import * as THREE from 'three';
import type { Mats } from './materials';
import { axisZ, mesh, rod, v3 } from './util';

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private radius: number,
    private turns: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(this.radius * Math.cos(a), -t, this.radius * Math.sin(a));
  }
}

const BODY_LEN = 0.22;
const SPRING_TOP = 0.04;
const SPRING_BOTTOM_GAP = 0.035;

export interface Shock {
  group: THREE.Group;
  /** Stretch/orient the shock between two points (parent space). */
  setEnds(top: THREE.Vector3, bottom: THREE.Vector3): void;
}

/** Rear shock: body + piggyback reservoir, chrome shaft, coil spring that compresses. */
export function createShock(m: Mats): Shock {
  const group = new THREE.Group();
  group.name = 'shock';

  const eye = () => mesh(axisZ(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 16)), m.forkLug);
  group.add(eye());
  group.add(rod(v3(0, -0.005), v3(0, -BODY_LEN), 0.022, m.shockBody, 24));
  group.add(rod(v3(0, -0.02, 0.0), v3(0, -0.02, 0.045), 0.01, m.shockBody));
  group.add(rod(v3(0, -0.02, 0.045), v3(0, -0.15, 0.045), 0.019, m.anodized, 20));
  group.add(rod(v3(0, -0.028), v3(0, -0.042), 0.034, m.anodized, 24));

  const shaft = mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 12), m.chrome);
  group.add(shaft);

  const bottom = new THREE.Group();
  bottom.add(eye());
  bottom.add(rod(v3(0, 0.0), v3(0, 0.03), 0.018, m.forkLug, 16));
  bottom.add(rod(v3(0, 0.03), v3(0, 0.04), 0.034, m.forkLug, 24));
  group.add(bottom);

  const spring = mesh(new THREE.TubeGeometry(new Helix(0.033, 9), 400, 0.0062, 8, false), m.spring);
  spring.position.y = -SPRING_TOP;
  group.add(spring);

  const DOWN = new THREE.Vector3(0, -1, 0);
  const dir = new THREE.Vector3();

  return {
    group,
    setEnds(top, bot) {
      dir.subVectors(bot, top);
      const len = dir.length();
      group.position.copy(top);
      group.quaternion.setFromUnitVectors(DOWN, dir.normalize());
      shaft.position.y = -(BODY_LEN + len) / 2;
      shaft.scale.y = Math.max(0.001, len - BODY_LEN);
      bottom.position.y = -len;
      spring.scale.y = Math.max(0.001, len - SPRING_TOP - SPRING_BOTTOM_GAP);
    },
  };
}
