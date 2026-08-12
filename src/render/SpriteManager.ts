import { TILE_SIZE } from '../game/constants';

export type SpriteKey = string;

const CACHE = new Map<SpriteKey, ImageBitmap | HTMLCanvasElement>();
let initialized = false;

export function isInitialized(): boolean { return initialized; }

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d')!;
}

// ── Deterministic hash ──
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 1013904223 + seed * 2654435761) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) & 0x7fffffff;
}

function hashf(x: number, y: number, seed: number): number {
  return hash(x, y, seed) / 0x7fffffff;
}

// ── Simple value noise for textures ──
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const ix = Math.floor(x / scale);
  const iy = Math.floor(y / scale);
  const fx = (x / scale) - ix;
  const fy = (y / scale) - iy;
  const sfx = fx * fx * (3 - 2 * fx);
  const sfy = fy * fy * (3 - 2 * fy);
  const a = hashf(ix, iy, seed);
  const b = hashf(ix + 1, iy, seed);
  const c = hashf(ix, iy + 1, seed);
  const d = hashf(ix + 1, iy + 1, seed);
  return a * (1 - sfx) * (1 - sfy) + b * sfx * (1 - sfy) + c * (1 - sfx) * sfy + d * sfx * sfy;
}

function fbmNoise(x: number, y: number, octaves: number, seed: number): number {
  let val = 0, amp = 0.5, freq = 1, maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    val += valueNoise(x * freq, y * freq, 4, seed + i * 1000) * amp;
    maxVal += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val / maxVal;
}

// ══════════════════════════════════════════════════════════════════════
// TERRAIN TEXTURES — multi-resolution tileable textures per biome
// ══════════════════════════════════════════════════════════════════════

interface BiomeParams {
  baseR: number; baseG: number; baseB: number;
  noiseR: number; noiseG: number; noiseB: number;
  noiseScale: number;
  detailAmount: number;
  detailColor: [number, number, number];
}

const BIOME_PARAMS: Record<string, BiomeParams> = {
  grass: {
    baseR: 58, baseG: 92, baseB: 42,
    noiseR: 15, noiseG: 25, noiseB: 12,
    noiseScale: 5, detailAmount: 0.3,
    detailColor: [45, 75, 35],
  },
  forest: {
    baseR: 30, baseG: 58, baseB: 18,
    noiseR: 12, noiseG: 20, noiseB: 8,
    noiseScale: 4, detailAmount: 0.45,
    detailColor: [22, 45, 14],
  },
  desert: {
    baseR: 175, baseG: 145, baseB: 95,
    noiseR: 20, noiseG: 18, noiseB: 12,
    noiseScale: 6, detailAmount: 0.25,
    detailColor: [195, 160, 110],
  },
  snow: {
    baseR: 210, baseG: 215, baseB: 220,
    noiseR: 10, noiseG: 10, noiseB: 12,
    noiseScale: 7, detailAmount: 0.15,
    detailColor: [230, 233, 237],
  },
  swamp: {
    baseR: 32, baseG: 50, baseB: 30,
    noiseR: 10, noiseG: 15, noiseB: 8,
    noiseScale: 5, detailAmount: 0.4,
    detailColor: [28, 42, 25],
  },
  volcanic: {
    baseR: 55, baseG: 20, baseB: 10,
    noiseR: 18, noiseG: 8, noiseB: 5,
    noiseScale: 4, detailAmount: 0.35,
    detailColor: [80, 25, 8],
  },
};

function generateTerrainTile(biome: string, variantX: number, variantY: number): HTMLCanvasElement {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const g = ctx(c);
  const p = BIOME_PARAMS[biome] || BIOME_PARAMS.grass;
  const seed = variantX * 10007 + variantY * 31 + 42;
  const imgData = g.createImageData(TILE_SIZE, TILE_SIZE);

  for (let py = 0; py < TILE_SIZE; py++) {
    for (let px = 0; px < TILE_SIZE; px++) {
      const wx = variantX * TILE_SIZE + px;
      const wy = variantY * TILE_SIZE + py;

      // Multi-scale noise
      const n1 = fbmNoise(wx, wy, 3, seed);
      const n2 = fbmNoise(wx + 500, wy + 500, 2, seed + 777);
      const n3 = valueNoise(wx, wy, 2, seed + 333);

      // Base variation
      const baseVar = (n1 - 0.5) * p.noiseR;
      const gVar = (n1 - 0.5) * p.noiseG;
      const bVar = (n1 - 0.5) * p.noiseB;

      // Detail layer — adds micro-texture
      const detail = n3 > 0.55 ? p.detailAmount : 0;

      let r = p.baseR + baseVar + (p.detailColor[0] - p.baseR) * detail;
      let g2 = p.baseG + gVar + (p.detailColor[1] - p.baseG) * detail;
      let b = p.baseB + bVar + (p.detailColor[2] - p.baseB) * detail;

      // Edge darkening for tile seamlessness
      const edgeX = Math.min(px, TILE_SIZE - 1 - px) / (TILE_SIZE * 0.3);
      const edgeY = Math.min(py, TILE_SIZE - 1 - py) / (TILE_SIZE * 0.3);
      const edgeFade = Math.min(1, edgeX) * Math.min(1, edgeY);
      const edgeMix = 0.75 + edgeFade * 0.25;
      r *= edgeMix;
      g2 *= edgeMix;
      b *= edgeMix;

      // Biome-specific micro-details
      if (biome === 'grass' || biome === 'forest') {
        // Grass blade highlights
        if (n2 > 0.6 && n3 > 0.5) {
          const blade = (n2 - 0.6) * 2.5;
          r += blade * 20;
          g2 += blade * 35;
          b += blade * 8;
        }
      } else if (biome === 'desert') {
        // Sand ripple
        const ripple = Math.sin(wx * 0.3 + wy * 0.1 + n1 * 4) * 0.5 + 0.5;
        if (ripple > 0.7) {
          const rv = (ripple - 0.7) * 3.3;
          r += rv * 12;
          g2 += rv * 10;
          b += rv * 5;
        }
      } else if (biome === 'snow') {
        // Sparkle
        if (n3 > 0.75 && n2 > 0.55) {
          r = Math.min(255, r + 25);
          g2 = Math.min(255, g2 + 25);
          b = Math.min(255, b + 30);
        }
      } else if (biome === 'volcanic') {
        // Lava veins
        const vein = Math.abs(Math.sin(wx * 0.2 + n1 * 8));
        if (vein > 0.85) {
          r = Math.min(255, r + 60);
          g2 = Math.min(255, g2 + 15);
          b = Math.min(255, b + 5);
        }
      } else if (biome === 'swamp') {
        // Murky water patches
        if (n2 > 0.6) {
          r *= 0.7;
          g2 *= 0.8;
          b *= 0.85;
        }
      }

      const idx = (py * TILE_SIZE + px) * 4;
      imgData.data[idx] = Math.max(0, Math.min(255, r | 0));
      imgData.data[idx + 1] = Math.max(0, Math.min(255, g2 | 0));
      imgData.data[idx + 2] = Math.max(0, Math.min(255, b | 0));
      imgData.data[idx + 3] = 255;
    }
  }

  g.putImageData(imgData, 0, 0);
  return c;
}

// ══════════════════════════════════════════════════════════════════════
// WATER TILES — animated-looking procedural water
// ══════════════════════════════════════════════════════════════════════

function generateWaterTile(variant: number): HTMLCanvasElement {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const g = ctx(c);
  const seed = variant * 7919 + 13;
  const imgData = g.createImageData(TILE_SIZE, TILE_SIZE);

  for (let py = 0; py < TILE_SIZE; py++) {
    for (let px = 0; px < TILE_SIZE; px++) {
      const wx = px;
      const wy = py;
      const n1 = fbmNoise(wx, wy, 3, seed);
      const n2 = valueNoise(wx, wy, 3, seed + 500);

      // Deep blue base with variation
      let r = 20 + n1 * 15;
      let g2 = 55 + n1 * 25 + n2 * 10;
      let b = 120 + n1 * 30 + n2 * 15;

      // Surface highlights (wave crests)
      if (n2 > 0.6) {
        const hl = (n2 - 0.6) * 2.5;
        r += hl * 30;
        g2 += hl * 40;
        b += hl * 50;
      }

      // Darker depths
      if (n1 < 0.35) {
        r *= 0.6;
        g2 *= 0.7;
        b *= 0.85;
      }

      const idx = (py * TILE_SIZE + px) * 4;
      imgData.data[idx] = Math.max(0, Math.min(255, r | 0));
      imgData.data[idx + 1] = Math.max(0, Math.min(255, g2 | 0));
      imgData.data[idx + 2] = Math.max(0, Math.min(255, b | 0));
      imgData.data[idx + 3] = 255;
    }
  }

  g.putImageData(imgData, 0, 0);
  return c;
}

// ══════════════════════════════════════════════════════════════════════
// TREE SPRITES — detailed multi-layer procedural trees
// ══════════════════════════════════════════════════════════════════════

function generateTreeSprite(biome: string, variant: number): HTMLCanvasElement {
  const c = createCanvas(TILE_SIZE, TILE_SIZE + 8);
  const g = ctx(c);
  const seed = variant * 137 + biome.length * 31;

  const isForest = biome === 'forest';
  const trunkColor = isForest ? '#1e1008' : '#2e1c08';
  const canopyDark = isForest ? '#0e2a08' : '#163d0c';
  const canopyMid = isForest ? '#143510' : '#1e5010';
  const canopyLight = isForest ? '#1c4518' : '#286220';
  const canopyHighlight = isForest ? '#224d1c' : '#327428';

  const trunkX = TILE_SIZE / 2 - 2 + (hashf(variant, 0, seed) - 0.5) * 4;
  const groundY = TILE_SIZE / 2 + 6;
  const treeH = 16 + hashf(variant, 1, seed) * 6;
  const trunkH = treeH * 0.55;

  // Ground shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(trunkX + 2, groundY + 1, 10, 3.5, 0, 0, Math.PI * 2);
  g.fill();

  // Trunk — bark texture
  const trunkW = 3 + hashf(variant, 2, seed) * 2;
  g.fillStyle = trunkColor;
  g.fillRect(trunkX, groundY - trunkH, trunkW, trunkH);

  // Bark lines
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    const by = groundY - trunkH + 3 + i * (trunkH / 3);
    g.beginPath();
    g.moveTo(trunkX + 0.5, by);
    g.lineTo(trunkX + trunkW - 0.5, by + 2);
    g.stroke();
  }

  // Trunk highlight
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(trunkX, groundY - trunkH, 1, trunkH);

  // Canopy layers (3 ellipses for volume)
  const cx = trunkX + trunkW / 2;
  const cy = groundY - trunkH - 2;

  // Dark back layer
  g.fillStyle = canopyDark;
  g.beginPath();
  g.ellipse(cx + 1, cy + 2, 11, 8, 0, 0, Math.PI * 2);
  g.fill();

  // Mid layer
  g.fillStyle = canopyMid;
  g.beginPath();
  g.ellipse(cx - 1, cy, 10, 7, 0, 0, Math.PI * 2);
  g.fill();

  // Light front layer
  g.fillStyle = canopyLight;
  g.beginPath();
  g.ellipse(cx, cy - 1, 8, 6, 0, 0, Math.PI * 2);
  g.fill();

  // Highlight spots
  g.fillStyle = canopyHighlight;
  g.beginPath();
  g.ellipse(cx - 3, cy - 2, 3, 2.5, -0.3, 0, Math.PI * 2);
  g.fill();

  // Leaf detail dots
  g.fillStyle = 'rgba(40,90,30,0.4)';
  for (let i = 0; i < 5; i++) {
    const lx = cx + (hashf(variant, i + 10, seed) - 0.5) * 14;
    const ly = cy + (hashf(variant, i + 20, seed) - 0.5) * 10;
    g.beginPath();
    g.arc(lx, ly, 1.5 + hashf(variant, i + 30, seed), 0, Math.PI * 2);
    g.fill();
  }

  return c;
}

// ══════════════════════════════════════════════════════════════════════
// BUILDING SPRITES — detailed factory-building sprites
// ══════════════════════════════════════════════════════════════════════

function generateBuildingSprite(type: string, variant: number): HTMLCanvasElement {
  const sizes: Record<string, { w: number; h: number }> = {
    miner: { w: 2, h: 2 }, furnace: { w: 2, h: 2 }, assembler: { w: 3, h: 3 },
    conveyor: { w: 1, h: 1 }, inserter: { w: 1, h: 1 }, storage: { w: 2, h: 2 },
    power_pole: { w: 1, h: 1 }, steam_engine: { w: 3, h: 2 }, boiler: { w: 2, h: 2 },
    lab: { w: 3, h: 3 }, radar: { w: 2, h: 2 }, turret: { w: 2, h: 2 },
    wall: { w: 1, h: 1 }, belt_junction: { w: 1, h: 1 }, splitter: { w: 2, h: 1 },
    underground_belt: { w: 1, h: 1 }, pumpjack: { w: 2, h: 2 }, refinery: { w: 3, h: 3 },
    chemical_plant: { w: 2, h: 2 }, pipe: { w: 1, h: 1 },
  };
  const s = sizes[type] || { w: 1, h: 1 };
  const w = s.w * TILE_SIZE;
  const h = s.h * TILE_SIZE;
  const c = createCanvas(w, h);
  const g = ctx(c);

  // Common base rendering
  drawBuildingBase(g, type, w, h, variant);
  drawBuildingDetails(g, type, w, h, variant);

  return c;
}

function drawBuildingBase(g: CanvasRenderingContext2D, type: string, w: number, h: number, _variant: number) {
  const colors: Record<string, { body: string; light: string; dark: string; accent: string }> = {
    miner:          { body: '#5a5a50', light: '#7a7a70', dark: '#3a3a30', accent: '#888880' },
    furnace:        { body: '#3a1a0a', light: '#5a3018', dark: '#2a0e04', accent: '#ff6600' },
    assembler:      { body: '#1a2a3a', light: '#2a4a6a', dark: '#0e1a2a', accent: '#4ab0ff' },
    conveyor:       { body: '#3a3830', light: '#5a5648', dark: '#211f1a', accent: '#888888' },
    inserter:       { body: '#4a3a10', light: '#6a5a30', dark: '#2a2008', accent: '#ffcc44' },
    storage:        { body: '#2a2218', light: '#4a3a28', dark: '#1a1410', accent: '#daa520' },
    power_pole:     { body: '#555550', light: '#777770', dark: '#333330', accent: '#88aaff' },
    steam_engine:   { body: '#101820', light: '#203040', dark: '#080e14', accent: '#b4dcff' },
    boiler:         { body: '#2a1808', light: '#4a3018', dark: '#1a0e04', accent: '#ff8800' },
    lab:            { body: '#081828', light: '#103050', dark: '#040c14', accent: '#00b4ff' },
    radar:          { body: '#182818', light: '#284828', dark: '#0c180c', accent: '#00ff64' },
    turret:         { body: '#281010', light: '#482020', dark: '#180808', accent: '#ff3333' },
    wall:           { body: '#3a3838', light: '#5a5858', dark: '#2a2828', accent: '#666666' },
    belt_junction:  { body: '#3a3830', light: '#5a5648', dark: '#211f1a', accent: '#888888' },
    splitter:       { body: '#404038', light: '#606058', dark: '#303028', accent: '#aaa888' },
    underground_belt: { body: '#303028', light: '#505048', dark: '#1a1a14', accent: '#777766' },
    pumpjack:       { body: '#1e1a10', light: '#3a3428', dark: '#100e08', accent: '#6a6050' },
    refinery:       { body: '#182030', light: '#283850', dark: '#0c1018', accent: '#ff6600' },
    chemical_plant: { body: '#18101e', light: '#282030', dark: '#0e0814', accent: '#00cc44' },
    pipe:           { body: '#1a1a1a', light: '#3a3a3a', dark: '#0a0a0a', accent: '#666666' },
  };
  const col = colors[type] || colors.wall;

  // Body
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, col.light);
  grad.addColorStop(0.4, col.body);
  grad.addColorStop(1, col.dark);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // Metal sheen top
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(2, 1, w - 4, 2);

  // Left highlight
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(1, 2, 1, h - 4);

  // Border
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, w - 1, h - 1);

  // Inner border highlight
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 0.5;
  g.strokeRect(1.5, 1.5, w - 3, h - 3);

  // Panel dividers for larger buildings
  g.strokeStyle = 'rgba(0,0,0,0.2)';
  g.lineWidth = 0.5;
  if (h >= TILE_SIZE * 2) {
    g.beginPath();
    g.moveTo(3, h / 2);
    g.lineTo(w - 3, h / 2);
    g.stroke();
  }
  if (w >= TILE_SIZE * 3) {
    g.beginPath();
    g.moveTo(w / 3, 3);
    g.lineTo(w / 3, h - 3);
    g.moveTo(w * 2 / 3, 3);
    g.lineTo(w * 2 / 3, h - 3);
    g.stroke();
  }

  // Corner rivets
  const ri = 4;
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(ri, ri, 3, 3);
  g.fillRect(w - ri - 3, ri, 3, 3);
  g.fillRect(ri, h - ri - 3, 3, 3);
  g.fillRect(w - ri - 3, h - ri - 3, 3, 3);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(ri, ri, 1, 1);
  g.fillRect(w - ri - 3, ri, 1, 1);
  g.fillRect(ri, h - ri - 3, 1, 1);
  g.fillRect(w - ri - 3, h - ri - 3, 1, 1);

  // Ambient occlusion (bottom edge)
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(2, h - 3, w - 4, 3);
}

function drawBuildingDetails(g: CanvasRenderingContext2D, type: string, w: number, h: number, _variant: number) {
  const cx = w / 2;
  const cy = h / 2;

  switch (type) {
    case 'miner': {
      // A-frame derrick
      g.strokeStyle = '#5a5a52';
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, 6);
      g.lineTo(6, h - 4);
      g.moveTo(cx, 6);
      g.lineTo(w - 6, h - 4);
      g.stroke();
      // Cross brace
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(8, h * 0.55);
      g.lineTo(w - 8, h * 0.55);
      g.stroke();
      g.lineCap = 'butt';
      // Drill head
      g.fillStyle = '#6a6a60';
      g.fillRect(cx - 8, cy + 2, 16, 4);
      g.fillRect(cx - 2, cy - 6, 4, 12);
      g.fillStyle = '#888880';
      g.beginPath();
      g.arc(cx, cy + 2, 4, 0, Math.PI * 2);
      g.fill();
      // Gear detail
      g.strokeStyle = '#999990';
      g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 3, cy + 2 + Math.sin(a) * 3);
        g.lineTo(cx + Math.cos(a) * 6, cy + 2 + Math.sin(a) * 6);
        g.stroke();
      }
      break;
    }
    case 'furnace': {
      // Chimney
      g.fillStyle = '#1a0a04';
      g.fillRect(cx - 3, -10, 6, 12);
      g.fillStyle = '#2a1208';
      g.fillRect(cx - 4, -11, 8, 3);
      // Brick texture on chimney
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(cx - 3, -5);
      g.lineTo(cx + 3, -5);
      g.stroke();
      // Fire opening
      g.fillStyle = '#0a0a0a';
      g.beginPath();
      g.arc(cx, cy, 8, 0, Math.PI * 2);
      g.fill();
      // Glow
      g.fillStyle = 'rgba(255,100,10,0.8)';
      g.beginPath();
      g.ellipse(cx, cy, 5, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,190,60,0.5)';
      g.beginPath();
      g.ellipse(cx, cy - 2, 3, 4, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'assembler': {
      // Central hub
      g.fillStyle = '#1a2a3a';
      g.beginPath();
      g.arc(cx, cy, 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#3a5a7a';
      g.lineWidth = 2;
      g.stroke();
      // 3 robotic arms
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const ex = cx + Math.cos(a) * 12;
        const ey = cy + Math.sin(a) * 12;
        g.strokeStyle = '#5a7a9a';
        g.lineWidth = 2.5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(ex, ey);
        g.stroke();
        g.fillStyle = '#8aaac0';
        g.beginPath();
        g.arc(ex, ey, 2.5, 0, Math.PI * 2);
        g.fill();
      }
      g.lineCap = 'butt';
      // Core
      g.fillStyle = '#4ab0ff';
      g.beginPath();
      g.arc(cx, cy, 3.5, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'lab': {
      // Flask
      g.fillStyle = '#006699';
      g.beginPath();
      g.moveTo(cx - 5, cy + 4);
      g.lineTo(cx + 5, cy + 4);
      g.lineTo(cx + 3, cy - 4);
      g.lineTo(cx - 3, cy - 4);
      g.fill();
      g.fillStyle = '#aaa';
      g.fillRect(cx - 2, cy - 8, 4, 6);
      // Science glow
      g.fillStyle = 'rgba(0,180,255,0.3)';
      g.beginPath();
      g.arc(cx, cy, 12, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'turret': {
      // Base ring
      g.fillStyle = '#880000';
      g.beginPath();
      g.arc(cx, cy, 6, 0, Math.PI * 2);
      g.fill();
      // Barrel
      g.strokeStyle = '#cc0000';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + 14, cy);
      g.stroke();
      g.lineCap = 'butt';
      break;
    }
    case 'power_pole': {
      g.fillStyle = '#555';
      g.fillRect(cx - 1.5, 4, 3, h - 8);
      g.fillRect(4, 6, w - 8, 2);
      g.fillStyle = '#8af';
      g.beginPath();
      g.arc(6, 6, 2, 0, Math.PI * 2);
      g.arc(w - 6, 6, 2, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'radar': {
      // Base dish
      g.fillStyle = 'rgba(0,200,80,0.15)';
      g.beginPath();
      g.arc(cx, cy, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0f0';
      g.beginPath();
      g.arc(cx, cy, 2, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'storage': {
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(4, h / 2);
      g.lineTo(w - 4, h / 2);
      g.stroke();
      g.fillStyle = '#daa520';
      g.beginPath();
      g.arc(cx, cy, 3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'wall': {
      // Brick pattern
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      g.lineWidth = 0.5;
      for (let row = 0; row < 3; row++) {
        const ry = 4 + row * 9;
        g.beginPath();
        g.moveTo(2, ry);
        g.lineTo(w - 2, ry);
        g.stroke();
        const offset = row % 2 === 0 ? w / 2 : 0;
        g.beginPath();
        g.moveTo(offset, ry);
        g.lineTo(offset, ry + 9);
        g.stroke();
      }
      break;
    }
    case 'boiler': {
      // Firebox opening
      g.fillStyle = '#0a0a08';
      g.beginPath();
      g.ellipse(cx, cy + 4, 6, 8, 0, 0, Math.PI * 2);
      g.fill();
      // Fire
      g.fillStyle = 'rgba(255,100,10,0.85)';
      g.beginPath();
      g.ellipse(cx, cy + 4, 4, 6, 0, 0, Math.PI * 2);
      g.fill();
      // Pressure gauge
      g.fillStyle = '#1a1a18';
      g.beginPath();
      g.arc(w - 7, 7, 5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#44ff88';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(w - 7, 7, 3.5, -Math.PI * 0.8, Math.PI * 0.3);
      g.stroke();
      break;
    }
    case 'steam_engine': {
      // Cylinder block
      g.fillStyle = '#101820';
      g.fillRect(3, 4, w * 0.48, h - 8);
      g.fillStyle = '#1a2838';
      g.fillRect(w * 0.38, h * 0.3, w * 0.22, h * 0.4);
      // Flywheel
      const swCx = w * 0.72;
      const swCy = h * 0.5;
      g.strokeStyle = '#3a5060';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(swCx, swCy, Math.min(w, h) * 0.28, 0, Math.PI * 2);
      g.stroke();
      // Spokes
      g.lineWidth = 2;
      g.strokeStyle = '#2a3a48';
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const r2 = Math.min(w, h) * 0.28;
        g.beginPath();
        g.moveTo(swCx, swCy);
        g.lineTo(swCx + Math.cos(a) * r2, swCy + Math.sin(a) * r2);
        g.stroke();
      }
      g.fillStyle = '#4a6070';
      g.beginPath();
      g.arc(swCx, swCy, 4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'pumpjack': {
      // Derrick frame
      g.strokeStyle = '#3a3428';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, 5);
      g.lineTo(6, h - 7);
      g.moveTo(cx, 5);
      g.lineTo(w - 6, h - 7);
      g.stroke();
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(9, h * 0.55);
      g.lineTo(w - 9, h * 0.55);
      g.stroke();
      g.lineCap = 'butt';
      // Platform
      g.fillStyle = '#141008';
      g.fillRect(3, h - 7, w - 6, 7);
      break;
    }
    case 'pipe': {
      g.fillStyle = '#2a2a2a';
      g.fillRect(0, TILE_SIZE / 2 - 4, TILE_SIZE, 8);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(0, TILE_SIZE / 2 - 4, TILE_SIZE, 1);
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 0.5;
      g.strokeRect(0, TILE_SIZE / 2 - 4, TILE_SIZE, 8);
      break;
    }
    case 'solar_panel': {
      // Blue photovoltaic panel
      g.fillStyle = '#1a3a70';
      g.fillRect(4, 6, w - 8, h - 10);
      g.fillStyle = '#2255aa';
      g.fillRect(5, 7, w - 10, h - 12);
      // Grid lines
      g.strokeStyle = '#1a3060';
      g.lineWidth = 0.8;
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(5, 7 + i * (h - 12) / 4);
        g.lineTo(w - 5, 7 + i * (h - 12) / 4);
        g.stroke();
      }
      for (let i = 1; i < 3; i++) {
        g.beginPath();
        g.moveTo(5 + i * (w - 10) / 3, 7);
        g.lineTo(5 + i * (w - 10) / 3, h - 5);
        g.stroke();
      }
      // Reflective sheen
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(6, 7, (w - 10) / 2, (h - 12) / 3);
      break;
    }
    case 'accumulator': {
      // Battery bank
      g.fillStyle = '#aa8800';
      g.fillRect(6, 8, w - 12, h - 14);
      g.fillStyle = '#ccaa00';
      g.fillRect(7, 9, w - 14, h - 16);
      // Charge indicator
      g.fillStyle = '#44ff44';
      g.fillRect(8, 10, w - 16, 2);
      // + terminal
      g.fillStyle = '#888';
      g.fillRect(cx - 2, 5, 4, 4);
      g.fillStyle = '#aaa';
      g.fillRect(cx - 1, 6, 2, 2);
      break;
    }
    case 'laser_turret': {
      // Turret base
      g.fillStyle = '#2a2a6a';
      g.beginPath();
      g.arc(cx, cy, 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#4a4aaa';
      g.lineWidth = 2;
      g.stroke();
      // Laser barrel
      g.fillStyle = '#4444cc';
      g.fillRect(cx - 2, 2, 4, cy - 4);
      // Lens
      g.fillStyle = '#aaffff';
      g.beginPath();
      g.arc(cx, 3, 3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'flak_cannon': {
      // Dual barrel
      g.fillStyle = '#4a2020';
      g.beginPath();
      g.arc(cx, cy + 2, 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#6a3030';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 3, cy - 2);
      g.lineTo(cx - 3, 2);
      g.moveTo(cx + 3, cy - 2);
      g.lineTo(cx + 3, 2);
      g.stroke();
      g.lineCap = 'butt';
      // Ammo belt
      g.fillStyle = '#aa8844';
      g.fillRect(w - 8, cy - 2, 4, 6);
      break;
    }
    case 'tesla_coil': {
      // Tesla coil tower
      g.fillStyle = '#3a2060';
      g.fillRect(cx - 2, 6, 4, h - 10);
      // Top orb
      g.fillStyle = '#8844ff';
      g.beginPath();
      g.arc(cx, 6, 5, 0, Math.PI * 2);
      g.fill();
      // Lightning bolts
      g.strokeStyle = '#cc88ff';
      g.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.5;
        g.beginPath();
        g.moveTo(cx, 6);
        const mx = cx + Math.cos(a) * 6;
        const my = 6 + Math.sin(a) * 6;
        g.lineTo(mx + Math.cos(a) * 4, my + Math.sin(a) * 4);
        g.stroke();
      }
      break;
    }
    case 'mine': {
      // Land mine — flat disc with red center
      g.fillStyle = '#5a3010';
      g.beginPath();
      g.arc(cx, cy + 2, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#884420';
      g.beginPath();
      g.arc(cx, cy + 2, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#cc2200';
      g.beginPath();
      g.arc(cx, cy + 2, 2.5, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'roboport': {
      // Robot port — large building with antenna
      g.fillStyle = '#1a4060';
      g.fillRect(4, h * 0.3, w - 8, h * 0.7 - 4);
      // Antenna
      g.strokeStyle = '#4a8090';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, h * 0.3);
      g.lineTo(cx, 4);
      g.stroke();
      g.lineCap = 'butt';
      // Dish
      g.fillStyle = '#6aaccc';
      g.beginPath();
      g.arc(cx, 5, 4, 0, Math.PI * 2);
      g.fill();
      // Door
      g.fillStyle = '#0a2040';
      g.fillRect(cx - 4, h * 0.6, 8, h * 0.3 - 4);
      break;
    }
    case 'pump': {
      // Water pump
      g.fillStyle = '#2a3a4a';
      g.fillRect(4, 8, w - 8, h - 12);
      // Pipe nozzle
      g.fillStyle = '#4a5a6a';
      g.fillRect(cx - 2, 3, 4, 8);
      g.fillRect(cx - 4, 3, 8, 3);
      // Water indicator
      g.fillStyle = '#4488cc';
      g.fillRect(6, h * 0.5, w - 12, 3);
      break;
    }
    case 'silo': {
      // Rocket silo — massive structure
      g.fillStyle = '#3a3a44';
      g.fillRect(4, h * 0.2, w - 8, h * 0.8 - 4);
      // Launch tube
      g.fillStyle = '#2a2a30';
      g.fillRect(cx - 6, h * 0.1, 12, h * 0.5);
      // Opening
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(cx, h * 0.15, 5, Math.PI, 0);
      g.fill();
      // Rivets
      g.fillStyle = '#555';
      for (let i = 0; i < 4; i++) {
        g.fillRect(6 + i * ((w - 12) / 3), h - 8, 3, 3);
      }
      break;
    }
    case 'beacon': {
      // Beacon — glowing module
      g.fillStyle = '#2a2a5a';
      g.fillRect(6, 8, w - 12, h - 12);
      // Antenna
      g.strokeStyle = '#4a4a8a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx, 8);
      g.lineTo(cx, 3);
      g.stroke();
      // Rings
      g.strokeStyle = '#6a6acc';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, 3, 3, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(cx, 3, 6, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'centrifuge': {
      // Centrifuge — circular with blades
      g.fillStyle = '#1a4a1a';
      g.beginPath();
      g.arc(cx, cy, Math.min(w, h) * 0.4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2a6a2a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, Math.min(w, h) * 0.4, 0, Math.PI * 2);
      g.stroke();
      // Blades
      g.strokeStyle = '#4a8a4a';
      g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
        g.stroke();
      }
      // Center
      g.fillStyle = '#88cc88';
      g.beginPath();
      g.arc(cx, cy, 3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'artillery': {
      // Artillery — large gun on tracks
      g.fillStyle = '#3a3828';
      g.fillRect(4, h * 0.5, w - 8, h * 0.4);
      // Turret
      g.fillStyle = '#4a4a38';
      g.beginPath();
      g.arc(cx, cy - 2, 8, 0, Math.PI * 2);
      g.fill();
      // Barrel
      g.strokeStyle = '#5a5a48';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy - 2);
      g.lineTo(cx + 20, cy - 6);
      g.stroke();
      g.lineCap = 'butt';
      // Tracks
      g.fillStyle = '#2a2820';
      g.fillRect(4, h - 8, 8, 4);
      g.fillRect(w - 12, h - 8, 8, 4);
      break;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// ENTITY SPRITES — player, enemies, NPCs
// ══════════════════════════════════════════════════════════════════════

function generatePlayerSprite(skinColor: string, _variant: number): HTMLCanvasElement {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const g = ctx(c);
  const cx = TILE_SIZE / 2;
  const cy = TILE_SIZE / 2;

  // Shadow
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(cx, cy + 12, 7, 3, 0, 0, Math.PI * 2);
  g.fill();

  // Body (torso)
  const bodyGrad = g.createLinearGradient(cx - 6, cy - 4, cx + 6, cy + 8);
  bodyGrad.addColorStop(0, '#4a6a3a');
  bodyGrad.addColorStop(1, '#2a4a1a');
  g.fillStyle = bodyGrad;
  g.beginPath();
  g.ellipse(cx, cy + 1, 7, 9, 0, 0, Math.PI * 2);
  g.fill();

  // Arms
  g.strokeStyle = '#3a5a2a';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - 5, cy);
  g.lineTo(cx - 9, cy + 6);
  g.moveTo(cx + 5, cy);
  g.lineTo(cx + 9, cy + 6);
  g.stroke();
  g.lineCap = 'butt';

  // Head
  const headGrad = g.createRadialGradient(cx - 1, cy - 7, 1, cx, cy - 6, 6);
  headGrad.addColorStop(0, lightenSkinColor(skinColor, 30));
  headGrad.addColorStop(1, skinColor);
  g.fillStyle = headGrad;
  g.beginPath();
  g.arc(cx, cy - 6, 6, 0, Math.PI * 2);
  g.fill();

  // Eyes
  g.fillStyle = '#fff';
  g.fillRect(cx - 3, cy - 7, 2, 2);
  g.fillRect(cx + 1, cy - 7, 2, 2);
  g.fillStyle = '#222';
  g.fillRect(cx - 2, cy - 7, 1, 1);
  g.fillRect(cx + 2, cy - 7, 1, 1);

  // Hair
  g.fillStyle = '#3a2a1a';
  g.beginPath();
  g.ellipse(cx, cy - 10, 5, 3, 0, Math.PI, Math.PI * 2);
  g.fill();

  // Legs
  g.fillStyle = '#2a3a4a';
  g.fillRect(cx - 4, cy + 8, 3, 6);
  g.fillRect(cx + 1, cy + 8, 3, 6);

  // Boots
  g.fillStyle = '#1a1a1a';
  g.fillRect(cx - 4, cy + 12, 3, 2);
  g.fillRect(cx + 1, cy + 12, 3, 2);

  return c;
}

function lightenSkinColor(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}

function generateEnemySprite(type: string, _variant: number): HTMLCanvasElement {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const g = ctx(c);
  const cx = TILE_SIZE / 2;
  const cy = TILE_SIZE / 2;

  switch (type) {
    case 'biter': {
      // Shadow
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(cx, cy + 11, 9, 3.5, 0, 0, Math.PI * 2);
      g.fill();

      // Body
      const bodyGrad = g.createRadialGradient(cx, cy, 2, cx, cy, 10);
      bodyGrad.addColorStop(0, '#8b4040');
      bodyGrad.addColorStop(1, '#5a1818');
      g.fillStyle = bodyGrad;
      g.beginPath();
      g.ellipse(cx, cy + 2, 9, 7, 0, 0, Math.PI * 2);
      g.fill();

      // Segmented body lines
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 0.8;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cx - 8, cy + 2 + i * 3);
        g.lineTo(cx + 8, cy + 2 + i * 3);
        g.stroke();
      }

      // Head
      g.fillStyle = '#7a3030';
      g.beginPath();
      g.ellipse(cx, cy - 5, 6, 5, 0, 0, Math.PI * 2);
      g.fill();

      // Mandibles
      g.strokeStyle = '#994040';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 3, cy - 2);
      g.lineTo(cx - 6, cy + 1);
      g.moveTo(cx + 3, cy - 2);
      g.lineTo(cx + 6, cy + 1);
      g.stroke();
      g.lineCap = 'butt';

      // Eyes (glowing)
      g.fillStyle = '#ff4444';
      g.beginPath();
      g.arc(cx - 3, cy - 6, 2, 0, Math.PI * 2);
      g.arc(cx + 3, cy - 6, 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff8888';
      g.beginPath();
      g.arc(cx - 3, cy - 6.5, 0.8, 0, Math.PI * 2);
      g.arc(cx + 3, cy - 6.5, 0.8, 0, Math.PI * 2);
      g.fill();

      // Legs
      g.strokeStyle = '#6a2020';
      g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const lx = cx - 6 + i * 6;
        g.beginPath();
        g.moveTo(lx, cy + 6);
        g.lineTo(lx - 2, cy + 12);
        g.stroke();
        g.beginPath();
        g.moveTo(lx + 1, cy + 6);
        g.lineTo(lx + 3, cy + 12);
        g.stroke();
      }
      break;
    }
    case 'spitter': {
      // Shadow
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(cx, cy + 11, 8, 3, 0, 0, Math.PI * 2);
      g.fill();

      // Body (bulbous)
      const spGrad = g.createRadialGradient(cx, cy + 3, 2, cx, cy + 3, 9);
      spGrad.addColorStop(0, '#4a8b40');
      spGrad.addColorStop(1, '#184a18');
      g.fillStyle = spGrad;
      g.beginPath();
      g.ellipse(cx, cy + 3, 8, 8, 0, 0, Math.PI * 2);
      g.fill();

      // Head (large mouth)
      g.fillStyle = '#3a7a30';
      g.beginPath();
      g.ellipse(cx, cy - 4, 7, 5, 0, 0, Math.PI * 2);
      g.fill();

      // Mouth
      g.fillStyle = '#2a1a0a';
      g.beginPath();
      g.ellipse(cx, cy - 1, 5, 3, 0, 0, Math.PI * 2);
      g.fill();

      // Eyes
      g.fillStyle = '#ffff00';
      g.beginPath();
      g.arc(cx - 4, cy - 5, 2.5, 0, Math.PI * 2);
      g.arc(cx + 4, cy - 5, 2.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(cx - 4, cy - 5, 1, 0, Math.PI * 2);
      g.arc(cx + 4, cy - 5, 1, 0, Math.PI * 2);
      g.fill();

      // Acid drips
      g.fillStyle = 'rgba(100,200,50,0.6)';
      g.beginPath();
      g.arc(cx - 2, cy + 2, 1.5, 0, Math.PI * 2);
      g.arc(cx + 3, cy + 3, 1, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'worm': {
      // Base mound
      g.fillStyle = '#3a2020';
      g.beginPath();
      g.ellipse(cx, cy + 6, 14, 8, 0, 0, Math.PI * 2);
      g.fill();

      // Fleshy tube
      g.fillStyle = '#6a3030';
      g.beginPath();
      g.ellipse(cx, cy - 2, 7, 10, 0, 0, Math.PI * 2);
      g.fill();

      // Mouth opening
      g.fillStyle = '#2a0808';
      g.beginPath();
      g.arc(cx, cy - 6, 5, 0, Math.PI * 2);
      g.fill();

      // Teeth
      g.fillStyle = '#ccccaa';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const tx = cx + Math.cos(a) * 4.5;
        const ty = cy - 6 + Math.sin(a) * 4.5;
        g.beginPath();
        g.moveTo(tx, ty);
        g.lineTo(tx + Math.cos(a) * 3, ty + Math.sin(a) * 3);
        g.strokeStyle = '#ccccaa';
        g.lineWidth = 1;
        g.stroke();
      }

      // Eyes
      g.fillStyle = '#ff2222';
      g.beginPath();
      g.arc(cx - 5, cy - 8, 2, 0, Math.PI * 2);
      g.arc(cx + 5, cy - 8, 2, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'behemoth': {
      // Large shadow
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      g.ellipse(cx, cy + 12, 14, 5, 0, 0, Math.PI * 2);
      g.fill();

      // Massive body
      const bGrad = g.createRadialGradient(cx, cy, 4, cx, cy, 14);
      bGrad.addColorStop(0, '#7a3050');
      bGrad.addColorStop(1, '#3a1020');
      g.fillStyle = bGrad;
      g.beginPath();
      g.ellipse(cx, cy + 2, 13, 11, 0, 0, Math.PI * 2);
      g.fill();

      // Armored plates
      g.strokeStyle = 'rgba(150,80,100,0.4)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.ellipse(cx, cy + 2 - i * 2.5, 11 - i, 2, 0, 0, Math.PI * 2);
        g.stroke();
      }

      // Head
      g.fillStyle = '#5a2040';
      g.beginPath();
      g.ellipse(cx, cy - 8, 8, 6, 0, 0, Math.PI * 2);
      g.fill();

      // Horns
      g.strokeStyle = '#aa8860';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 5, cy - 10);
      g.lineTo(cx - 10, cy - 16);
      g.moveTo(cx + 5, cy - 10);
      g.lineTo(cx + 10, cy - 16);
      g.stroke();
      g.lineCap = 'butt';

      // Eyes
      g.fillStyle = '#ff0000';
      g.beginPath();
      g.arc(cx - 4, cy - 9, 2.5, 0, Math.PI * 2);
      g.arc(cx + 4, cy - 9, 2.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff6666';
      g.beginPath();
      g.arc(cx - 4, cy - 9.5, 1, 0, Math.PI * 2);
      g.arc(cx + 4, cy - 9.5, 1, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'spawner': {
      // Organic mound
      const spGrad2 = g.createRadialGradient(cx, cy + 2, 4, cx, cy + 2, 14);
      spGrad2.addColorStop(0, '#5a2a30');
      spGrad2.addColorStop(0.6, '#3a1418');
      spGrad2.addColorStop(1, '#1a0a0c');
      g.fillStyle = spGrad2;
      g.beginPath();
      g.ellipse(cx, cy + 2, 14, 10, 0, 0, Math.PI * 2);
      g.fill();

      // Pulsing core
      g.fillStyle = '#ff3333';
      g.beginPath();
      g.arc(cx, cy, 4, 0, Math.PI * 2);
      g.fill();

      // Spawn holes
      g.fillStyle = '#1a0808';
      for (let i = 0; i < 3; i++) {
        const hx = cx + Math.cos(i * 2.1) * 8;
        const hy = cy + Math.sin(i * 2.1) * 5 + 2;
        g.beginPath();
        g.arc(hx, hy, 3, 0, Math.PI * 2);
        g.fill();
      }

      // Veins
      g.strokeStyle = 'rgba(150,30,30,0.5)';
      g.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 8);
        g.stroke();
      }
      break;
    }
    case 'destroyer': {
      // Flying robotic destroyer — angular metallic
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(cx, cy + 10, 6, 2.5, 0, 0, Math.PI * 2);
      g.fill();
      // Wings
      const wingGrad = g.createLinearGradient(cx - 14, cy - 2, cx, cy + 2);
      wingGrad.addColorStop(0, '#1a1a2a');
      wingGrad.addColorStop(1, '#3a3a5a');
      g.fillStyle = wingGrad;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx - 14, cy - 4);
      g.lineTo(cx - 12, cy + 4);
      g.closePath();
      g.fill();
      const wingGrad2 = g.createLinearGradient(cx, cy + 2, cx + 14, cy - 2);
      wingGrad2.addColorStop(0, '#3a3a5a');
      wingGrad2.addColorStop(1, '#1a1a2a');
      g.fillStyle = wingGrad2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + 14, cy - 4);
      g.lineTo(cx + 12, cy + 4);
      g.closePath();
      g.fill();
      // Body core
      const dGrad = g.createRadialGradient(cx, cy, 1, cx, cy, 6);
      dGrad.addColorStop(0, '#4a4a6a');
      dGrad.addColorStop(1, '#2a2a3a');
      g.fillStyle = dGrad;
      g.beginPath();
      g.ellipse(cx, cy, 6, 4, 0, 0, Math.PI * 2);
      g.fill();
      // Engine glow
      g.fillStyle = '#ff4400';
      g.beginPath();
      g.arc(cx - 2, cy + 3, 2, 0, Math.PI * 2);
      g.arc(cx + 2, cy + 3, 2, 0, Math.PI * 2);
      g.fill();
      // Eye
      g.fillStyle = '#ff0000';
      g.beginPath();
      g.arc(cx, cy - 1, 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff6666';
      g.beginPath();
      g.arc(cx, cy - 1.5, 0.8, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'leviathan': {
      // Massive ground boss
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.ellipse(cx, cy + 12, 14, 5, 0, 0, Math.PI * 2);
      g.fill();
      const lGrad = g.createRadialGradient(cx, cy, 4, cx, cy, 14);
      lGrad.addColorStop(0, '#5a1a5a');
      lGrad.addColorStop(0.5, '#3a0a3a');
      lGrad.addColorStop(1, '#1a0018');
      g.fillStyle = lGrad;
      g.beginPath();
      g.ellipse(cx, cy + 2, 14, 11, 0, 0, Math.PI * 2);
      g.fill();
      // Segmented shell
      g.strokeStyle = 'rgba(120,30,120,0.5)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.ellipse(cx, cy + 2 - i * 2, 13 - i * 1.5, 2, 0, 0, Math.PI * 2);
        g.stroke();
      }
      // Massive head
      g.fillStyle = '#4a1040';
      g.beginPath();
      g.ellipse(cx, cy - 8, 9, 7, 0, 0, Math.PI * 2);
      g.fill();
      // 4 horns
      g.strokeStyle = '#aa6644';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 6, cy - 10);
      g.lineTo(cx - 11, cy - 17);
      g.moveTo(cx + 6, cy - 10);
      g.lineTo(cx + 11, cy - 17);
      g.moveTo(cx - 3, cy - 12);
      g.lineTo(cx - 7, cy - 18);
      g.moveTo(cx + 3, cy - 12);
      g.lineTo(cx + 7, cy - 18);
      g.stroke();
      g.lineCap = 'butt';
      // Eyes
      g.fillStyle = '#ff00ff';
      g.beginPath();
      g.arc(cx - 4, cy - 9, 3, 0, Math.PI * 2);
      g.arc(cx + 4, cy - 9, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff88ff';
      g.beginPath();
      g.arc(cx - 4, cy - 9.5, 1.2, 0, Math.PI * 2);
      g.arc(cx + 4, cy - 9.5, 1.2, 0, Math.PI * 2);
      g.fill();
      // Jaw
      g.strokeStyle = '#5a2040';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - 6, cy - 3);
      g.quadraticCurveTo(cx, cy + 1, cx + 6, cy - 3);
      g.stroke();
      break;
    }
    case 'drone': {
      // Fast small flyer
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(cx, cy + 8, 4, 2, 0, 0, Math.PI * 2);
      g.fill();
      // Tiny wings
      g.fillStyle = '#4a4a3a';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx - 8, cy - 2);
      g.lineTo(cx - 6, cy + 2);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + 8, cy - 2);
      g.lineTo(cx + 6, cy + 2);
      g.closePath();
      g.fill();
      // Body
      g.fillStyle = '#6a6a4a';
      g.beginPath();
      g.ellipse(cx, cy, 4, 3, 0, 0, Math.PI * 2);
      g.fill();
      // Eye
      g.fillStyle = '#ffff00';
      g.beginPath();
      g.arc(cx, cy - 1, 1.5, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }

  return c;
}

function generateNPCSprite(type: string, _variant: number): HTMLCanvasElement {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const g = ctx(c);
  const cx = TILE_SIZE / 2;
  const cy = TILE_SIZE / 2;

  const npcColors: Record<string, { body: string; hat: string; skin: string }> = {
    worker:  { body: '#4a6a3a', hat: '#8a6a2a', skin: '#d4a574' },
    scout:   { body: '#3a5a6a', hat: '#2a4a4a', skin: '#c89870' },
    trader:  { body: '#6a4a2a', hat: '#aa8830', skin: '#d4a574' },
    guard:   { body: '#4a4a5a', hat: '#2a2a3a', skin: '#c89870' },
    settler: { body: '#5a5a4a', hat: '#6a6a4a', skin: '#d4a574' },
  };
  const col = npcColors[type] || npcColors.worker;

  // Shadow
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(cx, cy + 12, 7, 3, 0, 0, Math.PI * 2);
  g.fill();

  // Body
  const bodyGrad = g.createLinearGradient(cx - 6, cy - 3, cx + 6, cy + 8);
  bodyGrad.addColorStop(0, lightenColor2(col.body, 20));
  bodyGrad.addColorStop(1, col.body);
  g.fillStyle = bodyGrad;
  g.beginPath();
  g.ellipse(cx, cy + 1, 7, 9, 0, 0, Math.PI * 2);
  g.fill();

  // Head
  g.fillStyle = col.skin;
  g.beginPath();
  g.arc(cx, cy - 6, 6, 0, Math.PI * 2);
  g.fill();

  // Hat
  g.fillStyle = col.hat;
  g.beginPath();
  g.ellipse(cx, cy - 10, 6, 3, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - 4, cy - 12, 8, 3);

  // Eyes
  g.fillStyle = '#222';
  g.fillRect(cx - 3, cy - 7, 1.5, 1.5);
  g.fillRect(cx + 1.5, cy - 7, 1.5, 1.5);

  // Legs
  g.fillStyle = '#3a3a3a';
  g.fillRect(cx - 4, cy + 8, 3, 5);
  g.fillRect(cx + 1, cy + 8, 3, 5);

  return c;
}

function lightenColor2(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g2 = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g2},${b})`;
}

// ══════════════════════════════════════════════════════════════════════
// ITEM ICONS — small 16x16 item icons for inventory/belts
// ══════════════════════════════════════════════════════════════════════

function generateItemIcon(itemId: string): HTMLCanvasElement {
  const c = createCanvas(16, 16);
  const g = ctx(c);
  const cx = 8;
  const cy = 8;

  const itemDefs: Record<string, () => void> = {
    iron: () => {
      g.fillStyle = '#8B7355';
      g.beginPath();
      g.moveTo(3, 12); g.lineTo(6, 3); g.lineTo(10, 3); g.lineTo(13, 12);
      g.fill();
      g.fillStyle = '#a08060';
      g.beginPath();
      g.moveTo(5, 12); g.lineTo(7, 5); g.lineTo(9, 5); g.lineTo(11, 12);
      g.fill();
    },
    copper: () => {
      g.fillStyle = '#B87333';
      g.beginPath();
      g.arc(cx, cy, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d08840';
      g.beginPath();
      g.arc(cx - 1, cy - 1, 3, 0, Math.PI * 2);
      g.fill();
    },
    coal: () => {
      g.fillStyle = '#2C2C2C';
      g.beginPath();
      g.moveTo(4, 12); g.lineTo(6, 4); g.lineTo(10, 4); g.lineTo(12, 12);
      g.fill();
      g.fillStyle = '#444';
      g.fillRect(6, 6, 4, 3);
    },
    stone: () => {
      g.fillStyle = '#808080';
      g.beginPath();
      g.ellipse(cx, cy, 5, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#999';
      g.beginPath();
      g.ellipse(cx - 1, cy - 1, 3, 2.5, -0.2, 0, Math.PI * 2);
      g.fill();
    },
    wood: () => {
      g.fillStyle = '#8B4513';
      g.fillRect(5, 3, 6, 10);
      g.fillStyle = '#a06020';
      g.fillRect(6, 4, 4, 8);
    },
    iron_plate: () => {
      g.fillStyle = '#c0c0c0';
      g.fillRect(3, 5, 10, 6);
      g.fillStyle = '#ddd';
      g.fillRect(4, 6, 8, 2);
    },
    copper_plate: () => {
      g.fillStyle = '#e8a060';
      g.fillRect(3, 5, 10, 6);
      g.fillStyle = '#f0b878';
      g.fillRect(4, 6, 8, 2);
    },
    steel_plate: () => {
      g.fillStyle = '#a0a0b0';
      g.fillRect(3, 5, 10, 6);
      g.fillStyle = '#c0c0d0';
      g.fillRect(4, 6, 8, 1);
      g.fillStyle = '#8888a0';
      g.fillRect(4, 8, 8, 1);
    },
    gear: () => {
      g.fillStyle = '#888';
      g.beginPath();
      g.arc(cx, cy, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#555';
      g.beginPath();
      g.arc(cx, cy, 1.5, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        g.fillStyle = '#888';
        g.fillRect(cx + Math.cos(a) * 3 - 1, cy + Math.sin(a) * 3 - 1, 2, 2);
      }
    },
    circuit: () => {
      g.fillStyle = '#1a6a1a';
      g.fillRect(3, 4, 10, 8);
      g.fillStyle = '#0a4a0a';
      g.fillRect(4, 5, 3, 3);
      g.fillStyle = '#888';
      g.fillRect(5, 9, 6, 1);
      g.fillRect(4, 7, 1, 2);
      g.fillRect(11, 6, 1, 2);
    },
    advanced_circuit: () => {
      g.fillStyle = '#1a3a6a';
      g.fillRect(3, 4, 10, 8);
      g.fillStyle = '#0a2a5a';
      g.fillRect(4, 5, 3, 3);
      g.fillStyle = '#cc4444';
      g.fillRect(8, 5, 3, 3);
      g.fillStyle = '#888';
      g.fillRect(5, 9, 6, 1);
    },
    science_red: () => {
      g.fillStyle = '#ff3333';
      g.beginPath();
      g.arc(cx, cy + 1, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff6666';
      g.beginPath();
      g.arc(cx - 1, cy, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#aaa';
      g.fillRect(cx - 1, 2, 2, 4);
    },
    science_green: () => {
      g.fillStyle = '#33ff33';
      g.beginPath();
      g.arc(cx, cy + 1, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#66ff66';
      g.beginPath();
      g.arc(cx - 1, cy, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#aaa';
      g.fillRect(cx - 1, 2, 2, 4);
    },
    science_blue: () => {
      g.fillStyle = '#3366ff';
      g.beginPath();
      g.arc(cx, cy + 1, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6688ff';
      g.beginPath();
      g.arc(cx - 1, cy, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#aaa';
      g.fillRect(cx - 1, 2, 2, 4);
    },
    ammo: () => {
      g.fillStyle = '#cc6600';
      g.fillRect(5, 3, 6, 10);
      g.fillStyle = '#ee8800';
      g.fillRect(6, 4, 4, 8);
      g.fillStyle = '#ffaa22';
      g.fillRect(6, 4, 4, 2);
    },
    oil: () => {
      g.fillStyle = '#1a1a2e';
      g.beginPath();
      g.ellipse(cx, cy, 5, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a2a4e';
      g.beginPath();
      g.ellipse(cx - 1, cy - 1, 3, 3, 0, 0, Math.PI * 2);
      g.fill();
    },
    uranium: () => {
      g.fillStyle = '#00ff00';
      g.beginPath();
      g.arc(cx, cy, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#44ff44';
      g.beginPath();
      g.arc(cx - 1, cy - 1, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#aaffaa';
      g.beginPath();
      g.arc(cx - 1, cy - 1, 1.5, 0, Math.PI * 2);
      g.fill();
    },
    plastic: () => {
      g.fillStyle = '#c0c0d0';
      g.fillRect(3, 5, 10, 6);
      g.fillStyle = '#e0e0f0';
      g.fillRect(4, 6, 8, 2);
    },
    battery: () => {
      g.fillStyle = '#ccaa00';
      g.fillRect(4, 4, 8, 8);
      g.fillStyle = '#eecc00';
      g.fillRect(5, 5, 6, 6);
      g.fillStyle = '#888';
      g.fillRect(6, 3, 4, 2);
    },
    sulfuric_acid: () => {
      g.fillStyle = '#cc8800';
      g.beginPath();
      g.arc(cx, cy, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#eeaa22';
      g.beginPath();
      g.arc(cx - 1, cy - 1, 3, 0, Math.PI * 2);
      g.fill();
    },
    conveyor_belt: () => {
      g.fillStyle = '#3a3830';
      g.fillRect(3, 5, 10, 6);
      g.fillStyle = '#5a5648';
      g.fillRect(3, 5, 10, 1);
      g.fillRect(3, 10, 10, 1);
    },
    inserter_item: () => {
      g.strokeStyle = '#6a6a58';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(4, 12);
      g.lineTo(8, 6);
      g.lineTo(12, 8);
      g.stroke();
      g.fillStyle = '#ffcc44';
      g.beginPath();
      g.arc(12, 8, 2, 0, Math.PI * 2);
      g.fill();
    },
    miner_item: () => {
      g.strokeStyle = '#5a5a50';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(8, 3);
      g.lineTo(3, 13);
      g.moveTo(8, 3);
      g.lineTo(13, 13);
      g.stroke();
      g.lineCap = 'butt';
      g.fillStyle = '#888';
      g.beginPath();
      g.arc(8, 8, 3, 0, Math.PI * 2);
      g.fill();
    },
    furnace_item: () => {
      g.fillStyle = '#3a1a0a';
      g.fillRect(3, 4, 10, 9);
      g.fillStyle = '#ff6600';
      g.beginPath();
      g.arc(8, 8, 3, 0, Math.PI * 2);
      g.fill();
    },
    wall_item: () => {
      g.fillStyle = '#3a3838';
      g.fillRect(3, 3, 10, 10);
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      g.lineWidth = 0.5;
      g.strokeRect(3, 3, 10, 10);
    },
    turret_item: () => {
      g.fillStyle = '#880000';
      g.beginPath();
      g.arc(cx, cy + 1, 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#cc0000';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy + 1);
      g.lineTo(13, cy - 2);
      g.stroke();
    },
    solar_panel_item: () => {
      g.fillStyle = '#2244aa';
      g.fillRect(3, 4, 10, 8);
      g.fillStyle = '#4466cc';
      g.fillRect(4, 5, 8, 6);
      g.strokeStyle = '#6688ee';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(8, 5); g.lineTo(8, 11);
      g.moveTo(4, 8); g.lineTo(12, 8);
      g.stroke();
    },
    accumulator_item: () => {
      g.fillStyle = '#aa8800';
      g.fillRect(4, 3, 8, 10);
      g.fillStyle = '#ccaa00';
      g.fillRect(5, 4, 6, 8);
      g.fillStyle = '#ffee44';
      g.fillRect(6, 5, 4, 2);
    },
    laser_turret_item: () => {
      g.fillStyle = '#4444ff';
      g.beginPath();
      g.arc(cx, cy + 1, 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#8888ff';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(14, cy - 3);
      g.stroke();
      g.fillStyle = '#aaffff';
      g.beginPath();
      g.arc(14, cy - 3, 1.5, 0, Math.PI * 2);
      g.fill();
    },
    flak_cannon_item: () => {
      g.fillStyle = '#884444';
      g.fillRect(4, 5, 8, 6);
      g.strokeStyle = '#aa6666';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(14, cy - 1);
      g.moveTo(cx, cy + 2);
      g.lineTo(14, cy + 1);
      g.stroke();
    },
    tesla_coil_item: () => {
      g.fillStyle = '#8844ff';
      g.beginPath();
      g.arc(cx, cy + 1, 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#aa88ff';
      g.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.3;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7);
        g.stroke();
      }
    },
    mine_item: () => {
      g.fillStyle = '#aa4400';
      g.beginPath();
      g.arc(cx, cy + 1, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#cc6600';
      g.beginPath();
      g.arc(cx, cy + 1, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff0000';
      g.beginPath();
      g.arc(cx, cy, 1.5, 0, Math.PI * 2);
      g.fill();
    },
    roboport_item: () => {
      g.fillStyle = '#2288aa';
      g.fillRect(3, 4, 10, 8);
      g.fillStyle = '#44aacc';
      g.fillRect(5, 6, 6, 4);
      g.fillStyle = '#66ccee';
      g.beginPath();
      g.arc(cx, cy + 1, 2, 0, Math.PI * 2);
      g.fill();
    },
    silo_item: () => {
      g.fillStyle = '#666688';
      g.fillRect(3, 3, 10, 10);
      g.fillStyle = '#888aaa';
      g.fillRect(4, 4, 8, 8);
      g.fillStyle = '#aabbcc';
      g.fillRect(6, 6, 4, 6);
    },
    centrifuge_item: () => {
      g.fillStyle = '#448844';
      g.beginPath();
      g.arc(cx, cy, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#66aa66';
      g.beginPath();
      g.arc(cx, cy, 3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#88cc88';
      g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
        g.stroke();
      }
    },
    artillery_item: () => {
      g.fillStyle = '#666644';
      g.fillRect(3, 6, 10, 5);
      g.strokeStyle = '#888866';
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(14, cy - 3);
      g.stroke();
    },
    beacon_item: () => {
      g.fillStyle = '#4444aa';
      g.fillRect(5, 3, 6, 10);
      g.fillStyle = '#6666cc';
      g.fillRect(6, 4, 4, 8);
      g.fillStyle = '#aaaaff';
      g.beginPath();
      g.arc(cx, cy, 2, 0, Math.PI * 2);
      g.fill();
    },
  };

  const def = itemDefs[itemId];
  if (def) {
    def();
  } else {
    // Generic item box
    g.fillStyle = '#888';
    g.fillRect(4, 4, 8, 8);
    g.fillStyle = '#aaa';
    g.fillRect(5, 5, 6, 3);
  }

  return c;
}

// ══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════

export function getSprite(key: SpriteKey): ImageBitmap | HTMLCanvasElement | undefined {
  return CACHE.get(key);
}

export function getTerrainSprite(biome: string, tileX: number, tileY: number): HTMLCanvasElement {
  const variantX = Math.floor(tileX / 4);
  const variantY = Math.floor(tileY / 4);
  const key = `terrain_${biome}_${variantX}_${variantY}`;
  let sprite = CACHE.get(key);
  if (!sprite) {
    sprite = generateTerrainTile(biome, variantX, variantY);
    CACHE.set(key, sprite);
  }
  return sprite as HTMLCanvasElement;
}

export function getWaterSprite(tileX: number, tileY: number): HTMLCanvasElement {
  const variant = Math.floor(tileX / 3) * 1000 + Math.floor(tileY / 3);
  const key = `water_${variant}`;
  let sprite = CACHE.get(key);
  if (!sprite) {
    sprite = generateWaterTile(variant);
    CACHE.set(key, sprite);
  }
  return sprite as HTMLCanvasElement;
}

export function getTreeSprite(biome: string, tileX: number, tileY: number): HTMLCanvasElement {
  const variant = hash(tileX, tileY, 42) % 4;
  const key = `tree_${biome}_${variant}`;
  let sprite = CACHE.get(key);
  if (!sprite) {
    sprite = generateTreeSprite(biome, variant);
    CACHE.set(key, sprite);
  }
  return sprite as HTMLCanvasElement;
}

export function getBuildingSprite(type: string, variant: number = 0): HTMLCanvasElement {
  const key = `building_${type}_${variant}`;
  let sprite = CACHE.get(key);
  if (!sprite) {
    sprite = generateBuildingSprite(type, variant);
    CACHE.set(key, sprite);
  }
  return sprite as HTMLCanvasElement;
}

export function getPlayerSprite(skinColor: string): HTMLCanvasElement {
  const key = `player_${skinColor}`;
  let sprite = CACHE.get(key);
  if (!sprite) {
    sprite = generatePlayerSprite(skinColor, 0);
    CACHE.set(key, sprite);
  }
  return sprite as HTMLCanvasElement;
}

export function getEnemySprite(type: string, variant: number = 0): HTMLCanvasElement {
  const key = `enemy_${type}_${variant}`;
  let sprite = CACHE.get(key);
  if (!sprite) {
    sprite = generateEnemySprite(type, variant);
    CACHE.set(key, sprite);
  }
  return sprite as HTMLCanvasElement;
}

export function getNPCSprite(type: string): HTMLCanvasElement {
  const key = `npc_${type}`;
  let sprite = CACHE.get(key);
  if (!sprite) {
    sprite = generateNPCSprite(type, 0);
    CACHE.set(key, sprite);
  }
  return sprite as HTMLCanvasElement;
}

export function getItemIcon(itemId: string): HTMLCanvasElement {
  const key = `item_${itemId}`;
  let sprite = CACHE.get(key);
  if (!sprite) {
    sprite = generateItemIcon(itemId);
    CACHE.set(key, sprite);
  }
  return sprite as HTMLCanvasElement;
}

export function clearCache(): void {
  CACHE.clear();
}

export function cacheSize(): number {
  return CACHE.size;
}

export function initSprites(): void {
  if (initialized) return;
  initialized = true;

  // Pre-generate terrain tiles for all biomes (4x4 variants each)
  const biomes = ['grass', 'forest', 'desert', 'snow', 'swamp', 'volcanic'];
  for (const biome of biomes) {
    for (let vx = 0; vx < 4; vx++) {
      for (let vy = 0; vy < 4; vy++) {
        getTerrainSprite(biome, vx * 4, vy * 4);
      }
    }
  }

  // Pre-generate water tiles
  for (let i = 0; i < 16; i++) {
    getWaterSprite(i * 3, i * 3);
  }

  // Pre-generate tree sprites for all biomes
  for (const biome of biomes) {
    for (let v = 0; v < 4; v++) {
      getTreeSprite(biome, v * 4, v * 4);
    }
  }

  // Pre-generate building sprites
  const buildingTypes = [
    'miner', 'furnace', 'assembler', 'conveyor', 'inserter', 'storage',
    'power_pole', 'steam_engine', 'boiler', 'lab', 'radar', 'turret',
    'wall', 'belt_junction', 'splitter', 'underground_belt', 'pumpjack',
    'refinery', 'chemical_plant', 'pipe',
    'solar_panel', 'accumulator', 'laser_turret', 'flak_cannon', 'tesla_coil',
    'mine', 'roboport', 'pump', 'silo', 'beacon', 'centrifuge', 'artillery',
  ];
  for (const type of buildingTypes) {
    getBuildingSprite(type);
  }

  // Pre-generate enemy sprites
  const enemyTypes = ['biter', 'spitter', 'worm', 'behemoth', 'spawner', 'destroyer', 'leviathan', 'drone'];
  for (const type of enemyTypes) {
    getEnemySprite(type);
  }

  // Pre-generate NPC sprites
  const npcTypes = ['worker', 'scout', 'trader', 'guard', 'settler'];
  for (const type of npcTypes) {
    getNPCSprite(type);
  }

  // Pre-generate common item icons
  const commonItems = [
    'iron', 'copper', 'coal', 'stone', 'wood', 'oil', 'uranium',
    'iron_plate', 'copper_plate', 'steel_plate', 'gear', 'circuit',
    'advanced_circuit', 'battery', 'plastic', 'sulfuric_acid',
    'science_red', 'science_green', 'science_blue', 'ammo',
    'conveyor_belt', 'inserter_item', 'miner_item', 'furnace_item',
    'wall_item', 'turret_item',
    'solar_panel_item', 'accumulator_item', 'laser_turret_item',
    'flak_cannon_item', 'tesla_coil_item', 'mine_item',
    'roboport_item', 'silo_item', 'centrifuge_item', 'artillery_item', 'beacon_item',
  ];
  for (const item of commonItems) {
    getItemIcon(item);
  }
}
