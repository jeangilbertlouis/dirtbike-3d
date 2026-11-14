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
  /** Conifers per period (0 = none), kept at least `minZ` from the riding line. */
  trees: { count: number; minZ: number };
  /** Track-edge blocks lining both sides of the track. */
  markers?: { spacing: number; z: number; colors: string[] };
  dust: { color: string; rate: number };
  look: Look;
  /** Suggested riding speed (km/h), applied when the preset is picked. */
  speed?: number;
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
  trees: { count: 0, minZ: 4.5 },
  dust: { color: '#dcc8a6', rate: 1 },
  speed: 25,
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
  trees: { count: 170, minZ: 4.5 },
  speed: 22,
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

// ── Motocross ────────────────────────────────────────────────────────────────

/** Takeoff face: concave, steepening to the lip (t: 0 → 1). */
const face = (t: number) => Math.pow(Math.min(1, Math.max(0, t)), 1.6);
/** Smooth landing / backside slope (t: 0 → 1, height 1 → 0). */
const down = (t: number) => 1 - smoothstep(t, 0, 1);

/**
 * Hand-built track profile along one PERIOD (56 m). At ~33 km/h the 24° lips
 * throw the bike about 6 m, which puts it on the landings.
 *
 *   0–4    flat run-in
 *   4–9    tabletop takeoff (1.3 m) → 9–15 flat top → 15–21 landing
 *   26–30  double takeoff (1.1 m), 30–31.5 backside, gap, 33–34.5 landing
 *          face (1.0 m), 34.5–39 landing slope
 *   41–53  whoops: five 0.22 m bumps, 2.4 m apart
 */
function mxProfile(x: number): number {
  const s = ((x % PERIOD) + PERIOD) % PERIOD;
  if (s >= 4 && s < 9) return 1.3 * face((s - 4) / 5);
  if (s >= 9 && s < 15) return 1.3;
  if (s >= 15 && s < 21) return 1.3 * down((s - 15) / 6);
  if (s >= 26 && s < 30) return 1.1 * face((s - 26) / 4);
  if (s >= 30 && s < 31.5) return 1.1 * down((s - 30) / 1.5);
  if (s >= 33 && s < 34.5) return 1.0 * smoothstep(s, 33, 34.5);
  if (s >= 34.5 && s < 39) return 1.0 * down((s - 34.5) / 4.5);
  if (s >= 41 && s < 53) return 0.22 * Math.sin((Math.PI * (s - 41)) / 2.4) ** 2;
  return 0;
}

const MX = {
  dirt: c('#8b5a3c'),
  groomed: c('#a06a46'),
  line: c('#5e3b28'),
  grass: c('#5d7a3a'),
  grassLight: c('#7a9446'),
};

export const MOTOCROSS: TerrainPreset = {
  id: 'motocross',
  label: 'Motocross track',
  height(x, z, rough) {
    const az = Math.abs(z);
    const onTrack = 1 - smoothstep(az, 3.6, 5.2);
    let h = onTrack * mxProfile(x);
    // Groomed, so only light braking bumps and chatter.
    h += rough * onTrack * (0.035 * N(x, z, 2, 31) + 0.012 * N(x, z, 0.5, 32));
    // Raised track edges, then a flat infield.
    h += 0.45 * smoothstep(az, 4.6, 6.2) - 0.25 * smoothstep(az, 6.5, 9);
    return h + 0.08 * N(x, z, 14, 33);
  },
  color(x, z, out) {
    const az = Math.abs(z);
    out.copy(MX.dirt).lerp(MX.groomed, 0.5 + 0.5 * N(x, z, 1.75, 34));
    // Darker, watered racing line with tyre ruts.
    const line = 1 - smoothstep(az, 0.25, 1.2);
    out.lerp(MX.line, 0.6 * line * (0.75 + 0.25 * Math.sin(z * 40)));
    const grass = smoothstep(az, 5.6, 7);
    out.lerp(MX.grass, grass).lerp(MX.grassLight, grass * (0.3 + 0.3 * N(x, z, 3.5, 35)));
  },
  rocks: { perPeriod: 8, minZ: 9, maxZ: 20, color: '#7a7268', minSize: 0.15, maxSize: 0.4 },
  trees: { count: 40, minZ: 14 },
  markers: { spacing: 2.8, z: 4.9, colors: ['#1e6fd9', '#f4f4f0'] },
  dust: { color: '#c9a27c', rate: 1.2 },
  speed: 33,
  look: {
    background: '#a9c8e8',
    fogNear: 22,
    fogFar: 85,
    env: 0.6,
    key: ['#fff4e0', 3.0],
    rim: ['#cfe0ff', 0.6],
    hemi: ['#cfe4ff', '#4f6a35', 0.8],
  },
};

export const PRESETS: TerrainPreset[] = [DIRT_TRACK, FOREST_TRAIL, MOTOCROSS];
