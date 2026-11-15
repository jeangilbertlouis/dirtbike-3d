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

// Ride model: a sprung chassis (heave + pitch) on two wheels that follow the ground.
// All forces are per unit mass. Vertical displacements are relative to static sag.
const G = 9.81;
const K = 79; // spring rate per wheel → ~2 Hz body bounce
// Real shocks damp rebound far more than compression; without that the rear spring
// dumps its stored energy at a jump lip and flips the tail up.
const C_COMPRESSION = 6;
const C_REBOUND = 16;
const D0 = G / (2 * K); // static sag: each spring carries half the weight
const EXTENSION = 0.11; // wheel can drop this far below static sag before leaving the ground
const TRAVEL_F = 0.22; // vertical bump travel before bottoming out
const TRAVEL_R = 0.25;
const K_BOTTOM = 2500; // bump-stop stiffness
const RG2 = 0.45; // pitch radius of gyration² (m²) of bike + rider (~0.67 m)
// Rider in the air: body weight and throttle/brake steer pitch toward the ground slope
// below, so the bike lands roughly parallel to the landing instead of nose-diving.
const RIDER_K = 14; // rad/s² per rad of pitch error
const RIDER_C = 6; // 1/s pitch-rate damping
const SUBSTEP = 1 / 240;

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
  private ride = { init: false, Y: 0, V: 0, th: 0, W: 0, prevF: 0, prevR: 0 };

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
   * Integrates chassis heave/pitch over the terrain and returns the rig's
   * fork compression (along the steering axis) and swingarm angle.
   */
  private stepRide(dt: number, v: number, ground: (x: number) => number) {
    const r = this.ride;
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
    const force = (d: number, dd: number, travel: number) => {
      if (d < -D0) return 0; // spring fully extended: no push
      let f = K * (d + D0) + (dd > 0 ? C_COMPRESSION : C_REBOUND) * dd;
      if (d > travel) f += K_BOTTOM * (d - travel);
      return Math.max(0, f);
    };

    if (!r.init) {
      const tf = contactY(fx, rf) - fy;
      const tr = contactY(rx, rr) - ry;
      Object.assign(r, { init: true, Y: (tf + tr) / 2, V: 0, th: (tf - tr) / (fx - rx), W: 0, prevF: 0, prevR: 0 });
    }

    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    let dF = 0;
    let dR = 0;
    let Tf = 0;
    let Tr = 0;
    for (let i = 0; i < steps; i++) {
      this.distance += v * h;
      const sn = Math.sin(r.th);
      const cs = Math.cos(r.th);
      Tf = contactY(fx, rf);
      Tr = contactY(rx, rr);
      dF = Tf - (fx * sn + fy * cs + r.Y);
      dR = Tr - (rx * sn + ry * cs + r.Y);
      const fF = force(dF, (dF - r.prevF) / h, TRAVEL_F);
      const fR = force(dR, (dR - r.prevR) / h, TRAVEL_R);
      r.prevF = dF;
      r.prevR = dR;
      r.V += (fF + fR - G) * h;
      r.Y += r.V * h;
      let alpha = ((fF - fR) * fx) / RG2;
      // Rider control: full authority with both wheels off the ground,
      // most while only one wheel is touching (the moment the bike leaves a lip or lands).
      const offF = dF < -EXTENSION;
      const offR = dR < -EXTENSION;
      if (offF || offR) {
        const slope = Math.atan2(Tf - fy - (Tr - ry), fx - rx);
        const authority = offF && offR ? 1 : 0.65;
        alpha += authority * (-RIDER_K * (r.th - slope) - RIDER_C * r.W);
      }
      r.W += alpha * h;
      r.th += r.W * h;
    }

    this.chassis.position.y = r.Y;
    this.chassis.rotation.z = r.th;
    this.contact.front = dF > -EXTENSION;
    this.contact.rear = dR > -EXTENSION;
    this.contact.frontGroundY = Tf - rf;
    this.contact.rearGroundY = Tr - rr;
    this.contact.frontGap = Math.max(0, -(dF + EXTENSION));
    this.contact.rearGap = Math.max(0, -(dR + EXTENSION));

    // Map vertical wheel displacement back onto the rig.
    const sn = Math.sin(r.th);
    const cs = Math.cos(r.th);
    const fComp = THREE.MathUtils.clamp(dF, -EXTENSION, TRAVEL_F) / Math.cos(DIM.rake + r.th);
    const rearY = rx * sn + ry * cs + r.Y + THREE.MathUtils.clamp(dR, -EXTENSION, TRAVEL_R);
    const P = DIM.swingarmPivot;
    const k = P.x * sn + P.y * cs + r.Y;
    const swingAngle =
      Math.asin(THREE.MathUtils.clamp((k - rearY) / this.swing.length, -1, 1)) - r.th;
    return { fComp, swingAngle };
  }
}
