import * as THREE from 'three';
import { createBody } from './body';
import { DIM } from './dimensions';
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

export interface BikeState {
  /** Simulated ground speed in km/h (drives wheel spin). */
  speed: number;
  /** Suspension demo bounce. */
  bounce: boolean;
  /** Steering angle in degrees. */
  steer: number;
  /** Exploded view, 0 = assembled, 1 = fully exploded. */
  explode: number;
}

const FRONT_TRAVEL = 0.045; // m of fork travel used by the bounce demo
const REAR_TRAVEL = 0.07; // rad of swingarm rotation used by the bounce demo

/**
 * Assembles the procedural parts into one rig:
 *
 *   DirtBike (root)
 *   └── chassis (pitches/drops with suspension)
 *       ├── frame, engine, exhaust, radiators, body plastics, shock
 *       ├── frontEnd pivot → steer → slider → front wheel
 *       └── swingarm pivot → rear wheel, chain, sprockets
 */
export class DirtBike {
  readonly root = new THREE.Group();
  readonly chassis = new THREE.Group();
  readonly plates = new NumberPlates('27');
  readonly state: BikeState = { speed: 12, bounce: true, steer: 0, explode: 0 };

  private parts: Part[] = [];
  private front: FrontEnd;
  private swing: Swingarm;
  private shock: Shock;
  private shockPart: Part;
  private time = 0;
  private explodeEased = 0;

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
    const wf = v / DIM.front.radius;
    const wr = v / DIM.rear.radius;
    this.front.wheel.spin.rotation.z -= wf * dt;
    this.swing.wheel.spin.rotation.z -= wr * dt;
    this.swing.frontSprocket.rotation.z -=
      wr * (DIM.rearSprocket.teeth / DIM.frontSprocket.teeth) * dt;

    // Suspension.
    let fComp = 0;
    let rComp = 0;
    if (s.bounce) {
      fComp = FRONT_TRAVEL * (0.5 + 0.5 * Math.sin(this.time * 2.4));
      rComp = REAR_TRAVEL * (0.5 + 0.5 * Math.sin(this.time * 2.4 - 0.6));
    }
    this.front.slider.position.y = fComp;
    const swingAngle = this.swing.baseAngle - rComp;
    this.swing.group.rotation.z = swingAngle;
    this.front.steer.rotation.y = THREE.MathUtils.degToRad(s.steer);

    // Keep both tyres on the ground: drop and pitch the chassis by what the wheels rose.
    const L = this.swing.length;
    const dropF = fComp * Math.cos(DIM.rake);
    const dropR = L * (Math.sin(this.swing.baseAngle) - Math.sin(swingAngle));
    this.chassis.position.y = -(dropF + dropR) / 2;
    this.chassis.rotation.z = (dropR - dropF) / DIM.wheelbase;

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
}
