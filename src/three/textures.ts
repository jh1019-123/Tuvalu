import * as THREE from 'three';

export interface ProceduralTextureSet {
  sandColor: THREE.CanvasTexture;
  woodPlank: THREE.CanvasTexture;
  thatchWeave: THREE.CanvasTexture;
  kitchenTile: THREE.CanvasTexture;
  coralStone: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  disposeAll: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const textures: THREE.CanvasTexture[] = [];

  const finalize = (
    canvas: HTMLCanvasElement,
    repeatX = 1,
    repeatY = 1,
    isColor = true,
  ): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    textures.push(tex);
    return tex;
  };

  // 1. Coral Sand
  const [sandC, sandCtx] = makeCanvas(256, 256);
  sandCtx.fillStyle = '#f3e5c2';
  sandCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const tone = Math.random();
    sandCtx.fillStyle =
      tone > 0.65 ? 'rgba(255,250,235,0.6)' : tone > 0.3 ? 'rgba(218,195,152,0.5)' : 'rgba(244,180,165,0.28)';
    sandCtx.fillRect(x, y, 2, 2);
  }
  const sandColor = finalize(sandC, 6, 6);

  // 2. Weathered Pier Wood Planks
  const [woodC, woodCtx] = makeCanvas(256, 256);
  woodCtx.fillStyle = '#8b5e3c';
  woodCtx.fillRect(0, 0, 256, 256);
  for (let p = 0; p < 8; p++) {
    const y = p * 32;
    const shade = (p % 3) * 8 - 8;
    woodCtx.fillStyle = `rgb(${138 + shade}, ${94 + shade}, ${60 + shade})`;
    woodCtx.fillRect(0, y + 1, 256, 30);
    woodCtx.fillStyle = 'rgba(40, 22, 10, 0.35)';
    woodCtx.fillRect(0, y, 256, 2);
    for (let g = 0; g < 14; g++) {
      woodCtx.fillStyle = 'rgba(60, 35, 18, 0.16)';
      woodCtx.fillRect(0, y + 4 + g * 2, 256, 1);
    }
  }
  const woodPlank = finalize(woodC, 2, 4);

  // 3. Pandanus Thatch Weave
  const [thatchC, thatchCtx] = makeCanvas(256, 256);
  thatchCtx.fillStyle = '#a68246';
  thatchCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    for (let x = 0; x < 256; x += 16) {
      const shift = (y / 8) % 2 === 0 ? 0 : 8;
      thatchCtx.fillStyle = (x + y) % 32 === 0 ? '#b89456' : '#8e6b35';
      thatchCtx.fillRect((x + shift) % 256, y, 14, 6);
    }
  }
  const thatchWeave = finalize(thatchC, 4, 4);

  // 4. Kitchen Warm Terracotta / Coral Tile
  const [tileC, tileCtx] = makeCanvas(256, 256);
  tileCtx.fillStyle = '#e7dac3';
  tileCtx.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const shade = ((r + c) % 2 === 0 ? 8 : -6);
      tileCtx.fillStyle = `rgb(${224 + shade}, ${205 + shade}, ${175 + shade})`;
      tileCtx.fillRect(c * 64 + 2, r * 64 + 2, 60, 60);
    }
  }
  const kitchenTile = finalize(tileC, 4, 4);

  // 5. Coral Stone Masonry
  const [stoneC, stoneCtx] = makeCanvas(256, 256);
  stoneCtx.fillStyle = '#7c8288';
  stoneCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 230;
    const y = Math.random() * 230;
    const w = 18 + Math.random() * 26;
    const h = 12 + Math.random() * 18;
    const v = 100 + Math.floor(Math.random() * 45);
    stoneCtx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 8})`;
    stoneCtx.fillRect(x, y, w, h);
  }
  const coralStone = finalize(stoneC, 2, 2);

  // 6. Soft Contact Shadow Radial Gradient
  const [shadowC, shadowCtx] = makeCanvas(128, 128);
  const grad = shadowCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(5, 22, 30, 0.55)');
  grad.addColorStop(0.6, 'rgba(5, 22, 30, 0.22)');
  grad.addColorStop(1, 'rgba(5, 22, 30, 0)');
  shadowCtx.fillStyle = grad;
  shadowCtx.fillRect(0, 0, 128, 128);
  const contactShadow = finalize(shadowC, 1, 1, true);
  contactShadow.wrapS = THREE.ClampToEdgeWrapping;
  contactShadow.wrapT = THREE.ClampToEdgeWrapping;

  return {
    sandColor,
    woodPlank,
    thatchWeave,
    kitchenTile,
    coralStone,
    contactShadow,
    disposeAll: () => {
      textures.forEach((t) => t.dispose());
    },
  };
}
