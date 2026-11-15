import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Mats } from './materials';
import { extrude, mesh, roundedPoly, v3, type Pt } from './util';

/*
 * Handlebar controls, built in a bar-local frame:
 *   origin on the bar centreline at the perch's inboard face,
 *   +Z outward along the bar, +X forward, +Y up.
 * Everything is modelled for the right-hand side; the left side is mirrored by
 * the caller.
 */

const CLAMP_R = 0.0185;
/** Perches are rotated down around the bar so the blades line up with the rider's fingers. */
const TILT = THREE.MathUtils.degToRad(18);

export interface BarControl {
  group: THREE.Group;
  /** Where the hose or cable leaves the perch. */
  port: THREE.Object3D;
}

type Axis = 'x' | 'y' | 'z';

function box(
  size: [number, number, number],
  radius: number,
  mat: THREE.Material,
  pos: THREE.Vector3,
): THREE.Mesh {
  const b = mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius), mat);
  b.position.copy(pos);
  return b;
}

function orient(geo: THREE.BufferGeometry, axis: Axis): THREE.BufferGeometry {
  if (axis === 'x') geo.rotateZ(-Math.PI / 2);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  return geo;
}

/** Cylinder of radius r and length h along `axis`, centred at `pos`. */
function cyl(r: number, h: number, mat: THREE.Material, pos: THREE.Vector3, axis: Axis, segs = 16) {
  const c = mesh(orient(new THREE.CylinderGeometry(r, r, h, segs), axis), mat);
  c.position.copy(pos);
  return c;
}

/** Knurled knob: a cylinder with alternating ridges round its side. */
function knurled(r: number, h: number, mat: THREE.Material, pos: THREE.Vector3, axis: Axis, ridges = 14) {
  const segs = ridges * 2;
  const geo = new THREE.CylinderGeometry(r, r, h, segs, 1);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    if (Math.hypot(x, z) < r * 0.5) continue; // cap centre
    const n = Math.round(((Math.atan2(z, x) + Math.PI * 2) / (Math.PI * 2)) * segs);
    const k = n % 2 ? 0.86 : 1;
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  geo.computeVertexNormals();
  const c = mesh(orient(geo, axis), mat);
  c.position.copy(pos);
  return c;
}

/** Socket-head cap screw pointing along +Y, head centred on the origin. */
function capScrew(m: Mats, r: number, len: number): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(r, len, m.steel, v3(0, 0, 0), 'y', 18));
  g.add(cyl(r * 0.48, 0.0008, m.dark, v3(0, len / 2 + 0.0001, 0), 'y', 6)); // hex socket
  return g;
}

/** Clamp round the bar: a ring plus a bolted cap behind it. */
function barClamp(m: Mats, width: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const zc = width / 2;
  g.add(cyl(CLAMP_R, width, mat, v3(0, 0, zc), 'z', 28));
  g.add(box([0.009, 0.042, width], 0.003, mat, v3(-CLAMP_R - 0.0035, 0, zc)));
  // Split line between the perch and its cap.
  g.add(box([0.0012, 0.044, width + 0.0004], 0.0004, m.dark, v3(-CLAMP_R + 0.0002, 0, zc)));
  for (const y of [-0.0145, 0.0145]) {
    const s = capScrew(m, 0.0042, 0.006);
    s.rotation.z = Math.PI / 2; // head faces the rider (-X)
    s.position.set(-CLAMP_R - 0.011, y, zc);
    g.add(s);
  }
  return g;
}

/**
 * Forged lever blade around its pivot (the origin). Top-view outline in
 * (forward, outward) coordinates, extruded vertically, then bent: the blade
 * leaves the pivot boss smoothly and bows away from the bar through the middle,
 * curves progressively down, and tapers toward the tip, which ends in a safety ball.
 */
function leverBlade(
  m: Mats,
  length: number,
  drop: number,
  bow: number,
  tipBack: number,
  thick = 0.011,
): THREE.Group {
  const L = length;
  const tb = tipBack;
  const root = 0.03;
  const N = 16;
  // The bend needs vertices along the long edges, so sample them.
  const edge = (x0: number, s0: number, x1: number, s1: number): Pt[] =>
    Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      return [x0 + (x1 - x0) * t, s0 + (s1 - s0) * t, 0.002];
    });
  const shape = roundedPoly([
    [0.004, -0.012, 0.008],
    [0.017, -0.002, 0.008],
    ...edge(0.017, 0.03, 0.011 - tb, L - 0.004),
    [0.011 - tb, L, 0.003],
    [0.002 - tb, L, 0.003],
    ...edge(0.002 - tb, L - 0.004, 0.005, 0.04),
    [0.001, 0.021, 0.012],
    [-0.012, 0.003, 0.006],
    [-0.009, -0.01, 0.006],
  ]);
  /** Bend at outward distance s: forward bow (dx) and downward curve (dy). */
  const bend = (s: number) => {
    const u = Math.min(1, Math.max(0, (s - root) / (L - root)));
    return {
      u,
      // sin² leaves the boss with zero slope (no kink or dip at the pivot),
      // bows away from the bar through the middle and eases back at the tip.
      dx: bow * Math.sin(Math.PI * u) ** 2,
      dy: -drop * Math.pow(u, 1.8),
    };
  };
  const blade = extrude(shape, thick, m.leverAlloy, 0.0015, (pos) => {
    for (let i = 0; i < pos.count; i++) {
      const { u, dx, dy } = bend(pos.getY(i)); // outline Y = outward
      pos.setX(i, pos.getX(i) + dx);
      // Thinner toward the tip; extrusion Z becomes -Y after the rotation below.
      pos.setZ(i, pos.getZ(i) * (1 - 0.3 * u) - dy);
    }
  });
  blade.geometry.rotateX(Math.PI / 2); // outline Y → +Z (outward), extrusion → vertical

  const g = new THREE.Group();
  g.add(blade);
  // Finger grooves: shallow ribs standing just proud of the blade's back face.
  for (let i = 0; i < 4; i++) {
    const s = root + 0.03 + i * 0.02;
    const { u, dx, dy } = bend(s);
    const back = 0.005 - (0.003 + tb) * ((s - 0.04) / (L - 0.04)) - 0.0015 - 0.0004;
    g.add(box([0.0016, thick * (1 - 0.3 * u) - 0.003, 0.003], 0.0006, m.leverAlloy, v3(back + dx, dy, s)));
  }
  const tip = bend(L);
  g.add(mesh(new THREE.SphereGeometry(0.0068, 20, 14), m.leverAlloy).translateX(0.0065 - tb + tip.dx).translateY(tip.dy).translateZ(L));
  return g;
}

/** Pivot bolt through the perch ears, with a head on top and a nut underneath. */
function pivotBolt(m: Mats, p: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.0034, 0.025, m.steel, p, 'y', 12));
  g.add(cyl(0.0058, 0.0028, m.steel, v3(p.x, p.y + 0.0108, p.z), 'y', 20));
  g.add(cyl(0.0026, 0.0006, m.dark, v3(p.x, p.y + 0.0125, p.z), 'y', 6));
  g.add(cyl(0.0063, 0.0042, m.steel, v3(p.x, p.y - 0.0115, p.z), 'y', 6));
  return g;
}

/** Upper and lower ears that hold the lever's pivot. */
function ears(mat: THREE.Material, from: number, pivot: THREE.Vector3, width: number): THREE.Group {
  const g = new THREE.Group();
  const len = pivot.x + 0.012 - from;
  for (const y of [-0.0079, 0.0079]) {
    g.add(box([len, 0.0036, width], 0.0015, mat, v3(from + len / 2, y, pivot.z)));
  }
  return g;
}

/** Front brake: perch with integral master cylinder, reservoir, banjo and adjustable lever. */
export function createBrakeLever(m: Mats): BarControl {
  const group = new THREE.Group();
  group.name = 'brakeLever';
  const g = new THREE.Group();
  g.rotation.z = -TILT;
  group.add(g);

  const W = 0.028;
  const zc = W / 2;
  g.add(barClamp(m, W, m.leverBody));

  // Master cylinder: body forward of the bar, bore protruding inboard to the banjo.
  g.add(box([0.044, 0.026, W], 0.005, m.leverBody, v3(0.02, -0.002, zc)));
  g.add(cyl(0.0105, 0.031, m.leverBody, v3(0.031, -0.004, 0.0005), 'z', 22));
  g.add(cyl(0.0112, 0.002, m.leverBody, v3(0.031, -0.004, -0.0142), 'z', 22)); // bore lip

  // Banjo fitting: bolt, eye and a short stem angled down for the hose.
  g.add(cyl(0.0085, 0.0075, m.steel, v3(0.031, -0.004, -0.0195), 'z', 22));
  g.add(cyl(0.0062, 0.0045, m.steel, v3(0.031, -0.004, -0.0255), 'z', 6));
  g.add(cyl(0.0094, 0.0009, m.steel, v3(0.031, -0.004, -0.0153), 'z', 22)); // crush washer
  const stem = cyl(0.0042, 0.016, m.steel, v3(0.034, -0.017, -0.0195), 'y', 12);
  stem.rotation.z = -0.25;
  g.add(stem);
  const port = new THREE.Object3D();
  port.position.set(0.036, -0.025, -0.0195);
  g.add(port);

  // Reservoir with a screwed-down cap and a sight glass facing the rider.
  g.add(box([0.04, 0.019, W + 0.004], 0.004, m.leverBody, v3(0.017, 0.02, zc)));
  g.add(box([0.037, 0.0032, W + 0.001], 0.0014, m.anodized, v3(0.017, 0.0308, zc)));
  for (const x of [0.0035, 0.0305]) g.add(cyl(0.0021, 0.0012, m.steel, v3(x, 0.0328, zc), 'y', 12));
  g.add(cyl(0.0052, 0.0016, m.leverBody, v3(-0.0032, 0.02, zc), 'x', 24)); // bezel
  g.add(cyl(0.0043, 0.0018, m.sightGlass, v3(-0.0035, 0.02, zc), 'x', 24));

  // Lever on its pivot, with a reach adjuster at the front of the boss.
  const pivot = v3(0.054, 0, 0.016);
  g.add(ears(m.leverBody, 0.04, pivot, 0.022));
  g.add(pivotBolt(m, pivot));
  const lever = leverBlade(m, 0.15, 0.024, 0.011, 0.004);
  lever.position.copy(pivot);
  g.add(lever);
  g.add(cyl(0.0022, 0.006, m.steel, v3(pivot.x + 0.019, 0, pivot.z - 0.004), 'x', 10));
  g.add(knurled(0.0058, 0.0075, m.anodized, v3(pivot.x + 0.0245, 0, pivot.z - 0.004), 'x'));
  // Rubber boot over the pushrod between lever and master cylinder.
  g.add(cyl(0.0045, 0.006, m.rubber, v3(0.044, -0.002, 0.024), 'x', 14));

  return { group, port };
}

/** Clutch: cable perch with a knurled barrel adjuster and lever. */
export function createClutchLever(m: Mats): BarControl {
  const group = new THREE.Group();
  group.name = 'clutchLever';
  const g = new THREE.Group();
  g.rotation.z = -TILT;
  group.add(g);

  const W = 0.026;
  const zc = W / 2;
  g.add(barClamp(m, W, m.leverBody));
  g.add(box([0.036, 0.022, W], 0.005, m.leverBody, v3(0.017, 0, zc)));

  // Cable entry on the inboard side: boss, lock ring, adjuster barrel.
  const cx = 0.034;
  g.add(cyl(0.0068, 0.008, m.leverBody, v3(cx, 0, 0.001), 'z', 20));
  g.add(knurled(0.0072, 0.0028, m.steel, v3(cx, 0, -0.0045), 'z', 10));
  g.add(knurled(0.0062, 0.012, m.anodized, v3(cx, 0, -0.0123), 'z'));
  g.add(cyl(0.0035, 0.004, m.steel, v3(cx, 0, -0.02), 'z', 12)); // ferrule
  const port = new THREE.Object3D();
  port.position.set(cx, 0, -0.022);
  g.add(port);

  const pivot = v3(0.047, 0, 0.014);
  g.add(ears(m.leverBody, 0.03, pivot, 0.02));
  g.add(pivotBolt(m, pivot));
  const lever = leverBlade(m, 0.158, 0.028, 0.012, 0.004);
  lever.position.copy(pivot);
  g.add(lever);
  // Inner cable and its nipple seated in the lever.
  g.add(cyl(0.0011, 0.012, m.steel, v3(cx, 0, 0.011), 'z', 6));
  g.add(cyl(0.0032, 0.0075, m.steel, v3(pivot.x - 0.006, 0, pivot.z - 0.0005), 'y', 12));

  return { group, port };
}

/** Engine stop button on its own small clamp. Same bar-local frame. */
export function createKillSwitch(m: Mats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'killSwitch';
  const W = 0.016;
  g.add(cyl(0.0172, W, m.leverBody, v3(0, 0, W / 2), 'z', 24));
  const pod = new THREE.Group();
  pod.rotation.z = 0.5; // button faces up and forward
  pod.add(box([0.016, 0.016, W - 0.002], 0.004, m.leverBody, v3(0.017, 0, W / 2)));
  pod.add(cyl(0.0058, 0.005, m.killRed, v3(0.0265, 0, W / 2), 'x', 20));
  g.add(pod);
  return g;
}
