import * as THREE from 'three';
import { FishSpecies } from '../types/game';
import { ProceduralTextureSet } from './textures';

export interface CharacterRig {
  root: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  head: THREE.Group;
  rodGroup?: THREE.Group;
  rodTip?: THREE.Object3D;
}

export function buildCharacterGroup(options: {
  skinColor: number;
  shirtColor: number;
  lavalavaColor: number;
  hasChefHat?: boolean;
  hasStrawHat?: boolean;
  hasFlowerCrown?: boolean;
  crownColor?: number;
  withRod?: boolean;
}): CharacterRig {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: options.skinColor,
    roughness: 0.65,
    metalness: 0.05,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: options.shirtColor,
    roughness: 0.85,
    metalness: 0.02,
  });
  const wrapMat = new THREE.MeshStandardMaterial({
    color: options.lavalavaColor,
    roughness: 0.9,
    metalness: 0.0,
  });

  // Legs (pivoted at hip y = 0.72)
  const makeLeg = (x: number) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(x, 0.72, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.34, 4, 8), skinMat);
    thigh.position.y = -0.28;
    thigh.castShadow = true;
    const sandal = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.08, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.75 }),
    );
    sandal.position.set(0, -0.66, 0.04);
    sandal.castShadow = true;
    legGroup.add(thigh, sandal);
    return legGroup;
  };

  const leftLeg = makeLeg(-0.17);
  const rightLeg = makeLeg(0.17);
  root.add(leftLeg, rightLeg);

  // Lavalava Skirt / Wrap
  const lavalava = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.34, 0.48, 14), wrapMat);
  lavalava.position.y = 0.68;
  lavalava.castShadow = true;
  root.add(lavalava);

  // Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.27, 0.62, 14), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  root.add(torso);

  // Apron Accent (if chef)
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.56, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.88 }),
  );
  apron.position.set(0, 1.02, 0.26);
  apron.castShadow = true;
  root.add(apron);

  // Head Group
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), skinMat);
  cranium.castShadow = true;
  head.add(cranium);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.1 });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
  leftEye.position.set(-0.085, 0.03, 0.21);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.085;
  head.add(leftEye, rightEye);

  // Hair cap
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.245, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
    new THREE.MeshStandardMaterial({ color: 0x1e1b18, roughness: 0.92 }),
  );
  hair.rotation.x = -0.2;
  head.add(hair);

  if (options.hasStrawHat) {
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xe3c07b, roughness: 0.88 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.03, 20), hatMat);
    brim.position.y = 0.14;
    brim.castShadow = true;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.16, 16), hatMat);
    crown.position.y = 0.22;
    const ribbon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.242, 0.242, 0.04, 16),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.5 }),
    );
    ribbon.position.y = 0.16;
    head.add(brim, crown, ribbon);
  } else if (options.hasChefHat) {
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.12, 16), hatMat);
    band.position.y = 0.2;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), hatMat);
    puff.position.y = 0.34;
    head.add(band, puff);
  } else if (options.hasFlowerCrown) {
    const crownRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.235, 0.045, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.75 }),
    );
    crownRing.rotation.x = Math.PI / 2;
    crownRing.position.y = 0.14;
    head.add(crownRing);

    const flowerMat = new THREE.MeshStandardMaterial({
      color: options.crownColor ?? 0xfacc15,
      roughness: 0.4,
      emissive: options.crownColor ?? 0xfacc15,
      emissiveIntensity: 0.15,
    });
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const flower = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), flowerMat);
      flower.position.set(Math.cos(ang) * 0.24, 0.16, Math.sin(ang) * 0.24);
      head.add(flower);
    }
  }

  root.add(head);

  // Arms
  const makeArm = (x: number) => {
    const arm = new THREE.Group();
    arm.position.set(x, 1.38, 0);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.18, 10), shirtMat);
    sleeve.position.y = -0.09;
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.32, 4, 8), skinMat);
    forearm.position.y = -0.3;
    forearm.castShadow = true;
    arm.add(sleeve, forearm);
    return arm;
  };

  const leftArm = makeArm(-0.36);
  const rightArm = makeArm(0.36);
  root.add(leftArm, rightArm);

  let rodGroup: THREE.Group | undefined;
  let rodTip: THREE.Object3D | undefined;
  if (options.withRod) {
    rodGroup = new THREE.Group();
    rodGroup.position.set(0, -0.46, 0.08);
    rodGroup.rotation.x = Math.PI * 0.35;

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.038, 0.38, 10),
      new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.75 }),
    );
    handle.position.y = 0.14;
    const reel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.22 }),
    );
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0.04, 0.26, 0.04);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.025, 2.3, 10),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.55, roughness: 0.35 }),
    );
    shaft.position.y = 1.4;
    shaft.castShadow = true;

    rodTip = new THREE.Object3D();
    rodTip.position.set(0, 2.55, 0);
    rodGroup.add(handle, reel, shaft, rodTip);
    rightArm.add(rodGroup);
  }

  return { root, leftArm, rightArm, leftLeg, rightLeg, head, rodGroup, rodTip };
}

export function buildFishMesh(species: FishSpecies): THREE.Group {
  const group = new THREE.Group();
  const isRareOrHigher = species.tier === 'epic' || species.tier === 'legendary' || species.tier === 'mythic';

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: species.primaryColor,
    roughness: isRareOrHigher ? 0.22 : 0.38,
    metalness: species.tier === 'mythic' ? 0.55 : species.tier === 'legendary' ? 0.35 : 0.12,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
  });

  const bellyMat = new THREE.MeshStandardMaterial({
    color: species.secondaryColor,
    roughness: 0.45,
    metalness: 0.1,
  });

  const finMat = new THREE.MeshStandardMaterial({
    color: species.finColor,
    roughness: 0.4,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });

  // 1. Primary Body (sculpted ellipsoid via LatheGeometry)
  const pts: THREE.Vector2[] = [];
  const len = species.bodyLength;
  const depth = species.bodyDepth;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = (t - 0.5) * len;
    const radius = Math.sin(Math.pow(t, 0.72) * Math.PI) * depth * 0.55;
    pts.push(new THREE.Vector2(Math.max(0.004, radius), x));
  }
  const bodyGeo = new THREE.LatheGeometry(pts, 16);
  bodyGeo.rotateZ(-Math.PI / 2);
  bodyGeo.scale(1, 1.15, 0.58);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // 2. Belly Highlight Strip
  const bellyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(depth * 0.42, 12, 10),
    bellyMat,
  );
  bellyMesh.scale.set((len * 0.75) / (depth * 0.84), 0.55, 0.46);
  bellyMesh.position.set(0.04, -depth * 0.14, 0);
  group.add(bellyMesh);

  // 3. Caudal Tail Fin (ExtrudeShape)
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(-0.34, 0.26);
  tailShape.lineTo(-0.2, 0);
  tailShape.lineTo(-0.34, -0.26);
  tailShape.closePath();
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  tailGeo.center();
  const tailMesh = new THREE.Mesh(tailGeo, finMat);
  tailMesh.position.set(-len * 0.52, 0, 0);
  tailMesh.castShadow = true;
  group.add(tailMesh);

  // 4. Dorsal Fin
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(-0.2, 0);
  dorsalShape.lineTo(-0.02, species.id.includes('sailfish') ? 0.52 : 0.26);
  dorsalShape.lineTo(0.22, 0);
  dorsalShape.closePath();
  const dorsalGeo = new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.02, bevelEnabled: false });
  dorsalGeo.center();
  const dorsalMesh = new THREE.Mesh(dorsalGeo, finMat);
  dorsalMesh.position.set(-0.04, depth * 0.52, 0);
  group.add(dorsalMesh);

  // 5. Pectoral Fins
  const pectGeo = new THREE.ConeGeometry(0.08, 0.22, 4);
  pectGeo.rotateZ(Math.PI * 0.35);
  const pectL = new THREE.Mesh(pectGeo, finMat);
  pectL.position.set(0.08, -0.04, depth * 0.34);
  pectL.rotation.y = 0.5;
  const pectR = pectL.clone();
  pectR.position.z = -depth * 0.34;
  pectR.rotation.y = -0.5;
  group.add(pectL, pectR);

  // 6. Eyes
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 });
  const eyePupil = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.1 });
  const eyeOffsetX = len * 0.31;
  const eyeOffsetZ = depth * 0.22;
  [-1, 1].forEach((side) => {
    const ew = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 10), eyeWhite);
    ew.position.set(eyeOffsetX, depth * 0.1, side * eyeOffsetZ);
    const ep = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), eyePupil);
    ep.position.set(eyeOffsetX + 0.015, depth * 0.1, side * (eyeOffsetZ + 0.028));
    group.add(ew, ep);
  });

  // 7. Swordbill for Sailfish / Marlin
  if (species.id.includes('sailfish') || species.id.includes('marlin')) {
    const bill = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, metalness: 0.4, roughness: 0.25 }),
    );
    bill.rotation.z = -Math.PI / 2;
    bill.position.set(len * 0.5 + 0.22, 0.02, 0);
    group.add(bill);
  }

  group.scale.setScalar(species.scaleFactor);
  return group;
}

export function buildPalmTreeGroup(): THREE.Group {
  const tree = new THREE.Group();

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6242, roughness: 0.92, metalness: 0.0 });
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.25, 1.8, 0.1),
    new THREE.Vector3(0.65, 3.6, 0.22),
    new THREE.Vector3(0.95, 5.2, 0.15),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 12, 0.22, 8, false);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const crownPos = new THREE.Vector3(0.95, 5.2, 0.15);

  // Coconuts cluster
  const cocoMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.75 });
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const coco = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), cocoMat);
    coco.position.set(
      crownPos.x + Math.cos(ang) * 0.24,
      crownPos.y - 0.18,
      crownPos.z + Math.sin(ang) * 0.24,
    );
    coco.castShadow = true;
    tree.add(coco);
  }

  // Arched Palm Fronds (7 fronds)
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x1e8e3e,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });
  const frondShape = new THREE.Shape();
  frondShape.moveTo(0, 0);
  frondShape.quadraticCurveTo(1.2, 0.5, 2.5, 0);
  frondShape.quadraticCurveTo(1.2, -0.5, 0, 0);
  const frondGeo = new THREE.PlaneGeometry(2.5, 0.85, 6, 2);
  const posAttr = frondGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const px = posAttr.getX(i);
    const py = posAttr.getY(i);
    const dist = (px + 1.25) / 2.5;
    const droop = -Math.pow(dist, 2) * 1.15;
    const taper = Math.sin(dist * Math.PI);
    posAttr.setY(i, py * taper);
    posAttr.setZ(i, droop);
  }
  frondGeo.computeVertexNormals();
  frondGeo.translate(1.25, 0, 0);

  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(frondGeo, frondMat);
    frond.position.copy(crownPos);
    frond.rotation.order = 'YXZ';
    frond.rotation.y = (i / 7) * Math.PI * 2 + (i % 2) * 0.2;
    frond.rotation.x = -Math.PI * 0.42;
    frond.castShadow = true;
    tree.add(frond);
  }

  return tree;
}

export function buildPierGroup(textures: ProceduralTextureSet): THREE.Group {
  const pier = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodPlank,
    roughness: 0.85,
    metalness: 0.02,
  });
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x5c3c24,
    roughness: 0.9,
    metalness: 0.02,
  });

  // Main walkway deck (z from 0 out to +11.5)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.24, 11.5), woodMat);
  deck.position.set(0, 0.82, 5.75);
  deck.castShadow = true;
  deck.receiveShadow = true;
  pier.add(deck);

  // Support pilings
  for (let z = 1; z <= 11; z += 2.5) {
    [-1.55, 1.55].forEach((x) => {
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.6, 10), postMat);
      piling.position.set(x, -0.1, z);
      piling.castShadow = true;
      pier.add(piling);
    });
  }

  // Mooring Bollards & Rope Railings at Pier Tip
  [-1.5, 1.5].forEach((x) => {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.72, 10), postMat);
    bollard.position.set(x, 1.18, 11.1);
    bollard.castShadow = true;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.14, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.75, roughness: 0.28 }),
    );
    cap.position.set(x, 1.56, 11.1);
    pier.add(bollard, cap);
  });

  // Lantern Post on Pier
  const lanternPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.3, 8), postMat);
  lanternPole.position.set(-1.55, 2.05, 8.8);
  const lanternGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      roughness: 0.15,
    }),
  );
  lanternGlass.position.set(-1.55, 3.2, 8.8);
  pier.add(lanternPole, lanternGlass);

  // Fish Basket & Tackle Box at Pier End
  const basket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.28, 0.48, 12),
    new THREE.MeshStandardMaterial({ map: textures.thatchWeave, roughness: 0.88 }),
  );
  basket.position.set(1.2, 1.18, 10.6);
  basket.castShadow = true;
  pier.add(basket);

  return pier;
}

export interface KitchenBuildingRefs {
  group: THREE.Group;
  roofGroup: THREE.Group;
  frontWallGroup: THREE.Group;
  washStationPos: THREE.Vector3;
  prepStationPos: THREE.Vector3;
  stoveStationPos: THREE.Vector3;
  marketStationPos: THREE.Vector3;
  judgeTablePos: THREE.Vector3;
  cuttingBoardFishAnchor: THREE.Group;
  potGroup: THREE.Group;
  potLiquid: THREE.Mesh;
  hearthGlow: THREE.PointLight;
  emberMesh: THREE.Mesh;
  playerPlate: THREE.Group;
  rivalPlate: THREE.Group;
  doorTrigger: THREE.Mesh;
  stationInteractables: { mesh: THREE.Object3D; action: string }[];
}

export function buildKitchenFaleGroup(textures: ProceduralTextureSet): KitchenBuildingRefs {
  const group = new THREE.Group();
  const stationInteractables: { mesh: THREE.Object3D; action: string }[] = [];

  const floorMat = new THREE.MeshStandardMaterial({
    map: textures.kitchenTile,
    roughness: 0.72,
    metalness: 0.05,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xdcc39b,
    roughness: 0.86,
  });
  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x5d3c23,
    roughness: 0.78,
  });
  const counterMat = new THREE.MeshStandardMaterial({
    color: 0xf1e8d6,
    roughness: 0.42,
    metalness: 0.05,
  });

  // Raised Platform Floor (x: -5.5..5.5, z: -5..5)
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(11.4, 0.45, 10.4),
    new THREE.MeshStandardMaterial({ map: textures.coralStone, roughness: 0.9 }),
  );
  foundation.position.set(0, 0.225, 0);
  foundation.receiveShadow = true;
  group.add(foundation);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.08, 10.0), floorMat);
  floor.position.set(0, 0.49, 0);
  floor.receiveShadow = true;
  group.add(floor);

  // Back & Side Walls
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(11.0, 4.2, 0.3), wallMat);
  backWall.position.set(0, 2.6, -4.85);
  backWall.castShadow = true;
  backWall.receiveShadow = true;

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 10.0), wallMat);
  leftWall.position.set(-5.35, 2.6, 0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 10.0), wallMat);
  rightWall.position.set(5.35, 2.6, 0);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;
  group.add(backWall, leftWall, rightWall);

  // Corner Wooden Pillars
  [
    [-5.25, -4.75],
    [5.25, -4.75],
    [-5.25, 4.75],
    [5.25, 4.75],
  ].forEach(([px, pz]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 4.4, 10), timberMat);
    post.position.set(px, 2.65, pz);
    post.castShadow = true;
    group.add(post);
  });

  // Front Wall with Open Doorway (fades/lifts when camera goes inside)
  const frontWallGroup = new THREE.Group();
  const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.2, 0.3), wallMat);
  frontLeft.position.set(-3.6, 2.6, 4.85);
  frontLeft.castShadow = true;
  const frontRight = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.2, 0.3), wallMat);
  frontRight.position.set(3.6, 2.6, 4.85);
  frontRight.castShadow = true;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 0.35), timberMat);
  lintel.position.set(0, 4.15, 4.85);
  // Signboard above doorway
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.55, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.45 }),
  );
  sign.position.set(0, 4.25, 5.05);
  frontWallGroup.add(frontLeft, frontRight, lintel, sign);
  group.add(frontWallGroup);

  const doorTrigger = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 2.8, 1.4),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  doorTrigger.position.set(0, 1.8, 4.85);
  group.add(doorTrigger);

  // Thatched Pandanus Roof Group (lifts smoothly when inside kitchen)
  const roofGroup = new THREE.Group();
  roofGroup.position.set(0, 4.6, 0);
  const roofMat = new THREE.MeshStandardMaterial({
    map: textures.thatchWeave,
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  const roofCone = new THREE.Mesh(new THREE.ConeGeometry(8.6, 2.9, 4), roofMat);
  roofCone.rotation.y = Math.PI / 4;
  roofCone.position.y = 1.45;
  roofCone.castShadow = true;
  const ridgeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.5, 8), timberMat);
  ridgeCap.position.y = 2.95;
  roofGroup.add(roofCone, ridgeCap);
  group.add(roofGroup);

  // --- STATION 1: Washing Sink (Back-Left: x = -3.4, z = -3.6) ---
  const washGroup = new THREE.Group();
  washGroup.position.set(-3.4, 0.53, -3.6);
  const sinkCabinet = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.3), timberMat);
  sinkCabinet.position.y = 0.5;
  sinkCabinet.castShadow = true;
  const sinkTop = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 1.4), counterMat);
  sinkTop.position.y = 1.04;
  const sinkBasin = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.18, 0.9),
    new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, roughness: 0.1, transmission: 0.3, opacity: 0.85, transparent: true }),
  );
  sinkBasin.position.y = 1.06;
  const faucetNeck = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.04, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.18 }),
  );
  faucetNeck.position.set(0, 1.25, -0.42);
  washGroup.add(sinkCabinet, sinkTop, sinkBasin, faucetNeck);
  group.add(washGroup);
  stationInteractables.push({ mesh: sinkCabinet, action: 'battle' });

  // --- STATION 2: Cutting Board Prep Station (Back-Center: x = 0, z = -3.6) ---
  const prepGroup = new THREE.Group();
  prepGroup.position.set(0, 0.53, -3.6);
  const prepTable = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 1.3), timberMat);
  prepTable.position.y = 0.5;
  prepTable.castShadow = true;
  const prepTop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 1.4), counterMat);
  prepTop.position.y = 1.04;
  const cuttingBoard = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.08, 0.86),
    new THREE.MeshStandardMaterial({ color: 0xd99b52, roughness: 0.7 }),
  );
  cuttingBoard.position.y = 1.14;
  cuttingBoard.receiveShadow = true;

  const cuttingBoardFishAnchor = new THREE.Group();
  cuttingBoardFishAnchor.position.set(0, 1.26, 0);

  // Chef Knife prop resting beside board
  const knifeBlade = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.018, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.14 }),
  );
  knifeBlade.position.set(0.88, 1.14, 0.1);
  knifeBlade.rotation.y = 0.4;
  const knifeHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.04, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.8 }),
  );
  knifeHandle.position.set(1.14, 1.14, -0.02);
  knifeHandle.rotation.y = 0.4;

  prepGroup.add(prepTable, prepTop, cuttingBoard, cuttingBoardFishAnchor, knifeBlade, knifeHandle);
  group.add(prepGroup);
  stationInteractables.push({ mesh: prepTable, action: 'battle' });

  // --- STATION 3: Coral-Stone Hearth & Cooking Pot (Back-Right: x = 3.4, z = -3.6) ---
  const stoveGroup = new THREE.Group();
  stoveGroup.position.set(3.4, 0.53, -3.6);
  const hearthBase = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.0, 1.35),
    new THREE.MeshStandardMaterial({ map: textures.coralStone, roughness: 0.88 }),
  );
  hearthBase.position.y = 0.5;
  hearthBase.castShadow = true;

  const emberMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.62, 0.08, 16),
    new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 1.4,
      roughness: 0.5,
    }),
  );
  emberMesh.position.y = 1.02;

  const potGroup = new THREE.Group();
  potGroup.position.set(0, 1.1, 0);
  const potMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.82, roughness: 0.3 });
  const potBody = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.46, 0.64, 18), potMat);
  potBody.position.y = 0.32;
  potBody.castShadow = true;
  const potRim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 8, 20), potMat);
  potRim.rotation.x = Math.PI / 2;
  potRim.position.y = 0.64;
  const potLiquid = new THREE.Mesh(
    new THREE.CircleGeometry(0.51, 18),
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
      roughness: 0.25,
    }),
  );
  potLiquid.rotation.x = -Math.PI / 2;
  potLiquid.position.y = 0.54;
  potGroup.add(potBody, potRim, potLiquid);

  const hearthGlow = new THREE.PointLight(0xff7b29, 2.4, 9, 1.5);
  hearthGlow.position.set(0, 1.7, 0.4);
  stoveGroup.add(hearthBase, emberMesh, potGroup, hearthGlow);
  group.add(stoveGroup);
  stationInteractables.push({ mesh: hearthBase, action: 'battle' });

  // --- STATION 4: Ingredient Market Shelf (Left Wall: x = -4.5, z = 0.6) ---
  const marketGroup = new THREE.Group();
  marketGroup.position.set(-4.35, 0.53, 0.6);
  const marketCounter = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 2.8), timberMat);
  marketCounter.position.y = 0.55;
  marketCounter.castShadow = true;
  const jarColors = [0xfb7185, 0x34d399, 0xfbbf24, 0xf8fafc];
  jarColors.forEach((col, i) => {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.34, 10),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }),
    );
    jar.position.set(0, 1.28, -0.9 + i * 0.6);
    marketGroup.add(jar);
  });
  marketGroup.add(marketCounter);
  group.add(marketGroup);
  stationInteractables.push({ mesh: marketCounter, action: 'market' });

  // --- STATION 5: Judge Tasting Table (Center-Right: x = 1.4, z = 0.8) ---
  const tableGroup = new THREE.Group();
  tableGroup.position.set(1.4, 0.53, 0.8);
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.14, 1.6), timberMat);
  tableTop.position.y = 0.92;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  const tableCloth = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 0.03, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.85 }),
  );
  tableCloth.position.y = 1.0;

  [-1.2, 1.2].forEach((lx) => {
    [-0.58, 0.58].forEach((lz) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8), timberMat);
      leg.position.set(lx, 0.45, lz);
      tableGroup.add(leg);
    });
  });

  const makePlate = (px: number) => {
    const pGroup = new THREE.Group();
    pGroup.position.set(px, 1.04, 0);
    const dishPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.3, 0.06, 18),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 }),
    );
    const garnishLeaf = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 12),
      new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.65 }),
    );
    garnishLeaf.rotation.x = -Math.PI / 2;
    garnishLeaf.position.y = 0.035;
    pGroup.add(dishPlate, garnishLeaf);
    return pGroup;
  };

  const playerPlate = makePlate(-0.65);
  const rivalPlate = makePlate(0.65);
  tableGroup.add(tableTop, tableCloth, playerPlate, rivalPlate);
  group.add(tableGroup);
  stationInteractables.push({ mesh: tableTop, action: 'battle' });

  return {
    group,
    roofGroup,
    frontWallGroup,
    washStationPos: new THREE.Vector3(-3.4, 0.53, -2.0),
    prepStationPos: new THREE.Vector3(0, 0.53, -2.0),
    stoveStationPos: new THREE.Vector3(3.4, 0.53, -2.0),
    marketStationPos: new THREE.Vector3(-2.9, 0.53, 0.6),
    judgeTablePos: new THREE.Vector3(1.4, 0.53, 2.2),
    cuttingBoardFishAnchor,
    potGroup,
    potLiquid,
    hearthGlow,
    emberMesh,
    playerPlate,
    rivalPlate,
    doorTrigger,
    stationInteractables,
  };
}

export function buildBoatDockGroup(textures: ProceduralTextureSet): THREE.Group {
  const dock = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodPlank,
    roughness: 0.85,
    metalness: 0.02,
  });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.9 });

  // Broad wooden jetty extending along +X (0..10.5)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.26, 4.2), woodMat);
  deck.position.set(5.25, 0.82, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  dock.add(deck);

  for (let x = 1.5; x <= 9.5; x += 2.6) {
    [-1.85, 1.85].forEach((z) => {
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 2.6, 10), postMat);
      piling.position.set(x, -0.05, z);
      piling.castShadow = true;
      dock.add(piling);
    });
  }

  // Harbor Signpost & Warm Beacon
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.8, 8), postMat);
  post.position.set(9.8, 2.2, -1.8);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.5,
      roughness: 0.15,
    }),
  );
  beacon.position.set(9.8, 3.65, -1.8);
  const signBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.7, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.5 }),
  );
  signBoard.position.set(9.8, 2.75, -1.8);
  dock.add(post, beacon, signBoard);

  return dock;
}

export function buildBoatGroup(): { root: THREE.Group; seatAnchor: THREE.Object3D } {
  const root = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x854d27, roughness: 0.72, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.45, metalness: 0.15 });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const bambooMat = new THREE.MeshStandardMaterial({ color: 0xd4a359, roughness: 0.78 });

  // 1. Main Carved Canoe Hull (aligned forward along +Z)
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 3.1, 6, 12), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1.05, 1.0, 0.65);
  hull.position.y = 0.35;
  hull.castShadow = true;
  root.add(hull);

  // 2. Painted Teal Bow & Gunwale Trim
  const bowTrim = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 8), trimMat);
  bowTrim.rotation.x = Math.PI / 2;
  bowTrim.position.set(0, 0.56, 2.05);
  root.add(bowTrim);

  // 3. Wooden Bench Deck
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.12, 1.9), bambooMat);
  bench.position.set(0, 0.72, -0.1);
  bench.receiveShadow = true;
  root.add(bench);

  // 4. Outrigger Pontoon & Crossbeams (Traditional Tuvaluan Paopao Ama)
  const ama = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 2.8, 4, 10), trimMat);
  ama.rotation.x = Math.PI / 2;
  ama.position.set(1.55, 0.18, 0);
  ama.castShadow = true;
  root.add(ama);

  [-0.95, 0.95].forEach((bz) => {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8), bambooMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(0.78, 0.58, bz);
    root.add(beam);
  });

  // 5. Mast & Traditional Lateen Sail Accent
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 3.6, 8), bambooMat);
  mast.position.set(0, 2.35, 0.7);
  mast.castShadow = true;
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(0, 2.7);
  sailShape.lineTo(-1.75, 0.5);
  sailShape.closePath();
  const sailGeo = new THREE.ShapeGeometry(sailShape);
  const sail = new THREE.Mesh(sailGeo, sailMat);
  sail.rotation.y = Math.PI / 2;
  sail.position.set(0.04, 1.15, 0.65);
  root.add(mast, sail);

  // 6. Bow Lantern
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 10),
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    }),
  );
  lantern.position.set(0, 1.0, 1.9);
  root.add(lantern);

  const seatAnchor = new THREE.Object3D();
  seatAnchor.position.set(0, 0.78, -0.2);
  root.add(seatAnchor);

  return { root, seatAnchor };
}

export function buildGatherNodeGroup(colorHex: number): THREE.Group {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.85, 0.25, 12),
    new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9 }),
  );
  base.position.y = 0.125;
  group.add(base);

  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.15,
    clearcoat: 0.9,
  });

  [
    [0, 0.65, 0, 0.28, 0.95, 0, 0],
    [-0.32, 0.45, 0.18, 0.2, 0.65, 0.35, 0.3],
    [0.34, 0.48, -0.15, 0.22, 0.7, -0.3, -0.28],
  ].forEach(([x, y, z, r, h, rx, rz]) => {
    const spike = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), crystalMat);
    spike.scale.set(1, h / (r * 2), 1);
    spike.position.set(x, y, z);
    spike.rotation.set(rx, 0.4, rz);
    spike.castShadow = true;
    group.add(spike);
  });

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.045, 8, 24),
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 0.8,
      roughness: 0.25,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.25;
  group.add(ring);

  return group;
}

