import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createChain, type Chain } from './chain';
import { DIM, rearAxle } from './dimensions';
import type { Mats } from './materials';
import { extrude, mesh, rod, roundedPoly, v3 } from './util';
import { createCaliper, createSprocket, createWheel, type Wheel } from './wheels';

export interface Swingarm {
  /** Pivot group: positioned at the swingarm pivot, rotates about Z. */
  group: THREE.Group;
  wheel: Wheel;
  frontSprocket: THREE.Object3D;
  chain: Chain;
  /** Rotation that puts the rear axle at its static position. */
  baseAngle: number;
  length: number;
}

/**
 * Swingarm built in its own space: pivot at the origin, rear axle at (-length, 0).
 * Carries the rear wheel, chain, sprockets and rear caliper.
 */
export function createSwingarm(m: Mats): Swingarm {
  const P = DIM.swingarmPivot;
  const d = new THREE.Vector2().subVectors(rearAxle, P);
  const L = d.length();
  const baseAngle = Math.atan2(-d.y, -d.x);

  const group = new THREE.Group();
  group.name = 'swingarm';
  group.position.set(P.x, P.y, 0);
  group.rotation.z = baseAngle;

  const zA = DIM.swingarmHalfWidth;
  const armShape = roundedPoly(
    [
      [0.04, 0.032],
      [-0.12, 0.036],
      [-L + 0.03, 0.022],
      [-L - 0.045, 0.02],
      [-L - 0.045, -0.02],
      [-L + 0.03, -0.022],
      [-0.12, -0.042],
      [0.04, -0.032],
    ],
    0.015,
  );
  for (const s of [-1, 1]) {
    const arm = extrude(armShape, 0.022, m.frame, 0.004);
    arm.position.z = s * zA;
    group.add(arm);
    const adjuster = mesh(new RoundedBoxGeometry(0.05, 0.03, 0.012, 2, 0.004), m.anodized);
    adjuster.position.set(-L - 0.01, 0, s * (zA + 0.017));
    group.add(adjuster);
  }

  group.add(rod(v3(0, 0, -zA - 0.012), v3(0, 0, zA + 0.012), 0.022, m.frame, 24));
  const brace = mesh(new RoundedBoxGeometry(0.03, 0.05, 2 * zA, 2, 0.008), m.frame);
  brace.position.set(-0.035, 0.012, 0);
  group.add(brace);

  // Linkage under the swingarm where the shock bolts on.
  const mnt = DIM.shockSwingarmMount;
  const link = mesh(new RoundedBoxGeometry(0.06, 0.035, 0.06, 2, 0.008), m.forkLug);
  link.position.set(mnt.x, mnt.y, 0);
  group.add(link);
  for (const s of [-1, 1]) {
    group.add(rod(v3(mnt.x, mnt.y, s * 0.035), v3(-0.05, -0.025, s * 0.06), 0.009, m.forkLug));
  }

  // Chain slider and guide (left side).
  const slider = mesh(new RoundedBoxGeometry(0.18, 0.012, 0.026, 1, 0.004), m.dark);
  slider.position.set(-0.08, 0.04, -zA);
  group.add(slider);
  const guide = mesh(new RoundedBoxGeometry(0.1, 0.05, 0.03, 2, 0.008), m.dark);
  guide.position.set(-L + 0.22, -0.06, DIM.chainZ);
  group.add(guide);

  const wheel = createWheel(DIM.rear, 1, m, {
    radius: DIM.rearSprocket.radius,
    teeth: DIM.rearSprocket.teeth,
    z: DIM.chainZ,
  });
  wheel.group.position.set(-L, 0, 0);
  group.add(wheel.group);

  // Rear caliper hangs below the arm, ahead of the axle (right side).
  const ca = THREE.MathUtils.degToRad(-40);
  const caliper = createCaliper(m);
  caliper.position.set(-L + 0.1 * Math.cos(ca), 0.1 * Math.sin(ca), DIM.rear.hubWidth / 2 + 0.006);
  caliper.rotation.z = ca;
  group.add(caliper);

  // Countershaft sprocket, expressed in swingarm space at the static angle.
  const cs = new THREE.Vector2()
    .subVectors(DIM.countershaft, P)
    .rotateAround(new THREE.Vector2(), -baseAngle);
  const frontSprocket = createSprocket(DIM.frontSprocket.radius, DIM.frontSprocket.teeth, m);
  frontSprocket.position.set(cs.x, cs.y, DIM.chainZ);
  group.add(frontSprocket);

  const chain = createChain(
    cs,
    DIM.frontSprocket.radius + 0.001,
    new THREE.Vector2(-L, 0),
    DIM.rearSprocket.radius + 0.001,
    DIM.chainZ,
    m,
  );
  group.add(chain.group);

  return { group, wheel, frontSprocket, chain, baseAngle, length: L };
}
