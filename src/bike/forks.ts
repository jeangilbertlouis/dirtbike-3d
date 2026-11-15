import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIM, headCenter } from './dimensions';
import { createBrakeLever, createClutchLever, createKillSwitch } from './levers';
import type { Mats } from './materials';
import { mesh, rod, tube, v3 } from './util';
import { createCaliper, createWheel, type Wheel } from './wheels';

export interface FrontEnd {
  /** Fixed to the frame at the head tube, tilted by the rake angle. */
  pivot: THREE.Group;
  /** Rotates about local Y (the steering axis). */
  steer: THREE.Group;
  /** Translates along local Y for fork compression. */
  slider: THREE.Group;
  wheel: Wheel;
}

/**
 * Front end built in steering-local space: +Y is the steering axis, the head tube
 * centre is the origin and the front axle sits at (forkOffset, -headLength).
 */
export function createFrontEnd(m: Mats, fender: THREE.Object3D, plate: THREE.Object3D): FrontEnd {
  const a = DIM.rake;
  const off = DIM.forkOffset;
  const L = DIM.headLength;
  const zL = DIM.forkHalfSpacing;

  const pivot = new THREE.Group();
  pivot.name = 'frontEnd';
  pivot.position.set(headCenter.x, headCenter.y, 0);
  pivot.rotation.z = a;

  const steer = new THREE.Group();
  pivot.add(steer);
  const slider = new THREE.Group();
  steer.add(slider);

  // Convert a world-aligned offset (dx forward, dy up) into steering-local space.
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const local = (base: THREE.Vector3, dx: number, dy: number, z: number) =>
    v3(base.x + dx * ca + dy * sa, base.y - dx * sa + dy * ca, base.z + z);

  // Upside-down fork legs.
  for (const s of [-1, 1]) {
    const z = s * zL;
    steer.add(rod(v3(off, -0.36, z), v3(off, 0.135, z), 0.027, m.forkOuter, 24));
    steer.add(rod(v3(off, 0.135, z), v3(off, 0.152, z), 0.021, m.anodized, 6));
    steer.add(rod(v3(off, -0.378, z), v3(off, -0.355, z), 0.0285, m.dark, 24));

    slider.add(rod(v3(off, -0.74, z), v3(off, -0.3, z), 0.0235, m.gold, 24));
    const lug = mesh(new RoundedBoxGeometry(0.062, 0.11, 0.042, 2, 0.01), m.forkLug);
    lug.position.set(off, -0.765, z);
    slider.add(lug);

    // Plastic fork guard wrapping the front/outer side of the inner tube.
    const start = s > 0 ? 0 : Math.PI * 0.3;
    const guard = mesh(
      new THREE.CylinderGeometry(0.036, 0.038, 0.27, 20, 1, true, start, Math.PI * 0.7),
      m.plasticDS,
    );
    guard.position.set(off, -0.58, z);
    slider.add(guard);
  }

  // Triple clamps and steering stem.
  const clamp = (h: number) => new RoundedBoxGeometry(0.085, h, 2 * zL + 0.075, 3, 0.012);
  const top = mesh(clamp(0.03), m.anodized);
  top.position.set(off * 0.5, 0.1, 0);
  steer.add(top);
  const bottom = mesh(clamp(0.045), m.anodized);
  bottom.position.set(off * 0.5, -0.09, 0);
  steer.add(bottom);
  steer.add(rod(v3(0, -0.12), v3(0, 0.13), 0.017, m.steel));

  // Bar mounts, handlebar, pad, grips and levers.
  for (const s of [-1, 1]) {
    steer.add(rod(v3(0, 0.115, s * 0.05), v3(0, 0.155, s * 0.05), 0.012, m.anodized));
    const cap = mesh(new RoundedBoxGeometry(0.04, 0.022, 0.045, 2, 0.006), m.anodized);
    cap.position.set(-0.004, 0.168, s * 0.05);
    steer.add(cap);
  }
  const barC = v3(-0.004, 0.168, 0);
  const barPts = (
    [
      [-0.1, 0.06, -0.4],
      [-0.06, 0.05, -0.3],
      [-0.01, 0.012, -0.17],
      [0, 0, -0.07],
      [0, 0, 0.07],
      [-0.01, 0.012, 0.17],
      [-0.06, 0.05, 0.3],
      [-0.1, 0.06, 0.4],
    ] as const
  ).map(([dx, dy, z]) => local(barC, dx, dy, z));
  const barCurve = new THREE.CatmullRomCurve3(barPts, false, 'centripetal');
  steer.add(mesh(new THREE.TubeGeometry(barCurve, 80, 0.0143, 12), m.bar));

  const pad = mesh(new RoundedBoxGeometry(0.05, 0.045, 0.2, 3, 0.015), m.accent);
  pad.position.copy(local(barC, 0, 0.03, 0));
  pad.rotation.z = -a;
  steer.add(pad);

  const P = (t: number) => barCurve.getPoint(t);
  for (const [t0, t1] of [
    [0, 0.17],
    [0.83, 1],
  ]) {
    steer.add(rod(P(t0), P(t1), 0.0175, m.rubber, 16));
  }
  steer.add(rod(P(0.795), P(0.83), 0.021, m.dark, 16)); // throttle housing

  // Brake (right) and clutch (left) perches, oriented along the bar where they clamp.
  const upLocal = v3(sa, ca, 0); // world up in steering space
  const tAtZ = (z: number) => {
    let lo = 0.5;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (barCurve.getPoint(mid).z < z) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  /** Mount a bar-local control (built for the right side) at |z| on the bar. */
  const onBar = (obj: THREE.Object3D, z: number, left: boolean) => {
    const t = tAtZ(z);
    const zAx = barCurve.getTangent(t).normalize();
    const yAx = upLocal.clone().addScaledVector(zAx, -upLocal.dot(zAx)).normalize();
    const xAx = new THREE.Vector3().crossVectors(yAx, zAx);
    obj.position.copy(barCurve.getPoint(t));
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx, zAx));
    if (!left) {
      steer.add(obj);
      return;
    }
    const mirror = new THREE.Group();
    mirror.scale.z = -1; // the bar is symmetric, so the left side is a mirror image
    mirror.add(obj);
    steer.add(mirror);
  };
  /** Position of an object's origin in steering space. */
  const inSteer = (o: THREE.Object3D) => {
    const p = new THREE.Vector3();
    for (let n: THREE.Object3D | null = o; n && n !== steer; n = n.parent) {
      n.updateMatrix();
      p.applyMatrix4(n.matrix);
    }
    return p;
  };

  const brake = createBrakeLever(m);
  onBar(brake.group, 0.205, false);
  const clutch = createClutchLever(m);
  onBar(clutch.group, 0.236, true);
  onBar(createKillSwitch(m), 0.212, true);

  // Brake hose: from the banjo, down behind the number plate, clipped to the
  // bottom clamp and the left fork leg on its way to the caliper.
  const bp = inSteer(brake.port);
  steer.add(
    tube(
      [
        bp,
        local(bp, 0.012, -0.03, -0.012),
        v3(0.06, 0.1, 0.08),
        v3(0.062, 0.0, -0.03),
        v3(0.06, -0.09, -0.098),
        v3(0.055, -0.2, -0.104),
        v3(0.052, -0.3, -0.104),
      ],
      0.0042,
      m.hose,
      96,
    ),
  );
  for (const y of [-0.09, -0.3]) {
    steer.add(rod(v3(0.06, y - 0.009, -0.1), v3(0.06, y + 0.009, -0.1), 0.0065, m.dark, 10));
  }

  // Clutch cable: loops forward from the adjuster and back down the left side.
  const cp = inSteer(clutch.port);
  steer.add(
    tube(
      [
        cp,
        local(cp, 0.02, -0.006, 0.03),
        v3(0.05, 0.06, -0.15),
        v3(0.01, -0.06, -0.152),
        v3(-0.04, -0.13, -0.135),
        v3(-0.09, -0.17, -0.12),
      ],
      0.0036,
      m.hose,
      96,
    ),
  );

  // Front fender (mounted to the bottom clamp) and number plate.
  const bracket = mesh(new RoundedBoxGeometry(0.08, 0.06, 0.12, 2, 0.01), m.dark);
  bracket.position.set(0.0, -0.145, 0);
  steer.add(bracket);
  steer.add(fender);
  steer.add(plate);

  // Wheel and caliper ride on the slider.
  const wheel = createWheel(DIM.front, -1, m);
  wheel.group.position.set(off, -L, 0);
  slider.add(wheel.group);

  const cAng = THREE.MathUtils.degToRad(150);
  const caliper = createCaliper(m);
  caliper.position.set(
    off + 0.112 * Math.cos(cAng),
    -L + 0.112 * Math.sin(cAng),
    -(DIM.front.hubWidth / 2 + 0.006),
  );
  caliper.rotation.z = cAng;
  slider.add(caliper);
  slider.add(rod(caliper.position.clone(), v3(off, -L + 0.04, -zL), 0.01, m.forkLug));

  return { pivot, steer, slider, wheel };
}
