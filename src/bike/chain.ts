import * as THREE from 'three';
import type { Mats } from './materials';
import { axisZ } from './util';

/** Chain pitch (m). Rounded so a whole, even number of links fits the loop. */
const PITCH = 0.0135;
const ROLLER_R = 0.0041;
const INNER_W = 0.0066; // gap between the inner plates (roller width)
const PLATE_T = 0.0011;
const PLATE_H = 0.0108;

export interface Chain {
  group: THREE.Group;
  /** Move the chain along its loop by `ds` metres (positive = top run forward). */
  advance(ds: number): void;
}

/** Figure-of-eight side plate: two round lobes over the pins, waisted between them. */
function plateGeometry(pitch: number, h: number, t: number): THREE.BufferGeometry {
  const R = h / 2;
  const w = 0.37 * h; // half-height of the waist
  const a = Math.asin(w / R);
  const ix = pitch / 2 - R * Math.cos(a); // where the lobes meet the waist
  const s = new THREE.Shape();
  s.absarc(pitch / 2, 0, R, -(Math.PI - a), Math.PI - a, false);
  s.quadraticCurveTo(0, w * 0.86, -ix, w);
  s.absarc(-pitch / 2, 0, R, a, 2 * Math.PI - a, false);
  s.quadraticCurveTo(0, -w * 0.86, ix, -w);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: t,
    bevelEnabled: true,
    bevelThickness: 0.0002,
    bevelSize: 0.0002,
    bevelSegments: 1,
    curveSegments: 10,
  });
  geo.translate(0, 0, -t / 2);
  return geo;
}

/**
 * Closed loop round two sprockets: straight top and bottom runs on the outer
 * tangents, wrapping the front sprocket at the front and the rear at the back.
 * Travelling forward along the top run, so both wraps are clockwise.
 */
function loopPath(rear: THREE.Vector2, r2: number, front: THREE.Vector2, r1: number) {
  const d = new THREE.Vector2().subVectors(front, rear);
  const D = d.length();
  const u = d.clone().divideScalar(D);
  const perp = new THREE.Vector2(-u.y, u.x);
  const c = (r2 - r1) / D;
  const sq = Math.sqrt(1 - c * c);
  const nTop = u.clone().multiplyScalar(c).addScaledVector(perp, sq);
  const nBot = u.clone().multiplyScalar(c).addScaledVector(perp, -sq);
  const aTop = Math.atan2(nTop.y, nTop.x);
  const aBot = Math.atan2(nBot.y, nBot.x);
  const TAU = Math.PI * 2;
  const sweepF = (((aTop - aBot) % TAU) + TAU) % TAU; // front wrap, clockwise top → bottom
  const sweepR = TAU - sweepF; // rear wrap, clockwise bottom → top

  const topA = rear.clone().addScaledVector(nTop, r2);
  const topB = front.clone().addScaledVector(nTop, r1);
  const botA = front.clone().addScaledVector(nBot, r1);
  const botB = rear.clone().addScaledVector(nBot, r2);
  const lTop = topA.distanceTo(topB);
  const lF = r1 * sweepF;
  const lBot = botA.distanceTo(botB);
  const lR = r2 * sweepR;
  const length = lTop + lF + lBot + lR;

  const point = (s: number, out: THREE.Vector2) => {
    s = ((s % length) + length) % length;
    if (s < lTop) return out.lerpVectors(topA, topB, s / lTop);
    s -= lTop;
    if (s < lF) {
      const a = aTop - s / r1;
      return out.set(front.x + r1 * Math.cos(a), front.y + r1 * Math.sin(a));
    }
    s -= lF;
    if (s < lBot) return out.lerpVectors(botA, botB, s / lBot);
    s -= lBot;
    const a = aBot - s / r2;
    return out.set(rear.x + r2 * Math.cos(a), rear.y + r2 * Math.sin(a));
  };
  return { length, point };
}

/**
 * Roller chain built link by link: rollers, inner and outer side plates, and
 * pin ends, all instanced. `advance` re-lays the links so the chain runs with
 * the sprockets.
 */
export function createChain(
  front: THREE.Vector2,
  rFront: number,
  rear: THREE.Vector2,
  rRear: number,
  z: number,
  m: Mats,
): Chain {
  const path = loopPath(rear, rRear, front, rFront);
  let n = Math.round(path.length / PITCH);
  if (n % 2) n++; // inner and outer links alternate, so the count must be even
  const step = path.length / n;

  const group = new THREE.Group();
  group.name = 'chain';
  group.position.z = z;

  const plate = plateGeometry(step, PLATE_H, PLATE_T);
  const zInner = INNER_W / 2 + PLATE_T / 2;
  const zOuter = zInner + PLATE_T + 0.0002;
  const inner = new THREE.InstancedMesh(plate, m.chain, n); // n/2 links × 2 sides
  const outer = new THREE.InstancedMesh(plate, m.chainGold, n);
  const rollers = new THREE.InstancedMesh(
    axisZ(new THREE.CylinderGeometry(ROLLER_R, ROLLER_R, INNER_W, 14)),
    m.chain,
    n,
  );
  const pinLen = 2 * (zOuter + PLATE_T / 2) + 0.0012;
  const pins = new THREE.InstancedMesh(
    axisZ(new THREE.CylinderGeometry(0.0021, 0.0021, pinLen, 10)),
    m.steel,
    n,
  );
  for (const im of [inner, outer, rollers, pins]) {
    im.castShadow = true;
    im.frustumCulled = false; // instances move every frame
    group.add(im);
  }

  const pts = Array.from({ length: n + 1 }, () => new THREE.Vector2());
  const dummy = new THREE.Object3D();
  let offset = 0;

  const layout = () => {
    // Shift by whole links of the 2-link pattern so instance roles never swap.
    const phase = ((offset % (2 * step)) + 2 * step) % (2 * step);
    for (let i = 0; i <= n; i++) path.point(i * step + phase, pts[i]);
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      // Roller and pin at each joint.
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(a.x, a.y, 0);
      dummy.updateMatrix();
      rollers.setMatrixAt(i, dummy.matrix);
      pins.setMatrixAt(i, dummy.matrix);
      // Side plates span the chord between neighbouring joints.
      dummy.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      const im = i % 2 ? outer : inner;
      const zp = i % 2 ? zOuter : zInner;
      const k = i - (i % 2); // two plates per link: slots k and k + 1
      for (const side of [0, 1]) {
        dummy.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, side ? zp : -zp);
        dummy.updateMatrix();
        im.setMatrixAt(k + side, dummy.matrix);
      }
    }
    for (const im of [inner, outer, rollers, pins]) im.instanceMatrix.needsUpdate = true;
  };
  layout();

  return {
    group,
    advance(ds: number) {
      if (ds === 0) return;
      offset += ds;
      layout();
    },
  };
}
