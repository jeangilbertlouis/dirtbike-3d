import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { WheelSpec } from './dimensions';
import type { Mats } from './materials';
import { axisZ, extrude, mesh, roundedPoly, setInstanceRod, v3, type Pt } from './util';

export interface Wheel {
  /** Static parts (axle) — positioned at the axle. */
  group: THREE.Group;
  /** Rotating parts — spin about local Z. */
  spin: THREE.Group;
}

export interface SprocketSpec {
  radius: number;
  teeth: number;
  z: number;
}

/** A complete wheel, lying in the XY plane with its axle along Z. */
export function createWheel(
  spec: WheelSpec,
  discSide: 1 | -1,
  m: Mats,
  sprocket?: SprocketSpec,
): Wheel {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);

  spin.add(createTire(spec, m));
  spin.add(createRim(spec, m));
  spin.add(createHubAndSpokes(spec, m));

  const disc = createDisc(spec.discRadius, m);
  disc.position.z = discSide * (spec.hubWidth / 2 + 0.006);
  spin.add(disc);

  if (sprocket) {
    const sp = createSprocket(sprocket.radius, sprocket.teeth, m);
    sp.position.z = sprocket.z;
    spin.add(sp);
  }

  const axleLen = spec.hubWidth + 0.11;
  group.add(mesh(axisZ(new THREE.CylinderGeometry(0.01, 0.01, axleLen, 12)), m.steel));
  for (const s of [-1, 1]) {
    const nut = mesh(axisZ(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 6)), m.steel);
    nut.position.z = (s * axleLen) / 2;
    group.add(nut);
  }
  return { group, spin };
}

/** Lathe-turned carcass plus an instanced knobby tread pattern. */
function createTire(spec: WheelSpec, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const ri = spec.rimRadius + 0.012;
  const ro = spec.radius - spec.knobHeight;
  const hw = (spec.width / 2) * 1.08;

  // Cross-section profile: t in [-1, 1] runs bead → tread → bead.
  const prof = (t: number) => {
    const a = (t * Math.PI) / 2;
    const c = Math.max(0, Math.cos(a));
    const s = Math.sin(a);
    return new THREE.Vector2(
      ri + (ro - ri) * Math.pow(c, 0.42),
      hw * Math.sign(s) * Math.pow(Math.abs(s), 0.8) * (0.82 + 0.18 * Math.sqrt(c)),
    );
  };
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 40; i++) pts.push(prof(-1 + (2 * i) / 40));
  g.add(mesh(new THREE.LatheGeometry(pts, 120).rotateX(Math.PI / 2), m.rubber));

  // Knobs: alternating rows of centre/shoulder and intermediate blocks.
  const rows = Math.round((2 * Math.PI * ro) / 0.036);
  const pattern = [
    [0, -0.8, 0.8],
    [-0.42, 0.42],
  ];
  let count = 0;
  for (let j = 0; j < rows; j++) count += pattern[j % 2].length;

  const kh = spec.knobHeight;
  const knobGeo = new RoundedBoxGeometry(kh * 1.1, 0.021, spec.width * 0.22, 1, 0.003);
  const knobs = new THREE.InstancedMesh(knobGeo, m.rubber, count);
  const dummy = new THREE.Object3D();
  let i = 0;
  for (let j = 0; j < rows; j++) {
    const theta = (j / rows) * Math.PI * 2;
    for (const t of pattern[j % 2]) {
      const p = prof(t);
      const p1 = prof(t - 0.01);
      const p2 = prof(t + 0.01);
      const n = new THREE.Vector2(p2.y - p1.y, -(p2.x - p1.x)).normalize();
      const phi = Math.atan2(n.y, n.x);
      const r = p.x + n.x * kh * 0.45;
      const z = p.y + n.y * kh * 0.45;
      dummy.position.set(r * Math.cos(theta), r * Math.sin(theta), z);
      dummy.rotation.set(0, 0, theta);
      dummy.rotateY(-phi);
      dummy.updateMatrix();
      knobs.setMatrixAt(i++, dummy.matrix);
    }
  }
  g.add(knobs);
  return g;
}

function createRim(spec: WheelSpec, m: Mats): THREE.Mesh {
  const R = spec.rimRadius;
  const w = spec.width * 0.42;
  const profile: [number, number][] = [
    [R + 0.012, -w],
    [R - 0.012, -w * 0.8],
    [R - 0.014, 0],
    [R - 0.012, w * 0.8],
    [R + 0.012, w],
    [R + 0.004, w * 0.85],
    [R + 0.004, -w * 0.85],
    [R + 0.012, -w],
  ];
  const geo = new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    120,
  ).rotateX(Math.PI / 2);
  return mesh(geo, m.rim);
}

function createHubAndSpokes(spec: WheelSpec, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const hw = spec.hubWidth;
  g.add(mesh(axisZ(new THREE.CylinderGeometry(0.032, 0.032, hw, 24)), m.anodized));

  const fz = hw / 2 - 0.012;
  const fr = 0.048;
  for (const s of [-1, 1]) {
    const flange = mesh(axisZ(new THREE.CylinderGeometry(0.056, 0.056, 0.007, 28)), m.anodized);
    flange.position.z = s * fz;
    g.add(flange);
  }

  // Tangentially laced spokes, alternating sides and leading/trailing.
  const n = spec.spokes;
  const rr = spec.rimRadius - 0.012;
  const spokes = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0019, 0.0019, 1, 6),
    m.steel,
    n,
  );
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const side = i % 2 === 0 ? 1 : -1;
    const lead = Math.floor(i / 2) % 2 === 0 ? 1 : -1;
    const hubA = theta + lead * 0.62;
    const a = v3(fr * Math.cos(hubA), fr * Math.sin(hubA), side * fz);
    const b = v3(rr * Math.cos(theta), rr * Math.sin(theta), side * 0.004);
    setInstanceRod(spokes, i, a, b);
  }
  g.add(spokes);
  return g;
}

/** Wave-pattern brake rotor with drilled holes and a five-arm carrier. */
function createDisc(R: number, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const N = 144;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const r = R * (1 - 0.03 * (0.5 + 0.5 * Math.cos(a * 14)));
    if (k === 0) shape.moveTo(r * Math.cos(a), r * Math.sin(a));
    else shape.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  shape.closePath();
  const inner = new THREE.Path();
  inner.absarc(0, 0, R * 0.66, 0, Math.PI * 2, true);
  shape.holes.push(inner);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const h = new THREE.Path();
    h.absarc(R * 0.82 * Math.cos(a), R * 0.82 * Math.sin(a), R * 0.035, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
  g.add(extrude(shape, 0.0045, m.disc, 0));

  const star: Pt[] = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const r = k % 2 === 0 ? R * 0.7 : R * 0.42;
    star.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  g.add(extrude(roundedPoly(star, 0.008), 0.006, m.anodized, 0.001));
  return g;
}

export function createSprocket(R: number, teeth: number, m: Mats): THREE.Mesh {
  const shape = new THREE.Shape();
  const root = R - 0.007;
  const step = (Math.PI * 2) / teeth;
  for (let k = 0; k < teeth; k++) {
    const base = k * step;
    const pts: [number, number][] = [
      [root, base],
      [R, base + step * 0.3],
      [R, base + step * 0.5],
      [root, base + step * 0.8],
    ];
    pts.forEach(([r, a], j) => {
      const x = r * Math.cos(a);
      const y = r * Math.sin(a);
      if (k === 0 && j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, R * 0.35, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  if (R > 0.05) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const h = new THREE.Path();
      h.absarc(R * 0.64 * Math.cos(a), R * 0.64 * Math.sin(a), R * 0.15, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }
  return extrude(shape, 0.005, m.anodized, 0);
}

/** Brake caliper; local +x points radially outward from the disc centre. */
export function createCaliper(m: Mats): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new RoundedBoxGeometry(0.034, 0.08, 0.04, 2, 0.008), m.anodized);
  g.add(body);
  const pad = mesh(new RoundedBoxGeometry(0.02, 0.05, 0.05, 1, 0.004), m.forkLug);
  pad.position.x = 0.012;
  g.add(pad);
  return g;
}
