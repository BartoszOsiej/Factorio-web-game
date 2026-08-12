import { GameState, Tile, Building, NPC, Enemy, Direction } from './types';
import { CHUNK_SIZE, TILE_SIZE, BUILDING_SIZES, BUILDING_COLORS, RESOURCE_COLORS, MAX_PARTICLES } from './constants';
import { hasTreeAt, getYieldColor } from './world';
import { DIR_OFFSETS } from '../render/utils';
import { initSprites, getTerrainSprite, getWaterSprite, getTreeSprite, getBuildingSprite, getEnemySprite, getNPCSprite, getPlayerSprite, getItemIcon } from '../render/SpriteManager';
import { WeatherSystem, WeatherScheduler, WeatherType } from '../render/WeatherSystem';
import { ParticleEffectsSystem } from '../render/ParticleEffects';
import { AmbientAtmosphere } from '../render/AmbientAtmosphere';
import { ScreenEffects } from '../render/ScreenEffects';
import { PollutionOverlay } from '../render/PollutionOverlay';

/**
 * Renderer Canvas 2D — rysuje świat gry (chunki, budynki, NPC, wrogowie,
 * cząsteczki, efekty świetlne, ghost building, minimap overlay).
 * Dodatkowo zarządza efektem "Fog of War" (visibility) i cyklem dnia/nocy.
 */
export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** Licznik klatek — używany do animacji (miganie, ruchome elementy). */
  private frameCount = 0;
  /** Offscreen canvas do efektów świetlnych (day/night cycle, dynamic lighting). */
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  /** Czy gracz aktualnie się porusza (wpływa na trail effect). */
  isPlayerMoving = false;
  /** Typ budynku do narysowania jako "ghost" (półprzezroczysty podgląd). */
  ghostBuilding: string | null = null;
  /** Kafelek pod kursorem — pozycja ghost building. */
  ghostTile: { x: number; y: number } | null = null;
  ghostDirection = 'right';
  /** Czy gracza stać na postawienie ghost building (kolor: zielony/czerwony). */
  ghostCanAfford = true;

  // Pre-allocated render buffers — NO per-frame allocations
  private _sortedBuildings: Building[] = [];
  private _entityBuf: { y: number; render: () => void }[] = [];
  private _entityCount = 0;
  // Cached sky gradient to avoid recreation
  private _lastSkyDayFactor = -1;
  private _skyCanvas: HTMLCanvasElement | null = null;
  private _skyCtx: CanvasRenderingContext2D | null = null;
  private enemyHitFlash = new Map<string, number>();
  private damageNumbers: { x: number; y: number; value: number; life: number; color: string }[] = [];
  private prevEnemyHealth = new Map<string, number>();
  private _prevEnemyHealthIds: string[] = [];
  private sunShadowDX = 4;
  private sunShadowDY = 4;
  private sunShadowAlpha = 0.25;
  // Pre-computed enemy color cache: key = `${type}_${evolutionBucket}` → 'rgb(...)' string
  private static readonly _ENEMY_COLOR_CACHE = new Map<string, string>();
  private static _getEnemyDarkColor(type: string, evolution: number): string {
    const bucket = (evolution * 10 | 0) / 10; // quantize to 0.1
    const key = type + '_' + bucket;
    let c = GameRenderer._ENEMY_COLOR_CACHE.get(key);
    if (c !== undefined) return c;
    const r = 60 + bucket * 10 * 120;
    const g = 15 + bucket * 10 * 25;
    const b = 15 + bucket * 10 * 15;
    c = `rgb(${r * 0.6 | 0},${g * 0.6 | 0},${b * 0.6 | 0})`;
    GameRenderer._ENEMY_COLOR_CACHE.set(key, c);
    return c;
  }

  /** Weather system — rain, snow, fog, storm. */
  weatherSystem = new WeatherSystem();
  /** Weather scheduler for auto-cycling. */
  weatherScheduler = new WeatherScheduler();
  /** Particle effects — explosions, sparks, smoke, damage numbers. */
  particleEffects = new ParticleEffectsSystem();
  /** Ambient atmosphere — fireflies, dust, pollution haze, leaves. */
  ambientAtmosphere = new AmbientAtmosphere();
  /** Screen effects — shake, shockwaves, damage flash. */
  screenEffects = new ScreenEffects();
  /** Pollution overlay — visible brown haze on ground. */
  pollutionOverlay = new PollutionOverlay();

  /** Inicjalizuje renderer: zapisuje referencję do canvas, context 2D i tworzy offscreen lightCanvas. */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d')!;
    initSprites();
  }

  /** Główna metoda renderowania: czyści ekran, rysuje chunki, budynki, NPC, wrogów, cząsteczki, ghost building, fog i efekty świetlne. */
  render(state: GameState) {
    this.frameCount++;
    const { ctx, canvas } = this;
    const { camera } = state;

    // Periodic map cleanup every 500 frames to prevent memory leaks
    if (this.frameCount % 500 === 0) {
      if (this.enemyHitFlash.size > 500) {
        for (const [k, v] of this.enemyHitFlash) { if (v <= 0) this.enemyHitFlash.delete(k); }
      }
      if (this.prevEnemyHealth.size > 500) {
        // Remove entries for enemies that no longer exist
        for (const [k] of this.prevEnemyHealth) {
          if (!state.enemies.has(k)) this.prevEnemyHealth.delete(k);
        }
      }
    }

    // Update screen effects
    this.screenEffects.update();

    // Apply screen shake
    ctx.save();
    ctx.translate(this.screenEffects.shakeX, this.screenEffects.shakeY);

    const dayPhase = state.dayTime / state.dayLength;
    const dayFactor = Math.max(0.25, Math.sin(dayPhase * Math.PI * 2) * 0.5 + 0.5);
    const isNight = dayFactor < 0.5;

    // Directional sun shadow based on time of day
    {
      // dayPhase: 0.25 = noon (dayFactor=1), 0.75 = midnight (dayFactor=0.25)
      const dayAngle = (dayPhase - 0.25) * Math.PI * 2;
      const shadowLength = isNight ? 0 : Math.max(1.5, (1.0 - dayFactor) * 14 + 1.5);
      // Shadow opposite to sun: dawn (sun east) → shadow west (negative X), dusk → east (positive X)
      this.sunShadowDX = -Math.sin(dayAngle) * shadowLength * 0.65;
      this.sunShadowDY = Math.max(1.5, Math.abs(Math.cos(dayAngle)) * shadowLength * 0.35 + (isNight ? 0 : 1.8));
      this.sunShadowAlpha = isNight ? 0 : Math.max(0, Math.min(0.38, (dayFactor - 0.33) * 0.55));
    }

    // Sky — cached to offscreen canvas, only rebuild when dayFactor changes
    const dayFactorRounded = Math.round(dayFactor * 20) / 20; // quantize to 5% steps
    if (dayFactorRounded !== this._lastSkyDayFactor || !this._skyCanvas) {
      if (!this._skyCanvas) {
        this._skyCanvas = document.createElement('canvas');
        this._skyCtx = this._skyCanvas.getContext('2d')!;
      }
      this._skyCanvas.width = canvas.width;
      this._skyCanvas.height = canvas.height;
      const sc = this._skyCtx!;
      const skyGrad = sc.createLinearGradient(0, 0, 0, canvas.height);
      const isDawnDusk = dayFactorRounded > 0.38 && dayFactorRounded < 0.62;
      if (isDawnDusk) {
        const t = 1 - Math.abs(dayFactorRounded - 0.5) / 0.12;
        skyGrad.addColorStop(0, `rgb(${Math.floor(8 + dayFactorRounded * 12)},${Math.floor(8 + dayFactorRounded * 12)},${Math.floor(18 + dayFactorRounded * 20)})`);
        skyGrad.addColorStop(0.6, `rgb(${Math.floor(30 + t * 80)},${Math.floor(15 + t * 35)},${Math.floor(5 + t * 10)})`);
        skyGrad.addColorStop(1, `rgb(${Math.floor(20 + t * 60)},${Math.floor(10 + t * 25)},${Math.floor(3 + t * 8)})`);
      } else if (dayFactorRounded < 0.4) {
        skyGrad.addColorStop(0, 'rgb(3,4,10)');
        skyGrad.addColorStop(1, 'rgb(6,6,14)');
      } else {
        skyGrad.addColorStop(0, `rgb(${Math.floor(10 + dayFactorRounded * 65)},${Math.floor(20 + dayFactorRounded * 85)},${Math.floor(50 + dayFactorRounded * 110)})`);
        skyGrad.addColorStop(1, `rgb(${Math.floor(14 + dayFactorRounded * 70)},${Math.floor(25 + dayFactorRounded * 90)},${Math.floor(55 + dayFactorRounded * 105)})`);
      }
      sc.fillStyle = skyGrad;
      sc.fillRect(0, 0, this._skyCanvas.width, this._skyCanvas.height);
      this._lastSkyDayFactor = dayFactorRounded;
    }
    ctx.drawImage(this._skyCanvas, 0, 0);

    // Stars at night (fewer stars = faster)
    if (dayFactor < 0.45) {
      const starAlpha = Math.max(0, (0.45 - dayFactor) / 0.2);
      for (let i = 0; i < 80; i++) {
        const sx = ((i * 7919 + 13) % canvas.width);
        const sy = ((i * 3571 + 29) % (canvas.height * 0.65));
        const twinkle = Math.sin(this.frameCount * 0.02 + i) * 0.3 + 0.7;
        ctx.globalAlpha = starAlpha * twinkle * 0.5;
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    const viewLeft = camera.x - canvas.width / 2 / camera.zoom;
    const viewTop = camera.y - canvas.height / 2 / camera.zoom;
    const viewRight = camera.x + canvas.width / 2 / camera.zoom;
    const viewBottom = camera.y + canvas.height / 2 / camera.zoom;

    const startCX = Math.floor(viewLeft / TILE_SIZE / CHUNK_SIZE) - 1;
    const startCY = Math.floor(viewTop / TILE_SIZE / CHUNK_SIZE) - 1;
    const endCX = Math.floor(viewRight / TILE_SIZE / CHUNK_SIZE) + 1;
    const endCY = Math.floor(viewBottom / TILE_SIZE / CHUNK_SIZE) + 1;

    // Render ground layer — pre-compute night tint color once
    const nightAmount = dayFactor < 0.95 ? Math.max(0.25, 1 - dayFactor) : 0;
    const nightTintAlpha = nightAmount * 0.55;
    const nightTint = nightTintAlpha > 0.01 ? `rgba(5,3,12,${nightTintAlpha.toFixed(3)})` : null;
    for (let cy = startCY; cy <= endCY; cy++) {
      for (let cx = startCX; cx <= endCX; cx++) {
        const key = `${cx},${cy}`;
        const chunk = state.chunks.get(key);
        if (!chunk) continue;
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const tile = chunk[ly][lx];
            const sx = tile.x * TILE_SIZE;
            const sy = tile.y * TILE_SIZE;
            if (sx + TILE_SIZE < viewLeft || sx > viewRight || sy + TILE_SIZE < viewTop || sy > viewBottom) continue;
            this.renderTile(ctx, tile, nightTint, state);
          }
        }
      }
    }

    // Render conveyors (below buildings)
    this.renderConveyors(ctx, state, viewLeft, viewTop, viewRight, viewBottom);

    // Render buildings with shadows — reuse buffer, NO new array per frame
    this._sortedBuildings.length = 0;
    for (const building of state.buildings.values()) {
      const sx = building.x * TILE_SIZE;
      const sy = building.y * TILE_SIZE;
      if (sx >= viewLeft - 100 && sx <= viewRight + 100 && sy >= viewTop - 100 && sy <= viewBottom + 100) {
        this._sortedBuildings.push(building);
      }
    }
    this._sortedBuildings.sort((a, b) => a.y - b.y);

    for (let i = 0; i < this._sortedBuildings.length; i++) {
      this.renderBuilding(ctx, this._sortedBuildings[i], state);
    }

    this.renderPowerConnections(ctx, state);

    // Render entities sorted by Y for depth — reuse buffer
    this._entityCount = 0;

    for (const [, enemy] of state.enemies) {
      const ex = enemy.x * TILE_SIZE;
      const ey = enemy.y * TILE_SIZE;
      if (ex < viewLeft - 50 || ex > viewRight + 50 || ey < viewTop - 50 || ey > viewBottom + 50) continue;
      if (this._entityCount >= this._entityBuf.length) {
        this._entityBuf.push({ y: 0, render: () => {} });
      }
      const e = this._entityBuf[this._entityCount++];
      e.y = ey;
      e.render = () => this.renderEnemy(ctx, enemy, state);
    }

    for (const [, npc] of state.npcs) {
      const nx = npc.x * TILE_SIZE;
      const ny = npc.y * TILE_SIZE;
      if (nx < viewLeft - 50 || nx > viewRight + 50 || ny < viewTop - 50 || ny > viewBottom + 50) continue;
      if (this._entityCount >= this._entityBuf.length) {
        this._entityBuf.push({ y: 0, render: () => {} });
      }
      const e = this._entityBuf[this._entityCount++];
      e.y = ny;
      e.render = () => this.renderNPC(ctx, npc, state);
    }

    // Player
    const py = state.player.y * TILE_SIZE;
    if (this._entityCount >= this._entityBuf.length) {
      this._entityBuf.push({ y: 0, render: () => {} });
    }
    const pe = this._entityBuf[this._entityCount++];
    pe.y = py;
    pe.render = () => this.renderPlayer(ctx, state);

    // Sort only the used portion
    const sortSlice = this._entityBuf;
    const count = this._entityCount;
    // Simple insertion sort — faster for small N (<100 entities typical)
    for (let i = 1; i < count; i++) {
      const key = sortSlice[i];
      let j = i - 1;
      while (j >= 0 && sortSlice[j].y > key.y) {
        sortSlice[j + 1] = sortSlice[j];
        j--;
      }
      sortSlice[j + 1] = key;
    }
    for (let i = 0; i < count; i++) {
      sortSlice[i].render();
    }

    // Render co-op visitors (other players in this world)
    if (state.coopVisitors) {
      for (const [, visitor] of state.coopVisitors) {
        const vx = visitor.x * TILE_SIZE - state.camera.x + canvas.width / 2;
        const vy = visitor.y * TILE_SIZE - state.camera.y + canvas.height / 2;
        ctx.save();
        ctx.translate(vx, vy);
        // Body
        ctx.beginPath();
        ctx.arc(0, -8, 8, 0, Math.PI * 2);
        ctx.fillStyle = visitor.color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Name tag
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'white';
        ctx.fillText(visitor.username, 0, -22);
        ctx.restore();
      }
    }

    // Ghost building preview
    if (this.ghostBuilding && this.ghostTile) {
      this.renderGhostBuilding(ctx, state);
    }

    // Render build queue sites (construction scaffolding)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,200,80,0.7)';
    ctx.lineWidth = 1.5;
    for (const task of state.buildQueue) {
      const bsize = BUILDING_SIZES[task.type] || { w: 1, h: 1 };
      const bx = task.x * TILE_SIZE;
      const bob = task.y * TILE_SIZE;
      const bw = bsize.w * TILE_SIZE;
      const bh = bsize.h * TILE_SIZE;
      const prog = task.constructionProgress / 100;

      ctx.strokeRect(bx + 1, bob + 1, bw - 2, bh - 2);

      // Construction fill
      ctx.fillStyle = `rgba(255,200,80,${0.08 + prog * 0.18})`;
      ctx.fillRect(bx, bob, bw, bh * prog);

      // Progress bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, bob + bh - 5, bw, 5);
      ctx.fillStyle = '#ffcc44';
      ctx.fillRect(bx, bob + bh - 5, bw * prog, 5);

      // Build icon
      ctx.font = `${Math.min(bw, bh) * 0.5}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,200,80,0.9)';
      ctx.fillText('🔨', bx + bw / 2, bob + bh / 2 + 4);
    }
    ctx.setLineDash([]);
    ctx.textAlign = 'left';

    // Render particles
    this.renderParticles(ctx, state, viewLeft, viewTop, viewRight, viewBottom);

    // Render floating damage numbers — swap-and-pop, NO splice
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      const alpha = dn.life / 40;
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${10 + (1 - alpha) * 4}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = dn.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeText(`-${dn.value}`, dn.x, dn.y);
      ctx.fillText(`-${dn.value}`, dn.x, dn.y);
      dn.y -= 0.35;
      dn.life--;
      if (dn.life <= 0) {
        // Swap-and-pop: move last element into this slot, shrink
        const last = this.damageNumbers.length - 1;
        if (i !== last) this.damageNumbers[i] = this.damageNumbers[last];
        this.damageNumbers.pop();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // Render building glow effects (emissive)
    for (let i = 0; i < this._sortedBuildings.length; i++) {
      this.renderBuildingGlow(ctx, this._sortedBuildings[i]);
    }

    ctx.restore();

    // Night lighting overlay
    if (isNight) {
      this.renderNightLighting(state, dayFactor);
    }

    // Sunrise/sunset atmospheric tint
    const dawnDusk = this.getDawnDuskFactor(dayPhase);
    if (dawnDusk > 0) {
      const isSunrise = dayPhase < 0.5;
      if (isSunrise) {
        // Sunrise — warm orange/gold
        ctx.fillStyle = `rgba(255,140,40,${dawnDusk * 0.08})`;
      } else {
        // Sunset — deep red/purple
        ctx.fillStyle = `rgba(200,60,80,${dawnDusk * 0.1})`;
      }
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Update & render weather — throttled to every 2 frames
    if (this.frameCount % 2 === 0) {
      this.weatherSystem.setWeather(state.weather as WeatherType || 'clear');
      this.weatherScheduler.update((w) => this.weatherSystem.setWeather(w));
    }
    this.weatherSystem.update(canvas.width, canvas.height, state.camera.x, state.camera.y);
    this.weatherSystem.render(ctx, canvas.width, canvas.height, state.camera.x, state.camera.y);

    // Update & render particle effects — throttled
    if (this.frameCount % 2 === 0) this.particleEffects.update();
    this.particleEffects.render(ctx, state.camera.x, state.camera.y);

    // Update & render ambient atmosphere — throttled
    if (this.frameCount % 3 === 0) {
      this.ambientAtmosphere.update(
        canvas.width, canvas.height,
        state.camera.x, state.camera.y,
        dayFactor,
        state.buildings.size,
        state.tick
      );
    }
    this.ambientAtmosphere.render(ctx, state.camera.x, state.camera.y);

    // Pollution overlay — throttled to every 8 frames
    if (this.frameCount % 8 === 0) {
      this.pollutionOverlay.render(ctx, state, state.camera.x, state.camera.y, canvas.width, canvas.height, this.frameCount);
    }

    // Vignette
    this.renderVignette(ctx);

    // Damage flash
    if (state.player.health < state.player.maxHealth * 0.3) {
      const pulse = Math.sin(this.frameCount * 0.1) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(200,0,0,${pulse * 0.08})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Screen effects (shockwaves, damage vignette, flash)
    this.screenEffects.render(ctx, canvas.width, canvas.height, state.camera.x, state.camera.y);

    // Restore from screen shake
    ctx.restore();
  }

  private renderTile(ctx: CanvasRenderingContext2D, tile: Tile, nightTint: string | null, state: GameState) {
    const x = tile.x * TILE_SIZE;
    const y = tile.y * TILE_SIZE;

    // Water handled via renderResource
    if (tile.resource !== 'water') {
      // Draw pre-generated terrain sprite
      const sprite = getTerrainSprite(tile.biome, tile.x, tile.y);
      if (sprite) {
        ctx.drawImage(sprite, x, y, TILE_SIZE, TILE_SIZE);
      }

      // Apply day/night tint
      if (nightTint) {
        ctx.fillStyle = nightTint;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      }

      // Grid lines only when very zoomed in
      if (state.camera.zoom > 2.5) {
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }

    // Trees
    if (hasTreeAt(tile.x, tile.y, tile.biome) && !tile.building) {
      this.renderTree(ctx, x, y, tile.biome);
    }

    // Resources
    if (tile.resource && tile.resourceAmount > 0 && !tile.building) {
      this.renderResource(ctx, tile);
    }

    // Pollution overlay
    if (tile.pollution > 0) {
      const pAlpha = Math.min(0.35, tile.pollution * 0.012);
      ctx.fillStyle = `rgba(120,90,50,${pAlpha})`;
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }
  }

  private renderTree(ctx: CanvasRenderingContext2D, x: number, y: number, biome: string) {
    const sprite = getTreeSprite(biome, x / TILE_SIZE | 0, y / TILE_SIZE | 0);
    if (sprite) {
      // Animated sway effect — gentle wind
      const windPhase = this.frameCount * 0.015 + x * 0.05 + y * 0.03;
      const sway = Math.sin(windPhase) * 2.0;
      const sway2 = Math.sin(windPhase * 1.3 + 1.5) * 0.8;
      // Shadow underneath
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(x + TILE_SIZE / 2 + sway * 0.3, y + TILE_SIZE - 1, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tree with sway
      ctx.drawImage(sprite, x + sway, y - 8 + sway2, TILE_SIZE, TILE_SIZE + 8);
    }
  }

  private renderResource(ctx: CanvasRenderingContext2D, tile: Tile) {
    const x = tile.x * TILE_SIZE;
    const y = tile.y * TILE_SIZE;
    const color = RESOURCE_COLORS[tile.resource!] || '#ffffff';

    if (tile.resource === 'water') {
      const sprite = getWaterSprite(tile.x, tile.y);
      if (sprite) {
        ctx.drawImage(sprite, x, y, TILE_SIZE, TILE_SIZE);
        // Animated wave shimmer
        const shimmer = Math.sin(this.frameCount * 0.03 + tile.x * 0.5 + tile.y * 0.3) * 0.15 + 0.05;
        ctx.fillStyle = `rgba(200,230,255,${shimmer})`;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        // Water current flow lines
        const flowPhase = this.frameCount * 0.02 + tile.x * 0.3;
        ctx.strokeStyle = `rgba(180,210,240,${0.08 + Math.sin(flowPhase) * 0.04})`;
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 3; i++) {
          const fy = y + 4 + i * (TILE_SIZE / 3);
          ctx.beginPath();
          ctx.moveTo(x, fy);
          ctx.quadraticCurveTo(
            x + TILE_SIZE / 2, fy + Math.sin(flowPhase + i) * 3,
            x + TILE_SIZE, fy + Math.sin(flowPhase + i + 1) * 2
          );
          ctx.stroke();
        }
        // Occasional sparkle on water surface
        if (this.frameCount % 25 === 0) {
          const sparkX = x + ((tile.x * 17 + this.frameCount) % TILE_SIZE);
          const sparkY = y + ((tile.y * 23 + this.frameCount * 7) % TILE_SIZE);
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(sparkX, sparkY, 2, 1);
        }
      } else {
        ctx.fillStyle = '#1a4a8a';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      }
      return;
    }

    if (tile.resource === 'oil') {
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      return;
    }

    // Szybki resource: pojedynczy kolorowy prostokąt zamiast 3-5 skalnych brył
    const alpha = Math.min(1, tile.resourceAmount / 100);
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    ctx.globalAlpha = 1;

    // Parse ore color components
    const rC = parseInt(color.slice(1, 3), 16);
    const gC = parseInt(color.slice(3, 5), 16);
    const bC = parseInt(color.slice(5, 7), 16);

    // Tile-wide ore ground tint — makes the patch clearly visible even when zoomed out
    ctx.fillStyle = `rgba(${Math.floor(rC * 0.35)},${Math.floor(gC * 0.35)},${Math.floor(bC * 0.35)},0.6)`;
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Deterministic hash for rock positions
    const h1 = ((tile.x * 7919 + tile.y * 104729) & 0xFFFF) / 65535;
    const h2 = ((tile.x * 104729 + tile.y * 7919) & 0xFFFF) / 65535;
    const h3 = ((tile.x * 49999 + tile.y * 86413) & 0xFFFF) / 65535;

    // Draw 3–5 ore rock chunks per tile
    const rockCount = 3 + Math.floor(h3 * 3);
    const darkRC = Math.floor(rC * 0.5);
    const darkGC = Math.floor(gC * 0.5);
    const darkBC = Math.floor(bC * 0.5);
    const darkOutlineColor = `rgba(${darkRC},${darkGC},${darkBC},0.8)`;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < rockCount; i++) {
      const t = i / rockCount;
      const rx = x + ((h1 + t * 0.37) % 1) * (TILE_SIZE - 10) + 5;
      const ry = y + ((h2 + t * 0.53) % 1) * (TILE_SIZE - 10) + 5;
      const rs = 3.5 + ((h1 + h2 + t) % 1) * 2.5;
      const angle = (h3 + t) * Math.PI;

      // Rock shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(rx + 1.5, ry + 2, rs * 0.9, rs * 0.55, angle, 0, Math.PI * 2);
      ctx.fill();

      // Rock body — angular polygon
      const pts = 5 + Math.floor((h1 + i) % 1 * 2);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let p = 0; p < pts; p++) {
        const a = (p / pts) * Math.PI * 2 + angle;
        const jitter = 0.7 + ((h2 + p * 0.17) % 1) * 0.6;
        const px2 = rx + Math.cos(a) * rs * jitter;
        const py2 = ry + Math.sin(a) * rs * 0.65 * jitter;
        p === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
      }
      ctx.closePath();
      ctx.fill();

      // Rock outline (darker edge) — pre-computed color
      ctx.strokeStyle = darkOutlineColor;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Highlight facet
      ctx.fillStyle = `rgba(255,255,255,0.22)`;
      ctx.beginPath();
      ctx.ellipse(rx - rs * 0.3, ry - rs * 0.35, rs * 0.3, rs * 0.2, angle - 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Metallic specular sparkle (animated)
      const sparkPhase = Math.sin(this.frameCount * 0.04 + i * 1.5 + tile.x * 0.3) * 0.5 + 0.5;
      if (sparkPhase > 0.85) {
        ctx.fillStyle = `rgba(255,255,255,${(sparkPhase - 0.85) * 2.5})`;
        ctx.beginPath();
        ctx.arc(rx - rs * 0.25, ry - rs * 0.3, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Yield quality indicator — small corner square (zamiast arc)
    if (tile.resourceYield !== 'normal') {
      const yieldColor = getYieldColor(tile.resourceYield);
      ctx.fillStyle = yieldColor;
      ctx.fillRect(x + TILE_SIZE - 7, y + 2, 5, 5);
    }
  }

  private renderBuilding(ctx: CanvasRenderingContext2D, building: Building, _state: GameState) {
    const x = building.x * TILE_SIZE;
    const y = building.y * TILE_SIZE;
    const size = BUILDING_SIZES[building.type] || { w: 1, h: 1 };
    const w = size.w * TILE_SIZE;
    const h = size.h * TILE_SIZE;

    // Directional sun shadow + ambient contact shadow
    if (this.sunShadowAlpha > 0.02) {
      ctx.fillStyle = `rgba(0,0,0,${this.sunShadowAlpha})`;
      ctx.fillRect(x + this.sunShadowDX, y + this.sunShadowDY, w, h);
    }

    // Ambient contact shadow (simple bar)
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x + 2, y + h - 4, w - 4, 4);

    // Draw pre-generated building sprite as base
    const sprite = getBuildingSprite(building.type);
    if (sprite) {
      ctx.drawImage(sprite, x, y, w, h);
    } else {
      // Fallback: colored rectangle
      const color = BUILDING_COLORS[building.type] || '#888';
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    // Direction arrow — only draw on top of sprite
    const dir = DIR_OFFSETS[building.direction];
    if (dir) {
      const arrowX = Math.round(x + w / 2 + dir.dx * w / 3);
      const arrowY = Math.round(y + h / 2 + dir.dy * h / 3);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(arrowX - 3, arrowY - 3, 6, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(arrowX - 1, arrowY - 1, 2, 2);
    }

    // Progress bar — fillRect zamiast roundRect
    if (building.recipe && building.progress > 0) {
      const progress = building.progress / building.recipe.craftTime;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y - 8, w, 5);
      ctx.fillStyle = '#00cc66';
      ctx.fillRect(x + 0.5, y - 7.5, (w - 1) * progress, 4);
    }

    // Health bar — fillRect (no roundRect overhead)
    if (building.health < building.maxHealth) {
      const hp = building.health / building.maxHealth;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y + h + 3, w, 4);
      const hpColor = hp > 0.5 ? '#22c55e' : hp > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillStyle = hpColor;
      ctx.fillRect(x + 0.5, y + 3.5, (w - 1) * hp, 3);
    }

    // Status indicator bar at bottom
    let statusColor: string;
    if (building.type === 'boiler') {
      let coalCount = 0;
      for (let ci = 0; ci < building.inventory.length; ci++) {
        if (building.inventory[ci].itemId === 'coal') { coalCount = building.inventory[ci].count; break; }
      }
      statusColor = building.isActive && coalCount > 0 ? '#ff8800' : coalCount === 0 ? '#ff2222' : '#444';
    } else {
      statusColor = building.isActive ? '#22dd44' : '#444';
    }
    ctx.fillStyle = statusColor;
    ctx.fillRect(x + 2, y + h - 3, (w - 4), 2);
    if (building.isActive && building.recipe && building.progress > 0) {
      const prog = Math.min(1, building.progress / (building.recipe?.craftTime ?? 100));
      ctx.fillStyle = '#88ffaa';
      ctx.fillRect(x + 2, y + h - 3, (w - 4) * prog, 2);
    }

    // Animated type-specific details (overlaid on sprite)
    this.renderBuildingAnimations(ctx, building, x, y, w, h);

    // Active building ambient effects
    if (building.isActive) {
      const cx2 = x + w / 2;
      const cy2 = y + h / 2;

      // Smoke from chimneys — furnaces, refineries, boilers
      if ((building.type === 'furnace' || building.type === 'refinery' || building.type === 'boiler') && this.frameCount % 6 === 0) {
        ctx.fillStyle = `rgba(80,70,60,${0.15 + Math.random() * 0.1})`;
        const smokeX = cx2 + Math.sin(this.frameCount * 0.03) * 3;
        const smokeY = y - 8 - (this.frameCount % 30);
        ctx.beginPath();
        ctx.arc(smokeX, smokeY, 3 + (this.frameCount % 30) * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }

      // Steam from chemical plants
      if (building.type === 'chemical_plant' && this.frameCount % 8 === 0) {
        ctx.fillStyle = 'rgba(200,220,240,0.12)';
        const sx = cx2 + Math.sin(this.frameCount * 0.04) * 4;
        const sy = y - 4 - (this.frameCount % 24);
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + (this.frameCount % 24) * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sparks from assemblers
      if (building.type === 'assembler' && this.frameCount % 15 === 0) {
        ctx.fillStyle = '#ffcc44';
        for (let i = 0; i < 2; i++) {
          const sx = cx2 + (Math.random() - 0.5) * w * 0.6;
          const sy = cy2 + (Math.random() - 0.5) * h * 0.4;
          ctx.fillRect(sx, sy, 1.5, 1.5);
        }
      }

      // Steam vents from steam engines
      if (building.type === 'steam_engine' && this.frameCount % 10 === 0) {
        ctx.fillStyle = 'rgba(220,230,240,0.15)';
        const sx = cx2 + Math.sin(this.frameCount * 0.06) * 5;
        const sy = y - 2 - (this.frameCount % 20);
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + (this.frameCount % 20) * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }

      // Energy pulse for laser turret / tesla coil
      if ((building.type === 'laser_turret' || building.type === 'tesla_coil') && this.frameCount % 30 < 3) {
        ctx.strokeStyle = building.type === 'tesla_coil' ? 'rgba(150,100,255,0.3)' : 'rgba(0,255,255,0.3)';
        ctx.lineWidth = 1;
        const pulseR = 10 + (this.frameCount % 30) * 2;
        ctx.beginPath();
        ctx.arc(cx2, cy2, pulseR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Mining drill sparks
      if (building.type === 'miner' && this.frameCount % 10 === 0) {
        ctx.fillStyle = '#ffaa44';
        const angle = this.frameCount * 0.1;
        for (let i = 0; i < 3; i++) {
          const a = angle + i * Math.PI * 2 / 3;
          const sparkR = 6 + Math.random() * 4;
          ctx.fillRect(cx2 + Math.cos(a) * sparkR - 0.5, cy2 + Math.sin(a) * sparkR - 0.5, 2, 2);
        }
      }

      // Radar sweep
      if (building.type === 'radar') {
        const sweepAngle = (this.frameCount * 0.02) % (Math.PI * 2);
        ctx.strokeStyle = 'rgba(6,182,212,0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx2, cy2);
        ctx.lineTo(cx2 + Math.cos(sweepAngle) * 18, cy2 + Math.sin(sweepAngle) * 18);
        ctx.stroke();
      }

      // Lab research glow
      if (building.type === 'lab' && building.progress > 0) {
        const glowIntensity = Math.sin(this.frameCount * 0.08) * 0.15 + 0.2;
        ctx.fillStyle = `rgba(168,85,247,${glowIntensity})`;
        ctx.beginPath();
        ctx.arc(cx2, cy2, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Silo launch countdown
      if (building.type === 'silo' && building.progress > 0) {
        const prog = building.progress / (building.recipe?.craftTime ?? 1);
        if (prog > 0.9) {
          const shake = Math.sin(this.frameCount * 0.3) * 2 * (prog - 0.9) * 10;
          ctx.fillStyle = `rgba(255,100,30,${(prog - 0.9) * 5})`;
          ctx.beginPath();
          ctx.arc(cx2 + shake, cy2 - 5, 4 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Roboport drone activity
      if (building.type === 'roboport' && this.frameCount % 40 < 20) {
        ctx.fillStyle = 'rgba(100,200,220,0.15)';
        ctx.beginPath();
        ctx.arc(cx2, cy2, 16 + Math.sin(this.frameCount * 0.05) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private renderPowerConnections(ctx: CanvasRenderingContext2D, state: GameState) {
    // Single pass — no Array.from + filter per type
    const boilers: Building[] = [];
    const steamEngines: Building[] = [];
    const powerPoles: Building[] = [];

    for (const building of state.buildings.values()) {
      if (building.type === 'boiler') boilers.push(building);
      else if (building.type === 'steam_engine') steamEngines.push(building);
      else if (building.type === 'power_pole') powerPoles.push(building);
    }

    // Draw orange steam pipes connecting boilers to nearby steam engines
    for (const boiler of boilers) {
      for (const engine of steamEngines) {
        const dx = engine.x - boiler.x;
        const dy = engine.y - boiler.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 12) {
          const sx = (boiler.x + 1) * TILE_SIZE;
          const sy = (boiler.y + 1) * TILE_SIZE;
          const ex = (engine.x + 1.5) * TILE_SIZE;
          const ey = (engine.y + 1) * TILE_SIZE;
          const alpha = boiler.isActive ? 0.7 : 0.25;
          ctx.strokeStyle = `rgba(255,140,0,${alpha})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.setLineDash([]);
          // Animated steam flow dot
          if (boiler.isActive) {
            const t = (this.frameCount * 0.04) % 1;
            const dotX = sx + (ex - sx) * t;
            const dotY = sy + (ey - sy) * t;
            ctx.fillStyle = 'rgba(255,200,100,0.9)';
            ctx.beginPath();
            ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Draw yellow wires between power poles (within 15 tiles of each other) — batched
    ctx.strokeStyle = 'rgba(220,200,60,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < powerPoles.length; i++) {
      for (let j = i + 1; j < powerPoles.length; j++) {
        const a = powerPoles[i];
        const b = powerPoles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 15) {
          const ax = a.x * TILE_SIZE + TILE_SIZE / 2;
          const ay = a.y * TILE_SIZE + TILE_SIZE / 2;
          const bx = b.x * TILE_SIZE + TILE_SIZE / 2;
          const bob = b.y * TILE_SIZE + TILE_SIZE / 2;
          const midX = (ax + bx) / 2;
          const midY = (ay + bob) / 2 + dist * 1.5;
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo(midX, midY, bx, bob);
        }
      }
    }
    ctx.stroke();

    // Power pole range indicator — batched into single path
    if (powerPoles.length > 0 && powerPoles.length < 200) {
      ctx.strokeStyle = 'rgba(220,200,60,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      for (let i = 0; i < powerPoles.length; i++) {
        const pole = powerPoles[i];
        ctx.moveTo(pole.x * TILE_SIZE + TILE_SIZE / 2 + 15 * TILE_SIZE, pole.y * TILE_SIZE + TILE_SIZE / 2);
        ctx.arc(pole.x * TILE_SIZE + TILE_SIZE / 2, pole.y * TILE_SIZE + TILE_SIZE / 2, 15 * TILE_SIZE, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Cached glow gradients — one per type, reused across frames
  private static readonly _glowCache = new Map<string, { canvas: HTMLCanvasElement; radius: number }>();

  private renderBuildingGlow(ctx: CanvasRenderingContext2D, building: Building) {
    const x = building.x * TILE_SIZE;
    const y = building.y * TILE_SIZE;
    const size = BUILDING_SIZES[building.type] || { w: 1, h: 1 };
    const w = size.w * TILE_SIZE;
    const h = size.h * TILE_SIZE;

    // Only render glow for active buildings of specific types
    if (!building.isActive) return;

    switch (building.type) {
      case 'furnace': {
        const flicker = Math.sin(this.frameCount * 0.15) * 5 + 18;
        const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, flicker);
        glow.addColorStop(0, 'rgba(255,100,10,0.4)');
        glow.addColorStop(0.5, 'rgba(255,50,0,0.15)');
        glow.addColorStop(1, 'rgba(200,30,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 15, y - 15, w + 30, h + 30);
        break;
      }
      case 'lab': {
        const pulse = Math.sin(this.frameCount * 0.05) * 0.1 + 0.18;
        const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, 24);
        glow.addColorStop(0, `rgba(0,180,255,${pulse})`);
        glow.addColorStop(1, 'rgba(0,80,200,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 12, y - 12, w + 24, h + 24);
        break;
      }
      case 'boiler': {
        const flicker2 = Math.sin(this.frameCount * 0.1) * 4 + 14;
        const glow = ctx.createRadialGradient(x + w / 2, y + h * 0.3, 0, x + w / 2, y + h * 0.3, flicker2);
        glow.addColorStop(0, 'rgba(255,80,0,0.2)');
        glow.addColorStop(1, 'rgba(200,50,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 8, y - 12, w + 16, h + 16);
        break;
      }
      case 'steam_engine': {
        const pulse2 = Math.sin(this.frameCount * 0.08) * 0.08 + 0.1;
        const glow = ctx.createRadialGradient(x + w * 0.72, y + h * 0.5, 0, x + w * 0.72, y + h * 0.5, 22);
        glow.addColorStop(0, `rgba(180,220,255,${pulse2})`);
        glow.addColorStop(1, 'rgba(100,160,220,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
        break;
      }
      case 'assembler': {
        const p = Math.sin(this.frameCount * 0.06) * 0.05 + 0.08;
        const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, 18);
        glow.addColorStop(0, `rgba(74,176,255,${p})`);
        glow.addColorStop(1, 'rgba(20,100,200,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
        break;
      }
      case 'radar': {
        const pulse3 = Math.sin(this.frameCount * 0.05) * 0.08 + 0.12;
        const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, 20);
        glow.addColorStop(0, `rgba(0,200,80,${pulse3})`);
        glow.addColorStop(1, 'rgba(0,100,40,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
        break;
      }
    }
  }

  private renderBuildingAnimations(ctx: CanvasRenderingContext2D, building: Building, x: number, y: number, w: number, h: number) {
    switch (building.type) {
      case 'pipe': {
        // Animated fluid flow inside pipe
        if (building.isActive) {
          const flowSpeed = this.frameCount * 0.04;
          const pipeY = y + h / 2;
          // Horizontal fluid blobs — batched into single path
          ctx.fillStyle = 'rgba(80,160,220,0.3)';
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const fx = x + ((flowSpeed * 8 + i * (TILE_SIZE / 4)) % TILE_SIZE);
            ctx.moveTo(fx + 3, pipeY);
            ctx.ellipse(fx, pipeY, 3, 2, 0, 0, Math.PI * 2);
          }
          ctx.fill();
          // Pipe highlight shimmer
          ctx.fillStyle = 'rgba(200,230,255,0.08)';
          ctx.fillRect(x + 2, pipeY - 3, TILE_SIZE - 4, 2);
        }
        break;
      }
      case 'miner': {
        // Drill derrick A-frame
        const dcx = x + w / 2;
        const dtip = y + 4;
        ctx.strokeStyle = '#4a4a42';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(dcx, dtip);
        ctx.lineTo(x + 5, y + h - 4);
        ctx.moveTo(dcx, dtip);
        ctx.lineTo(x + w - 5, y + h - 4);
        ctx.stroke();
        // Cross brace
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 8, y + h * 0.55);
        ctx.lineTo(x + w - 8, y + h * 0.55);
        ctx.stroke();
        ctx.lineCap = 'butt';
        // Rotating drill bit head
        const angle = (building.isActive ? this.frameCount * 0.18 : 0);
        ctx.save();
        ctx.translate(dcx, y + h / 2 + 2);
        ctx.rotate(angle);
        ctx.fillStyle = '#6a6a60';
        ctx.fillRect(-8, -2, 16, 4);
        ctx.fillRect(-2, -8, 4, 16);
        ctx.fillStyle = '#888880';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Dust cloud when active
        if (building.isActive && this.frameCount % 8 === 0) {
          ctx.fillStyle = 'rgba(140,120,90,0.25)';
          for (let i = 0; i < 3; i++) {
            const ddx = (Math.random() - 0.5) * w;
            const ddy = -Math.random() * 10;
            ctx.beginPath();
            ctx.arc(dcx + ddx, y + h * 0.6 + ddy, 2 + Math.random() * 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'boiler': {
        // Firebox glow
        const flicker2 = Math.sin(this.frameCount * 0.15) * 2;
        if (building.isActive) {
          ctx.fillStyle = `rgba(255,${80 + flicker2 * 8},10,0.85)`;
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2 + 4, 6 + flicker2 * 0.5, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,${160 + flicker2 * 6},60,0.5)`;
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2 + 3, 3, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Pressure gauge (small circle top-right)
        ctx.fillStyle = '#1a1a18';
        ctx.beginPath();
        ctx.arc(x + w - 7, y + 7, 5, 0, Math.PI * 2);
        ctx.fill();
        const pressure = building.energy / (building.maxEnergy || 50);
        ctx.strokeStyle = pressure > 0.5 ? '#44ff88' : pressure > 0.2 ? '#ffcc44' : '#ff4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x + w - 7, y + 7, 3.5, -Math.PI * 0.8, -Math.PI * 0.8 + pressure * Math.PI * 1.6);
        ctx.stroke();
        // Coal level indicator & "NO COAL" warning — simple loop instead of find
        let coalCount2 = 0;
        for (let ci = 0; ci < building.inventory.length; ci++) {
          if (building.inventory[ci].itemId === 'coal') { coalCount2 = building.inventory[ci].count; break; }
        }
        if (coalCount2 === 0 && Math.floor(this.frameCount / 20) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,60,60,0.95)';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('NO COAL', x + w / 2, y - 2);
          ctx.textAlign = 'left';
        }
        break;
      }
      case 'furnace': {
        ctx.fillStyle = '#1a0a04';
        ctx.fillRect(x + w / 2 - 3, y - 12, 6, 14);
        ctx.fillStyle = '#2a1208';
        ctx.fillRect(x + w / 2 - 4, y - 13, 8, 3);
        // Chimney bricks
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x + w / 2 - 3, y - 7);
        ctx.lineTo(x + w / 2 + 3, y - 7);
        ctx.stroke();
        // Smoke from chimney
        if (building.isActive) {
          const smokeT = (this.frameCount * 0.4) % 40;
          const smokeAlpha = Math.max(0, 0.4 - smokeT * 0.01);
          ctx.fillStyle = `rgba(80,70,60,${smokeAlpha})`;
          ctx.beginPath();
          ctx.arc(x + w / 2 + Math.sin(this.frameCount * 0.05) * 2, y - 14 - smokeT * 0.3, 3 + smokeT * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
        // Fire core with flicker
        const flicker = Math.sin(this.frameCount * 0.2) * 2;
        ctx.fillStyle = `rgba(255,${100 + flicker * 12},10,0.9)`;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, 5 + flicker, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,${190 + flicker * 10},70,0.6)`;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2 - 2, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Fire aperture (dark surround)
        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, 8, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'assembler': {
        const speed = building.isActive ? 0.05 : 0.008;
        const angle = this.frameCount * speed;
        const cx2 = x + w / 2;
        const cy2 = y + h / 2;
        // Central hub
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.arc(cx2, cy2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3a5a7a';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 3 robotic arms
        for (let i = 0; i < 3; i++) {
          const a = angle + (i / 3) * Math.PI * 2;
          const armEndX = cx2 + Math.cos(a) * 12;
          const armEndY = cy2 + Math.sin(a) * 12;
          ctx.strokeStyle = '#5a7a9a';
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx2, cy2);
          ctx.lineTo(armEndX, armEndY);
          ctx.stroke();
          // Claw tip
          ctx.fillStyle = '#8aaac0';
          ctx.beginPath();
          ctx.arc(armEndX, armEndY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.lineCap = 'butt';
        // Center core
        ctx.fillStyle = building.isActive ? '#4ab0ff' : '#2a4a6a';
        ctx.beginPath();
        ctx.arc(cx2, cy2, 3.5, 0, Math.PI * 2);
        ctx.fill();
        // Activity ring
        if (building.recipe && building.progress > 0) {
          const prog = building.progress / building.recipe.craftTime;
          ctx.strokeStyle = 'rgba(74,176,255,0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx2, cy2, 14, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'lab': {
        // Flask with bubbling liquid
        const bubbleY = Math.sin(this.frameCount * 0.06) * 2;
        ctx.fillStyle = '#0088cc';
        ctx.beginPath();
        ctx.moveTo(x + w / 2 - 5, y + h / 2 + 4);
        ctx.lineTo(x + w / 2 + 5, y + h / 2 + 4);
        ctx.lineTo(x + w / 2 + 3, y + h / 2 - 4 + bubbleY);
        ctx.lineTo(x + w / 2 - 3, y + h / 2 - 4 + bubbleY);
        ctx.fill();
        // Flask neck
        ctx.fillStyle = '#aaa';
        ctx.fillRect(x + w / 2 - 2, y + h / 2 - 8, 4, 6);
        // Bubbles
        if (building.isActive) {
          ctx.fillStyle = 'rgba(0,200,255,0.5)';
          const bob = y + h / 2 + 2 - (this.frameCount % 20) * 0.3;
          ctx.beginPath();
          ctx.arc(x + w / 2 + Math.sin(this.frameCount * 0.1) * 2, bob, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'turret': {
        // Base
        ctx.fillStyle = '#880000';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        // Barrel
        const dir = DIR_OFFSETS[building.direction];
        if (dir) {
          ctx.strokeStyle = '#cc0000';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x + w / 2, y + h / 2);
          ctx.lineTo(x + w / 2 + dir.dx * 14, y + h / 2 + dir.dy * 14);
          ctx.stroke();
          ctx.lineCap = 'butt';
          // Muzzle flash when attacking
          if (building.isActive && this.frameCount % 15 < 3) {
            ctx.fillStyle = 'rgba(255,200,50,0.7)';
            ctx.beginPath();
            ctx.arc(x + w / 2 + dir.dx * 16, y + h / 2 + dir.dy * 16, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'power_pole': {
        // Pole
        ctx.fillStyle = '#555';
        ctx.fillRect(x + TILE_SIZE / 2 - 1.5, y + 4, 3, TILE_SIZE - 8);
        // Cross arm
        ctx.fillRect(x + 4, y + 6, TILE_SIZE - 8, 2);
        // Insulators
        ctx.fillStyle = '#8af';
        ctx.beginPath();
        ctx.arc(x + 6, y + 6, 2, 0, Math.PI * 2);
        ctx.arc(x + TILE_SIZE - 6, y + 6, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'radar': {
        const angle = this.frameCount * 0.025;
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        // Dish
        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(0,255,100,0.2)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 14, -0.3, 0.3);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,255,100,0.4)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 14, -0.15, 0.15);
        ctx.fill();
        // Center dot
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'storage': {
        // Chest lines
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + h / 2);
        ctx.lineTo(x + w - 4, y + h / 2);
        ctx.stroke();
        // Lock
        ctx.fillStyle = '#daa520';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'pumpjack': {
        // Base platform
        ctx.fillStyle = '#141008';
        ctx.fillRect(x + 3, y + h - 7, w - 6, 7);
        // A-frame derrick
        const pcx = x + w / 2;
        const ptip = y + 5;
        ctx.strokeStyle = '#3a3428';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pcx, ptip);
        ctx.lineTo(x + 6, y + h - 7);
        ctx.moveTo(pcx, ptip);
        ctx.lineTo(x + w - 6, y + h - 7);
        ctx.stroke();
        // Cross brace
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 9, y + h * 0.55);
        ctx.lineTo(x + w - 9, y + h * 0.55);
        ctx.stroke();
        ctx.lineCap = 'butt';
        // Walking beam (rocking animation)
        const beamRock = Math.sin(this.frameCount * (building.isActive ? 0.07 : 0.01)) * 0.4;
        const beamLen = w * 0.45;
        const frontX = pcx + Math.cos(beamRock) * beamLen * 0.55;
        const frontY = ptip + Math.sin(beamRock) * beamLen * 0.55;
        const backX = pcx - Math.cos(beamRock) * beamLen * 0.4;
        const backY = ptip - Math.sin(beamRock) * beamLen * 0.4;
        ctx.strokeStyle = '#6a6050';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(frontX, frontY);
        ctx.lineTo(backX, backY);
        ctx.stroke();
        ctx.lineCap = 'butt';
        // Horsehead
        ctx.fillStyle = '#4a4038';
        ctx.fillRect(frontX - 4, frontY - 3, 8, 6);
        // Pump rod
        ctx.strokeStyle = '#8a8070';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(frontX, frontY + 3);
        ctx.lineTo(frontX, y + h - 7);
        ctx.stroke();
        // Counterweight
        ctx.fillStyle = '#2a2820';
        ctx.beginPath();
        ctx.arc(backX, backY, 5, 0, Math.PI * 2);
        ctx.fill();
        // Oil drip when active
        if (building.isActive) {
          const dripY = y + h - 7 + ((this.frameCount * 0.5) % 10);
          ctx.fillStyle = 'rgba(15,10,5,0.7)';
          ctx.beginPath();
          ctx.arc(frontX, dripY, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'steam_engine': {
        const seSpeed = building.isActive ? 0.09 : 0.006;
        const crankAngle = this.frameCount * seSpeed;
        const swCx = x + w * 0.72;
        const swCy = y + h * 0.5;
        const wheelR = Math.min(w, h) * 0.28;
        // Engine cylinder block
        ctx.fillStyle = '#101820';
        ctx.fillRect(x + 3, y + 4, w * 0.48, h - 8);
        ctx.fillStyle = '#1a2838';
        ctx.fillRect(x + w * 0.38, y + h * 0.3, w * 0.22, h * 0.4);
        // Flywheel outer ring
        ctx.strokeStyle = '#3a5060';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(swCx, swCy, wheelR, 0, Math.PI * 2);
        ctx.stroke();
        // Spokes
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#2a3a48';
        for (let i = 0; i < 4; i++) {
          const a = crankAngle + i * Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(swCx, swCy);
          ctx.lineTo(swCx + Math.cos(a) * wheelR, swCy + Math.sin(a) * wheelR);
          ctx.stroke();
        }
        // Crank pin
        const crankPinX = swCx + Math.cos(crankAngle) * wheelR * 0.65;
        const crankPinY = swCy + Math.sin(crankAngle) * wheelR * 0.65;
        // Connecting rod to piston
        ctx.strokeStyle = '#6a8090';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(crankPinX, crankPinY);
        ctx.lineTo(x + w * 0.42, swCy);
        ctx.stroke();
        ctx.lineCap = 'butt';
        // Flywheel hub
        ctx.fillStyle = '#4a6070';
        ctx.beginPath();
        ctx.arc(swCx, swCy, 4, 0, Math.PI * 2);
        ctx.fill();
        // Steam vent (top)
        if (building.isActive) {
          const steamY = y + 2 - ((this.frameCount * 0.4) % 14);
          ctx.fillStyle = `rgba(180,180,180,${Math.max(0, 0.4 - ((this.frameCount * 0.4) % 14) * 0.03)})`;
          ctx.beginPath();
          ctx.arc(x + w * 0.25, steamY, 3 + ((this.frameCount * 0.4) % 14) * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (!building.isActive && Math.floor(this.frameCount / 25) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,60,60,0.95)';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('NO STEAM', x + w / 2, y - 2);
          ctx.textAlign = 'left';
        }
        break;
      }
      case 'wall': {
        // Brick pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        for (let row = 0; row < 3; row++) {
          const ry = y + 4 + row * 9;
          ctx.beginPath();
          ctx.moveTo(x + 2, ry);
          ctx.lineTo(x + TILE_SIZE - 2, ry);
          ctx.stroke();
          const offset = row % 2 === 0 ? TILE_SIZE / 2 : 0;
          ctx.beginPath();
          ctx.moveTo(x + offset, ry);
          ctx.lineTo(x + offset, ry + 9);
          ctx.stroke();
        }
        break;
      }
      case 'inserter': {
        // Mechanical arm — base plate, rotating arm, claw
        const dir = DIR_OFFSETS[building.direction] || DIR_OFFSETS.right;
        const cx2 = x + TILE_SIZE / 2;
        const cy2 = y + TILE_SIZE / 2;

        // Arm swing animation
        const swingMax = 0.65;
        const swingSpeed = building.isActive ? 0.08 : 0.015;
        const swing = Math.sin(this.frameCount * swingSpeed) * swingMax;

        // Base plate
        ctx.fillStyle = '#3a3a30';
        ctx.beginPath();
        ctx.arc(cx2, cy2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a5a48';
        ctx.beginPath();
        ctx.arc(cx2, cy2, 3, 0, Math.PI * 2);
        ctx.fill();

        // Arm direction angle
        const baseAngle = Math.atan2(dir.dy, dir.dx) - Math.PI / 2; // -90 rotated to point in dir
        const armAngle = baseAngle + swing;

        // Upper arm
        const armLength = 9;
        const elbowX = cx2 + Math.cos(armAngle) * armLength;
        const elbowY = cy2 + Math.sin(armAngle) * armLength;
        ctx.strokeStyle = '#6a6a58';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx2, cy2);
        ctx.lineTo(elbowX, elbowY);
        ctx.stroke();

        // Forearm (slightly offset angle)
        const foreAngle = armAngle + 0.3;
        const clawX = elbowX + Math.cos(foreAngle) * 6;
        const clawY = elbowY + Math.sin(foreAngle) * 6;
        ctx.strokeStyle = '#8a8a72';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(elbowX, elbowY);
        ctx.lineTo(clawX, clawY);
        ctx.stroke();

        // Claw / grip at tip
        ctx.fillStyle = building.isActive ? '#ffcc44' : '#888870';
        ctx.beginPath();
        ctx.arc(clawX, clawY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Show carried item on claw when active
        if (building.isActive && building.inventory.length > 0) {
          const item = building.inventory[0];
          if (item) {
            const itemColor = RESOURCE_COLORS[item.itemId] || '#aaa888';
            ctx.fillStyle = itemColor;
            ctx.beginPath();
            ctx.arc(clawX, clawY - 3, 2.5, 0, Math.PI * 2);
            ctx.fill();
            // Item highlight
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(clawX - 0.5, clawY - 3.5, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.lineCap = 'butt';
        break;
      }
      case 'laser_turret': {
        if (building.isActive) {
          // Pulsing lens glow
          const pulse = Math.sin(this.frameCount * 0.1) * 0.3 + 0.7;
          ctx.fillStyle = `rgba(0,255,255,${pulse * 0.4})`;
          ctx.beginPath();
          ctx.arc(x + w / 2, 4, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'tesla_coil': {
        if (building.isActive) {
          // Electrical arcs
          const arcCount = 3;
          for (let i = 0; i < arcCount; i++) {
            if (Math.random() < 0.4) {
              const angle = Math.random() * Math.PI * 2;
              const len = 8 + Math.random() * 12;
              ctx.strokeStyle = `rgba(180,130,255,${0.5 + Math.random() * 0.5})`;
              ctx.lineWidth = 1 + Math.random();
              ctx.beginPath();
              ctx.moveTo(x + w / 2, y + 4);
              const segments = 4;
              let px = x + w / 2;
              let py = y + 4;
              for (let s = 0; s < segments; s++) {
                px += Math.cos(angle) * (len / segments) + (Math.random() - 0.5) * 6;
                py += Math.sin(angle) * (len / segments) + (Math.random() - 0.5) * 6;
                ctx.lineTo(px, py);
              }
              ctx.stroke();
            }
          }
        }
        break;
      }
      case 'flak_cannon': {
        // Muzzle flash when shooting
        if (building.isActive && this.frameCount % 12 < 2) {
          ctx.fillStyle = 'rgba(255,200,50,0.8)';
          ctx.beginPath();
          ctx.arc(x + w / 2, y + 2, 4 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'solar_panel': {
        // Subtle glint
        if (this.frameCount % 60 < 3) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(x + 5, y + 7, 3, 2);
        }
        break;
      }
      case 'accumulator': {
        // Charge level glow
        const chargeRatio = building.energy / (building.maxEnergy || 200);
        const glowR = Math.round(255 * (1 - chargeRatio));
        const glowG = Math.round(255 * chargeRatio);
        ctx.fillStyle = `rgba(${glowR},${glowG},50,0.4)`;
        ctx.fillRect(x + 8, y + 10, (w - 16) * chargeRatio, 3);
        break;
      }
      case 'roboport': {
        // Drone orbiting animation
        if (building.isActive) {
          const droneAngle = this.frameCount * 0.05;
          for (let i = 0; i < 2; i++) {
            const a = droneAngle + i * Math.PI;
            const dx = x + w / 2 + Math.cos(a) * 14;
            const dy = y + h / 2 + Math.sin(a) * 14;
            ctx.fillStyle = '#66ccee';
            ctx.beginPath();
            ctx.arc(dx, dy, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'centrifuge': {
        // Spinning animation
        const spinAngle = building.isActive ? this.frameCount * 0.15 : 0;
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(spinAngle);
        ctx.strokeStyle = '#66aa66';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'artillery': {
        // Barrel recoil
        if (building.isActive && this.frameCount % 30 < 3) {
          const recoil = Math.sin(this.frameCount * 0.5) * 3;
          ctx.strokeStyle = '#5a5a48';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x + w / 2, y + h / 2 - 2);
          ctx.lineTo(x + w + 4 + recoil, y + h / 2 - 6);
          ctx.stroke();
          ctx.lineCap = 'butt';
        }
        break;
      }
      case 'mine': {
        // Red warning blink when enemy nearby
        if (building.isActive) {
          const blink = Math.floor(this.frameCount / 8) % 2;
          if (blink) {
            ctx.fillStyle = 'rgba(255,0,0,0.6)';
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2 + 2, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
    }
  }

  private renderConveyors(ctx: CanvasRenderingContext2D, state: GameState, vl: number, vt: number, vr: number, vb: number) {
    // Pre-set rail gradient colors — reuse across all conveyors
    const railHGrad = ctx.createLinearGradient(0, 0, 0, 4);
    railHGrad.addColorStop(0, '#5a5648');
    railHGrad.addColorStop(1, '#3a3830');
    const railVGrad = ctx.createLinearGradient(0, 0, 4, 0);
    railVGrad.addColorStop(0, '#5a5648');
    railVGrad.addColorStop(1, '#3a3830');

    for (const [key, segments] of state.conveyors) {
      const commaIdx = key.indexOf(',');
      const sx = parseInt(key.substring(0, commaIdx)) * TILE_SIZE;
      const sy = parseInt(key.substring(commaIdx + 1)) * TILE_SIZE;
      if (sx < vl - TILE_SIZE || sx > vr + TILE_SIZE || sy < vt - TILE_SIZE || sy > vb + TILE_SIZE) continue;

      const building = state.buildings.get(key);
      if (!building) continue;
      const dir = DIR_OFFSETS[building.direction];
      const dx = dir ? dir.dx : 1;
      const dy = dir ? dir.dy : 0;
      const isVertical = dy !== 0;

      // ── Belt rubber surface ──
      ctx.fillStyle = '#211f1a';
      ctx.beginPath();
      ctx.roundRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4, 1.5);
      ctx.fill();

      // ── Center track strip (slightly lighter rubber) ──
      ctx.fillStyle = '#2c2924';
      if (isVertical) {
        ctx.fillRect(sx + 6, sy + 2, TILE_SIZE - 12, TILE_SIZE - 4);
      } else {
        ctx.fillRect(sx + 2, sy + 6, TILE_SIZE - 4, TILE_SIZE - 12);
      }

      // ── Metal side rails ──
      ctx.fillStyle = isVertical ? railVGrad : railHGrad;
      if (isVertical) {
        ctx.fillRect(sx + 2, sy + 2, 4, TILE_SIZE - 4);
        ctx.fillRect(sx + TILE_SIZE - 6, sy + 2, 4, TILE_SIZE - 4);
      } else {
        ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, 4);
        ctx.fillRect(sx + 2, sy + TILE_SIZE - 6, TILE_SIZE - 4, 4);
      }
      // Rail highlight edge
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      if (isVertical) {
        ctx.fillRect(sx + 2, sy + 2, 1, TILE_SIZE - 4);
        ctx.fillRect(sx + TILE_SIZE - 6, sy + 2, 1, TILE_SIZE - 4);
      } else {
        ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, 1);
        ctx.fillRect(sx + 2, sy + TILE_SIZE - 6, TILE_SIZE - 4, 1);
      }
      // Rail shadow edge
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      if (isVertical) {
        ctx.fillRect(sx + 5, sy + 2, 1, TILE_SIZE - 4);
        ctx.fillRect(sx + TILE_SIZE - 7, sy + 2, 1, TILE_SIZE - 4);
      } else {
        ctx.fillRect(sx + 2, sy + 5, TILE_SIZE - 4, 1);
        ctx.fillRect(sx + 2, sy + TILE_SIZE - 7, TILE_SIZE - 4, 1);
      }

      // ── Animated belt cleats (perpendicular ridges) — batched into single path ──
      const speed = 1.8;
      const cleatSpacing = TILE_SIZE / 3;
      const animOff = ((this.frameCount * speed) % cleatSpacing + cleatSpacing) % cleatSpacing;
      ctx.strokeStyle = 'rgba(50,46,38,0.75)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = -1; i <= 3; i++) {
        if (isVertical) {
          const cy = sy + ((i * cleatSpacing + animOff * (dy > 0 ? 1 : -1) + TILE_SIZE * 2) % TILE_SIZE + TILE_SIZE) % TILE_SIZE;
          if (cy < sy + 2 || cy > sy + TILE_SIZE - 2) continue;
          ctx.moveTo(sx + 6, cy);
          ctx.lineTo(sx + TILE_SIZE - 6, cy);
        } else {
          const cx2 = sx + ((i * cleatSpacing + animOff * (dx > 0 ? 1 : -1) + TILE_SIZE * 2) % TILE_SIZE + TILE_SIZE) % TILE_SIZE;
          if (cx2 < sx + 2 || cx2 > sx + TILE_SIZE - 2) continue;
          ctx.moveTo(cx2, sy + 6);
          ctx.lineTo(cx2, sy + TILE_SIZE - 6);
        }
      }
      ctx.stroke();
      ctx.lineCap = 'butt';

      // ── Direction arrow painted on belt ──
      const acx = sx + TILE_SIZE / 2;
      const acy = sy + TILE_SIZE / 2;
      ctx.save();
      ctx.translate(acx, acy);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = 'rgba(255,215,80,0.28)';
      ctx.beginPath();
      ctx.moveTo(-5, -3.5);
      ctx.lineTo(4, 0);
      ctx.lineTo(-5, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // ── Items on belt (3D box style) ──
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        if (!seg.itemId) continue;
        const progress = seg.progress;
        const ix = sx + TILE_SIZE / 2 + dx * (progress - 0.5) * TILE_SIZE;
        const iy = sy + TILE_SIZE / 2 + dy * (progress - 0.5) * TILE_SIZE;
        const itemColor = RESOURCE_COLORS[seg.itemId] || '#aaa888';

        // Parse color components once
        const rI = parseInt(itemColor.slice(1, 3), 16);
        const gI = parseInt(itemColor.slice(3, 5), 16);
        const bI = parseInt(itemColor.slice(5, 7), 16);

        // Ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(ix + 1.5, iy + 3, 5.5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Box top face (lighter)
        const rTop = Math.min(255, rI + 35);
        const gTop = Math.min(255, gI + 35);
        const bTop = Math.min(255, bI + 35);
        ctx.fillStyle = `rgb(${rTop},${gTop},${bTop})`;
        ctx.fillRect(ix - 4.5, iy - 6, 9, 7);

        // Box front face (darker, slight 3D illusion)
        const rBot = Math.max(0, rI - 35);
        const gBot = Math.max(0, gI - 35);
        const bBot = Math.max(0, bI - 35);
        ctx.fillStyle = `rgb(${rBot},${gBot},${bBot})`;
        ctx.fillRect(ix - 4.5, iy + 1, 9, 2.5);

        // Box right face (mid tone)
        const rMid = Math.max(0, rI - 15);
        const gMid = Math.max(0, gI - 15);
        const bMid = Math.max(0, bI - 15);
        ctx.fillStyle = `rgb(${rMid},${gMid},${bMid})`;
        ctx.fillRect(ix + 4.5, iy - 4, 2, 5);

        // Top highlight + item border — reuse dark color
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(ix - 3.5, iy - 5, 4, 1.5);

        ctx.strokeStyle = `rgba(${Math.max(0, rI - 50)},${Math.max(0, gI - 50)},${Math.max(0, bI - 50)},0.7)`;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(ix - 4.5, iy - 6, 9, 7);
      }
    }
  }

  private renderEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, _state: GameState) {
    const x = enemy.x * TILE_SIZE;
    const y = enemy.y * TILE_SIZE;
    const size = enemy.type === 'behemoth' ? 14 : enemy.type === 'worm' ? 12 : 8;

    // Track hit flash
    const flashFrames = this.enemyHitFlash.get(enemy.id) || 0;
    if (flashFrames > 0) this.enemyHitFlash.set(enemy.id, flashFrames - 1);
    const isFlashing = flashFrames > 0;

    // Detect damage taken this frame
    const prevHp = this.prevEnemyHealth.get(enemy.id);
    if (prevHp !== undefined && enemy.health < prevHp) {
      const dmg = Math.ceil(prevHp - enemy.health);
      this.enemyHitFlash.set(enemy.id, 6);
      this.damageNumbers.push({ x, y: y - size - 5, value: dmg, life: 40, color: '#ff4444' });
      // Spawn hit particles
      this.particleEffects.spawnSparks(x + TILE_SIZE / 2, y + TILE_SIZE / 2, Math.min(8, dmg));
      // Small screen shake for hits
      this.screenEffects.triggerShake(2, 4);
      if (enemy.health <= 0) {
        this.particleEffects.spawnExplosion(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 4);
        // Screen effects for big kills
        const explosionSize = enemy.type === 'leviathan' ? 12 : enemy.type === 'behemoth' ? 8 : 4;
        this.screenEffects.triggerShake(explosionSize, 8 + explosionSize);
        this.screenEffects.triggerShockwave(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 30 + explosionSize * 3);
        if (enemy.type === 'leviathan' || enemy.type === 'behemoth') {
          this.screenEffects.triggerFlash('255,150,50', 0.15);
        }
      }
    }
    this.prevEnemyHealth.set(enemy.id, enemy.health);

    // Draw pre-generated enemy sprite
    const sprite = getEnemySprite(enemy.type);
    if (sprite) {
      // Scale based on type
      const scale = enemy.type === 'behemoth' ? 1.5 : enemy.type === 'worm' ? 1.3 : 1.0;
      const sw = TILE_SIZE * scale;
      const sh = TILE_SIZE * scale;
      ctx.drawImage(sprite, x - (sw - TILE_SIZE) / 2, y - (sh - TILE_SIZE) / 2, sw, sh);
    }

    // Animated overlays for worm (tentacles)
    if (enemy.type === 'worm') {
      const darkColor = GameRenderer._getEnemyDarkColor('worm', enemy.evolution);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + this.frameCount * 0.015;
        const len = size * 1.2 + Math.sin(this.frameCount * 0.05 + i) * 3;
        ctx.strokeStyle = darkColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        const midX = x + Math.cos(a) * len * 0.5;
        const midY = y + Math.sin(a) * len * 0.5;
        const endX = x + Math.cos(a + 0.3) * len;
        const endY = y + Math.sin(a + 0.3) * len;
        ctx.quadraticCurveTo(midX, midY, endX, endY);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }

    // Animated biter/behemoth legs
    if (enemy.type === 'biter' || enemy.type === 'behemoth') {
      const darkColor = GameRenderer._getEnemyDarkColor(enemy.type, enemy.evolution);
      const legAnim = Math.sin(this.frameCount * 0.12 + enemy.id.charCodeAt(0)) * 3;
      ctx.strokeStyle = darkColor;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i += 2) {
        const legOffset = i * legAnim * 0.3;
        ctx.beginPath();
        ctx.moveTo(x + i * size * 0.5, y + size * 0.2);
        ctx.lineTo(x + i * size * 0.9 + legOffset, y + size + 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + i * size * 0.3, y + size * 0.3);
        ctx.lineTo(x + i * size * 0.7 - legOffset, y + size + 1);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';

      // Mandibles animation
      ctx.strokeStyle = '#ff3300';
      ctx.lineWidth = 2;
      const mandibleOpen = enemy.state === 'attacking' ? 4 : 1;
      ctx.beginPath();
      ctx.moveTo(x - 3, y + size * 0.3);
      ctx.lineTo(x - 5, y + size * 0.3 + mandibleOpen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 3, y + size * 0.3);
      ctx.lineTo(x + 5, y + size * 0.3 + mandibleOpen);
      ctx.stroke();
    }

    // Health bar — fillRect (no roundRect overhead)
    if (enemy.health < enemy.maxHealth) {
      const hp = enemy.health / enemy.maxHealth;
      const barW = size * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - barW / 2, y - size - 10, barW, 5);
      ctx.fillStyle = hp > 0.5 ? '#22c55e' : hp > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(x - barW / 2 + 0.5, y - size - 9.5, (barW - 1) * hp, 4);
    }

    // Attack flash — type-specific effects
    if (enemy.state === 'attacking') {
      const attackPulse = Math.sin(this.frameCount * 0.15) * 0.15 + 0.2;
      switch (enemy.type) {
        case 'spitter': {
          // Acid spit projectile
          const spitProgress = (this.frameCount % 12) / 12;
          const spitX = x + Math.cos(this.frameCount * 0.1) * (size + 4) * spitProgress;
          const spitY = y + Math.sin(this.frameCount * 0.1) * (size + 4) * spitProgress;
          ctx.fillStyle = `rgba(120,255,50,${0.8 - spitProgress * 0.6})`;
          ctx.beginPath();
          ctx.arc(spitX, spitY, 3 - spitProgress * 2, 0, Math.PI * 2);
          ctx.fill();
          // Acid splash
          ctx.fillStyle = 'rgba(120,255,50,0.15)';
          ctx.beginPath();
          ctx.arc(x, y, size + 4, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'worm': {
          // Acid spray in cone
          const sprayAngle = Math.atan2(_state.player.y - enemy.y, _state.player.x - enemy.x);
          ctx.fillStyle = `rgba(120,255,50,${attackPulse})`;
          for (let i = 0; i < 5; i++) {
            const a = sprayAngle + (Math.random() - 0.5) * 0.8;
            const d = size + Math.random() * 10;
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'behemoth': {
          // Ground pound shockwave
          const shockR = size + 8 + Math.sin(this.frameCount * 0.1) * 4;
          ctx.strokeStyle = `rgba(255,100,0,${attackPulse * 0.4})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, shockR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,80,0,${attackPulse * 0.15})`;
          ctx.beginPath();
          ctx.arc(x, y, shockR, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'destroyer': {
          // Laser beam from above
          const laserAlpha = Math.sin(this.frameCount * 0.2) * 0.3 + 0.4;
          ctx.strokeStyle = `rgba(255,50,0,${laserAlpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y - 10);
          ctx.lineTo(x, y + 10);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,80,0,${laserAlpha * 0.3})`;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'leviathan': {
          // Massive ground slam — radial cracks
          const slamR = size + 12;
          ctx.strokeStyle = `rgba(200,50,200,${attackPulse * 0.5})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, slamR, 0, Math.PI * 2);
          ctx.stroke();
          // Crack lines
          for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            ctx.strokeStyle = `rgba(150,30,150,${attackPulse * 0.3})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
            ctx.lineTo(x + Math.cos(a) * slamR, y + Math.sin(a) * slamR);
            ctx.stroke();
          }
          break;
        }
        case 'drone': {
          // Quick zip attack trail
          ctx.fillStyle = `rgba(255,255,0,${attackPulse * 0.4})`;
          ctx.beginPath();
          ctx.arc(x, y, size + 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        default: {
          // Basic bite flash
          ctx.fillStyle = `rgba(255,50,0,${attackPulse})`;
          ctx.beginPath();
          ctx.arc(x, y, size + 6, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }

    // Enemy type-specific shadow
    if (enemy.type === 'destroyer' || enemy.type === 'drone') {
      // Flying enemies cast shadow below
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(x, y + 8, size * 0.8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // White hit flash
    if (isFlashing) {
      ctx.fillStyle = `rgba(255,255,255,${(flashFrames / 6) * 0.65})`;
      ctx.beginPath();
      ctx.ellipse(x, y, size + 2, size * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderNPC(ctx: CanvasRenderingContext2D, npc: NPC, state: GameState) {
    const x = npc.x * TILE_SIZE;
    const y = npc.y * TILE_SIZE;
    const bob = Math.sin(this.frameCount * 0.07 + npc.id.charCodeAt(0)) * 1;

    // Accent color for UI elements — static lookup, NO object allocation
    const accent = GameRenderer._NPC_ACCENTS[npc.type] || '#c87020';

    // Draw pre-generated NPC sprite
    const sprite = getNPCSprite(npc.type);
    if (sprite) {
      ctx.drawImage(sprite, x + bob * 0.3, y + bob, TILE_SIZE, TILE_SIZE);
    }

    // Name tag — simple fillRect background instead of roundRect
    if (state.camera.zoom > 1) {
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const nameWidth = ctx.measureText(npc.name).width + 6;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(x - nameWidth / 2, y - 24 + bob, nameWidth, 10);
      ctx.fillStyle = accent;
      ctx.fillText(npc.name, x, y - 17 + bob);
      ctx.textAlign = 'left';
    }

    // HP bar if damaged — fillRect
    if (npc.health < npc.maxHealth) {
      const hp = npc.health / npc.maxHealth;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 12, y - 28 + bob, 24, 3.5);
      ctx.fillStyle = hp > 0.5 ? '#22c55e' : '#ef4444';
      ctx.fillRect(x - 11.5, y - 27.5 + bob, 23 * hp, 2.5);
    }

    // Show carried item
    if (npc.inventory && npc.inventory.length > 0) {
      const item = npc.inventory[0];
      const itemIcon = getItemIcon(item.itemId);
      if (itemIcon) {
        ctx.drawImage(itemIcon, x + 5, y - 8 + bob, 8, 8);
      }
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D, state: GameState) {
    const { player } = state;
    const x = player.x * TILE_SIZE;
    const y = player.y * TILE_SIZE;

    // Walking animation
    const isMoving = state.player.isMoving || (
      Math.abs(state.player.x - (state.player as any).prevX) > 0.01 ||
      Math.abs(state.player.y - (state.player as any).prevY) > 0.01
    );
    const walkCycle = isMoving ? Math.sin(this.frameCount * 0.2) : 0;
    const bob = isMoving ? Math.abs(Math.sin(this.frameCount * 0.2)) * 1.8 : 0;
    const lean = isMoving ? Math.sin(this.frameCount * 0.2) * 0.03 : 0;

    // Player ambient glow — brighter when moving
    const glowR = isMoving ? 26 : 22;
    const glowAlpha = isMoving ? 0.28 : 0.22;
    const playerGlow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    playerGlow.addColorStop(0, `rgba(255,210,100,${glowAlpha})`);
    playerGlow.addColorStop(0.5, `rgba(255,200,80,${glowAlpha * 0.45})`);
    playerGlow.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = playerGlow;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Draw pre-generated player sprite with lean
    const skinColor = player.cosmetics?.skinColor || '#e0b890';
    const sprite = getPlayerSprite(skinColor);
    if (sprite) {
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.rotate(lean);
      ctx.drawImage(sprite, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      ctx.restore();
    }

    // Walking legs — small dark marks at bottom
    if (isMoving) {
      ctx.fillStyle = '#2a2a28';
      const legOffset = Math.sin(this.frameCount * 0.25) * 3;
      ctx.fillRect(x - 3 + legOffset, y + 6 + bob, 2.5, 4);
      ctx.fillRect(x + 1 - legOffset, y + 6 + bob, 2.5, 4);
    }

    // Arm + tool (direction-aware, animated swing)
    const dir = DIR_OFFSETS[player.direction];
    if (dir) {
      const armAngle = Math.atan2(dir.dy, dir.dx);
      const armSwing = isMoving ? Math.sin(this.frameCount * 0.25) * 0.3 : 0;

      ctx.save();
      ctx.translate(x + dir.dx * 10, y - 2 + dir.dy * 10 + bob);
      ctx.rotate(armAngle + armSwing);

      // Upper arm
      ctx.fillStyle = '#3a3c38';
      ctx.fillRect(-8, -2, 8, 3);

      // Tool head — dynamic based on nearby building
      const toolX = 1;
      const toolY = -3.5;

      // Check if near a building to show mining effect — early exit, max 20 checks
      let isNearBuilding = false;
      let checkCount = 0;
      for (const [, b] of state.buildings) {
        const bdx = b.x - player.x;
        const bdy = b.y - player.y;
        if (Math.abs(bdx) < 2 && Math.abs(bdy) < 2) {
          isNearBuilding = true;
          break;
        }
        if (++checkCount >= 20) break; // Stop checking after 20 buildings (most are far away)
      }

      if (isNearBuilding && isMoving) {
        // Mining laser effect
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(toolX, toolY);
        ctx.lineTo(toolX + 12, toolY);
        ctx.stroke();
        // Glow at tip
        ctx.fillStyle = 'rgba(255,150,50,0.5)';
        ctx.beginPath();
        ctx.arc(toolX + 12, toolY, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Normal tool
        ctx.fillStyle = '#999';
        ctx.fillRect(toolX, toolY, 6, 5);
        ctx.fillStyle = '#c89040';
        ctx.fillRect(toolX, toolY + 1.5, 6, 2);
      }

      ctx.restore();
    }

    // Health bar — fillRect
    const hp = player.health / player.maxHealth;
    const barW = 28;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - barW / 2, y - 23 + bob, barW, 4);
    const hpColor = hp > 0.5 ? '#22c55e' : hp > 0.25 ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = hpColor;
    ctx.fillRect(x - barW / 2 + 0.5, y - 22.5 + bob, (barW - 1) * hp, 3);

    // Reach circle
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(x, y, player.reach * TILE_SIZE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderGhostBuilding(ctx: CanvasRenderingContext2D, state: GameState) {
    if (!this.ghostBuilding || !this.ghostTile) return;
    const { x, y } = this.ghostTile;
    const bsize = BUILDING_SIZES[this.ghostBuilding] || { w: 1, h: 1 };
    const sx = x * TILE_SIZE;
    const sy = y * TILE_SIZE;
    const sw = bsize.w * TILE_SIZE;
    const sh = bsize.h * TILE_SIZE;

    // Check if placement is valid (no building in the way)
    let canPlace = true;
    for (let dy = 0; dy < bsize.h && canPlace; dy++) {
      for (let dx = 0; dx < bsize.w && canPlace; dx++) {
        const tile = state.chunks.size > 0 ? (() => {
          const tx = x + dx, ty = y + dy;
          const cx = Math.floor(tx / 32), cy2 = Math.floor(ty / 32);
          const chunk = state.chunks.get(`${cx},${cy2}`);
          if (!chunk) return null;
          const lx = ((tx % 32) + 32) % 32, ly = ((ty % 32) + 32) % 32;
          return chunk[ly][lx];
        })() : null;
        if (tile?.building) canPlace = false;
      }
    }
    canPlace = canPlace && this.ghostCanAfford;

    // Pulsing animation
    const pulse = Math.sin(this.frameCount * 0.08) * 0.08 + 0.52;

    ctx.save();
    ctx.globalAlpha = pulse;
    if (canPlace) {
      // Valid placement: blue-green tint with glow
      ctx.fillStyle = 'rgba(80,220,130,0.35)';
      // Pulsing glow
      const glow = ctx.createRadialGradient(sx + sw / 2, sy + sh / 2, 0, sx + sw / 2, sy + sh / 2, Math.max(sw, sh) * 0.8);
      glow.addColorStop(0, 'rgba(80,220,130,0.15)');
      glow.addColorStop(1, 'rgba(80,220,130,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 10, sy - 10, sw + 20, sh + 20);
      ctx.fillStyle = 'rgba(80,220,130,0.35)';
    } else {
      // Invalid: red tint
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
    }
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, 2);
    ctx.fill();

    // Show building sprite preview at low opacity
    const ghostSprite = getBuildingSprite(this.ghostBuilding);
    if (ghostSprite) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(ghostSprite, sx, sy, sw, sh);
      ctx.globalAlpha = pulse;
    }

    // Outline — fillRect + strokeRect (no roundRect)
    ctx.strokeStyle = canPlace ? 'rgba(80,220,130,0.85)' : 'rgba(255,80,80,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(sx + 0.75, sy + 0.75, sw - 1.5, sh - 1.5);
    ctx.setLineDash([]);

    // Show direction arrow
    const dir = DIR_OFFSETS[this.ghostDirection as Direction];
    if (dir) {
      const acx = sx + sw / 2;
      const acy = sy + sh / 2;
      ctx.fillStyle = canPlace ? 'rgba(255,255,255,0.7)' : 'rgba(255,150,150,0.7)';
      ctx.save();
      ctx.translate(acx, acy);
      ctx.rotate(Math.atan2(dir.dy, dir.dx));
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.lineTo(6, 0);
      ctx.lineTo(-6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Show building name
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = canPlace ? 'rgba(180,255,200,0.8)' : 'rgba(255,150,150,0.8)';
    ctx.fillText(this.ghostBuilding.replace(/_/g, ' ').toUpperCase(), sx + sw / 2, sy - 8);
    ctx.textAlign = 'left';

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D, state: GameState, vl: number, vt: number, vr: number, vb: number) {
    // Skip particle rendering entirely if too many (performance safety)
    if (state.particles.length > MAX_PARTICLES * 0.8) {
      // Only render every other particle when near limit
      for (let i = 0; i < state.particles.length; i += 2) {
        const p = state.particles[i];
        if (!p || p.x < vl - 20 || p.x > vr + 20 || p.y < vt - 20 || p.y > vb + 20) continue;
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = p.color;
        const r = p.size * (1 + (1 - alpha) * 3);
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      return;
    }

    for (const p of state.particles) {
      if (p.x < vl - 20 || p.x > vr + 20 || p.y < vt - 20 || p.y > vb + 20) continue;

      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      switch (p.type) {
        case 'smoke': {
          // Approximate 3-circle smoke with single fillRect (5x faster than arc)
          const radius = p.size * (1 + (1 - alpha) * 3);
          const swirl = this.frameCount * 0.012 + p.x * 0.01;
          ctx.globalAlpha = alpha * 0.35;
          ctx.fillRect(p.x + Math.cos(swirl) * radius * 0.25 - radius, p.y + Math.sin(swirl) * radius * 0.15 - radius, radius * 2, radius * 2);
          ctx.globalAlpha = alpha * 0.45;
          ctx.fillRect(p.x - Math.sin(swirl * 1.3) * radius * 0.2 - radius * 0.8, p.y - radius * 0.1 - radius * 0.8, radius * 1.6, radius * 1.6);
          ctx.globalAlpha = alpha * 0.3;
          ctx.fillRect(p.x + Math.cos(swirl * 0.7 + 1) * radius * 0.3 - radius * 0.6, p.y + Math.sin(swirl * 0.7 + 1) * radius * 0.2 - radius * 0.6, radius * 1.2, radius * 1.2);
          break;
        }
        case 'spark': {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#fff';
          ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
          break;
        }
        case 'fire': {
          const radius = p.size * alpha;
          ctx.globalAlpha = alpha * 0.8;
          ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
          ctx.fillStyle = '#ff8';
          ctx.globalAlpha = alpha * 0.5;
          ctx.fillRect(p.x - radius * 0.4, p.y - radius * 0.4, radius * 0.8, radius * 0.8);
          break;
        }
        case 'explosion': {
          const radius = p.size * (1 + (1 - alpha) * 4);
          ctx.globalAlpha = alpha * 0.7;
          ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
          break;
        }
        case 'resource': {
          ctx.globalAlpha = alpha;
          ctx.fillRect(p.x - p.size * 0.85, p.y - p.size * 0.85, p.size * 1.7, p.size * 1.7);
          break;
        }
        case 'ambient': {
          ctx.globalAlpha = alpha * 0.3;
          ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Pre-computed lit types as Set for O(1) lookup
  private static readonly LIT_TYPES = new Set([
    'furnace', 'boiler', 'lab', 'radar', 'steam_engine', 'assembler',
    'refinery', 'chemical_plant', 'tesla_coil', 'laser_turret', 'roboport', 'centrifuge'
  ]);
  // Pre-computed light config: [radius, r, g, b, alpha]
  private static readonly LIGHT_CFG: Record<string, [number, number, number, number, number]> = {
    furnace: [100, 0, 0, 0, 0.75],
    steam_engine: [90, 0, 0, 0, 0.55],
    tesla_coil: [80, 80, 40, 160, 0.55],
    laser_turret: [65, 0, 80, 120, 0.55],
    centrifuge: [65, 20, 80, 20, 0.55],
    roboport: [65, 20, 60, 80, 0.55],
    lab: [65, 0, 0, 0, 0.6],
  };
  private static readonly DEFAULT_LIGHT: [number, number, number, number, number] = [65, 0, 0, 0, 0.55];
  private static readonly _NPC_ACCENTS: Record<string, string> = {
    worker: '#c87020', scout: '#20a840', trader: '#d4a017', guard: '#cc2020', settler: '#7a60cc',
  };

  private renderNightLighting(state: GameState, dayFactor: number) {
    const { canvas, lightCanvas, lightCtx } = this;
    lightCanvas.width = canvas.width;
    lightCanvas.height = canvas.height;

    // Dark overlay — warm dark (not cold blue)
    const darkness = (1 - dayFactor) * 0.72;
    lightCtx.fillStyle = `rgba(8,5,2,${darkness})`;
    lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);

    // Cut out light sources
    lightCtx.globalCompositeOperation = 'destination-out';

    // Player torch light (warm, personal radius)
    const px = canvas.width / 2;
    const py = canvas.height / 2;
    const playerLight = lightCtx.createRadialGradient(px, py, 0, px, py, 130 * state.camera.zoom);
    playerLight.addColorStop(0, 'rgba(0,0,0,0.95)');
    playerLight.addColorStop(0.4, 'rgba(0,0,0,0.7)');
    playerLight.addColorStop(0.8, 'rgba(0,0,0,0.2)');
    playerLight.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = playerLight;
    lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);

    // Building lights — single gradient per visible active building
    const zoom = state.camera.zoom;
    const hw = canvas.width / 2;
    const hh = canvas.height / 2;
    const camX = state.camera.x;
    const camY = state.camera.y;
    for (const [, building] of state.buildings) {
      if (!GameRenderer.LIT_TYPES.has(building.type)) continue;
      if (!building.isActive) continue;
      const bx = (building.x * TILE_SIZE - camX) * zoom + hw;
      const bob = (building.y * TILE_SIZE - camY) * zoom + hh;
      if (bx < -150 || bx > canvas.width + 150 || bob < -150 || bob > canvas.height + 150) continue;
      const cfg = GameRenderer.LIGHT_CFG[building.type] || GameRenderer.DEFAULT_LIGHT;
      const radius = cfg[0] * zoom;
      const light = lightCtx.createRadialGradient(bx, bob, 0, bx, bob, radius);
      const alphaStr = cfg[5].toString();
      const alphaHalf = (cfg[5] * 0.4).toFixed(2);
      light.addColorStop(0, `rgba(${cfg[1]},${cfg[2]},${cfg[3]},${alphaStr})`);
      light.addColorStop(0.5, `rgba(${cfg[1]},${cfg[2]},${cfg[3]},${alphaHalf})`);
      light.addColorStop(1, `rgba(${cfg[1]},${cfg[2]},${cfg[3]},0)`);
      lightCtx.fillStyle = light;
      lightCtx.fillRect(bx - radius, bob - radius, radius * 2, radius * 2);
    }

    lightCtx.globalCompositeOperation = 'source-over';

    // Amber tint for illuminated areas
    lightCtx.globalCompositeOperation = 'source-atop';
    lightCtx.fillStyle = 'rgba(255,140,30,0.07)';
    lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
    lightCtx.globalCompositeOperation = 'source-over';

    this.ctx.drawImage(lightCanvas, 0, 0);
  }

  private renderWeather(ctx: CanvasRenderingContext2D, state: GameState) {
    if (state.weather === 'rain' || state.weather === 'storm') {
      const intensity = state.weather === 'storm' ? 0.25 : 0.12;
      ctx.fillStyle = `rgba(80,120,180,${intensity})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Rain drops — batched into single path (ONE stroke call for all drops)
      const dropCount = state.weather === 'storm' ? 150 : 60;
      ctx.strokeStyle = 'rgba(180,210,255,0.25)';
      ctx.lineWidth = 1;
      const windOffset = state.weather === 'storm' ? 4 : 1;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      ctx.beginPath();
      for (let i = 0; i < dropCount; i++) {
        const rx = (this.frameCount * 7.3 + i * 137.7) % cw;
        const ry = (this.frameCount * 13.1 + i * 251.3) % ch;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - windOffset, ry + 12);
      }
      ctx.stroke();

      // Lightning flash for storms
      if (state.weather === 'storm' && this.frameCount % 300 < 3) {
        ctx.fillStyle = 'rgba(200,220,255,0.15)';
        ctx.fillRect(0, 0, cw, ch);
      }
    } else if (state.weather === 'fog') {
      const w = this.canvas.width, h = this.canvas.height;
      const fogGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.7);
      fogGrad.addColorStop(0, 'rgba(180,195,210,0)');
      fogGrad.addColorStop(0.5, 'rgba(180,195,210,0.08)');
      fogGrad.addColorStop(1, 'rgba(180,195,210,0.22)');
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, 0, w, h);
      const t = this.frameCount * 0.002;
      for (let i = 0; i < 3; i++) {
        const wispX = ((t * 40 + i * (w / 3)) % (w + 200)) - 100;
        const wispGrad = ctx.createLinearGradient(wispX - 150, 0, wispX + 150, 0);
        wispGrad.addColorStop(0, 'rgba(200,210,220,0)');
        wispGrad.addColorStop(0.5, `rgba(200,210,220,${(0.04 + Math.sin(t + i) * 0.01).toFixed(3)})`);
        wispGrad.addColorStop(1, 'rgba(200,210,220,0)');
        ctx.fillStyle = wispGrad;
        ctx.fillRect(wispX - 150, h * 0.2 + i * h * 0.25, 300, h * 0.3);
      }
    }
  }

  // Cached vignette — static, only rebuild on resize
  private _vignetteCanvas: HTMLCanvasElement | null = null;
  private _vignetteW = 0;
  private _vignetteH = 0;

  private renderVignette(ctx: CanvasRenderingContext2D) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    // Rebuild only on resize
    if (!this._vignetteCanvas || this._vignetteW !== w || this._vignetteH !== h) {
      if (!this._vignetteCanvas) {
        this._vignetteCanvas = document.createElement('canvas');
      }
      this._vignetteCanvas.width = w;
      this._vignetteCanvas.height = h;
      const vc = this._vignetteCanvas.getContext('2d')!;
      // Corner-focused vignette
      const grad = vc.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.15)');
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      vc.fillStyle = grad;
      vc.fillRect(0, 0, w, h);
      // Subtle amber pollution haze at bottom
      const hazeGrad = vc.createLinearGradient(0, h * 0.75, 0, h);
      hazeGrad.addColorStop(0, 'rgba(0,0,0,0)');
      hazeGrad.addColorStop(1, 'rgba(30,15,0,0.12)');
      vc.fillStyle = hazeGrad;
      vc.fillRect(0, 0, w, h);
      // Dawn/dusk warm glow on horizon
      const horizonGrad = vc.createLinearGradient(0, 0, 0, h * 0.3);
      horizonGrad.addColorStop(0, 'rgba(255,120,40,0.04)');
      horizonGrad.addColorStop(1, 'rgba(255,120,40,0)');
      vc.fillStyle = horizonGrad;
      vc.fillRect(0, 0, w, h * 0.3);
      this._vignetteW = w;
      this._vignetteH = h;
    }
    ctx.drawImage(this._vignetteCanvas, 0, 0);
  }

  /** Returns 0..1 for dawn/dusk intensity. 0 = noon/midnight, 1 = sunrise/sunset peak. */
  private getDawnDuskFactor(dayPhase: number): number {
    // dayPhase: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    // Dawn: 0.15..0.35, peak at 0.25
    // Dusk: 0.65..0.85, peak at 0.75
    if (dayPhase > 0.15 && dayPhase < 0.35) {
      return 1 - Math.abs(dayPhase - 0.25) / 0.1;
    } else if (dayPhase > 0.65 && dayPhase < 0.85) {
      return 1 - Math.abs(dayPhase - 0.75) / 0.1;
    }
    return 0;
  }
}


