import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tileNoise } from './noise';
import { DIRT_TRACK, PERIOD, PRESETS, type TerrainPreset } from './presets';

export { PERIOD };

const LENGTH = PERIOD * 3; // mesh covers [-PERIOD, 2*PERIOD) so the view is always filled
const HALF_WIDTH = 30;
const SEG_X = 840; // 0.2 m along the track
const SEG_Z = 120;
const MAX_ROCKS = 160;
const MAX_TREES = 200;
const MAX_MARKERS = 60;

/**
 * Endless rough terrain. The bike stays at the origin; the mesh slides backwards
 * underneath it as the bike's distance grows.
 *
 * Track coordinates: x runs along the direction of travel, z = 0 is the riding line.
 * Shape, colours, rocks, trees and look come from the active preset.
 */
export class Terrain {
  readonly group = new THREE.Group();
  /** 0 = smooth rollers only, 1 = default, 2 = brutal. */
  roughness = 1;
  preset: TerrainPreset = DIRT_TRACK;

  private mesh: THREE.Mesh;
  private rocks: THREE.InstancedMesh;
  private rockMat: THREE.MeshStandardMaterial;
  private trunks: THREE.InstancedMesh;
  private canopies: THREE.InstancedMesh;
  private markers: THREE.InstancedMesh;

  constructor() {
    this.group.name = 'terrain';

    const geo = new THREE.PlaneGeometry(LENGTH, 2, SEG_X, SEG_Z);
    geo.rotateX(-Math.PI / 2);
    geo.translate(PERIOD / 2, 0, 0);
    // Pack rows toward the riding line so bumps under the tyres are well resolved.
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getZ(i); // -1..1
      const z = Math.sign(u) * HALF_WIDTH * Math.pow(Math.abs(u), 1.8);
      pos.setZ(i, z);
      uv.setXY(i, pos.getX(i) / 2, z / 2); // 2 m texture tiles; PERIOD/2 is whole → seamless
    }
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, map: createDirtTexture(), roughness: 0.96 }),
    );
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    this.rockMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    this.rocks = new THREE.InstancedMesh(createRockGeometry(), this.rockMat, MAX_ROCKS * 3);
    this.rocks.castShadow = true;
    this.rocks.receiveShadow = true;
    this.group.add(this.rocks);

    const tree = createTreeGeometries();
    this.trunks = new THREE.InstancedMesh(
      tree.trunk,
      new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 0.95, envMapIntensity: 0.3 }),
      MAX_TREES * 3,
    );
    this.canopies = new THREE.InstancedMesh(
      tree.canopy,
      // Tinted per instance; low env reflection keeps the foliage deep green.
      new THREE.MeshStandardMaterial({ color: '#9fb894', roughness: 0.9, flatShading: true, envMapIntensity: 0.25 }),
      MAX_TREES * 3,
    );
    this.group.add(this.trunks, this.canopies);
    // Create the per-instance colour buffer up front so the material compiles with it.
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_TREES * 3; i++) this.canopies.setColorAt(i, white);

    this.markers = new THREE.InstancedMesh(
      new RoundedBoxGeometry(1.1, 0.5, 0.5, 2, 0.06),
      new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      MAX_MARKERS * 3,
    );
    this.markers.castShadow = true;
    this.markers.receiveShadow = true;
    for (let i = 0; i < MAX_MARKERS * 3; i++) this.markers.setColorAt(i, white);
    this.group.add(this.markers);

    this.rebuild();
  }

  /** Ground height at track coordinate (x, z). */
  height(x: number, z = 0): number {
    return this.preset.height(x, z, this.roughness);
  }

  setPreset(id: string): void {
    this.preset = PRESETS.find((p) => p.id === id) ?? DIRT_TRACK;
    this.rebuild();
  }

  /** Slide the mesh so that the bike (at world x = 0) sits at track position `distance`. */
  setDistance(distance: number): void {
    this.group.position.x = -(((distance % PERIOD) + PERIOD) % PERIOD);
  }

  /** Recompute heights, colours, rocks and trees for the current preset and roughness. */
  rebuild(): void {
    const p = this.preset;
    const geo = this.mesh.geometry;
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.height(x, z));
      p.color(x, z, color);
      col.setXYZ(i, color.r, color.g, color.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const rng = mulberry32(42);
    const dummy = new THREE.Object3D();
    const side = () => (rng() < 0.5 ? -1 : 1);

    // Rocks beside the riding line, repeated once per period.
    const r = p.rocks;
    this.rockMat.color.set(r.color);
    const nRocks = Math.min(MAX_ROCKS, r.perPeriod);
    for (let i = 0; i < nRocks; i++) {
      const x = rng() * PERIOD;
      const z = side() * (r.minZ + rng() * (r.maxZ - r.minZ));
      const s = r.minSize + rng() ** 2 * (r.maxSize - r.minSize);
      dummy.rotation.set(rng() * 6, rng() * 6, rng() * 6);
      dummy.scale.set(s * (0.8 + rng() * 0.6), s, s * (0.8 + rng() * 0.6));
      const y = this.height(x, z) - s * 0.25;
      this.repeatInstance(this.rocks, i, dummy, x, y, z);
    }
    this.rocks.count = nRocks * 3;
    this.rocks.instanceMatrix.needsUpdate = true;
    this.rocks.computeBoundingSphere();

    // Track-edge blocks, alternating colours down both sides.
    const mk = p.markers;
    let nMarkers = 0;
    if (mk) {
      const perSide = Math.min(MAX_MARKERS / 2, Math.floor(PERIOD / mk.spacing));
      const tint = new THREE.Color();
      for (let j = 0; j < perSide; j++) {
        for (const s of [-1, 1]) {
          const x = j * mk.spacing;
          const z = s * mk.z;
          dummy.rotation.set(0, (rng() - 0.5) * 0.1, 0);
          dummy.scale.set(1, 1, 1);
          this.repeatInstance(this.markers, nMarkers, dummy, x, this.height(x, z) + 0.12, z);
          tint.set(mk.colors[j % mk.colors.length]);
          for (let k = 0; k < 3; k++) this.markers.setColorAt(nMarkers * 3 + k, tint);
          nMarkers++;
        }
      }
    }
    this.markers.count = nMarkers * 3;
    this.markers.visible = nMarkers > 0;
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
    this.markers.computeBoundingSphere();

    // Conifers, kept clear of the trail and the usual camera orbit.
    const nTrees = Math.min(MAX_TREES, p.trees.count);
    const green = new THREE.Color();
    for (let i = 0; i < nTrees; i++) {
      const x = rng() * PERIOD;
      const z = side() * (p.trees.minZ + rng() ** 1.4 * (28.5 - p.trees.minZ));
      const h = 5 + rng() * 7;
      const w = h * (0.8 + rng() * 0.4);
      dummy.rotation.set((rng() - 0.5) * 0.08, rng() * 6, (rng() - 0.5) * 0.08);
      dummy.scale.set(w, h, w);
      this.repeatInstance(this.trunks, i, dummy, x, this.height(x, z) - 0.15, z);
      this.repeatInstance(this.canopies, i, dummy, x, this.height(x, z) - 0.15, z);
      green.setHSL(0.28 + rng() * 0.07, 0.45 + rng() * 0.2, 0.07 + rng() * 0.06);
      for (let k = 0; k < 3; k++) this.canopies.setColorAt(i * 3 + k, green);
    }
    this.trunks.count = this.canopies.count = nTrees * 3;
    this.trunks.visible = this.canopies.visible = nTrees > 0;
    for (const m of [this.trunks, this.canopies]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    if (this.canopies.instanceColor) this.canopies.instanceColor.needsUpdate = true;
  }

  /** Place an instance at x, x−PERIOD and x+PERIOD so it scrolls seamlessly. */
  private repeatInstance(
    mesh: THREE.InstancedMesh,
    i: number,
    dummy: THREE.Object3D,
    x: number,
    y: number,
    z: number,
  ): void {
    for (let k = 0; k < 3; k++) {
      dummy.position.set(x + (k - 1) * PERIOD, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i * 3 + k, dummy.matrix);
    }
  }
}

function createRockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + 0.25 * Math.abs(tileNoise(p.getX(i) * 7, p.getZ(i) * 7 + p.getY(i) * 3, 1, 64, 9));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A unit-height conifer (trunk + three stacked cones), scaled per instance. */
function createTreeGeometries(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.018, 0.03, 0.4, 7).translate(0, 0.2, 0);
  const tiers: [number, number, number][] = [
    [0.27, 0.42, 0.22],
    [0.21, 0.38, 0.44],
    [0.14, 0.34, 0.66],
  ];
  const canopy = mergeGeometries(
    tiers.map(([r, h, y]) => new THREE.ConeGeometry(r, h, 8).translate(0, y + h / 2, 0)),
  )!;
  return { trunk, canopy };
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
