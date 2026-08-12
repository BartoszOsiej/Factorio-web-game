// ══════════════════════════════════════════════════════════════════════
// POLLUTION OVERLAY — visible brown/reddish haze on ground
// based on actual pollution values in tiles
// ══════════════════════════════════════════════════════════════════════

import { CHUNK_SIZE, TILE_SIZE } from '../game/constants';

export class PollutionOverlay {
  private pollCanvas: HTMLCanvasElement | null = null;
  private pollCtx: CanvasRenderingContext2D | null = null;
  private lastUpdate = 0;
  private updateInterval = 30; // frames between updates

  render(
    ctx: CanvasRenderingContext2D,
    state: any,
    cameraX: number, cameraY: number,
    viewWidth: number, viewHeight: number,
    frameCount: number
  ) {
    // Only update every N frames for performance
    if (frameCount - this.lastUpdate < this.updateInterval) {
      if (this.pollCanvas) {
        ctx.globalAlpha = 0.35;
        ctx.drawImage(this.pollCanvas, -cameraX * 0.5, -cameraY * 0.5);
        ctx.globalAlpha = 1;
      }
      return;
    }
    this.lastUpdate = frameCount;

    // Create/reuse offscreen canvas
    if (!this.pollCanvas) {
      this.pollCanvas = document.createElement('canvas');
      this.pollCtx = this.pollCanvas.getContext('2d')!;
    }

    const pc = this.pollCanvas;
    const pctx = this.pollCtx!;
    const scale = 0.5; // Half resolution for performance
    const w = Math.ceil(viewWidth * scale);
    const h = Math.ceil(viewHeight * scale);

    if (pc.width !== w || pc.height !== h) {
      pc.width = w;
      pc.height = h;
    }

    pctx.clearRect(0, 0, w, h);

    // Sample pollution from visible tiles
    const startX = Math.floor(cameraX / TILE_SIZE) - 2;
    const startY = Math.floor(cameraY / TILE_SIZE) - 2;
    const endX = startX + Math.ceil(viewWidth / TILE_SIZE) + 4;
    const endY = startY + Math.ceil(viewHeight / TILE_SIZE) + 4;

    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        // Get pollution from tile data if available
        const chunkKey = `${Math.floor(tx / CHUNK_SIZE)},${Math.floor(ty / CHUNK_SIZE)}`;
        const chunk = state.chunks?.get(chunkKey);
        if (!chunk) continue;

        const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const tile = chunk[ly]?.[lx];
        if (!tile) continue;

        // Check for pollution property on tile
        const pollution = (tile as any).pollution || 0;
        if (pollution <= 0) continue;

        // Also check nearby buildings for active pollution sources
        let buildingPollution = 0;
        if (tile.building) {
          const bType = tile.building.type;
          if (bType === 'furnace' || bType === 'boiler' || bType === 'refinery') {
            buildingPollution = tile.building.isActive ? 0.5 : 0.1;
          } else if (bType === 'chemical_plant' || bType === 'assembler') {
            buildingPollution = tile.building.isActive ? 0.2 : 0;
          }
        }

        const totalPollution = Math.min(1, pollution * 0.01 + buildingPollution);
        if (totalPollution <= 0.02) continue;

        const sx = (tx * TILE_SIZE - cameraX) * scale;
        const sy = (ty * TILE_SIZE - cameraY) * scale;
        const size = TILE_SIZE * scale;

        // Brown/reddish pollution tint
        const r = Math.floor(120 + totalPollution * 40);
        const g = Math.floor(60 + totalPollution * 20);
        const b = Math.floor(20);
        const alpha = totalPollution * 0.5;

        pctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        pctx.fillRect(sx, sy, size, size);
      }
    }

    // Draw with animated drift
    const drift = Math.sin(frameCount * 0.005) * 2;
    ctx.globalAlpha = 0.35;
    ctx.drawImage(pc, -cameraX * 0.5 + drift, -cameraY * 0.5);
    ctx.globalAlpha = 1;
  }
}
