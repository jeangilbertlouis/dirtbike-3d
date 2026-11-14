/**
 * Small, dependency-free 2D value noise that tiles along X.
 * Tiling lets the terrain scroll forever without a seam.
 */

function hash(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Value noise in [-1, 1]. `cell` is the lattice spacing in metres; the pattern
 * repeats every `periodCells * cell` metres along X.
 */
export function tileNoise(
  x: number,
  z: number,
  cell: number,
  periodCells: number,
  seed: number,
): number {
  const gx = x / cell;
  const gz = z / cell;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = fade(gx - ix);
  const fz = fade(gz - iz);
  const x0 = mod(ix, periodCells);
  const x1 = mod(ix + 1, periodCells);
  const a = hash(x0, iz, seed);
  const b = hash(x1, iz, seed);
  const c = hash(x0, iz + 1, seed);
  const d = hash(x1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function smoothstep(x: number, e0: number, e1: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
