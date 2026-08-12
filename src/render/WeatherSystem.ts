// ══════════════════════════════════════════════════════════════════════
// WEATHER SYSTEM — rain, snow, fog, storm with particles
// ══════════════════════════════════════════════════════════════════════

export type WeatherType = 'clear' | 'rain' | 'heavy_rain' | 'snow' | 'fog' | 'storm';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

const WEATHER_CONFIGS: Record<WeatherType, {
  particleCount: number;
  windX: number;
  windY: number;
  color: string;
  sizeRange: [number, number];
  speedRange: [number, number];
  alphaRange: [number, number];
  flashChance: number;
  fogAlpha: number;
}> = {
  clear:      { particleCount: 0, windX: 0, windY: 0, color: '#fff', sizeRange: [0,0], speedRange: [0,0], alphaRange: [0,0], flashChance: 0, fogAlpha: 0 },
  rain:       { particleCount: 200, windX: 0.5, windY: 8, color: '#8899cc', sizeRange: [1,2], speedRange: [6,10], alphaRange: [0.3,0.6], flashChance: 0, fogAlpha: 0 },
  heavy_rain: { particleCount: 500, windX: 1.5, windY: 12, color: '#6677aa', sizeRange: [1,3], speedRange: [8,14], alphaRange: [0.4,0.7], flashChance: 0.001, fogAlpha: 0 },
  snow:       { particleCount: 150, windX: 0.8, windY: 2, color: '#ffffff', sizeRange: [2,5], speedRange: [1,3], alphaRange: [0.5,0.9], flashChance: 0, fogAlpha: 0 },
  fog:        { particleCount: 0, windX: 0.2, windY: 0, color: '#cccccc', sizeRange: [0,0], speedRange: [0,0], alphaRange: [0,0], flashChance: 0, fogAlpha: 0.45 },
  storm:      { particleCount: 600, windX: 3, windY: 14, color: '#5566aa', sizeRange: [1,3], speedRange: [10,18], alphaRange: [0.5,0.8], flashChance: 0.008, fogAlpha: 0 },
};

export class WeatherSystem {
  private particles: Particle[] = [];
  private currentWeather: WeatherType = 'clear';
  private targetWeather: WeatherType = 'clear';
  private transitionProgress = 1;
  private lightningTimer = 0;
  private lightningAlpha = 0;
  private windOffset = 0;
  private initialized = false;

  setWeather(weather: WeatherType) {
    if (weather === this.targetWeather) return;
    this.targetWeather = weather;
    this.transitionProgress = 0;
  }

  getCurrentWeather(): WeatherType {
    return this.currentWeather;
  }

  private lerpConfig(a: WeatherType, b: WeatherType, t: number) {
    const ca = WEATHER_CONFIGS[a];
    const cb = WEATHER_CONFIGS[b];
    return {
      particleCount: Math.round(ca.particleCount + (cb.particleCount - ca.particleCount) * t),
      windX: ca.windX + (cb.windX - ca.windX) * t,
      windY: ca.windY + (cb.windY - ca.windY) * t,
      sizeRange: [ca.sizeRange[0] + (cb.sizeRange[0] - ca.sizeRange[0]) * t, ca.sizeRange[1] + (cb.sizeRange[1] - ca.sizeRange[1]) * t] as [number, number],
      speedRange: [ca.speedRange[0] + (cb.speedRange[0] - ca.speedRange[0]) * t, ca.speedRange[1] + (cb.speedRange[1] - ca.speedRange[1]) * t] as [number, number],
      alphaRange: [ca.alphaRange[0] + (cb.alphaRange[0] - ca.alphaRange[0]) * t, ca.alphaRange[1] + (cb.alphaRange[1] - ca.alphaRange[1]) * t] as [number, number],
      flashChance: ca.flashChance + (cb.flashChance - ca.flashChance) * t,
      fogAlpha: ca.fogAlpha + (cb.fogAlpha - ca.fogAlpha) * t,
    };
  }

  private randomRange(r: [number, number]): number {
    return r[0] + Math.random() * (r[1] - r[0]);
  }

  update(viewWidth: number, viewHeight: number, cameraX: number, cameraY: number) {
    if (!this.initialized) {
      this.initialized = true;
      this.currentWeather = this.targetWeather;
    }

    // Transition
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + 0.005);
      if (this.transitionProgress >= 1) {
        this.currentWeather = this.targetWeather;
      }
    }

    const config = this.currentWeather === this.targetWeather
      ? WEATHER_CONFIGS[this.currentWeather]
      : this.lerpConfig(this.currentWeather, this.targetWeather, this.transitionProgress);

    if (config.particleCount === 0 && config.fogAlpha === 0) {
      this.particles = [];
      return;
    }

    // Spawn particles
    while (this.particles.length < config.particleCount) {
      this.particles.push({
        x: cameraX + Math.random() * viewWidth,
        y: cameraY - 20 + Math.random() * (viewHeight * 0.1),
        vx: config.windX + (Math.random() - 0.5) * 0.5,
        vy: this.randomRange(config.speedRange),
        size: this.randomRange(config.sizeRange),
        alpha: this.randomRange(config.alphaRange),
        life: 0,
        maxLife: viewHeight / config.speedRange[0] * 1.5,
      });
    }

    // Remove excess
    if (this.particles.length > config.particleCount * 1.5) {
      this.particles.length = config.particleCount;
    }

    // Update particles
    const windWave = Math.sin(Date.now() * 0.001) * 0.3;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx + config.windX * 0.5 + windWave;
      p.y += p.vy;
      p.life++;

      // Recycle
      if (p.y > cameraY + viewHeight + 20 || p.life > p.maxLife) {
        p.x = cameraX + Math.random() * viewWidth;
        p.y = cameraY - 10 - Math.random() * 40;
        p.life = 0;
      }
    }

    // Lightning
    if (config.flashChance > 0 && Math.random() < config.flashChance) {
      this.lightningAlpha = 0.7 + Math.random() * 0.3;
      this.lightningTimer = 8 + Math.random() * 12;
    }
    if (this.lightningTimer > 0) {
      this.lightningTimer--;
      this.lightningAlpha *= 0.85;
      if (this.lightningTimer === 0) this.lightningAlpha = 0;
    }
  }

  render(ctx: CanvasRenderingContext2D, viewWidth: number, viewHeight: number, cameraX: number, cameraY: number) {
    if (this.currentWeather === 'clear' && this.targetWeather === 'clear') return;

    const config = this.currentWeather === this.targetWeather
      ? WEATHER_CONFIGS[this.currentWeather]
      : this.lerpConfig(this.currentWeather, this.targetWeather, this.transitionProgress);

    // Draw particles (rain/snow)
    if (this.particles.length > 0) {
      const isSnow = this.currentWeather === 'snow' || this.targetWeather === 'snow';

      if (isSnow) {
        // Snow — soft circles
        for (const p of this.particles) {
          const sx = p.x - cameraX;
          const sy = p.y - cameraY;
          ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
          ctx.beginPath();
          ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Rain — lines
        ctx.strokeStyle = config.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        for (const p of this.particles) {
          const sx = p.x - cameraX;
          const sy = p.y - cameraY;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + p.vx * 1.5, sy + p.vy * 1.5);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Fog overlay
    if (config.fogAlpha > 0) {
      const fogGrad = ctx.createLinearGradient(0, 0, 0, viewHeight);
      fogGrad.addColorStop(0, `rgba(180,190,200,${config.fogAlpha * 0.3})`);
      fogGrad.addColorStop(0.3, `rgba(170,180,190,${config.fogAlpha})`);
      fogGrad.addColorStop(0.7, `rgba(170,180,190,${config.fogAlpha})`);
      fogGrad.addColorStop(1, `rgba(180,190,200,${config.fogAlpha * 0.5})`);
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, 0, viewWidth, viewHeight);

      // Drifting fog wisps
      const t = Date.now() * 0.0003;
      ctx.globalAlpha = config.fogAlpha * 0.4;
      for (let i = 0; i < 5; i++) {
        const fx = (Math.sin(t + i * 1.7) * 0.5 + 0.5) * viewWidth;
        const fy = viewHeight * (0.2 + i * 0.15);
        const fw = 200 + Math.sin(t + i) * 80;
        ctx.fillStyle = 'rgba(200,210,220,0.15)';
        ctx.beginPath();
        ctx.ellipse(fx, fy, fw, 30, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Lightning flash
    if (this.lightningAlpha > 0.01) {
      ctx.fillStyle = `rgba(200,220,255,${this.lightningAlpha})`;
      ctx.fillRect(0, 0, viewWidth, viewHeight);

      // Lightning bolt
      if (this.lightningTimer > 4) {
        const lx = viewWidth * (0.2 + Math.random() * 0.6);
        ctx.strokeStyle = `rgba(180,200,255,${this.lightningAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        let ly = 0;
        for (let s = 0; s < 8; s++) {
          ly += viewHeight / 8;
          ctx.lineTo(lx + (Math.random() - 0.5) * 60, ly);
        }
        ctx.stroke();
      }
    }
  }
}

// Auto weather cycle for ambiance
export class WeatherScheduler {
  private timer = 0;
  private interval = 600; // frames between weather changes (~10s at 60fps)
  private weather: WeatherType = 'clear';

  update(onChange: (w: WeatherType) => void) {
    this.timer++;
    if (this.timer >= this.interval) {
      this.timer = 0;
      this.interval = 400 + Math.random() * 800;

      const weathers: WeatherType[] = ['clear', 'clear', 'clear', 'rain', 'snow', 'fog', 'storm'];
      this.weather = weathers[Math.floor(Math.random() * weathers.length)];
      onChange(this.weather);
    }
  }

  getWeather(): WeatherType {
    return this.weather;
  }

  setManual(w: WeatherType) {
    this.weather = w;
    this.timer = 0;
  }
}
