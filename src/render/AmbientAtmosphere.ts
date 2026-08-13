// ══════════════════════════════════════════════════════════════════════
// AMBIENT ATMOSPHERE — zero-alloc, object-pooled
// ══════════════════════════════════════════════════════════════════════

const MAX_PARTICLES = 120;
const FIREFLY_MAX = 20;
const DUST_MAX = 30;
const EMBER_MAX = 15;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
  life: number; maxLife: number;
  type: number; // 0=firefly 1=dust 2=pollution 3=heat 4=leaf 5=ember 6=spore
  colorIdx: number; // index into COLOR_LUT
}

// Pre-baked color lookup — no string allocations in hot path
const COLOR_LUT: [number, number, number][] = [
  [204, 255, 68],   // 0: firefly
  [170, 153, 119],  // 1: dust
  [100, 80, 60],    // 2: pollution
  [255, 200, 100],  // 3: heat
  [74, 138, 58],    // 4: leaf-day
  [26, 58, 26],     // 5: leaf-night
  [138, 106, 42],   // 6: leaf-dusk
  [255, 102, 34],   // 7: ember-orange
  [255, 170, 68],   // 8: ember-yellow
  [187, 221, 187],  // 9: spore
  [136, 170, 136],  // 10: spore-night
];

const TYPE_DUST = 1;
const TYPE_POLLUTION = 2;
const TYPE_HEAT = 3;
const TYPE_LEAF = 4;
const TYPE_EMBER = 5;
const TYPE_SPORE = 6;
const TYPE_FIREFLY = 0;

export class AmbientAtmosphere {
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private poolSize = 0;
  private spawnAccum = 0;

  constructor() {
    // Pre-allocate pool
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        x: 0, y: 0, vx: 0, vy: 0,
        size: 0, alpha: 0,
        life: 0, maxLife: 0,
        type: 0, colorIdx: 0,
      });
    }
    this.poolSize = MAX_PARTICLES;
  }

  private acquire(): Particle | null {
    if (this.poolSize === 0) return null;
    return this.pool[--this.poolSize];
  }

  private release(p: Particle) {
    if (this.poolSize < MAX_PARTICLES) {
      this.pool[this.poolSize++] = p;
    }
  }

  update(
    vw: number, vh: number,
    camX: number, camY: number,
    dayFactor: number,
    buildingCount: number, tick: number
  ) {
    // Only spawn every 4th frame
    this.spawnAccum++;
    if (this.spawnAccum >= 4) {
      this.spawnAccum = 0;
      this.spawnParticles(vw, vh, camX, camY, dayFactor, buildingCount, tick);
    }

    const margin = 40;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;

      const lr = p.life / p.maxLife;

      switch (p.type) {
        case TYPE_FIREFLY: {
          const s = Math.sin(p.life * 0.03 + i) * 0.02;
          const c = Math.cos(p.life * 0.04 + i) * 0.015;
          p.vx += s; p.vy += c;
          p.vx *= 0.98; p.vy *= 0.98;
          const pulse = Math.sin(p.life * 0.08) * 0.5 + 0.5;
          p.alpha = lr < 0.1 ? lr * 10 : lr > 0.8 ? (1 - lr) * 5 : pulse * 0.8;
          p.size = 1.5 + pulse * 1.5;
          break;
        }
        case TYPE_DUST: {
          p.vx += Math.sin(p.life * 0.02) * 0.005;
          p.alpha = lr < 0.2 ? lr * 1.5 : lr > 0.7 ? (1 - lr) * 1.0 : 0.3;
          break;
        }
        case TYPE_POLLUTION: {
          p.size += 0.03;
          p.vx += 0.001;
          p.alpha = lr < 0.3 ? lr * 0.5 : lr > 0.6 ? (1 - lr) * 0.375 : 0.15;
          break;
        }
        case TYPE_HEAT: {
          p.vx += Math.sin(p.life * 0.1) * 0.02;
          p.alpha = lr < 0.2 ? lr * 0.4 : lr > 0.5 ? (1 - lr) * 0.16 : 0.08;
          break;
        }
        case TYPE_LEAF: {
          p.vx += Math.sin(p.life * 0.05) * 0.015;
          p.vy *= 0.997;
          p.alpha = lr < 0.1 ? lr * 7 : lr > 0.8 ? (1 - lr) * 3.5 : 0.7;
          break;
        }
        case TYPE_EMBER: {
          p.vy *= 0.992;
          p.alpha = lr < 0.1 ? lr * 9 : lr > 0.6 ? (1 - lr) * 2.25 : 0.9;
          p.size *= 0.997;
          break;
        }
        case TYPE_SPORE: {
          p.vx += Math.sin(p.life * 0.04) * 0.008;
          p.alpha = lr < 0.2 ? lr * 2.5 : lr > 0.7 ? (1 - lr) * 1.67 : 0.5;
          break;
        }
      }

      // Recycle if dead or off-screen
      if (p.life >= p.maxLife || p.alpha < 0.005 ||
          p.x < camX - margin || p.x > camX + vw + margin ||
          p.y < camY - margin || p.y > camY + vh + margin) {
        this.active.splice(i, 1);
        this.release(p);
      }
    }
  }

  private spawnParticles(
    vw: number, vh: number,
    camX: number, camY: number,
    dayFactor: number, buildingCount: number, tick: number
  ) {
    const cx = camX + vw * 0.5;
    const cy = camY + vh * 0.5;
    const isNight = dayFactor < 0.4;
    const isDusk = dayFactor > 0.35 && dayFactor < 0.55;

    // Count types for throttling
    let fireflyCount = 0, dustCount = 0, emberCount = 0;
    for (const p of this.active) {
      if (p.type === TYPE_FIREFLY) fireflyCount++;
      else if (p.type === TYPE_DUST) dustCount++;
      else if (p.type === TYPE_EMBER) emberCount++;
    }

    // Fireflies at night
    if (isNight && fireflyCount < FIREFLY_MAX) {
      const p = this.acquire();
      if (p) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * vw * 0.35;
        p.x = cx + Math.cos(a) * d;
        p.y = cy + Math.sin(a) * d;
        p.vx = (Math.random() - 0.5) * 0.3;
        p.vy = (Math.random() - 0.5) * 0.2;
        p.size = 2; p.alpha = 0;
        p.life = 0; p.maxLife = 300;
        p.type = TYPE_FIREFLY; p.colorIdx = 0;
        this.active.push(p);
      }
    }

    // Industrial dust
    if (buildingCount > 5 && dustCount < DUST_MAX) {
      const p = this.acquire();
      if (p) {
        p.x = cx + (Math.random() - 0.5) * vw;
        p.y = cy + (Math.random() - 0.5) * vh;
        p.vx = (Math.random() - 0.5) * 0.15;
        p.vy = -0.1;
        p.size = 1.5; p.alpha = 0;
        p.life = 0; p.maxLife = 150;
        p.type = TYPE_DUST; p.colorIdx = 1;
        this.active.push(p);
      }
    }

    // Leaves
    if (tick % 5 === 0 && Math.random() < 0.15) {
      const p = this.acquire();
      if (p) {
        p.x = cx + (Math.random() - 0.5) * vw;
        p.y = cy - 20;
        p.vx = 0.3 + Math.random() * 0.4;
        p.vy = 0.5 + Math.random() * 0.6;
        p.size = 2; p.alpha = 0;
        p.life = 0; p.maxLife = 150;
        p.type = TYPE_LEAF;
        p.colorIdx = isNight ? 5 : isDusk ? 6 : 4;
        this.active.push(p);
      }
    }

    // Embers at night
    if (isNight && buildingCount > 3 && emberCount < EMBER_MAX) {
      const p = this.acquire();
      if (p) {
        p.x = cx + (Math.random() - 0.5) * vw * 0.4;
        p.y = cy + Math.random() * vh * 0.2;
        p.vx = (Math.random() - 0.5) * 0.2;
        p.vy = -0.5 - Math.random() * 0.8;
        p.size = 1 + Math.random();
        p.alpha = 0;
        p.life = 0; p.maxLife = 50;
        p.type = TYPE_EMBER;
        p.colorIdx = Math.random() < 0.5 ? 7 : 8;
        this.active.push(p);
      }
    }

    // Spores (rare)
    if (tick % 4 === 0 && Math.random() < 0.08) {
      const p = this.acquire();
      if (p) {
        p.x = cx + (Math.random() - 0.5) * vw;
        p.y = cy + (Math.random() - 0.5) * vh;
        p.vx = (Math.random() - 0.5) * 0.3;
        p.vy = -0.15;
        p.size = 1.2; p.alpha = 0;
        p.life = 0; p.maxLife = 100;
        p.type = TYPE_SPORE;
        p.colorIdx = isNight ? 10 : 9;
        this.active.push(p);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    if (this.active.length === 0) return;

    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i];
      const sx = p.x - camX;
      const sy = p.y - camY;
      const a = Math.max(0, Math.min(1, p.alpha));
      if (a < 0.01) continue;

      const c = COLOR_LUT[p.colorIdx];
      ctx.globalAlpha = a;

      switch (p.type) {
        case TYPE_FIREFLY: {
          // Glow
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * 0.3})`;
          ctx.beginPath();
          ctx.arc(sx, sy, p.size * 3, 0, 6.2832);
          ctx.fill();
          // Core
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
          ctx.beginPath();
          ctx.arc(sx, sy, p.size * 0.5, 0, 6.2832);
          ctx.fill();
          break;
        }
        case TYPE_POLLUTION:
        case TYPE_HEAT: {
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
          ctx.beginPath();
          ctx.arc(sx, sy, p.size, 0, 6.2832);
          ctx.fill();
          break;
        }
        case TYPE_LEAF: {
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(p.life * 0.04);
          ctx.fillRect(-p.size * 0.5, -p.size * 0.25, p.size, p.size * 0.5);
          ctx.restore();
          break;
        }
        case TYPE_EMBER: {
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
          ctx.beginPath();
          ctx.arc(sx, sy, p.size, 0, 6.2832);
          ctx.fill();
          break;
        }
        default: {
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
          ctx.beginPath();
          ctx.arc(sx, sy, p.size, 0, 6.2832);
          ctx.fill();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
