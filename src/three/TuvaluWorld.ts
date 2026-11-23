import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  FISH_CATALOG,
  FISH_TIERS,
  INGREDIENT_CATALOG,
  OUTER_ISLANDS,
} from '../data/tuvaluData';
import {
  CookingStage,
  FishSpecies,
  FishingPhase,
  IslandId,
  MapZone,
  RivalChef,
} from '../types/game';
import {
  buildBoatDockGroup,
  buildBoatGroup,
  buildCharacterGroup,
  buildFishMesh,
  buildGatherNodeGroup,
  buildKitchenFaleGroup,
  buildPalmTreeGroup,
  buildPierGroup,
  CharacterRig,
  KitchenBuildingRefs,
} from './models';
import { createProceduralTextures, ProceduralTextureSet } from './textures';

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();

const FUNAFUTI_DOCK_BOAT_POS = new THREE.Vector3(34.6, 0, -5.5);
const BOAT_SPEED = 5.8; // ~175u / 5.8 = ~30s sail to outer islands

interface ParticleItem {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

export interface SailingTelemetry {
  target: IslandId;
  distance: number;
  etaSeconds: number;
  arrivedIsland: IslandId | null;
}

export interface TuvaluWorldCallbacks {
  onZoneAutoSwitch?: (zone: MapZone) => void;
  onStationClick?: (action: string) => void;
  onNearStationChange?: (station: string | null) => void;
  onSailingUpdate?: (info: SailingTelemetry) => void;
  onAutoBoardBoat?: (target: IslandId) => void;
}

export type BattleOutcomeMotion = 'none' | 'won' | 'lost' | 'draw';

export class TuvaluWorld {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTextureSet;
  private isSoftwareGl: boolean;

  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private elapsed = 0;

  // Input state
  private heldKeys = new Set<string>();
  private virtualMoveX = 0;
  private virtualMoveZ = 0;
  private raycaster = new THREE.Raycaster();
  private callbacks: TuvaluWorldCallbacks;

  // World Actors & Refs
  private player: CharacterRig;
  private playerShadow: THREE.Mesh;
  private judgeNpc: CharacterRig;
  private rivalNpc: CharacterRig;
  private kitchen: KitchenBuildingRefs;
  private palmTrees: THREE.Group[] = [];
  private gatherNodes: {
    group: THREE.Group;
    ring: THREE.Object3D | null;
    islandId: Exclude<IslandId, 'funafuti'>;
    ingredientId: string;
    worldX: number;
    worldZ: number;
  }[] = [];
  private gatherCooldownActive: Record<string, boolean> = {};
  private ambientFishes: { group: THREE.Group; angle: number; radius: number; speed: number; depth: number }[] = [];

  // Boat, Boarding & Sailing state
  private boat: { root: THREE.Group; seatAnchor: THREE.Object3D };
  private boatYaw = Math.PI / 2;
  private currentIsland: IslandId = 'funafuti';
  private sailingTarget: IslandId = 'nanumea';
  private autoSail = false;
  private sailingElapsed = 0;
  private sailingEmitTimer = 0;
  private boarding: {
    active: boolean;
    t: number;
    duration: number;
    startPos: THREE.Vector3;
    targetIsland: IslandId;
  } | null = null;

  // Player Jump Physics & Extra Action Motions
  private playerVy = 0;
  private isGrounded = true;
  private gatheringActive = false;
  private gatherSwingTimer = 0;
  private battleOutcome: BattleOutcomeMotion = 'none';
  private battleOutcomeTimer = 0;

  // Fishing visuals
  private bobber: THREE.Group;
  private fishingLine: THREE.Line;
  private linePositions = new Float32Array(6);
  private caughtFishShowcase: THREE.Group | null = null;
  private boardFishMesh: THREE.Group | null = null;
  private platePlayerItems: THREE.Object3D[] = [];
  private plateRivalItems: THREE.Object3D[] = [];

  // Water shader uniform
  private waterUniforms = { uTime: { value: 0 } };

  // Camera & state sync
  private screenMode: 'title' | 'playing' = 'title';
  private zone: MapZone = 'fishing';
  private fishingPhase: FishingPhase = 'idle';
  private cookingStage: CookingStage = 'none';
  private heatLevel = 0.5;
  private cameraLookCurrent = new THREE.Vector3(0, 1.4, 2);
  private shakeIntensity = 0;
  private nearStation: string | null = null;

  // Pooled Particles
  private particles: ParticleItem[] = [];
  private particleGroup = new THREE.Group();

  // Interactive meshes for click raycasting
  private clickTargets: { object: THREE.Object3D; action: string }[] = [];

  constructor(container: HTMLElement, callbacks: TuvaluWorldCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x7be0ef);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0x7be0ef, 0.003);

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.2, 460);
    this.camera.position.set(14, 9.5, 19);
    this.camera.lookAt(this.cameraLookCurrent);

    // Mandatory studio environment map on every device
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    this.setupLighting();
    this.buildEnvironment();
    this.buildOuterIslands();

    this.kitchen = buildKitchenFaleGroup(this.textures);
    this.kitchen.group.position.set(0, 0.38, -8.5);
    this.scene.add(this.kitchen.group);

    this.kitchen.stationInteractables.forEach((s) => {
      this.clickTargets.push({ object: s.mesh, action: s.action });
    });
    this.clickTargets.push({ object: this.kitchen.doorTrigger, action: 'enter_kitchen' });

    // Boat moored at East Boat Dock
    this.boat = buildBoatGroup();
    this.boat.root.position.copy(FUNAFUTI_DOCK_BOAT_POS);
    this.boat.root.rotation.y = this.boatYaw;
    this.scene.add(this.boat.root);
    this.clickTargets.push({ object: this.boat.root, action: 'board_boat' });

    // Player Character
    this.player = buildCharacterGroup({
      skinColor: 0xb07348,
      shirtColor: 0x0d9488,
      lavalavaColor: 0x1e3a8a,
      hasStrawHat: true,
      withRod: true,
    });
    this.player.root.position.set(0, 0.94, 13.0);
    this.player.root.rotation.y = 0;
    this.scene.add(this.player.root);

    this.playerShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({
        map: this.textures.contactShadow,
        transparent: true,
        depthWrite: false,
        opacity: 0.45,
      }),
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.set(0, 0.96, 13.0);
    this.scene.add(this.playerShadow);

    // Judge NPC inside Kitchen
    this.judgeNpc = buildCharacterGroup({
      skinColor: 0x8d5524,
      shirtColor: 0xfef3c7,
      lavalavaColor: 0xb45309,
      hasFlowerCrown: true,
      crownColor: 0xfacc15,
    });
    this.judgeNpc.root.position.set(1.4, 0.91, -9.2);
    this.judgeNpc.root.rotation.y = 0;
    this.scene.add(this.judgeNpc.root);

    // Rival Chef NPC inside Kitchen
    this.rivalNpc = buildCharacterGroup({
      skinColor: 0xa06438,
      shirtColor: 0xe11d48,
      lavalavaColor: 0x1e293b,
      hasChefHat: true,
    });
    this.rivalNpc.root.position.set(3.4, 0.91, -6.2);
    this.rivalNpc.root.rotation.y = Math.PI;
    this.scene.add(this.rivalNpc.root);

    // Bobber & Line
    this.bobber = new THREE.Group();
    const bobTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 }),
    );
    const bobBot = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
    );
    this.bobber.add(bobTop, bobBot);
    this.bobber.visible = false;
    this.scene.add(this.bobber);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.fishingLine = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.85 }),
    );
    this.fishingLine.frustumCulled = false;
    this.fishingLine.visible = false;
    this.scene.add(this.fishingLine);

    // Pooled Particles
    this.initParticlePool();
    this.scene.add(this.particleGroup);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.tick();
  }

  private setupLighting() {
    const hemi = new THREE.HemisphereLight(0xa5f3fc, 0x0e7490, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
    sun.position.set(22, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    const d = 32;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 95;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0x67e8f9, 0.65);
    rim.position.set(-18, 12, -20);
    this.scene.add(rim);

    const kitchenFill = new THREE.PointLight(0xffedd5, 1.4, 16, 1.2);
    kitchenFill.position.set(0, 4.2, -8.5);
    this.scene.add(kitchenFill);
  }

  private buildEnvironment() {
    // 1. Wide Animated Turquoise Lagoon Ocean (560x560)
    const oceanGeo = new THREE.PlaneGeometry(560, 560, 96, 96);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.MeshPhysicalMaterial({
      color: 0x06b6d4,
      roughness: 0.16,
      metalness: 0.08,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 0.92,
    });
    oceanMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterUniforms.uTime;
      shader.vertexShader = `uniform float uTime;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float waveA = sin(transformed.x * 0.24 + uTime * 1.4) * 0.12;
        float waveB = cos(transformed.z * 0.28 + uTime * 1.1) * 0.10;
        transformed.y += waveA + waveB;
        `,
      );
    };
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.position.y = 0;
    ocean.receiveShadow = true;
    this.scene.add(ocean);

    // 2. Sandy Seabed underneath shallow translucent lagoon
    const seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(540, 540),
      new THREE.MeshStandardMaterial({ color: 0x164e63, roughness: 0.95 }),
    );
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -1.6;
    this.scene.add(seabed);

    // 3. Expanded Funafuti Coral Sand Atoll Island
    const islandGeo = new THREE.CylinderGeometry(22.5, 28, 1.4, 42, 4);
    const pos = islandGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const ang = Math.atan2(vz, vx);
      const wobble = 1 + Math.sin(ang * 3) * 0.06 + Math.cos(ang * 5) * 0.04;
      pos.setX(i, vx * wobble * 1.18);
      pos.setZ(i, vz * wobble * 0.86);
    }
    islandGeo.computeVertexNormals();
    const islandMat = new THREE.MeshStandardMaterial({
      map: this.textures.sandColor,
      roughness: 0.92,
      metalness: 0.0,
    });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.set(0, -0.25, -13.5);
    island.receiveShadow = true;
    this.scene.add(island);

    // 4. South Fishing Pier extending into Lagoon
    const pier = buildPierGroup(this.textures);
    pier.position.set(0, 0, 2.5);
    this.scene.add(pier);

    const fishTrigger = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 2.4, 4.0),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    fishTrigger.position.set(0, 1.2, 12.2);
    this.scene.add(fishTrigger);
    this.clickTargets.push({ object: fishTrigger, action: 'cast_or_fish' });

    // 5. East Boat Dock (선착장) extending along +X from shore into deep lagoon
    const dock = buildBoatDockGroup(this.textures);
    dock.position.set(21.5, 0, -5.5);
    this.scene.add(dock);

    const dockTrigger = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 3.0, 4.4),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    dockTrigger.position.set(30.5, 1.4, -5.5);
    this.scene.add(dockTrigger);
    this.clickTargets.push({ object: dockTrigger, action: 'board_boat' });

    // 6. Expanded Palm Tree Grove framing Funafuti naturally
    const palmCoords: [number, number, number, number][] = [
      [-14.5, 0.35, -3.5, 0.95],
      [-18.2, 0.35, -12.5, 1.12],
      [-15.8, 0.35, -22.5, 0.96],
      [-6.5, 0.35, -26.8, 1.08],
      [7.2, 0.35, -26.5, 1.0],
      [15.2, 0.35, -21.5, 1.05],
      [16.5, 0.35, -12.5, 0.94],
      [13.8, 0.35, -1.2, 1.02],
      [-10.2, 0.35, 0.5, 0.92],
    ];
    palmCoords.forEach(([px, py, pz, sc], idx) => {
      const palm = buildPalmTreeGroup();
      palm.position.set(px, py, pz);
      palm.rotation.y = idx * 1.3;
      palm.scale.setScalar(sc);
      this.palmTrees.push(palm);
      this.scene.add(palm);
    });

    // 7. Instanced Coral Rocks around Funafuti reef
    const rockGeo = new THREE.DodecahedronGeometry(0.85, 1);
    const rockMat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.04 });
    const rockCount = 28;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let i = 0; i < rockCount; i++) {
      const ang = (i / rockCount) * Math.PI * 2;
      const rad = i < 18 ? 27 + (i % 3) * 2.5 : 44 + (i % 4) * 6;
      dummy.position.set(Math.cos(ang) * rad * 1.15, -0.15, -13.5 + Math.sin(ang) * rad * 0.92);
      dummy.rotation.set(i * 0.5, i * 1.1, 0);
      const sx = 0.85 + (i % 5) * 0.38;
      dummy.scale.set(sx * 1.3, sx * 0.7, sx);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.08 + (i % 4) * 0.04, 0.25, 0.55 + (i % 3) * 0.08);
      rocks.setColorAt(i, tint);
    }
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    rocks.computeBoundingSphere();
    this.scene.add(rocks);

    // 8. Ambient Swimming Lagoon Fish beneath the Pier
    for (let i = 0; i < 6; i++) {
      const sp = FISH_CATALOG[i % FISH_CATALOG.length];
      const fMesh = buildFishMesh(sp);
      fMesh.scale.multiplyScalar(0.75);
      this.scene.add(fMesh);
      this.ambientFishes.push({
        group: fMesh,
        angle: (i / 6) * Math.PI * 2,
        radius: 3.5 + (i % 3) * 2.2,
        speed: 0.35 + (i % 2) * 0.18,
        depth: -0.45 - (i % 3) * 0.2,
      });
    }
  }

  private buildOuterIslands() {
    const sandMat = new THREE.MeshStandardMaterial({
      map: this.textures.sandColor,
      roughness: 0.92,
      metalness: 0.0,
    });

    OUTER_ISLANDS.forEach((isl) => {
      const cx = isl.position.x;
      const cz = isl.position.z;

      // Sandy Coral Island Mound
      const islGeo = new THREE.CylinderGeometry(14.5, 19.0, 1.35, 30, 2);
      const islMesh = new THREE.Mesh(islGeo, sandMat);
      islMesh.position.set(cx, -0.22, cz);
      islMesh.receiveShadow = true;
      this.scene.add(islMesh);

      // Decorative Theme Coral Reef Ring Marker
      const reefMarker = new THREE.Mesh(
        new THREE.TorusGeometry(15.2, 0.22, 6, 32),
        new THREE.MeshStandardMaterial({
          color: isl.themeColor,
          emissive: isl.themeColor,
          emissiveIntensity: 0.25,
          roughness: 0.5,
        }),
      );
      reefMarker.rotation.x = Math.PI / 2;
      reefMarker.position.set(cx, -0.08, cz);
      this.scene.add(reefMarker);

      // Return Wooden Dock extending +Z (11..21.5 relative to island center)
      const retDock = buildBoatDockGroup(this.textures);
      retDock.rotation.y = -Math.PI / 2;
      retDock.position.set(cx, 0, cz + 11.0);
      this.scene.add(retDock);

      const retDockTrigger = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 3.0, 4.4),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      retDockTrigger.position.set(cx, 1.4, cz + 19.8);
      this.scene.add(retDockTrigger);
      this.clickTargets.push({ object: retDockTrigger, action: 'board_boat' });

      // Palm Trees framing the outer island
      const outerPalms: [number, number, number][] = [
        [-8.5, -7.2, 1.05],
        [8.5, -6.8, 0.96],
        [-9.2, 3.8, 1.0],
        [9.0, 3.4, 0.92],
        [0, -10.4, 1.12],
      ];
      outerPalms.forEach(([ox, oz, sc], idx) => {
        const palm = buildPalmTreeGroup();
        palm.position.set(cx + ox, 0.35, cz + oz);
        palm.rotation.y = idx * 1.4 + 0.5;
        palm.scale.setScalar(sc);
        this.palmTrees.push(palm);
        this.scene.add(palm);
      });

      // 2 Rare Ingredient Gather Nodes per Outer Island
      const nodeOffsets: [number, number][] = [
        [-4.8, -3.2],
        [4.8, -4.2],
      ];
      isl.rareIngredientIds.forEach((ingId, idx) => {
        const [ox, oz] = nodeOffsets[idx] ?? [0, -4];
        const ing = INGREDIENT_CATALOG.find((i) => i.id === ingId);
        const colHex = ing ? parseInt(ing.colorHex.replace('#', ''), 16) : isl.floraColor;
        const node = buildGatherNodeGroup(colHex);
        node.position.set(cx + ox, 0.45, cz + oz);
        this.scene.add(node);

        const ring = node.children[node.children.length - 1] ?? null;

        this.gatherNodes.push({
          group: node,
          ring,
          islandId: isl.id,
          ingredientId: ingId,
          worldX: cx + ox,
          worldZ: cz + oz,
        });
        this.clickTargets.push({
          object: node,
          action: `gather_node:${isl.id}:${ingId}`,
        });
      });
    });
  }

  private initParticlePool() {
    const geo = new THREE.SphereGeometry(0.11, 6, 6);
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.particleGroup.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.7,
        active: false,
      });
    }
  }

  public spawnBurst(pos: THREE.Vector3, colorHex: number, count = 12, upwardSpeed = 4.2) {
    let spawned = 0;
    for (const p of this.particles) {
      if (!p.active) {
        p.active = true;
        p.life = 0;
        p.maxLife = 0.55 + Math.random() * 0.35;
        p.mesh.visible = true;
        p.mesh.position.copy(pos);
        p.mesh.scale.setScalar(0.8 + Math.random() * 0.7);
        (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
        p.vel.set(
          (Math.random() - 0.5) * 3.4,
          upwardSpeed * (0.6 + Math.random() * 0.6),
          (Math.random() - 0.5) * 3.4,
        );
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  public triggerShake(amount = 0.25) {
    this.shakeIntensity = Math.min(0.6, this.shakeIntensity + amount);
  }

  public triggerJump() {
    if (
      this.screenMode !== 'playing' ||
      this.cookingStage !== 'none' ||
      this.fishingPhase !== 'idle' ||
      this.zone === 'sailing' ||
      this.boarding?.active ||
      this.gatheringActive
    ) {
      return;
    }
    if (this.isGrounded) {
      this.playerVy = 7.4;
      this.isGrounded = false;
      if (this.zone !== 'kitchen') {
        this.spawnBurst(this.player.root.position, 0xfef3c7, 6, 2.2);
      }
    }
  }

  // --- Gather & Outcome Motion APIs ---
  public setGatherCooldowns(cooldownActiveMap: Record<string, boolean>) {
    this.gatherCooldownActive = cooldownActiveMap;
    for (const gn of this.gatherNodes) {
      const onCd = Boolean(cooldownActiveMap[gn.ingredientId]);
      if (gn.ring) gn.ring.visible = !onCd;
      gn.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.material && !Array.isArray(mesh.material)) {
          const mat = mesh.material as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial;
          if ('emissiveIntensity' in mat && typeof mat.emissiveIntensity === 'number') {
            if (obj === gn.ring) {
              mat.emissiveIntensity = onCd ? 0.05 : 0.85;
            } else if (mat.emissive && mat.emissive.getHex() !== 0) {
              mat.emissiveIntensity = onCd ? 0.06 : 0.48;
            }
          }
        }
      });
    }
  }

  public setGatheringActive(active: boolean, ingredientId?: string) {
    this.gatheringActive = active;
    if (active && ingredientId) {
      const gn = this.gatherNodes.find((n) => n.ingredientId === ingredientId);
      if (gn) {
        this.player.root.rotation.y = Math.atan2(
          gn.worldX - this.player.root.position.x,
          gn.worldZ - this.player.root.position.z,
        );
      }
    }
    if (!active) {
      this.player.root.rotation.x = 0;
      this.player.head.rotation.x = 0;
      this.gatherSwingTimer = 0;
    }
  }

  public triggerGatherHitBurst(ingredientId: string) {
    this.gatherSwingTimer = 0.45;
    const gn = this.gatherNodes.find((n) => n.ingredientId === ingredientId);
    if (gn) {
      _vec3A.set(gn.worldX, 1.1, gn.worldZ);
      this.spawnBurst(_vec3A, 0xfbbf24, 12, 3.8);
    }
  }

  public setBattleOutcome(outcome: BattleOutcomeMotion) {
    this.battleOutcome = outcome;
    this.battleOutcomeTimer = 0;
    if (outcome === 'none') {
      this.resetActorPoses();
    }
  }

  private resetActorPoses() {
    this.player.root.rotation.x = 0;
    this.player.head.rotation.x = 0;
    this.player.leftArm.rotation.set(0, 0, 0);
    this.player.rightArm.rotation.set(0, 0, 0);
    this.player.leftLeg.rotation.set(0, 0, 0);
    this.player.rightLeg.rotation.set(0, 0, 0);

    this.rivalNpc.root.rotation.x = 0;
    this.rivalNpc.head.rotation.x = 0;
    this.rivalNpc.leftArm.rotation.set(0, 0, 0);
    this.rivalNpc.rightArm.rotation.set(0, 0, 0);

    this.judgeNpc.leftArm.rotation.set(0, 0, 0);
    this.judgeNpc.rightArm.rotation.set(0, 0, 0);
  }

  // --- Public State Setters from React ---
  public setScreenMode(mode: 'title' | 'playing') {
    this.screenMode = mode;
  }

  public setZone(zone: MapZone) {
    this.zone = zone;
    this.boarding = null;
    this.gatheringActive = false;
    this.playerVy = 0;
    this.isGrounded = true;
    this.resetActorPoses();

    if (zone === 'fishing') {
      this.currentIsland = 'funafuti';
      this.boat.root.position.copy(FUNAFUTI_DOCK_BOAT_POS);
      this.boat.root.rotation.y = Math.PI / 2;
      this.player.root.position.set(0, 0.94, 13.0);
      this.player.root.rotation.y = 0;
      if (this.player.rodGroup) this.player.rodGroup.visible = true;
    } else if (zone === 'kitchen') {
      this.currentIsland = 'funafuti';
      this.player.root.position.set(-1.3, 0.91, -6.3);
      this.player.root.rotation.y = Math.PI;
      if (this.player.rodGroup) this.player.rodGroup.visible = false;
    } else if (zone === 'sailing') {
      if (this.player.rodGroup) this.player.rodGroup.visible = false;
    } else if (zone === 'island') {
      if (this.player.rodGroup) this.player.rodGroup.visible = false;
    }
  }

  public startSailing(target: IslandId) {
    this.sailingTarget = target;
    this.sailingElapsed = 0;
    this.autoSail = false;
    this.gatheringActive = false;
    this.resetActorPoses();

    // Place boat cleanly at current island's dock mooring
    if (this.currentIsland === 'funafuti') {
      this.boat.root.position.copy(FUNAFUTI_DOCK_BOAT_POS);
      // If player clicked quick-button from across the island, place at dock tip for smooth boarding leap
      const dToDock = Math.hypot(
        this.player.root.position.x - 30.6,
        this.player.root.position.z - (-5.5),
      );
      if (dToDock > 8.5) {
        this.player.root.position.set(30.4, 0.94, -5.5);
      }
    } else {
      const isl = OUTER_ISLANDS.find((i) => i.id === this.currentIsland);
      if (isl) {
        this.boat.root.position.set(isl.position.x, 0, isl.position.z + 24.4);
        const dToDock = Math.hypot(
          this.player.root.position.x - isl.position.x,
          this.player.root.position.z - (isl.position.z + 19.8),
        );
        if (dToDock > 8.5) {
          this.player.root.position.set(isl.position.x, 0.94, isl.position.z + 19.6);
        }
      }
    }

    const dest = this.getIslandDockTarget(target);
    this.boatYaw = Math.atan2(
      dest.x - this.boat.root.position.x,
      dest.z - this.boat.root.position.z,
    );
    this.boat.root.rotation.y = this.boatYaw;

    // Trigger smooth parabolic boarding animation onto the boat!
    this.boarding = {
      active: true,
      t: 0,
      duration: 0.68,
      startPos: this.player.root.position.clone(),
      targetIsland: target,
    };
    this.player.root.rotation.y = Math.atan2(
      this.boat.root.position.x - this.player.root.position.x,
      this.boat.root.position.z - this.player.root.position.z,
    );

    this.zone = 'sailing';
    this.playerVy = 0;
    this.isGrounded = true;
    if (this.player.rodGroup) this.player.rodGroup.visible = false;
    this.emitSailingTelemetry(null);
  }

  public setSailingTarget(target: IslandId) {
    this.sailingTarget = target;
    this.emitSailingTelemetry(null);
  }

  public setAutoSail(enabled: boolean) {
    this.autoSail = enabled;
  }

  public disembarkAtIsland(islandId: IslandId) {
    this.autoSail = false;
    this.boarding = null;
    this.playerVy = 0;
    this.isGrounded = true;
    this.resetActorPoses();

    if (islandId === 'funafuti') {
      this.currentIsland = 'funafuti';
      this.zone = 'fishing';
      this.boat.root.position.copy(FUNAFUTI_DOCK_BOAT_POS);
      this.boat.root.rotation.y = Math.PI / 2;
      this.player.root.position.set(28.8, 0.94, -5.5);
      this.player.root.rotation.y = -Math.PI / 2;
      if (this.player.rodGroup) this.player.rodGroup.visible = true;
    } else {
      const isl = OUTER_ISLANDS.find((i) => i.id === islandId);
      if (!isl) return;
      this.currentIsland = islandId;
      this.zone = 'island';
      this.boat.root.position.set(isl.position.x, 0, isl.position.z + 24.4);
      this.boat.root.rotation.y = 0;
      this.player.root.position.set(isl.position.x, 0.94, isl.position.z + 17.2);
      this.player.root.rotation.y = Math.PI;
      if (this.player.rodGroup) this.player.rodGroup.visible = false;
    }
  }

  public getCurrentIsland(): IslandId {
    return this.currentIsland;
  }

  private getIslandDockTarget(target: IslandId): THREE.Vector3 {
    if (target === 'funafuti') return FUNAFUTI_DOCK_BOAT_POS;
    const isl = OUTER_ISLANDS.find((i) => i.id === target);
    if (isl) {
      return _vec3A.set(isl.position.x, 0, isl.position.z + 24.4);
    }
    return FUNAFUTI_DOCK_BOAT_POS;
  }

  public setFishingPhase(phase: FishingPhase, caughtSpecies?: FishSpecies) {
    this.fishingPhase = phase;
    if (phase === 'idle') {
      this.bobber.visible = false;
      this.fishingLine.visible = false;
      this.clearShowcaseFish();
      this.resetActorPoses();
    } else if (phase === 'casting' || phase === 'waiting' || phase === 'biting' || phase === 'reeling') {
      this.clearShowcaseFish();
      this.bobber.visible = true;
      this.fishingLine.visible = true;
      const forwardX = Math.sin(this.player.root.rotation.y);
      const forwardZ = Math.cos(this.player.root.rotation.y);
      this.bobber.position.set(
        this.player.root.position.x + forwardX * 4.5,
        0.04,
        Math.max(15.2, this.player.root.position.z + forwardZ * 4.5),
      );
      if (phase === 'waiting') {
        this.spawnBurst(this.bobber.position, 0xe0f2fe, 10, 2.8);
      }
    } else if (phase === 'caught' && caughtSpecies) {
      this.bobber.visible = false;
      this.fishingLine.visible = false;
      this.showCaughtFish(caughtSpecies);
    }
  }

  private showCaughtFish(species: FishSpecies) {
    this.clearShowcaseFish();
    const fish = buildFishMesh(species);
    fish.position.set(
      this.player.root.position.x,
      this.player.root.position.y + 2.35,
      this.player.root.position.z + 1.2,
    );
    this.scene.add(fish);
    this.caughtFishShowcase = fish;
    const tierCol = parseInt(FISH_TIERS[species.tier].colorHex.replace('#', ''), 16);
    this.spawnBurst(fish.position, tierCol, 18, 4.8);
  }

  private clearShowcaseFish() {
    if (this.caughtFishShowcase) {
      this.scene.remove(this.caughtFishShowcase);
      this.caughtFishShowcase = null;
    }
  }

  public setCookingStage(
    stage: CookingStage,
    species?: FishSpecies,
    heatLevel = 0.5,
    playerIngredientIds: string[] = [],
    rival?: RivalChef,
  ) {
    this.cookingStage = stage;
    this.heatLevel = heatLevel;
    this.playerVy = 0;
    this.isGrounded = true;

    if (stage === 'wash') {
      this.battleOutcome = 'none';
      this.resetActorPoses();
      this.player.root.position.set(-3.4, 0.91, -10.7);
      this.player.root.rotation.y = Math.PI;
    } else if (stage === 'prep') {
      this.player.root.position.set(0, 0.91, -10.7);
      this.player.root.rotation.y = Math.PI;
      this.setCuttingBoardFish(species ?? null);
    } else if (stage === 'cook') {
      this.setCuttingBoardFish(null);
      this.player.root.position.set(3.4, 0.91, -10.7);
      this.player.root.rotation.y = Math.PI;
    } else if (stage === 'judging' || stage === 'result') {
      this.setCuttingBoardFish(null);
      this.player.root.position.set(0.3, 0.91, -6.2);
      this.player.root.rotation.y = Math.PI;
      this.showPlatedDishes(species ?? FISH_CATALOG[0], playerIngredientIds, rival);
    } else {
      this.battleOutcome = 'none';
      this.resetActorPoses();
      this.setCuttingBoardFish(null);
      this.clearPlatedDishes();
    }
  }

  public setHeatLevel(heat: number) {
    this.heatLevel = heat;
  }

  public setVirtualMove(x: number, z: number) {
    this.virtualMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.virtualMoveZ = THREE.MathUtils.clamp(z, -1, 1);
  }

  public triggerKitchenBurst(station: 'wash' | 'prep' | 'cook' | 'judging', colorHex = 0x38bdf8) {
    const pos = _vec3A;
    if (station === 'wash') {
      pos.set(-3.4, 1.9, -12.1);
    } else if (station === 'prep') {
      pos.set(0, 1.85, -12.1);
    } else if (station === 'cook') {
      pos.set(3.4, 2.2, -12.1);
    } else {
      pos.set(1.4, 2.1, -7.7);
    }
    this.spawnBurst(pos, colorHex, 10, 3.2);
  }

  private setCuttingBoardFish(species: FishSpecies | null) {
    if (this.boardFishMesh) {
      this.kitchen.cuttingBoardFishAnchor.remove(this.boardFishMesh);
      this.boardFishMesh = null;
    }
    if (species) {
      const m = buildFishMesh(species);
      m.scale.multiplyScalar(0.82);
      m.rotation.x = Math.PI / 2;
      this.kitchen.cuttingBoardFishAnchor.add(m);
      this.boardFishMesh = m;
    }
  }

  private add3DGarnishes(plate: THREE.Group, ingredientIds: string[], targetArr: THREE.Object3D[]) {
    ingredientIds.forEach((id, idx) => {
      const ing = INGREDIENT_CATALOG.find((i) => i.id === id);
      if (!ing) return;
      const colHex = parseInt(ing.colorHex.replace('#', ''), 16);
      const angle = (idx / Math.max(1, ingredientIds.length)) * Math.PI * 2 + 0.4;
      const rad = 0.24;
      const prop = new THREE.Mesh(
        ing.category === 'meat'
          ? new THREE.BoxGeometry(0.14, 0.08, 0.11)
          : ing.category === 'salt'
            ? new THREE.OctahedronGeometry(0.06, 0)
            : new THREE.SphereGeometry(0.075, 8, 8),
        new THREE.MeshStandardMaterial({ color: colHex, roughness: 0.4 }),
      );
      prop.position.set(Math.cos(angle) * rad, 0.09, Math.sin(angle) * rad);
      plate.add(prop);
      targetArr.push(prop);
    });
  }

  private showPlatedDishes(species: FishSpecies, playerIngredientIds: string[], rival?: RivalChef) {
    this.clearPlatedDishes();

    const pFish = buildFishMesh(species);
    pFish.scale.multiplyScalar(0.5);
    pFish.rotation.x = Math.PI / 2;
    pFish.position.y = 0.14;
    this.kitchen.playerPlate.add(pFish);
    this.platePlayerItems.push(pFish);
    this.add3DGarnishes(this.kitchen.playerPlate, playerIngredientIds, this.platePlayerItems);

    const rivalSpecies =
      (rival ? FISH_CATALOG.find((f) => f.id === rival.specialtyFishId) : undefined) ?? FISH_CATALOG[5];
    const rFish = buildFishMesh(rivalSpecies);
    rFish.scale.multiplyScalar(0.46);
    rFish.rotation.x = Math.PI / 2;
    rFish.position.y = 0.14;
    this.kitchen.rivalPlate.add(rFish);
    this.plateRivalItems.push(rFish);
    if (rival) {
      this.add3DGarnishes(this.kitchen.rivalPlate, rival.specialtyIngredientIds, this.plateRivalItems);
    }
  }

  private clearPlatedDishes() {
    this.platePlayerItems.forEach((obj) => this.kitchen.playerPlate.remove(obj));
    this.platePlayerItems = [];
    this.plateRivalItems.forEach((obj) => this.kitchen.rivalPlate.remove(obj));
    this.plateRivalItems = [];
  }

  // --- Events ---
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.heldKeys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
  };

  private onBlur = () => {
    this.heldKeys.clear();
  };

  private onResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.screenMode !== 'playing' || this.cookingStage !== 'none' || this.boarding?.active) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const meshes = this.clickTargets.map((t) => t.object);
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      const match = this.clickTargets.find((t) => t.object === hitObj || this.isDescendant(hitObj, t.object));
      if (match) {
        this.callbacks.onStationClick?.(match.action);
      }
    }
  };

  private isDescendant(child: THREE.Object3D, parent: THREE.Object3D): boolean {
    let curr: THREE.Object3D | null = child;
    while (curr) {
      if (curr === parent) return true;
      curr = curr.parent;
    }
    return false;
  }

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
  }

  private getGroundY(x: number, z: number): number {
    if (this.zone === 'kitchen') return 0.91;
    if (this.zone === 'fishing') {
      if (Math.abs(x) <= 1.55 && z >= 2.0 && z <= 13.6) return 0.94;
      if (x >= 20.5 && x <= 32.2 && z >= -7.7 && z <= -3.3) return 0.94;
      return 0.45;
    }
    if (this.zone === 'island') {
      const isl = OUTER_ISLANDS.find((i) => i.id === this.currentIsland);
      if (isl) {
        const dx = x - isl.position.x;
        const dz = z - isl.position.z;
        if (Math.abs(dx) <= 2.1 && dz >= 10.5 && dz <= 21.6) return 0.94;
      }
      return 0.45;
    }
    return 0.78;
  }

  private emitSailingTelemetry(arrivedIsland: IslandId | null) {
    const dest = this.getIslandDockTarget(this.sailingTarget);
    const dist = Math.hypot(
      dest.x - this.boat.root.position.x,
      dest.z - this.boat.root.position.z,
    );
    this.callbacks.onSailingUpdate?.({
      target: this.sailingTarget,
      distance: dist,
      etaSeconds: dist / BOAT_SPEED,
      arrivedIsland,
    });
  }

  // --- Per-frame Simulation ---
  private updateSimulation(dt: number) {
    this.elapsed += dt;
    this.waterUniforms.uTime.value = this.elapsed;

    // Gentle palm tree breeze
    for (let i = 0; i < this.palmTrees.length; i++) {
      this.palmTrees[i].rotation.z = Math.sin(this.elapsed * 0.9 + i) * 0.035;
    }

    // Gather node crystal gentle rotation (paused/slower when on cooldown)
    for (let i = 0; i < this.gatherNodes.length; i++) {
      const gn = this.gatherNodes[i];
      const onCd = Boolean(this.gatherCooldownActive[gn.ingredientId]);
      gn.group.rotation.y += dt * (onCd ? 0.15 : 0.95);
    }

    // Ambient lagoon fish circling pier
    for (const f of this.ambientFishes) {
      f.angle += dt * f.speed;
      const cx = Math.cos(f.angle) * f.radius;
      const cz = 12.5 + Math.sin(f.angle) * (f.radius * 0.85);
      f.group.position.set(cx, f.depth + Math.sin(this.elapsed * 2 + f.angle) * 0.08, cz);
      f.group.rotation.y = -f.angle + Math.PI / 2;
    }

    // Boat bobbing on water when moored
    if (this.zone !== 'sailing') {
      this.boat.root.position.y = Math.sin(this.elapsed * 2.2) * 0.06;
      this.boat.root.rotation.z = Math.sin(this.elapsed * 1.7) * 0.035;
    }

    let moving = false;

    if (this.screenMode === 'playing' && this.zone === 'sailing') {
      if (this.boarding && this.boarding.active) {
        this.updateBoarding(dt);
      } else {
        this.updateSailing(dt);
      }
    } else if (
      this.screenMode === 'playing' &&
      this.fishingPhase === 'idle' &&
      this.cookingStage === 'none' &&
      !this.gatheringActive
    ) {
      let mx = this.virtualMoveX;
      let mz = this.virtualMoveZ;
      if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) mz -= 1;
      if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) mz += 1;
      if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) mx -= 1;
      if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) mx += 1;

      if (Math.hypot(mx, mz) > 0.08) {
        moving = true;
        const len = Math.max(1, Math.hypot(mx, mz));
        mx /= len;
        mz /= len;
        const speed = 6.2;
        const px = this.player.root.position.x;
        const pz = this.player.root.position.z;
        let nx = px + mx * speed * dt;
        let nz = pz + mz * speed * dt;

        if (this.zone === 'fishing') {
          const currentlyOnPier = pz >= 2.2 && Math.abs(px) <= 1.7;
          const enteringPier = Math.abs(nx) <= 1.38 && nz >= 2.0;
          const currentlyOnDock = px >= 20.6 && Math.abs(pz - (-5.5)) <= 2.2;
          const enteringDock = nx >= 20.6 && Math.abs(nz - (-5.5)) <= 1.75;

          if (currentlyOnPier || enteringPier) {
            nx = THREE.MathUtils.clamp(nx, -1.35, 1.35);
            nz = THREE.MathUtils.clamp(nz, 1.8, 13.4);
          } else if (currentlyOnDock || enteringDock) {
            nz = THREE.MathUtils.clamp(nz, -7.1, -3.9);
            if (nx >= 30.8) {
              // Walked right up to the end of the dock -> board the boat smoothly!
              this.player.root.position.set(30.8, 0.94, nz);
              const nextTarget: IslandId = 'nanumea';
              this.startSailing(nextTarget);
              this.callbacks.onAutoBoardBoat?.(nextTarget);
              return;
            }
          } else {
            // Free exploration across expanded Funafuti island ellipse
            const ex = nx / 22.8;
            const ez = (nz + 13.5) / 17.5;
            const d2 = ex * ex + ez * ez;
            if (d2 > 1.0) {
              const s = 1 / Math.sqrt(d2);
              nx *= s;
              nz = -13.5 + (nz + 13.5) * s;
            }
            // Kitchen doorway / building wall collision
            if (Math.abs(nx) < 5.75 && nz > -13.8 && nz < -3.2) {
              if (Math.abs(nx) < 1.5 && nz < -3.1 && nz > -5.2) {
                this.callbacks.onZoneAutoSwitch?.('kitchen');
              } else {
                if (pz >= -3.2) nz = -3.2;
                else if (pz <= -13.8) nz = -13.8;
                else if (px <= -5.75) nx = -5.75;
                else if (px >= 5.75) nx = 5.75;
              }
            }
          }
        } else if (this.zone === 'kitchen') {
          nx = THREE.MathUtils.clamp(nx, -4.2, 4.2);
          nz = THREE.MathUtils.clamp(nz, -12.2, -4.2);
          if (Math.abs(nx) < 1.4 && nz > -4.3) {
            this.callbacks.onZoneAutoSwitch?.('fishing');
          }
        } else if (this.zone === 'island') {
          const isl = OUTER_ISLANDS.find((i) => i.id === this.currentIsland);
          if (isl) {
            const pdx = px - isl.position.x;
            const pdz = pz - isl.position.z;
            const dx = nx - isl.position.x;
            const dz = nz - isl.position.z;
            const currentlyOnRetDock = pdz >= 10.6 && Math.abs(pdx) <= 2.1;
            const enteringRetDock = dz >= 10.6 && Math.abs(dx) <= 1.75;

            if (currentlyOnRetDock || enteringRetDock) {
              nx = isl.position.x + THREE.MathUtils.clamp(dx, -1.7, 1.7);
              if (dz >= 20.0) {
                // Walked onto end of outer island return dock -> board boat smoothly!
                this.player.root.position.set(nx, 0.94, isl.position.z + 20.0);
                this.startSailing('funafuti');
                this.callbacks.onAutoBoardBoat?.('funafuti');
                return;
              }
            } else {
              const dist = Math.hypot(dx, dz);
              if (dist > 14.0) {
                const s = 14.0 / dist;
                nx = isl.position.x + dx * s;
                nz = isl.position.z + dz * s;
              }
            }
          }
        }

        this.player.root.position.x = nx;
        this.player.root.position.z = nz;
        const targetYaw = Math.atan2(mx, mz);
        let diff = targetYaw - this.player.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.player.root.rotation.y += diff * Math.min(1, dt * 12);
      }

      // Vertical Jump & Ground Physics
      const groundY = this.getGroundY(this.player.root.position.x, this.player.root.position.z);
      if (!this.isGrounded) {
        this.playerVy -= 19.5 * dt;
        this.player.root.position.y += this.playerVy * dt;
        if (this.player.root.position.y <= groundY) {
          this.player.root.position.y = groundY;
          this.playerVy = 0;
          this.isGrounded = true;
        }
      } else {
        this.player.root.position.y = THREE.MathUtils.damp(this.player.root.position.y, groundY, 16, dt);
      }
    }

    // Contact shadow grounded directly beneath player
    const shadowY =
      this.zone === 'sailing'
        ? this.boat.root.position.y + 0.78
        : this.getGroundY(this.player.root.position.x, this.player.root.position.z) + 0.02;
    const heightAbove = Math.max(0, this.player.root.position.y - shadowY);
    const shadowScale = Math.max(0.55, 1 - heightAbove * 0.16);
    this.playerShadow.visible = this.zone !== 'sailing';
    this.playerShadow.scale.setScalar(shadowScale);
    this.playerShadow.position.set(this.player.root.position.x, shadowY, this.player.root.position.z);

    // Rich Character & NPC Animations
    this.updateCharacterAnimations(dt, moving);

    // Bobber & fishing line animation
    if (this.bobber.visible && this.player.rodTip) {
      const dip = this.fishingPhase === 'biting' ? Math.sin(this.elapsed * 22) * 0.16 - 0.14 : Math.sin(this.elapsed * 3.5) * 0.05;
      this.bobber.position.y = 0.03 + dip;
      if (this.fishingPhase === 'reeling') {
        this.bobber.position.x += Math.sin(this.elapsed * 14) * 1.4 * dt;
      }
      this.player.rodTip.getWorldPosition(_vec3A);
      this.linePositions[0] = _vec3A.x;
      this.linePositions[1] = _vec3A.y;
      this.linePositions[2] = _vec3A.z;
      this.linePositions[3] = this.bobber.position.x;
      this.linePositions[4] = this.bobber.position.y + 0.08;
      this.linePositions[5] = this.bobber.position.z;
      this.fishingLine.geometry.attributes.position.needsUpdate = true;
    }

    // Caught fish showcase spin
    if (this.caughtFishShowcase) {
      this.caughtFishShowcase.rotation.y += dt * 1.8;
      this.caughtFishShowcase.position.y = this.player.root.position.y + 2.35 + Math.sin(this.elapsed * 3.2) * 0.12;
    }

    // Roof & Front Wall cutaway transition when inside Kitchen
    const showInterior = this.zone === 'kitchen' || this.cookingStage !== 'none';
    const targetRoofY = showInterior ? 12.5 : 4.6;
    this.kitchen.roofGroup.position.y = THREE.MathUtils.damp(this.kitchen.roofGroup.position.y, targetRoofY, 7, dt);
    this.kitchen.roofGroup.visible = this.kitchen.roofGroup.position.y < 11.2;
    this.kitchen.frontWallGroup.visible = !showInterior;

    // Kitchen hearth ember & pot animation
    const targetIntensity = this.cookingStage === 'cook' ? 1.2 + this.heatLevel * 3.8 : 1.8 + Math.sin(this.elapsed * 5) * 0.25;
    this.kitchen.hearthGlow.intensity = THREE.MathUtils.damp(this.kitchen.hearthGlow.intensity, targetIntensity, 8, dt);
    this.kitchen.potLiquid.position.y = 0.54 + Math.sin(this.elapsed * (this.cookingStage === 'cook' ? 12 : 4)) * 0.018;

    // Proximity station detection
    this.detectNearbyStation();

    // Update particles
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 7.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      p.mesh.scale.setScalar(Math.max(0.1, (1 - t * 0.5) * 1.1));
    }

    // Smooth camera tracking
    this.updateCamera(dt);
  }

  private updateCharacterAnimations(dt: number, moving: boolean) {
    if (this.gatherSwingTimer > 0) {
      this.gatherSwingTimer = Math.max(0, this.gatherSwingTimer - dt);
    }

    if (this.boarding && this.boarding.active) {
      // Boarding leap motion handled cleanly
      const arc = Math.sin(this.boarding.t * Math.PI);
      this.player.leftArm.rotation.x = -1.25 * arc;
      this.player.rightArm.rotation.x = -1.25 * arc;
      this.player.leftLeg.rotation.x = 0.55 * arc;
      this.player.rightLeg.rotation.x = -0.35 * arc;
      return;
    }

    if (this.gatheringActive) {
      // Energetic foraging / crystal harvesting motion
      const fast = this.gatherSwingTimer > 0 ? 18 : 7.5;
      const scoop = Math.sin(this.elapsed * fast);
      this.player.root.rotation.x = THREE.MathUtils.damp(this.player.root.rotation.x, 0.24, 10, dt);
      this.player.head.rotation.x = 0.2;
      this.player.leftArm.rotation.x = -0.85 + scoop * 0.55;
      this.player.rightArm.rotation.x = -0.85 - scoop * 0.55;
      this.player.leftLeg.rotation.x = -0.18;
      this.player.rightLeg.rotation.x = 0.18;
      return;
    }

    if (this.cookingStage === 'result' && this.battleOutcome !== 'none') {
      this.battleOutcomeTimer += dt;
      if (this.battleOutcome === 'won') {
        // Player Victory Celebration: joyful jumps + raised waving arms!
        const hop = Math.abs(Math.sin(this.battleOutcomeTimer * 6.5)) * 0.42;
        this.player.root.position.y = 0.91 + hop;
        this.player.root.rotation.x = 0;
        this.player.head.rotation.x = -0.12;
        this.player.leftArm.rotation.x = -2.45 + Math.sin(this.battleOutcomeTimer * 11) * 0.35;
        this.player.rightArm.rotation.x = -2.45 - Math.sin(this.battleOutcomeTimer * 11) * 0.35;
        this.player.leftArm.rotation.z = 0.3;
        this.player.rightArm.rotation.z = -0.3;
        this.player.leftLeg.rotation.x = Math.sin(this.battleOutcomeTimer * 6.5) * 0.25;
        this.player.rightLeg.rotation.x = -Math.sin(this.battleOutcomeTimer * 6.5) * 0.25;

        // Rival slumps in defeat
        this.rivalNpc.root.rotation.x = 0.22;
        this.rivalNpc.head.rotation.x = 0.42;
        this.rivalNpc.leftArm.rotation.x = 0.15;
        this.rivalNpc.rightArm.rotation.x = 0.15;

        // Judge claps happily
        this.judgeNpc.head.rotation.x = Math.sin(this.battleOutcomeTimer * 8) * 0.12;
        this.judgeNpc.leftArm.rotation.x = -0.9;
        this.judgeNpc.rightArm.rotation.x = -0.9;
        this.judgeNpc.leftArm.rotation.z = -0.35 + Math.sin(this.battleOutcomeTimer * 14) * 0.2;
        this.judgeNpc.rightArm.rotation.z = 0.35 - Math.sin(this.battleOutcomeTimer * 14) * 0.2;
      } else if (this.battleOutcome === 'lost') {
        // Player Defeat Slump: bowed head, drooping shoulders & arms
        this.player.root.position.y = 0.91;
        this.player.root.rotation.x = THREE.MathUtils.damp(this.player.root.rotation.x, 0.24, 8, dt);
        this.player.head.rotation.x = 0.42 + Math.sin(this.battleOutcomeTimer * 2.5) * 0.05;
        this.player.leftArm.rotation.x = 0.15 + Math.sin(this.battleOutcomeTimer * 2) * 0.06;
        this.player.rightArm.rotation.x = 0.15 - Math.sin(this.battleOutcomeTimer * 2) * 0.06;
        this.player.leftLeg.rotation.x = 0;
        this.player.rightLeg.rotation.x = 0;

        // Rival celebrates triumph!
        this.rivalNpc.root.rotation.x = 0;
        this.rivalNpc.head.rotation.x = -0.1;
        this.rivalNpc.leftArm.rotation.x = -2.4 + Math.sin(this.battleOutcomeTimer * 9) * 0.3;
        this.rivalNpc.rightArm.rotation.x = -2.4 - Math.sin(this.battleOutcomeTimer * 9) * 0.3;
      } else {
        // Draw: respectful bow / applause
        const bow = Math.sin(this.battleOutcomeTimer * 3.5) * 0.16 + 0.12;
        this.player.root.rotation.x = bow;
        this.player.leftArm.rotation.x = -0.6;
        this.player.rightArm.rotation.x = -0.6;
        this.rivalNpc.root.rotation.x = bow;
        this.rivalNpc.leftArm.rotation.x = -0.6;
        this.rivalNpc.rightArm.rotation.x = -0.6;
      }
      return;
    }

    // Normal walking, jumping, fishing & cooking motions
    this.player.root.rotation.x = THREE.MathUtils.damp(this.player.root.rotation.x, 0, 10, dt);
    this.player.head.rotation.x = THREE.MathUtils.damp(this.player.head.rotation.x, 0, 10, dt);
    this.player.leftArm.rotation.z = THREE.MathUtils.damp(this.player.leftArm.rotation.z, 0, 10, dt);
    this.player.rightArm.rotation.z = THREE.MathUtils.damp(this.player.rightArm.rotation.z, 0, 10, dt);

    if (!this.isGrounded && this.zone !== 'sailing') {
      this.player.leftArm.rotation.x = -0.85;
      this.player.rightArm.rotation.x = -0.85;
      this.player.leftLeg.rotation.x = 0.35;
      this.player.rightLeg.rotation.x = -0.35;
    } else if (moving && this.zone !== 'sailing') {
      const swing = Math.sin(this.elapsed * 12) * 0.55;
      this.player.leftLeg.rotation.x = swing;
      this.player.rightLeg.rotation.x = -swing;
      this.player.leftArm.rotation.x = -swing * 0.6;
      this.player.rightArm.rotation.x = swing * 0.6;
    } else if (this.fishingPhase === 'casting') {
      this.player.rightArm.rotation.x = -1.35 + Math.sin(this.elapsed * 20) * 0.35;
      this.player.leftArm.rotation.x = -0.45;
    } else if (this.fishingPhase === 'reeling' || this.fishingPhase === 'biting') {
      this.player.leftLeg.rotation.x = 0;
      this.player.rightLeg.rotation.x = 0;
      this.player.rightArm.rotation.x = -0.65 + Math.sin(this.elapsed * 18) * 0.22;
      this.player.leftArm.rotation.x = -0.35;
    } else if (this.fishingPhase === 'caught') {
      this.player.leftArm.rotation.x = -2.1 + Math.sin(this.elapsed * 6) * 0.15;
      this.player.rightArm.rotation.x = -2.1 + Math.sin(this.elapsed * 6) * 0.15;
    } else if (this.cookingStage === 'wash') {
      this.player.leftArm.rotation.x = -0.65 + Math.sin(this.elapsed * 13) * 0.28;
      this.player.rightArm.rotation.x = -0.65 - Math.sin(this.elapsed * 13) * 0.28;
    } else if (this.cookingStage === 'prep') {
      this.player.rightArm.rotation.x = -0.75 + Math.abs(Math.sin(this.elapsed * 11)) * 0.55;
      this.player.leftArm.rotation.x = -0.45;
    } else if (this.cookingStage === 'cook') {
      this.player.leftArm.rotation.x = -0.7 + Math.sin(this.elapsed * 8) * 0.25;
      this.player.rightArm.rotation.x = -0.7 + Math.cos(this.elapsed * 8) * 0.25;
    } else if (this.zone === 'sailing') {
      // Balanced paddling / steering posture in boat
      this.player.leftLeg.rotation.x = -0.45;
      this.player.rightLeg.rotation.x = -0.45;
      this.player.leftArm.rotation.x = -0.45 + Math.sin(this.elapsed * 3) * 0.08;
      this.player.rightArm.rotation.x = -0.45 - Math.sin(this.elapsed * 3) * 0.08;
    } else {
      this.player.leftLeg.rotation.x = THREE.MathUtils.damp(this.player.leftLeg.rotation.x, 0, 10, dt);
      this.player.rightLeg.rotation.x = THREE.MathUtils.damp(this.player.rightLeg.rotation.x, 0, 10, dt);
      this.player.leftArm.rotation.x = THREE.MathUtils.damp(this.player.leftArm.rotation.x, Math.sin(this.elapsed * 2) * 0.05, 8, dt);
      this.player.rightArm.rotation.x = THREE.MathUtils.damp(this.player.rightArm.rotation.x, -Math.sin(this.elapsed * 2) * 0.05, 8, dt);
    }

    // Judge NPC gentle idle / tasting nod
    if (this.cookingStage !== 'result') {
      this.judgeNpc.head.rotation.x =
        this.cookingStage === 'judging'
          ? Math.sin(this.elapsed * 6) * 0.14
          : Math.sin(this.elapsed * 1.8) * 0.04;
    }
  }

  private updateBoarding(dt: number) {
    if (!this.boarding) return;
    this.boarding.t += dt / this.boarding.duration;
    const t = Math.min(1, this.boarding.t);

    this.boat.root.position.y = Math.sin(this.elapsed * 2.8) * 0.06;
    this.boat.seatAnchor.getWorldPosition(_vec3A);

    const smoothT = t * t * (3 - 2 * t);
    this.player.root.position.x = THREE.MathUtils.lerp(this.boarding.startPos.x, _vec3A.x, smoothT);
    this.player.root.position.z = THREE.MathUtils.lerp(this.boarding.startPos.z, _vec3A.z, smoothT);
    this.player.root.position.y =
      THREE.MathUtils.lerp(this.boarding.startPos.y, _vec3A.y, smoothT) + Math.sin(t * Math.PI) * 1.45;

    if (t >= 1) {
      this.boarding = null;
      this.sailingElapsed = 0;
      this.spawnBurst(this.boat.root.position, 0xe0f2fe, 10, 2.6);
    }
  }

  /**
   * Resolves solid collision between the boat and all islands/piers/docks
   * so the boat can never pass through land or wooden piers.
   */
  private resolveBoatCollisions(bx: number, bz: number): [number, number] {
    let x = bx;
    let z = bz;

    // 1. Funafuti main island ellipse: center (0, -13.5), rx = 29.5, rz = 23.0
    const fdx = x / 29.5;
    const fdz = (z + 13.5) / 23.0;
    const fNorm = Math.hypot(fdx, fdz);
    if (fNorm < 1.0 && fNorm > 0.0001) {
      x = (fdx / fNorm) * 29.6;
      z = -13.5 + (fdz / fNorm) * 23.1;
    }

    // 2. Funafuti South Fishing Pier box: x in [-2.8, 2.8], z in [1.5, 14.8]
    if (x > -2.8 && x < 2.8 && z > 1.5 && z < 14.8) {
      const pushLeft = Math.abs(x - -2.8);
      const pushRight = Math.abs(2.8 - x);
      const pushBottom = Math.abs(14.8 - z);
      if (pushBottom <= pushLeft && pushBottom <= pushRight) z = 14.85;
      else if (pushLeft < pushRight) x = -2.85;
      else x = 2.85;
    }

    // 3. Funafuti East Boat Dock wooden deck: x in [21.0, 32.3], z in [-7.8, -3.2]
    if (x > 21.0 && x < 32.3 && z > -7.8 && z < -3.2) {
      const dTop = Math.abs(z - -7.8);
      const dBot = Math.abs(-3.2 - z);
      const dEnd = Math.abs(32.3 - x);
      if (dEnd <= dTop && dEnd <= dBot) x = 32.35;
      else if (dTop < dBot) z = -7.85;
      else z = -3.15;
    }

    // 4. Outer Islands solid shoreline circles (R = 20.0) & return dock decks
    for (const isl of OUTER_ISLANDS) {
      const ox = isl.position.x;
      const oz = isl.position.z;
      const dx = x - ox;
      const dz = z - oz;
      const d = Math.hypot(dx, dz);
      const minRad = 20.0;
      if (d < minRad && d > 0.0001) {
        x = ox + (dx / d) * (minRad + 0.08);
        z = oz + (dz / d) * (minRad + 0.08);
      }

      // Return dock deck barrier: x in [ox - 2.7, ox + 2.7], z in [oz + 10.5, oz + 22.0]
      if (x > ox - 2.7 && x < ox + 2.7 && z > oz + 10.5 && z < oz + 22.0) {
        const dL = Math.abs(x - (ox - 2.7));
        const dR = Math.abs(ox + 2.7 - x);
        const dS = Math.abs(oz + 22.0 - z);
        if (dS <= dL && dS <= dR) z = oz + 22.05;
        else if (dL < dR) x = ox - 2.75;
        else x = ox + 2.75;
      }
    }

    return [x, z];
  }

  /**
   * Computes a smooth collision-free target heading for Auto-Sail,
   * steering tangentially around any island that lies along the straight path.
   */
  private computeAutoSailYaw(bx: number, bz: number, destX: number, destZ: number): number {
    const dirX = destX - bx;
    const dirZ = destZ - bz;
    const totalDist = Math.hypot(dirX, dirZ);
    if (totalDist < 0.1) return this.boatYaw;

    const ux = dirX / totalDist;
    const uz = dirZ / totalDist;

    const obstacles: { x: number; z: number; r: number }[] = [
      { x: 0, z: -13.5, r: 33.0 },
      ...OUTER_ISLANDS.map((i) => ({ x: i.position.x, z: i.position.z, r: 23.8 })),
    ];

    let steerX = ux;
    let steerZ = uz;
    let nearestHitDist = totalDist;

    for (const obs of obstacles) {
      const toObsX = obs.x - bx;
      const toObsZ = obs.z - bz;
      const proj = toObsX * ux + toObsZ * uz;
      if (proj <= 0 || proj >= totalDist) continue;

      const closestX = bx + ux * proj;
      const closestZ = bz + uz * proj;
      const perpX = closestX - obs.x;
      const perpZ = closestZ - obs.z;
      const perpDist = Math.hypot(perpX, perpZ);

      if (perpDist < obs.r && proj < nearestHitDist) {
        nearestHitDist = proj;
        // Tangent side around obstacle (choose side closest to perpendicular offset, or right-hand rule if dead-center)
        const cross = ux * toObsZ - uz * toObsX;
        const side = cross >= 0 ? -1 : 1;
        const distToObs = Math.max(obs.r + 1, Math.hypot(toObsX, toObsZ));
        const tx = obs.x + (side * -uz) * (obs.r + 4.5);
        const tz = obs.z + (side * ux) * (obs.r + 4.5);
        // Aim toward tangent waypoint around the island perimeter
        const wx = tx - bx;
        const wz = tz - bz;
        const wl = Math.max(0.01, Math.hypot(wx, wz));
        steerX = wx / wl;
        steerZ = wz / wl;

        // If very close to obstacle edge, add radial repulsion
        if (distToObs < obs.r + 2.5) {
          const rx = (bx - obs.x) / distToObs;
          const rz = (bz - obs.z) / distToObs;
          steerX += rx * 0.7;
          steerZ += rz * 0.7;
        }
      }
    }

    return Math.atan2(steerX, steerZ);
  }

  private updateSailing(dt: number) {
    this.sailingElapsed += dt;
    this.sailingEmitTimer += dt;

    let forwardInput = 0;
    let steerInput = 0;

    if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) forwardInput += 1;
    if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) forwardInput -= 0.5;
    if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) steerInput += 1;
    if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) steerInput -= 1;

    const dest = this.getIslandDockTarget(this.sailingTarget);
    const hasManualStick = Math.hypot(this.virtualMoveX, this.virtualMoveZ) > 0.12;

    if (hasManualStick) {
      this.autoSail = false;
      const desiredYaw = Math.atan2(this.virtualMoveX, this.virtualMoveZ);
      let diff = desiredYaw - this.boatYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.boatYaw += diff * Math.min(1, dt * 4.5);
      forwardInput = Math.min(1, Math.hypot(this.virtualMoveX, this.virtualMoveZ));
    } else if (this.autoSail) {
      const desiredYaw = this.computeAutoSailYaw(
        this.boat.root.position.x,
        this.boat.root.position.z,
        dest.x,
        dest.z,
      );
      let diff = desiredYaw - this.boatYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.boatYaw += diff * Math.min(1, dt * 4.2);
      forwardInput = 1;
    } else {
      this.boatYaw += steerInput * 1.85 * dt;
    }

    const activeSpeed = forwardInput * BOAT_SPEED;
    if (Math.abs(activeSpeed) > 0.1) {
      let nx = this.boat.root.position.x + Math.sin(this.boatYaw) * activeSpeed * dt;
      let nz = this.boat.root.position.z + Math.cos(this.boatYaw) * activeSpeed * dt;
      nx = THREE.MathUtils.clamp(nx, -250, 250);
      nz = THREE.MathUtils.clamp(nz, -250, 250);

      const [rx, rz] = this.resolveBoatCollisions(nx, nz);
      this.boat.root.position.x = rx;
      this.boat.root.position.z = rz;

      if (Math.random() < 0.35) {
        _vec3B.set(
          rx - Math.sin(this.boatYaw) * 1.9,
          0.12,
          rz - Math.cos(this.boatYaw) * 1.9,
        );
        this.spawnBurst(_vec3B, 0xe0f2fe, 2, 1.4);
      }
    }

    this.boat.root.position.y = Math.sin(this.elapsed * 2.8) * 0.08;
    this.boat.root.rotation.y = this.boatYaw;
    this.boat.root.rotation.z = Math.sin(this.elapsed * 2.1) * 0.04;

    this.boat.seatAnchor.getWorldPosition(_vec3A);
    this.player.root.position.copy(_vec3A);
    this.player.root.rotation.y = this.boatYaw;

    // Dock-only landing arrival check (cannot disembark on raw beaches!)
    let arrived: IslandId | null = null;
    if (this.sailingElapsed > 2.2) {
      const funafutiDist = Math.hypot(
        FUNAFUTI_DOCK_BOAT_POS.x - this.boat.root.position.x,
        FUNAFUTI_DOCK_BOAT_POS.z - this.boat.root.position.z,
      );
      if (funafutiDist < 5.0 && (this.sailingTarget === 'funafuti' || this.sailingElapsed > 6.0)) {
        arrived = 'funafuti';
      } else {
        for (const isl of OUTER_ISLANDS) {
          const dIslDock = Math.hypot(
            isl.position.x - this.boat.root.position.x,
            isl.position.z + 24.4 - this.boat.root.position.z,
          );
          if (dIslDock < 5.2) {
            arrived = isl.id;
            break;
          }
        }
      }
    }

    if (arrived || this.sailingEmitTimer >= 0.15) {
      this.sailingEmitTimer = 0;
      this.emitSailingTelemetry(arrived);
      if (arrived) {
        this.disembarkAtIsland(arrived);
      }
    }
  }

  private detectNearbyStation() {
    let next: string | null = null;
    if (this.screenMode === 'playing' && this.cookingStage === 'none' && !this.boarding?.active) {
      const px = this.player.root.position.x;
      const pz = this.player.root.position.z;
      if (this.zone === 'fishing') {
        if (pz > 10.5 && Math.abs(px) < 2.2) next = 'fishing_pier';
        else if (px > 26.5 && Math.abs(pz - (-5.5)) < 2.8) next = 'boat_dock';
        else if (pz < -1.0 && pz > -5.5 && Math.abs(px) < 2.6) next = 'kitchen_door';
      } else if (this.zone === 'kitchen') {
        if (px < -1.8 && pz > -9.2) next = 'market_stall';
        else if (pz < -9.5) next = 'cooking_battle';
        else if (px > 0.2 && pz > -9.0) next = 'cooking_battle';
      } else if (this.zone === 'island') {
        const isl = OUTER_ISLANDS.find((i) => i.id === this.currentIsland);
        if (isl) {
          if (Math.abs(px - isl.position.x) < 2.6 && pz > isl.position.z + 16.5) {
            next = 'boat_dock';
          } else {
            for (const gn of this.gatherNodes) {
              if (gn.islandId === this.currentIsland) {
                const d = Math.hypot(px - gn.worldX, pz - gn.worldZ);
                if (d < 2.8) {
                  next = `gather_node:${gn.islandId}:${gn.ingredientId}`;
                  break;
                }
              }
            }
          }
        }
      }
    }
    if (next !== this.nearStation) {
      this.nearStation = next;
      this.callbacks.onNearStationChange?.(next);
    }
  }

  private updateCamera(dt: number) {
    if (this.screenMode === 'title') {
      const ang = this.elapsed * 0.16;
      _camTargetPos.set(Math.sin(ang) * 21, 10.2, 6 + Math.cos(ang) * 16);
      _camTargetLook.set(0, 1.8, -2.5);
    } else if (this.cookingStage === 'wash') {
      _camTargetPos.set(-3.4, 3.8, -8.5);
      _camTargetLook.set(-3.4, 1.5, -12.1);
    } else if (this.cookingStage === 'prep') {
      _camTargetPos.set(0, 3.6, -9.2);
      _camTargetLook.set(0, 1.65, -12.1);
    } else if (this.cookingStage === 'cook') {
      _camTargetPos.set(3.4, 3.7, -8.8);
      _camTargetLook.set(3.4, 1.65, -12.1);
    } else if (this.cookingStage === 'judging' || this.cookingStage === 'result') {
      _camTargetPos.set(1.4, 3.8, -4.4);
      _camTargetLook.set(1.4, 1.55, -8.1);
    } else if (this.zone === 'kitchen') {
      _camTargetPos.set(this.player.root.position.x * 0.4, 8.6, -1.2);
      _camTargetLook.set(0, 1.4, -8.8);
    } else if (this.zone === 'sailing') {
      const bx = this.boat.root.position.x;
      const bz = this.boat.root.position.z;
      _camTargetPos.set(
        bx - Math.sin(this.boatYaw) * 10.5,
        6.8,
        bz - Math.cos(this.boatYaw) * 10.5,
      );
      _camTargetLook.set(
        bx + Math.sin(this.boatYaw) * 5.0,
        1.2,
        bz + Math.cos(this.boatYaw) * 5.0,
      );
    } else {
      const px = this.player.root.position.x;
      const py = this.player.root.position.y;
      const pz = this.player.root.position.z;
      _camTargetPos.set(px + 6.2, 7.6 + py * 0.35, pz + 9.4);
      _camTargetLook.set(
        px,
        1.3 + py * 0.3,
        pz + (this.fishingPhase !== 'idle' ? 2.6 : 0.3),
      );
    }

    const dampSpeed = this.zone === 'sailing' ? 4.8 : 5.8;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camTargetPos.x, dampSpeed, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camTargetPos.y, dampSpeed, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camTargetPos.z, dampSpeed, dt);

    this.cameraLookCurrent.x = THREE.MathUtils.damp(this.cameraLookCurrent.x, _camTargetLook.x, 6.5, dt);
    this.cameraLookCurrent.y = THREE.MathUtils.damp(this.cameraLookCurrent.y, _camTargetLook.y, 6.5, dt);
    this.cameraLookCurrent.z = THREE.MathUtils.damp(this.cameraLookCurrent.z, _camTargetLook.z, 6.5, dt);

    if (this.shakeIntensity > 0.002) {
      _vec3B.set(
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity,
      );
      this.camera.position.add(_vec3B);
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 14, dt);
    }

    this.camera.lookAt(this.cameraLookCurrent);
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.updateSimulation(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    this.textures.disposeAll();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
