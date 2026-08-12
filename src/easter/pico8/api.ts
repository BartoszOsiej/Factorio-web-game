// PICO-8 16-color palette (hex)
const PALETTE = [
  '#000000', '#1D2B53', '#7E2553', '#008751',
  '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
  '#FF004D', '#FFA300', '#FFEC27', '#00E436',
  '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
];

export const PICO_COLS = PALETTE;

export class PicoAPI {
  screen: ImageData;
  private ctx: CanvasRenderingContext2D;
  private palette: string[];
  private buttons: Set<number> = new Set();
  private prevButtons: Set<number> = new Set();

  private audioCtx: AudioContext | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.screen = ctx.createImageData(128, 128);
    this.palette = PALETTE;
  }

  initAudio() {
    this.audioCtx = new AudioContext();
  }

  /** Clear screen with color index 0-15 */
  cls(col = 0) {
    const data = this.screen.data;
    const [r, g, b] = this.hexToRgb(this.palette[col]);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  /** Set pixel at (x, y) to color index */
  pset(x: number, y: number, col: number) {
    const [r, g, b] = this.hexToRgb(this.palette[col]);
    const idx = (Math.floor(y) * 128 + Math.floor(x)) * 4;
    if (idx < 0 || idx >= this.screen.data.length) return;
    this.screen.data[idx] = r;
    this.screen.data[idx + 1] = g;
    this.screen.data[idx + 2] = b;
    this.screen.data[idx + 3] = 255;
  }

  /** Get pixel color index at (x, y) */
  pget(x: number, y: number): number {
    const idx = (Math.floor(y) * 128 + Math.floor(x)) * 4;
    if (idx < 0 || idx >= this.screen.data.length) return 0;
    const r = this.screen.data[idx];
    const g = this.screen.data[idx + 1];
    const b = this.screen.data[idx + 2];
    for (let i = 0; i < this.palette.length; i++) {
      const [pr, pg, pb] = this.hexToRgb(this.palette[i]);
      if (pr === r && pg === g && pb === b) return i;
    }
    return 0;
  }

  /** Draw filled rect */
  rectfill(x1: number, y1: number, x2: number, y2: number, col: number) {
    const [r, g, b] = this.hexToRgb(this.palette[col]);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const idx = (y * 128 + x) * 4;
        if (idx < 0 || idx >= this.screen.data.length) continue;
        this.screen.data[idx] = r;
        this.screen.data[idx + 1] = g;
        this.screen.data[idx + 2] = b;
        this.screen.data[idx + 3] = 255;
      }
    }
  }

  /** Draw filled circle */
  circfill(cx: number, cy: number, r: number, col: number) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) {
          this.pset(cx + x, cy + y, col);
        }
      }
    }
  }

  /** Draw sprite from virtual sprite sheet (8x8 tiles, 16 tiles across) */
  spr(n: number, x: number, y: number, w = 1, h = 1) {
    const sx = (n % 16) * 8;
    const sy = Math.floor(n / 16) * 8;
    for (let row = 0; row < h * 8; row++) {
      for (let col = 0; col < w * 8; col++) {
        // Use palette index based on position
        const pi = (sx + col + (sy + row) * 128) % this.palette.length;
        this.pset(x + col, y + row, pi);
      }
    }
  }

  /** Draw text using built-in pixel font */
  print(text: string, x = 0, y = 0, col = 7) {
    const chars: Record<string, number[][]> = {
      A: [[0,1,1,0],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
      B: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,1],[1,1,1,0]],
      C: [[0,1,1,0],[1,0,0,1],[1,0,0,0],[1,0,0,1],[0,1,1,0]],
      D: [[1,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,0]],
      E: [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,1]],
      F: [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
      G: [[0,1,1,0],[1,0,0,1],[1,0,1,1],[1,0,0,1],[0,1,1,0]],
      H: [[1,0,0,1],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
      I: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
      J: [[0,0,1,1],[0,0,0,1],[0,0,0,1],[1,0,0,1],[0,1,1,0]],
      K: [[1,0,0,1],[1,0,1,0],[1,1,0,0],[1,0,1,0],[1,0,0,1]],
      L: [[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]],
      M: [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]],
      N: [[1,0,0,1],[1,1,0,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]],
      O: [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
      P: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
      Q: [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,1,1],[0,1,1,1]],
      R: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,1]],
      S: [[0,1,1,1],[1,0,0,0],[0,1,1,0],[0,0,0,1],[1,1,1,0]],
      T: [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
      U: [[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
      V: [[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,1,0,1,0],[0,0,1,0,0]],
      W: [[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,1,0,1],[0,1,0,1,0]],
      X: [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1]],
      Y: [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
      Z: [[1,1,1,1,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,1,1,1,1]],
      '0': [[0,1,1,0],[1,0,0,1],[1,0,1,1],[1,1,0,1],[0,1,1,0]],
      '1': [[0,0,1,0],[0,1,1,0],[0,0,1,0],[0,0,1,0],[0,1,1,1]],
      '2': [[0,1,1,0],[1,0,0,1],[0,0,1,0],[0,1,0,0],[1,1,1,1]],
      '3': [[0,1,1,0],[1,0,0,1],[0,0,1,0],[1,0,0,1],[0,1,1,0]],
      '4': [[0,0,1,0],[0,1,1,0],[1,0,1,0],[1,1,1,1],[0,0,1,0]],
      '5': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[0,0,0,1],[1,1,1,0]],
      '6': [[0,1,1,0],[1,0,0,0],[1,1,1,0],[1,0,0,1],[0,1,1,0]],
      '7': [[1,1,1,1],[0,0,0,1],[0,0,1,0],[0,1,0,0],[0,1,0,0]],
      '8': [[0,1,1,0],[1,0,0,1],[0,1,1,0],[1,0,0,1],[0,1,1,0]],
      '9': [[0,1,1,0],[1,0,0,1],[0,1,1,1],[0,0,0,1],[0,1,1,0]],
    };
    let dx = x;
    const [r, g, b] = this.hexToRgb(this.palette[col]);
    for (const ch of text.toUpperCase()) {
      const glyph = chars[ch];
      if (!glyph) { dx += 4; continue; }
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col]) {
            const idx = ((y + row) * 128 + (dx + col)) * 4;
            if (idx >= 0 && idx < this.screen.data.length) {
              this.screen.data[idx] = r;
              this.screen.data[idx + 1] = g;
              this.screen.data[idx + 2] = b;
              this.screen.data[idx + 3] = 255;
            }
          }
        }
      }
      dx += glyph[0].length + 1;
    }
  }

  /** Check if button is pressed */
  btn(i: number): boolean {
    return this.buttons.has(i);
  }

  /** Check if button just pressed */
  btnp(i: number): boolean {
    return this.buttons.has(i) && !this.prevButtons.has(i);
  }

  /** Play sound effect (simple synth) */
  sfx(n: number) {
    // n is just a placeholder; we generate a beep
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.frequency.value = 220 + n * 55;
    gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.1);
    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.1);
  }

  /** Flush pixel buffer to canvas */
  flip() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 128;
    tempCanvas.height = 128;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(this.screen, 0, 0);

    // Scale up with nearest neighbor
    const displaySize = Math.min(this.canvas.parentElement?.clientWidth ?? 512, 512);
    this.canvas.style.width = displaySize + 'px';
    this.canvas.style.height = displaySize + 'px';
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(tempCanvas, 0, 0, 128, 128, 0, 0, 128, 128);
  }

  /** Handle key press */
  keyDown(key: string) {
    const map: Record<string, number> = {
      ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3,
      z: 4, x: 5, a: 6, s: 7,
    };
    const b = map[key];
    if (b !== undefined) this.buttons.add(b);
  }

  /** Handle key release */
  keyUp(key: string) {
    const map: Record<string, number> = {
      ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3,
      z: 4, x: 5, a: 6, s: 7,
    };
    const b = map[key];
    if (b !== undefined) this.buttons.delete(b);
  }

  /** Swap button states for btnp tracking */
  endFrame() {
    this.prevButtons = new Set(this.buttons);
  }

  private hexToRgb(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }
}
