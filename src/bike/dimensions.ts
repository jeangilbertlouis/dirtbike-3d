import { Vector2 } from 'three';

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * All bike proportions in metres. Coordinate system:
 *   +x = forward, +y = up, +z = rider's right. Ground at y = 0, origin mid-wheelbase.
 */
export const DIM = {
  wheelbase: 1.48,
  front: {
    radius: 0.345, // 21" wheel
    width: 0.085,
    rimRadius: 0.268,
    knobHeight: 0.014,
    hubWidth: 0.1,
    discRadius: 0.13,
    spokes: 36,
  },
  rear: {
    radius: 0.33, // 18" wheel
    width: 0.112,
    rimRadius: 0.229,
    knobHeight: 0.017,
    hubWidth: 0.13,
    discRadius: 0.12,
    spokes: 36,
  },
  rake: deg(27),
  forkOffset: 0.022,
  /** Distance from front axle to head-tube centre, measured along the steering axis. */
  headLength: 0.77,
  forkHalfSpacing: 0.095,
  swingarmPivot: new Vector2(-0.17, 0.49),
  swingarmHalfWidth: 0.095,
  countershaft: new Vector2(-0.09, 0.44),
  chainZ: -0.118,
  rearSprocket: { radius: 0.105, teeth: 50 },
  frontSprocket: { radius: 0.034, teeth: 13 },
  shockTop: new Vector2(-0.13, 0.82),
  /** Shock lower mount, in swingarm-local space. */
  shockSwingarmMount: new Vector2(-0.14, -0.07),
};

export type WheelSpec = typeof DIM.front;

export const frontAxle = new Vector2(DIM.wheelbase / 2, DIM.front.radius);
export const rearAxle = new Vector2(-DIM.wheelbase / 2, DIM.rear.radius);

/** Head-tube centre in chassis space, derived from the front axle, rake and offset. */
export const headCenter = (() => {
  const a = DIM.rake;
  const o = DIM.forkOffset;
  const L = DIM.headLength;
  // Axle sits at (o, -L) in steering-local space; rotate that by the rake angle.
  const dx = o * Math.cos(a) + L * Math.sin(a);
  const dy = o * Math.sin(a) - L * Math.cos(a);
  return new Vector2(frontAxle.x - dx, frontAxle.y - dy);
})();
