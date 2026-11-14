import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Mats } from './materials';
import { axisZ, mesh, rod, tube, v3 } from './util';

const rbox = (w: number, h: number, d: number, r: number) =>
  new RoundedBoxGeometry(w, h, d, 3, r);

/** Single-cylinder four-stroke: crankcase, cylinder, head, covers, levers, skid plate. */
export function createEngine(m: Mats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'engine';

  const crank = mesh(rbox(0.34, 0.24, 0.2, 0.04), m.engine);
  crank.position.set(0.05, 0.47, 0);
  g.add(crank);

  // Clutch cover (right) and ignition cover (left), with bolt rings.
  const covers: [number, number, number, number][] = [
    [0.07, 0.46, 1, 0.095],
    [-0.02, 0.5, -1, 0.075],
  ];
  for (const [x, y, s, r] of covers) {
    const cover = mesh(axisZ(new THREE.CylinderGeometry(r, r * 1.04, 0.03, 40)), m.engineCover);
    cover.position.set(x, y, s * 0.105);
    g.add(cover);
    const boss = mesh(axisZ(new THREE.CylinderGeometry(r * 0.45, r * 0.5, 0.012, 32)), m.engine);
    boss.position.set(x, y, s * 0.125);
    g.add(boss);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const bolt = mesh(axisZ(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 6)), m.steel);
      bolt.position.set(x + r * 0.86 * Math.cos(a), y + r * 0.86 * Math.sin(a), s * 0.122);
      g.add(bolt);
    }
  }

  // Cylinder, leaning forward.
  const cyl = new THREE.Group();
  cyl.position.set(0.11, 0.58, 0);
  cyl.rotation.z = -0.17;
  g.add(cyl);
  const block = mesh(rbox(0.13, 0.14, 0.12, 0.015), m.engine);
  block.position.y = 0.07;
  cyl.add(block);
  for (let k = 0; k < 5; k++) {
    const fin = mesh(rbox(0.16, 0.006, 0.15, 0.002), m.engine);
    fin.position.y = 0.02 + k * 0.025;
    cyl.add(fin);
  }
  const head = mesh(rbox(0.15, 0.09, 0.14, 0.02), m.engine);
  head.position.y = 0.185;
  cyl.add(head);
  const valveCover = mesh(rbox(0.13, 0.045, 0.12, 0.015), m.engineCover);
  valveCover.position.y = 0.25;
  cyl.add(valveCover);
  const plug = mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.04, 12), m.dark);
  plug.position.set(0.0, 0.29, 0);
  cyl.add(plug);

  // Throttle body / intake into the airbox.
  g.add(tube([v3(0.06, 0.77, 0), v3(-0.04, 0.78, 0), v3(-0.18, 0.79, 0)], 0.03, m.dark, 16));

  // Shift lever (left) and rear brake pedal (right).
  g.add(tube([v3(-0.04, 0.45, -0.115), v3(-0.02, 0.43, -0.15), v3(0.05, 0.4, -0.165)], 0.007, m.steel, 16));
  g.add(rod(v3(0.05, 0.4, -0.15), v3(0.05, 0.4, -0.19), 0.008, m.steel));
  g.add(tube([v3(-0.12, 0.41, 0.165), v3(-0.02, 0.385, 0.17), v3(0.07, 0.37, 0.175)], 0.007, m.steel, 16));
  const pedal = mesh(rbox(0.03, 0.012, 0.04, 0.004), m.steel);
  pedal.position.set(0.075, 0.372, 0.185);
  g.add(pedal);

  // Skid plate under the cradle.
  const skid = mesh(rbox(0.36, 0.012, 0.17, 0.005), m.dark);
  skid.position.set(0.03, 0.288, 0);
  g.add(skid);
  const skidFront = mesh(rbox(0.11, 0.012, 0.17, 0.005), m.dark);
  skidFront.position.set(0.235, 0.33, 0);
  skidFront.rotation.z = 0.95;
  g.add(skidFront);

  return g;
}

/** Header pipe wrapping around the right side into a high-mounted silencer. */
export function createExhaust(m: Mats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'exhaust';
  g.add(
    tube(
      [
        v3(0.205, 0.735, 0.0),
        v3(0.26, 0.73, 0.03),
        v3(0.3, 0.66, 0.085),
        v3(0.3, 0.55, 0.13),
        v3(0.25, 0.47, 0.17),
        v3(0.12, 0.46, 0.195),
        v3(-0.08, 0.52, 0.2),
        v3(-0.26, 0.6, 0.2),
        v3(-0.38, 0.64, 0.2),
      ],
      0.021,
      m.header,
      120,
    ),
  );

  const a = v3(-0.38, 0.64, 0.2);
  const b = v3(-0.86, 0.79, 0.2);
  const dir = b.clone().sub(a).normalize();
  g.add(rod(a.clone().addScaledVector(dir, -0.02), a.clone().addScaledVector(dir, 0.04), 0.026, m.header, 20, 0.05));
  g.add(rod(a.clone().addScaledVector(dir, 0.04), b, 0.05, m.silencer, 32, 0.047));
  g.add(rod(b, b.clone().addScaledVector(dir, 0.035), 0.047, m.dark, 32, 0.03));
  g.add(rod(b.clone().addScaledVector(dir, 0.02), b.clone().addScaledVector(dir, 0.06), 0.014, m.header, 16));
  const bandAt = a.clone().lerp(b, 0.62);
  g.add(rod(bandAt.clone().addScaledVector(dir, -0.012), bandAt.clone().addScaledVector(dir, 0.012), 0.053, m.dark, 32));
  return g;
}

/** Left/right radiators with hoses into the cylinder head. */
export function createRadiators(m: Mats): { obj: THREE.Group; side: number }[] {
  return [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.name = s > 0 ? 'radiatorRight' : 'radiatorLeft';
    const core = new THREE.Group();
    core.position.set(0.265, 0.79, s * 0.115);
    core.rotation.y = -s * 0.35;
    const box = mesh(rbox(0.035, 0.22, 0.14, 0.006), m.radiator);
    core.add(box);
    for (let k = 0; k < 9; k++) {
      const louver = mesh(new THREE.BoxGeometry(0.004, 0.2, 0.003), m.engine);
      louver.position.set(0.019, 0, -0.06 + k * 0.015);
      core.add(louver);
    }
    g.add(core);
    g.add(tube([v3(0.24, 0.69, s * 0.08), v3(0.19, 0.67, s * 0.06), v3(0.16, 0.72, s * 0.04)], 0.011, m.rubber, 16));
    return { obj: g, side: s };
  });
}
