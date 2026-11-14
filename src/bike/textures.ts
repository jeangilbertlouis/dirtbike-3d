import * as THREE from 'three';

interface PlateCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/**
 * Number-plate graphics drawn at runtime on canvases (no image assets).
 * One canvas per plate aspect ratio; each plate gets its own Texture
 * (with its own UV transform) that shares the canvas.
 */
export class NumberPlates {
  private canvases = new Map<number, PlateCanvas>();
  private textures: THREE.Texture[] = [];
  private value: string;

  constructor(initial = '27') {
    this.value = initial;
  }

  get number(): string {
    return this.value;
  }

  /** Texture for a plate whose mapped area has the given width/height ratio. */
  texture(aspect: number): THREE.Texture {
    const key = Math.round(aspect * 100);
    let pc = this.canvases.get(key);
    if (!pc) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = Math.round(512 / aspect);
      pc = { canvas, ctx: canvas.getContext('2d')! };
      this.canvases.set(key, pc);
      this.draw(pc);
    }
    const tex = new THREE.CanvasTexture(pc.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.textures.push(tex);
    return tex;
  }

  setNumber(n: string): void {
    this.value = n.slice(0, 3);
    for (const pc of this.canvases.values()) this.draw(pc);
    for (const t of this.textures) t.needsUpdate = true;
  }

  private draw({ canvas, ctx }: PlateCanvas): void {
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#16181c';
    const size = Math.min(H * 0.62, (W * 0.95) / Math.max(1.6, this.value.length * 0.75));
    ctx.font = `italic 900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.value, W / 2, H * 0.55);
  }
}
