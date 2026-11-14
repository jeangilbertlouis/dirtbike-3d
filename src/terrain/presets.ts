import * as THREE from 'three';
import type { Look } from '../scene/modes';
import { smoothstep, tileNoise } from './noise';

/** The height field repeats every PERIOD metres along X, so it can scroll forever. */
export const PERIOD = 56;

/** Tiling noise with the period baked in. Every `cell` must divide PERIOD evenly. */
const N = (x: number, z: number, cell: number, seed: number) =>
  tileNoise(x, z, cell, PERIOD / cell, seed);

export interface TerrainPreset {
  id: string;
  label: string;
  /** Ground height at track coordinate (x, z); `rough` scales the small-scale bumps. */
  height(x: number, z: number, rough: number): number;
  /** Ground colour (linear) at track coordinate (x, z). */
  color(x: number, z: number, out: THREE.Color): void;
  rocks: { perPeriod: number; minZ: number; maxZ: number; color: string; minSize: number; maxSize: number };
  /** Conifers per period (0 = none). */
  trees: number;
  dust: { color: string; rate: number };
  look: Look;
}

const c = (hex: string) => new THREE.Color(hex);

const DIRT = { dirt: c('#8a6a48'), light: c('#ad8e66'), packed: c('#5e4632'), grass: c('#6d6b3c') };

export const DIRT_TRACK: TerrainPreset = {
  id: 'dirt',
  label: 'Dirt track',
  height(x, z, rough) {
    let h = 0.85 * N(x, z, 14, 1) + 0.3 * N(x, z, 7, 2);
    h += rough * (0.14 * N(x, z, 2, 3) + 0.035 * N(x, z, 0.5, 4));
    const side = smoothstep(Math.abs(z), 2.5, 9);
    return h + side * (0.5 * N(x, z, 4, 5) + 0.6 * side);
  },
  color(x, z, out) {
    const az = Math.abs(z);
    out.copy(DIRT.dirt).lerp(DIRT.light, 0.5 + 0.5 * N(x, z, 1.75, 6));
    out.lerp(DIRT.packed, 0.5 * (1 - smoothstep(az, 0.35, 1.4)));
    const g = smoothstep(az, 4, 10) * (0.55 + 0.45 * N(x, z, 3.5, 7));
    out.lerp(DIRT.grass, Math.max(0, g) * 0.75);
  },
  rocks: { perPeriod: 70, minZ: 2.2, maxZ: 16, color: '#6e655b', minSize: 0.12, maxSize: 0.67 },
  trees: 0,
  dust: { color: '#dcc8a6', rate: 1 },
  look: {
    background: '#b4c2cf',
    fogNear: 14,
    fogFar: 60,
    env: 0.55,
    key: ['#fff1dc', 2.8],
    rim: ['#c9dcff', 0.6],
    hemi: ['#d4e6ff', '#6b5236', 0.75],
  },
};

const FOREST = {
  loam: c('#4a3524'),
  leaves: c('#7a5530'),
  packed: c('#2f2219'),
  moss: c('#45532a'),
  needles: c('#5b3f24'),
};

export const FOREST_TRAIL: TerrainPreset = {
  id: 'forest',
  label: 'Forest trail',
  height(x, z, rough) {
    const az = Math.abs(z);
    // Steeper hills and bigger whoops than the dirt track.
    let h = 1.0 * N(x, z, 14, 11) + 0.4 * N(x, z, 7, 12);
    h += rough * (0.17 * N(x, z, 2, 13) + 0.045 * N(x, z, 0.5, 14));
    // Roots: thin ridges running roughly across the trail.
    const ridge = 1 - Math.abs(N(x, z * 0.3, 1.75, 15));
    h += rough * 0.065 * Math.pow(Math.max(0, ridge - 0.82) / 0.18, 2);
    // Rocks bedded into the riding line.
    h += rough * 0.25 * Math.max(0, N(x, z, 0.875, 16) - 0.55);
    // Steep, close banks either side.
    const side = smoothstep(az, 1.8, 6);
    return h + side * (0.6 * N(x, z, 4, 17) + 1.0 * side);
  },
  color(x, z, out) {
    const az = Math.abs(z);
    out.copy(FOREST.loam).lerp(FOREST.leaves, Math.max(0, 0.6 * N(x, z, 1.75, 18)));
    out.lerp(FOREST.needles, 0.35 + 0.35 * N(x, z, 0.5, 19));
    out.lerp(FOREST.packed, 0.55 * (1 - smoothstep(az, 0.3, 1.1)));
    const m = smoothstep(az, 2.5, 7) * (0.5 + 0.5 * N(x, z, 3.5, 20));
    out.lerp(FOREST.moss, Math.max(0, m) * 0.8);
  },
  rocks: { perPeriod: 140, minZ: 1.3, maxZ: 16, color: '#5d6056', minSize: 0.1, maxSize: 0.75 },
  trees: 170,
  dust: { color: '#7a6248', rate: 0.4 },
  look: {
    background: '#8b9b8d',
    fogNear: 6,
    fogFar: 42,
    env: 0.45,
    key: ['#ffe0b0', 2.1],
    rim: ['#bfe0c8', 0.5],
    hemi: ['#c8dcc8', '#33281a', 0.85],
  },
};

export const PRESETS: TerrainPreset[] = [DIRT_TRACK, FOREST_TRAIL];
