// ══════════════════════════════════════════════════════════════════════
// SCREEN EFFECTS — screen shake, shockwaves, pollution overlay,
// damage vignette, slow-mo flash, chromatic aberration hint
// ══════════════════════════════════════════════════════════════════════

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  speed: number;
  color: string;
}

export class ScreenEffects {
  // Screen shake
  shakeX = 0;
  shakeY = 0;
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimer = 0;

  // Shockwaves
  shockwaves: Shockwave[] = [];

  // Damage vignette
  damageVignetteAlpha = 0;

  // Slow-mo flash
  flashAlpha = 0;
  flashColor = '255,255,255';

  // Chromatic aberration hint (subtle RGB offset)
  aberrationAmount = 0;

  // ═══════════════════════════════════════════════════════════════════
  // TRIGGER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  triggerShake(intensity: number, duration: number) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
    this.shakeTimer = 0;
  }

  triggerShockwave(x: number, y: number, maxRadius: number, color = '255,200,100') {
    this.shockwaves.push({
      x, y, radius: 0, maxRadius,
      alpha: 0.6, speed: 3 + maxRadius * 0.05,
      color,
    });
  }

  triggerDamageFlash() {
    this.damageVignetteAlpha = 0.5;
  }

  triggerFlash(color = '255,255,255', alpha = 0.3) {
    this.flashAlpha = alpha;
    this.flashColor = color;
  }

  triggerAberration(amount = 2) {
    this.aberrationAmount = amount;
  }

  // ═══════════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════════

  update() {
    // Screen shake
    if (this.shakeTimer < this.shakeDuration) {
      this.shakeTimer++;
      const decay = 1 - this.shakeTimer / this.shakeDuration;
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * decay * 2;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * decay * 2;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeIntensity = 0;
      this.shakeDuration = 0;
    }

    // Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += sw.speed;
      sw.alpha *= 0.94;
      if (sw.radius >= sw.maxRadius || sw.alpha < 0.01) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Damage vignette fade
    if (this.damageVignetteAlpha > 0) {
      this.damageVignetteAlpha *= 0.92;
      if (this.damageVignetteAlpha < 0.01) this.damageVignetteAlpha = 0;
    }

    // Flash fade
    if (this.flashAlpha > 0) {
      this.flashAlpha *= 0.85;
      if (this.flashAlpha < 0.01) this.flashAlpha = 0;
    }

    // Aberration fade
    if (this.aberrationAmount > 0) {
      this.aberrationAmount *= 0.9;
      if (this.aberrationAmount < 0.1) this.aberrationAmount = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  render(ctx: CanvasRenderingContext2D, viewWidth: number, viewHeight: number, cameraX: number, cameraY: number) {
    // Shockwaves
    for (const sw of this.shockwaves) {
      const sx = sw.x - cameraX;
      const sy = sw.y - cameraY;
      ctx.strokeStyle = `rgba(${sw.color},${sw.alpha})`;
      ctx.lineWidth = 2 + (1 - sw.radius / sw.maxRadius) * 3;
      ctx.beginPath();
      ctx.arc(sx, sy, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      // Inner glow
      ctx.strokeStyle = `rgba(${sw.color},${sw.alpha * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, sw.radius * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Damage vignette — red edges
    if (this.damageVignetteAlpha > 0.01) {
      const grad = ctx.createRadialGradient(
        viewWidth / 2, viewHeight / 2, viewWidth * 0.3,
        viewWidth / 2, viewHeight / 2, viewWidth * 0.7
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(180,0,0,${this.damageVignetteAlpha})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }

    // Screen flash
    if (this.flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flashAlpha})`;
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }
  }
}
