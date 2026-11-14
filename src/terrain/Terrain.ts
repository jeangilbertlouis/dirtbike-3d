import * as THREE from 'three';
import { smoothstep, tileNoise } from './noise';

/** The height field repeats every PERIOD metres along X, so it can scroll forever. */
export const PERIOD = 56;
const LENGTH = PERIOD * 3; // mesh covers [-PERIOD, 2*PERIOD) so the view is always filled
const WIDTH = 60;
const SEG_X = 480;
const SEG_Z = 120;

/**
 * Endless rough dirt track. The bike stays at the origin; the terrain mesh slides
 * backwards underneath it as `distance` grows.
 *
 * Track coordinates: x runs along the direction of travel, z = 0 is the riding line.
 */
export class Terrain {
  readonly group = new THREE.Group();
  /** 0 = smooth rollers only, 1 = default whoops and chatter, 2 = brutal. */
  roughness = 1;

  private mesh: THREE.Mesh;
  private rocks: THREE.InstancedMesh;

  constructor() {
    this.group.name = 'terrain';

    const geo = new THREE.PlaneGeometry(LENGTH, WIDTH, SEG_X, SEG_Z);
    geo.rotateX(-Math.PI / 2);
    geo.translate(PERIOD / 2, 0, 0);
    geo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3), 3),
    );
    const detail = createDirtTexture();
    detail.repeat.set(LENGTH / 2, WIDTH / 2); // 2 m tiles; PERIOD/2 is whole, so it stays seamless
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96 }),
    );
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const p = rockGeo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + 0.25 * Math.abs(tileNoise(p.getX(i) * 7, p.getZ(i) * 7 + p.getY(i) * 3, 1, 64, 9));
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
    }
    rockGeo.computeVertexNormals();
    this.rocks = new THREE.InstancedMesh(
      rockGeo,
      new THREE.MeshStandardMaterial({ color: '#6e655b', roughness: 0.9, flatShading: true }),
      70 * 3,
    );
    this.rocks.castShadow = true;
    this.rocks.receiveShadow = true;
    this.group.add(this.rocks);

    this.rebuild();
  }

  /** Ground height at track coordinate (x, z). */
  height(x: number, z = 0): number {
    const az = Math.abs(z);
    let h = 0.85 * tileNoise(x, z, 14, PERIOD / 14, 1) + 0.3 * tileNoise(x, z, 7, PERIOD / 7, 2);
    h += this.roughness * (0.14 * tileNoise(x, z, 2, PERIOD / 2, 3) + 0.035 * tileNoise(x, z, 0.5, PERIOD / 0.5, 4));
    const side = smoothstep(az, 2.5, 9);
    h += side * (0.5 * tileNoise(x, z, 4, PERIOD / 4, 5) + 0.6 * side);
    return h;
  }

  /** Slide the mesh so that the bike (at world x = 0) sits at track position `distance`. */
  setDistance(distance: number): void {
    this.group.position.x = -(((distance % PERIOD) + PERIOD) % PERIOD);
  }

  /** Recompute heights, colours and rock placement (e.g. after a roughness change). */
  rebuild(): void {
    const geo = this.mesh.geometry;
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    const dirt = new THREE.Color('#8a6a48');
    const light = new THREE.Color('#ad8e66');
    const packed = new THREE.Color('#5e4632');
    const grass = new THREE.Color('#6d6b3c');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.height(x, z));
      const az = Math.abs(z);
      c.copy(dirt).lerp(light, 0.5 + 0.5 * tileNoise(x, z, 1.75, PERIOD / 1.75, 6));
      c.lerp(packed, 0.5 * (1 - smoothstep(az, 0.35, 1.4)));
      const g = smoothstep(az, 4, 10) * (0.55 + 0.45 * tileNoise(x, z, 3.5, PERIOD / 3.5, 7));
      c.lerp(grass, Math.max(0, g) * 0.75);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    // Rocks scattered beside the riding line, repeated once per period.
    const rng = mulberry32(42);
    const dummy = new THREE.Object3D();
    const n = this.rocks.count / 3;
    for (let i = 0; i < n; i++) {
      const x = rng() * PERIOD;
      const z = (rng() < 0.5 ? -1 : 1) * (2.2 + rng() * 14);
      const s = 0.12 + rng() ** 2 * 0.55;
      dummy.rotation.set(rng() * 6, rng() * 6, rng() * 6);
      dummy.scale.set(s * (0.8 + rng() * 0.6), s, s * (0.8 + rng() * 0.6));
      for (let k = 0; k < 3; k++) {
        dummy.position.set(x + (k - 1) * PERIOD, this.height(x, z) - s * 0.25, z);
        dummy.updateMatrix();
        this.rocks.setMatrixAt(i * 3 + k, dummy.matrix);
      }
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    this.rocks.computeBoundingSphere();
  }
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gritty grayscale detail, multiplied over the vertex colours. */
function createDirtTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const rng = mulberry32(7);
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = Math.floor(i / S);
    const v = 215 + 40 * tileNoise(x, y, 16, S / 16, 11) * 0.5 + (rng() - 0.5) * 50;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Pebbles.
  for (let k = 0; k < 140; k++) {
    const r = 1 + rng() * 3;
    const shade = 120 + rng() * 90;
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.arc(rng() * S, rng() * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
