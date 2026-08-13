// ══════════════════════════════════════════════════════════════════════
// PARTICLE EFFECTS — explosions, smoke, sparks, fire, damage numbers
// ══════════════════════════════════════════════════════════════════════

export interface ParticleEffect {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
  decay: number;
  type: 'circle' | 'square' | 'spark' | 'smoke';
}

export interface DamageNumber {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface ScreenFlash {
  color: string;
  alpha: number;
  life: number;
}

export class ParticleEffectsSystem {
  particles: ParticleEffect[] = [];
  damageNumbers: DamageNumber[] = [];
  screenFlashes: ScreenFlash[] = [];

  private readonly MAX_PARTICLES = 500;
  private readonly MAX_NUMBERS = 50;

  // ═══════════════════════════════════════════════════════════════════
  // SPAWN FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  spawnExplosion(x: number, y: number, size: number) {
    const count = Math.min(30, Math.floor(size * 4));

    // Fire core
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * size * 0.6;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.6 ? '#ff6600' : Math.random() < 0.5 ? '#ff3300' : '#ffcc00',
        alpha: 1,
        life: 0,
        maxLife: 20 + Math.random() * 20,
        gravity: 0.05,
        decay: 0.96,
        type: 'circle',
      });
    }

    // Sparks
    for (let i = 0; i < count / 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * size * 0.8;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        size: 1 + Math.random() * 1.5,
        color: '#ffdd88',
        alpha: 1,
        life: 0,
        maxLife: 15 + Math.random() * 25,
        gravity: 0.1,
        decay: 0.94,
        type: 'spark',
      });
    }

    // Smoke
    for (let i = 0; i < count / 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * 0.5 + (Math.random() - 0.5) * 0.3,
        vy: -0.5 - Math.random() * 1.5,
        size: 3 + Math.random() * 5,
        color: '#666666',
        alpha: 0.6,
        life: 0,
        maxLife: 30 + Math.random() * 40,
        gravity: -0.02,
        decay: 0.98,
        type: 'smoke',
      });
    }

    this.screenFlashes.push({ color: 'rgba(255,200,50,0.5)', alpha: 0.5, life: 5 });
  }

  spawnSmallExplosion(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.5 + Math.random() * 2,
        color: Math.random() < 0.5 ? '#ff8800' : '#ffcc44',
        alpha: 1,
        life: 0,
        maxLife: 10 + Math.random() * 10,
        gravity: 0,
        decay: 0.93,
        type: 'circle',
      });
    }
  }

  spawnSmoke(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.3 - Math.random() * 0.8,
        size: 2 + Math.random() * 4,
        color: '#888888',
        alpha: 0.4 + Math.random() * 0.3,
        life: 0,
        maxLife: 40 + Math.random() * 40,
        gravity: -0.01,
        decay: 0.99,
        type: 'smoke',
      });
    }
  }

  spawnSparks(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 0.5 + Math.random(),
        color: Math.random() < 0.5 ? '#ffff88' : '#ffaa44',
        alpha: 1,
        life: 0,
        maxLife: 8 + Math.random() * 12,
        gravity: 0.15,
        decay: 0.9,
        type: 'spark',
      });
    }
  }

  spawnFire(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -1 - Math.random() * 2,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.4 ? '#ff4400' : Math.random() < 0.5 ? '#ff8800' : '#ffcc00',
        alpha: 0.8 + Math.random() * 0.2,
        life: 0,
        maxLife: 15 + Math.random() * 15,
        gravity: -0.05,
        decay: 0.94,
        type: 'circle',
      });
    }
  }

  spawnDamageNumber(x: number, y: number, amount: number, isHeal: boolean) {
    if (this.damageNumbers.length >= this.MAX_NUMBERS) {
      this.damageNumbers.shift();
    }
    this.damageNumbers.push({
      x,
      y,
      text: isHeal ? `+${amount}` : `-${amount}`,
      color: isHeal ? '#44ff88' : '#ff4444',
      alpha: 1,
      life: 0,
      maxLife: 40,
    });
  }

  spawnLaserBeam(x1: number, y1: number, x2: number, y2: number) {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      this.particles.push({
        x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * 2,
        y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: 1 + Math.random(),
        color: Math.random() < 0.5 ? '#00ffff' : '#88ffff',
        alpha: 0.8,
        life: 0,
        maxLife: 6 + Math.random() * 4,
        gravity: 0,
        decay: 0.85,
        type: 'circle',
      });
    }
    // Impact sparks at target
    this.spawnSparks(x2, y2, 5);
  }

  spawnTeslaArc(x1: number, y1: number, x2: number, y2: number) {
    const segments = 6;
    for (let i = 0; i < segments; i++) {
      const t = (i + 1) / segments;
      const nx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 15;
      const ny = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 15;
      this.particles.push({
        x: nx,
        y: ny,
        vx: (Math.random() - 0.5) * 1,
        vy: (Math.random() - 0.5) * 1,
        size: 1.5 + Math.random(),
        color: Math.random() < 0.5 ? '#aa88ff' : '#cc88ff',
        alpha: 0.9,
        life: 0,
        maxLife: 4 + Math.random() * 4,
        gravity: 0,
        decay: 0.8,
        type: 'circle',
      });
    }
    this.spawnSparks(x2, y2, 3);
  }

  spawnFlakBurst(x: number, y: number) {
    // Black smoke puffs
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color: '#444444',
        alpha: 0.6,
        life: 0,
        maxLife: 25 + Math.random() * 15,
        gravity: -0.02,
        decay: 0.96,
        type: 'smoke',
      });
    }
    // Shrapnel sparks
    this.spawnSparks(x, y, 12);
  }

  spawnMineExplosion(x: number, y: number) {
    this.spawnExplosion(x, y, 8);
    // Debris chunks
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 2 + Math.random() * 2,
        color: '#aa6622',
        alpha: 1,
        life: 0,
        maxLife: 20 + Math.random() * 20,
        gravity: 0.2,
        decay: 0.95,
        type: 'square',
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════════

  update() {
    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= p.decay;
      p.vy *= p.decay;
      p.life++;
      p.alpha = Math.max(0, p.alpha * (1 - p.life / p.maxLife));
      p.size *= 0.99;

      if (p.life >= p.maxLife || p.alpha < 0.01) {
        this.particles.splice(i, 1);
      }
    }

    // Trim excess
    if (this.particles.length > this.MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - this.MAX_PARTICLES);
    }

    // Damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.y -= 0.8;
      d.life++;
      d.alpha = Math.max(0, 1 - d.life / d.maxLife);
      if (d.life >= d.maxLife) {
        this.damageNumbers.splice(i, 1);
      }
    }

    // Screen flashes
    for (let i = this.screenFlashes.length - 1; i >= 0; i--) {
      const f = this.screenFlashes[i];
      f.life--;
      f.alpha *= 0.8;
      if (f.life <= 0) {
        this.screenFlashes.splice(i, 1);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number) {
    // Particles
    for (const p of this.particles) {
      const sx = p.x - cameraX;
      const sy = p.y - cameraY;
      ctx.globalAlpha = p.alpha;

      if (p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - p.vx * 2, sy - p.vy * 2);
        ctx.stroke();
      } else if (p.type === 'square') {
        ctx.fillStyle = p.color;
        ctx.fillRect(sx - p.size / 2, sy - p.size / 2, p.size, p.size);
      } else {
        // circle (fire, etc)
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;

    // Damage numbers
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    for (const d of this.damageNumbers) {
      const sx = d.x - cameraX;
      const sy = d.y - cameraY;
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle = '#000';
      ctx.fillText(d.text, sx + 1, sy + 1);
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // Screen flashes
    for (const f of this.screenFlashes) {
      ctx.fillStyle = f.color.replace(/[\d.]+\)$/, `${f.alpha})`);
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }
}
