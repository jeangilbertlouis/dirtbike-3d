import * as THREE from 'three';
import { createBody } from './body';
import { DIM, frontAxle, rearAxle } from './dimensions';
import { createEngine, createExhaust, createRadiators } from './engine';
import { createFrame } from './frame';
import { createFrontEnd, type FrontEnd } from './forks';
import type { Mats } from './materials';
import { createShock, type Shock } from './shock';
import { createSwingarm, type Swingarm } from './swingarm';
import { NumberPlates } from './textures';

interface Part {
  obj: THREE.Object3D;
  base: THREE.Vector3;
  offset: THREE.Vector3;
}

export type BikeMode = 'ride' | 'showroom';

export interface BikeState {
  mode: BikeMode;
  /** Ground speed in km/h (drives wheel spin, and terrain travel in ride mode). */
  speed: number;
  /** Suspension demo bounce (showroom only). */
  bounce: boolean;
  /** Steering angle in degrees. */
  steer: number;
  /** Exploded view, 0 = assembled, 1 = fully exploded. */
  explode: number;
}

/** Where each tyre meets the ground, for effects like dust. */
export interface ContactInfo {
  front: boolean;
  rear: boolean;
  frontGroundY: number;
  rearGroundY: number;
  /** Gap between each tyre and the ground when it is in the air (m). */
  frontGap: number;
  rearGap: number;
}

// Showroom bounce demo.
const FRONT_TRAVEL = 0.045; // m of fork travel
const REAR_TRAVEL = 0.07; // rad of swingarm rotation

// Ride model: a sprung chassis (heave + pitch) on two suspension units, each with
// its own unsprung mass (wheel, brake, fork lowers / swingarm share) riding on a
// springy tyre. All forces are per unit of total bike + rider mass.
const G = 9.81;
const MU_F = 0.065; // front unsprung mass fraction
const MU_R = 0.085; // rear unsprung mass fraction
const MS = 1 - MU_F - MU_R; // sprung mass fraction
const K = 79; // spring rate per wheel -> ~2 Hz body bounce
const D0 = (MS * G) / (2 * K); // static sag: each spring carries half the sprung weight
const EXTENSION = 0.11; // stroke available below static sag (top-out)
const TRAVEL_F = 0.22; // stroke above static sag before the bump stop
const TRAVEL_R = 0.25;
const K_BOTTOM = 2500; // bump-stop stiffness
const C_BOTTOM = 60; // hydraulic bottoming: extra compression damping in the last 4 cm
const K_TIRE = 900; // tyre vertical stiffness, ~11x the spring
const C_TIRE = 3; // tyre damping
/** Static tyre squash at a wheel with unsprung fraction `mu`. */
const tireSag = (mu: number) => ((MS * G) / 2 + mu * G) / K_TIRE;
// Dampers are digressive: above the knee speed the shim stack opens and the force
// rises more slowly, so sharp hits are absorbed without the bike feeling rigid.
const KNEE_COMP = 0.6; // m/s
const KNEE_REB = 0.8;
const BLOWOFF = 0.4; // slope above the knee, relative to below it
const RG2 = 0.45; // pitch radius of gyration squared (m^2) of bike + rider (~0.67 m)
// Rider in the air: body weight and throttle/brake steer pitch toward the ground slope
// below, so the bike lands roughly parallel to the landing instead of nose-diving.
const RIDER_K = 14; // rad/s^2 per rad of pitch error
const RIDER_C = 6; // 1/s pitch-rate damping
const SUBSTEP = 1 / 240;

/** Damper settings (per unit mass). Tunable from the GUI. */
export interface Damping {
  /** Low-speed compression damping. */
  compression: number;
  /**
   * Low-speed rebound damping. Also sets how fast the wheels extend in the air and
   * drop into dips: too much and they skip over the ground ("packing down").
   */
  rebound: number;
}

/**
 * Tuned on the three terrains: no bottoming on the motocross jumps, balanced
 * front/rear air off the double, and only small skips over crests at speed.
 */
export const DEFAULT_DAMPING: Damping = { compression: 12, rebound: 10 };

/** Damper force for stroke speed v (positive = compressing). */
function damperForce(v: number, d: Damping): number {
  if (v >= 0) {
    const c = d.compression;
    return v < KNEE_COMP ? c * v : c * (KNEE_COMP + BLOWOFF * (v - KNEE_COMP));
  }
  const c = d.rebound;
  const u = -v;
  return -(u < KNEE_REB ? c * u : c * (KNEE_REB + BLOWOFF * (u - KNEE_REB)));
}

/** One suspension unit: wheel (axle) height and vertical speed in world space. */
interface Wheel {
  y: number;
  v: number;
  /** Axle height at which the tyre just touches the ground, last substep. */
  prevT: number;
  /** Stroke relative to static sag (+ = compressed). */
  s: number;
  touching: boolean;
}

/**
 * Assembles the procedural parts into one rig:
 *
 *   DirtBike (root)
 *   └── chassis (heaves/pitches with suspension)
 *       ├── frame, engine, exhaust, radiators, body plastics, shock
 *       ├── frontEnd pivot → steer → slider → front wheel
 *       └── swingarm pivot → rear wheel, chain, sprockets
 */
export class DirtBike {
  readonly root = new THREE.Group();
  readonly chassis = new THREE.Group();
  readonly plates = new NumberPlates('27');
  readonly state: BikeState = { mode: 'ride', speed: 25, bounce: true, steer: 0, explode: 0 };

  /** Ground height at a track position (ride mode). Set by whoever owns the terrain. */
  ground: ((trackX: number) => number) | null = null;
  /** Distance travelled along the track, in metres. */
  distance = 0;
  readonly contact: ContactInfo = { front: true, rear: true, frontGroundY: 0, rearGroundY: 0, frontGap: 0, rearGap: 0 };

  private parts: Part[] = [];
  private front: FrontEnd;
  private swing: Swingarm;
  private shock: Shock;
  private shockPart: Part;
  private time = 0;
  private explodeEased = 0;
  /** Suspension damper settings; edit live. */
  readonly damping: Damping = { ...DEFAULT_DAMPING };
  private ride = {
    init: false,
    Y: 0,
    V: 0,
    th: 0,
    W: 0,
    f: { y: 0, v: 0, prevT: 0, s: 0, touching: true } as Wheel,
    r: { y: 0, v: 0, prevT: 0, s: 0, touching: true } as Wheel,
  };

  constructor(m: Mats) {
    this.root.name = 'DirtBike';
    this.chassis.name = 'chassis';
    this.root.add(this.chassis);

    const body = createBody(m, this.plates);
    this.front = createFrontEnd(m, body.frontFender, body.frontPlate);
    this.swing = createSwingarm(m);
    this.shock = createShock(m);

    this.add(createFrame(m), [0, 0.3, 0]);
    this.add(createEngine(m), [0, 0, 0]);
    this.add(createExhaust(m), [0, 0.1, 0.45]);
    for (const r of createRadiators(m)) this.add(r.obj, [0.1, 0.3, r.side * 0.35]);
    this.add(body.airbox, [-0.1, 0.45, 0]);
    this.add(body.tank, [0, 0.55, 0]);
    this.add(body.seat, [0, 0.75, 0]);
    this.add(body.rearFender, [-0.25, 0.5, 0]);
    for (const s of body.shrouds) this.add(s.obj, [0, 0.3, s.side * 0.35]);
    for (const p of body.sidePanels) this.add(p.obj, [0, 0.3, p.side * 0.35]);
    this.add(this.front.pivot, [0.45, 0.1, 0]);
    this.add(this.swing.group, [-0.4, 0, 0]);
    this.shockPart = this.add(this.shock.group, [0, 0.35, 0]);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.update(0);
  }

  /** Re-seat the bike on the ground (e.g. after the terrain changes under it). */
  resetRide(): void {
    this.ride.init = false;
  }

  private add(obj: THREE.Object3D, offset: [number, number, number]): Part {
    const part = { obj, base: obj.position.clone(), offset: new THREE.Vector3(...offset) };
    this.parts.push(part);
    this.chassis.add(obj);
    return part;
  }

  update(dt: number): void {
    const s = this.state;
    this.time += dt;

    // Wheel spin from ground speed: ω = v / r.
    const v = s.speed / 3.6;
    const wr = v / DIM.rear.radius;
    this.front.wheel.spin.rotation.z -= (v / DIM.front.radius) * dt;
    this.swing.wheel.spin.rotation.z -= wr * dt;
    this.swing.frontSprocket.rotation.z -=
      wr * (DIM.rearSprocket.teeth / DIM.frontSprocket.teeth) * dt;
    this.swing.chain.advance(wr * DIM.rearSprocket.radius * dt);

    let fComp: number;
    let swingAngle: number;
    let steer = s.steer;

    if (s.mode === 'ride' && this.ground) {
      ({ fComp, swingAngle } = this.stepRide(dt, v, this.ground));
      // A little rider input so it doesn't look like it's on rails.
      steer += 3 * Math.sin(this.time * 0.9) + 1.5 * Math.sin(this.time * 2.3);
    } else {
      this.ride.init = false;
      let rComp = 0;
      fComp = 0;
      if (s.bounce) {
        fComp = FRONT_TRAVEL * (0.5 + 0.5 * Math.sin(this.time * 2.4));
        rComp = REAR_TRAVEL * (0.5 + 0.5 * Math.sin(this.time * 2.4 - 0.6));
      }
      swingAngle = this.swing.baseAngle - rComp;
      // Keep both tyres on the floor: drop and pitch the chassis by what the wheels rose.
      const L = this.swing.length;
      const dropF = fComp * Math.cos(DIM.rake);
      const dropR = L * (Math.sin(this.swing.baseAngle) - Math.sin(swingAngle));
      this.chassis.position.y = -(dropF + dropR) / 2;
      this.chassis.rotation.z = (dropR - dropF) / DIM.wheelbase;
      Object.assign(this.contact, { front: true, rear: true, frontGroundY: 0, rearGroundY: 0, frontGap: 0, rearGap: 0 });
    }

    this.front.slider.position.y = fComp;
    this.swing.group.rotation.z = swingAngle;
    this.front.steer.rotation.y = THREE.MathUtils.degToRad(steer);

    // Exploded view (eased toward the target).
    this.explodeEased += (s.explode - this.explodeEased) * Math.min(1, dt * 8 || 1);
    const e = THREE.MathUtils.smoothstep(this.explodeEased, 0, 1);
    for (const p of this.parts) p.obj.position.copy(p.base).addScaledVector(p.offset, e);

    // Shock follows the swingarm (computed from unexploded geometry, then offset).
    const mnt = DIM.shockSwingarmMount.clone().rotateAround(new THREE.Vector2(), swingAngle);
    const P = DIM.swingarmPivot;
    this.shock.setEnds(
      new THREE.Vector3(DIM.shockTop.x, DIM.shockTop.y, 0),
      new THREE.Vector3(P.x + mnt.x, P.y + mnt.y, 0),
    );
    this.shock.group.position.addScaledVector(this.shockPart.offset, e);
  }

  /**
   * Integrates the sprung chassis (heave + pitch) and both unsprung wheels over
   * the terrain, and returns the rig's fork compression (along the steering axis)
   * and swingarm angle.
   *
   * Each suspension unit is a spring and damper between the chassis and its wheel;
   * the wheel rides on a tyre spring over the ground. The damper acts on stroke
   * speed whether or not the tyre is touching, so in the air the forks extend at
   * the rebound-damped rate instead of snapping open. The damper term is solved
   * implicitly on the light wheel, so stiff settings stay stable.
   */
  private stepRide(dt: number, v: number, ground: (x: number) => number) {
    const r = this.ride;
    const d = this.damping;
    const rf = DIM.front.radius;
    const rr = DIM.rear.radius;
    const fx = frontAxle.x;
    const fy = frontAxle.y;
    const rx = rearAxle.x;
    const ry = rearAxle.y;

    // Axle height at which a wheel of radius `rad` just touches the ground under it.
    const contactY = (x: number, rad: number) => {
      let best = -Infinity;
      for (let k = -4; k <= 4; k++) {
        const dx = (k / 4) * rad * 0.9;
        best = Math.max(best, ground(this.distance + x + dx) + Math.sqrt(rad * rad - dx * dx));
      }
      return best;
    };
    // Where the axle would be at static sag, and how fast that point is moving.
    const mount = (x: number, y: number) => {
      const sn = Math.sin(r.th);
      const cs = Math.cos(r.th);
      return { y: x * sn + y * cs + r.Y, v: r.V + r.W * (x * cs - y * sn) };
    };

    if (!r.init) {
      const tf = contactY(fx, rf);
      const tr = contactY(rx, rr);
      r.Y = (tf - fy + tr - ry) / 2;
      r.th = (tf - fy - (tr - ry)) / (fx - rx);
      r.V = r.W = 0;
      Object.assign(r.f, { y: tf - tireSag(MU_F), v: 0, prevT: tf, s: 0, touching: true });
      Object.assign(r.r, { y: tr - tireSag(MU_R), v: 0, prevT: tr, s: 0, touching: true });
      r.init = true;
    }

    /** Advance one wheel by h; returns the suspension force it puts on the chassis. */
    const stepWheel = (w: Wheel, x: number, y: number, rad: number, mu: number, travel: number, h: number) => {
      const T = contactY(x, rad);
      const m = mount(x, y);
      const s = w.y - m.y;
      const sv = w.v - m.v;

      // Tyre: a stiff spring (preloaded by its static squash) that can only push.
      const pen = T - w.y + tireSag(mu);
      const tyreV = (T - w.prevT) / h - w.v;
      w.prevT = T;
      w.touching = pen > 0;
      const fTyre = w.touching ? Math.max(0, K_TIRE * pen + C_TIRE * tyreV) : 0;

      // Spring (pushes only once compressed past its free length) and bump stop.
      let fSpring = s > -D0 ? K * (s + D0) : 0;
      if (s > travel) fSpring += K_BOTTOM * (s - travel);

      // Damper, linearised about the current stroke speed and solved implicitly.
      let c = Math.abs(sv) > 1e-4 ? damperForce(sv, d) / sv : sv >= 0 ? d.compression : d.rebound;
      if (sv > 0) c += C_BOTTOM * THREE.MathUtils.smoothstep(s, travel - 0.04, travel);
      const nv = (w.v + (h * (fTyre - fSpring - mu * G + c * m.v)) / mu) / (1 + (h * c) / mu);
      const fDamper = c * (nv - m.v);
      w.v = nv;
      w.y += nv * h;
      return fSpring + fDamper;
    };

    /**
     * Hard stops at full extension and just past the bump stop: the wheel is carried
     * with the chassis, and the momentum it had relative to it goes into the chassis
     * (the clunk when a fork tops out).
     */
    const limit = (w: Wheel, x: number, y: number, mu: number, travel: number) => {
      const m = mount(x, y);
      w.s = w.y - m.y;
      const lo = -EXTENSION;
      const hi = travel + 0.03;
      if (w.s >= lo && w.s <= hi) return;
      w.s = THREE.MathUtils.clamp(w.s, lo, hi);
      w.y = m.y + w.s;
      const J = (mu * (w.v - m.v)) / MS; // velocity change of the sprung mass
      r.V += J;
      r.W += (J * x) / RG2;
      w.v = m.v;
    };

    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.distance += v * h;
      const fF = stepWheel(r.f, fx, fy, rf, MU_F, TRAVEL_F, h);
      const fR = stepWheel(r.r, rx, ry, rr, MU_R, TRAVEL_R, h);

      r.V += ((fF + fR) / MS - G) * h;
      r.Y += r.V * h;
      let alpha = (fF * fx + fR * rx) / (MS * RG2);
      // Rider control: full authority with both wheels off the ground,
      // most while only one wheel is touching (the moment the bike leaves a lip or lands).
      if (!r.f.touching || !r.r.touching) {
        const slope = Math.atan2(r.f.prevT - fy - (r.r.prevT - ry), fx - rx);
        const authority = !r.f.touching && !r.r.touching ? 1 : 0.65;
        alpha += authority * (-RIDER_K * (r.th - slope) - RIDER_C * r.W);
      }
      r.W += alpha * h;
      r.th += r.W * h;

      limit(r.f, fx, fy, MU_F, TRAVEL_F);
      limit(r.r, rx, ry, MU_R, TRAVEL_R);
    }

    this.chassis.position.y = r.Y;
    this.chassis.rotation.z = r.th;
    const Tf = r.f.prevT;
    const Tr = r.r.prevT;
    this.contact.front = r.f.touching;
    this.contact.rear = r.r.touching;
    this.contact.frontGroundY = Tf - rf;
    this.contact.rearGroundY = Tr - rr;
    this.contact.frontGap = Math.max(0, r.f.y - Tf);
    this.contact.rearGap = Math.max(0, r.r.y - Tr);

    // Map stroke onto the rig: the fork slides along the steering axis, and the
    // swingarm swings to wherever the rear axle actually is.
    const fComp = THREE.MathUtils.clamp(r.f.s, -EXTENSION, TRAVEL_F) / Math.cos(DIM.rake + r.th);
    const sn = Math.sin(r.th);
    const cs = Math.cos(r.th);
    const rearY = mount(rx, ry).y + THREE.MathUtils.clamp(r.r.s, -EXTENSION, TRAVEL_R);
    const P = DIM.swingarmPivot;
    const k = P.x * sn + P.y * cs + r.Y;
    const swingAngle =
      Math.asin(THREE.MathUtils.clamp((k - rearY) / this.swing.length, -1, 1)) - r.th;
    return { fComp, swingAngle };
  }
}
