import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Mats } from './materials';
import type { NumberPlates } from './textures';
import { extrude, mesh, planarMap, rod, roundedPoly, shell, tiltedSide, v3, type Pt } from './util';

export interface Body {
  tank: THREE.Object3D;
  seat: THREE.Object3D;
  airbox: THREE.Object3D;
  rearFender: THREE.Object3D;
  shrouds: { obj: THREE.Object3D; side: number }[];
  sidePanels: { obj: THREE.Object3D; side: number }[];
  /** Steering-local parts, attached by the front end. */
  frontFender: THREE.Object3D;
  frontPlate: THREE.Object3D;
}

const V2 = (x: number, y: number) => new THREE.Vector2(x, y);

function bbox(pts: Pt[], pad: number) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return { minX, minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
}

function plateMaterial(plates: NumberPlates, pts: Pt[], pad: number, flip: boolean) {
  const b = bbox(pts, pad);
  const tex = plates.texture(b.w / b.h);
  planarMap(tex, b.minX, b.minY, b.w, b.h, flip);
  return new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.6 });
}

export function createBody(m: Mats, plates: NumberPlates): Body {
  // Fuel tank (mostly hidden under the seat and shrouds) with filler cap.
  const tank = new THREE.Group();
  tank.name = 'tank';
  const tankBody = mesh(new RoundedBoxGeometry(0.3, 0.17, 0.24, 4, 0.05), m.tank);
  tankBody.position.set(0.14, 0.935, 0);
  tank.add(tankBody);
  tank.add(rod(v3(0.265, 1.0), v3(0.265, 1.035), 0.024, m.dark, 20));

  // Seat: long flat MX seat, tapered narrow at the front.
  const seatPts: Pt[] = [
    [0.24, 1.0],
    [0.05, 0.985],
    [-0.25, 0.972],
    [-0.6, 0.968],
    [-0.745, 0.955],
    [-0.745, 0.915],
    [-0.3, 0.905],
    [0.0, 0.925],
    [0.2, 0.955],
  ];
  const seat = extrude(roundedPoly(seatPts, 0.03), 0.19, m.seat, 0.022, (pos) => {
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.smoothstep(0.24 - pos.getX(i), 0, 0.42);
      pos.setZ(i, pos.getZ(i) * (0.5 + 0.5 * t));
    }
  }, 5);
  seat.name = 'seat';

  const airbox = mesh(new RoundedBoxGeometry(0.3, 0.17, 0.17, 3, 0.03), m.dark, 'airbox');
  airbox.position.set(-0.33, 0.79, 0);

  const rearFender = shell(
    [V2(-0.36, 0.893), V2(-0.65, 0.902), V2(-0.92, 0.928), V2(-1.1, 0.97)],
    (u) => 0.21 - 0.05 * u,
    0.035,
    m.plasticDS,
  );
  rearFender.name = 'rearFender';

  // Radiator shrouds with layered graphics.
  const shroudPts: Pt[] = [
    [0.43, 1.045, 0.03],
    [0.12, 1.015, 0.06],
    [-0.03, 0.955, 0.03],
    [0.03, 0.85, 0.05],
    [0.16, 0.67, 0.05],
    [0.3, 0.585, 0.04],
    [0.4, 0.615, 0.03],
    [0.45, 0.82, 0.05],
  ];
  const stripePts: Pt[] = [
    [0.42, 0.96],
    [0.3, 0.95],
    [0.14, 0.78],
    [0.2, 0.72],
    [0.33, 0.84],
    [0.43, 0.86],
  ];
  const pinPts: Pt[] = [
    [0.44, 0.8],
    [0.36, 0.78],
    [0.26, 0.66],
    [0.31, 0.63],
    [0.4, 0.7],
    [0.445, 0.72],
  ];
  const shrouds = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.add(extrude(roundedPoly(shroudPts), 0.008, m.plastic, 0.003));
    const stripe = extrude(roundedPoly(stripePts, 0.015), 0.002, m.accent, 0.0008);
    stripe.position.z = s * 0.009;
    g.add(stripe);
    const pin = extrude(roundedPoly(pinPts, 0.012), 0.002, m.white, 0.0008);
    pin.position.z = s * 0.009;
    g.add(pin);
    const obj = tiltedSide(g, s, 0.19, 0.1, 0.82);
    obj.name = s > 0 ? 'shroudRight' : 'shroudLeft';
    return { obj, side: s };
  });

  // Side number panels under the seat.
  const panelPts: Pt[] = [
    [-0.235, 0.895, 0.03],
    [-0.71, 0.925, 0.03],
    [-0.665, 0.72, 0.06],
    [-0.43, 0.625, 0.05],
    [-0.255, 0.69, 0.04],
  ];
  const sidePanels = [-1, 1].map((s) => {
    const mat = plateMaterial(plates, panelPts, 0.003, s < 0);
    const panel = extrude(roundedPoly(panelPts), 0.008, [mat, m.plastic], 0.003);
    const obj = tiltedSide(panel, s, 0.142, 0.06, 0.8);
    obj.name = s > 0 ? 'sidePanelRight' : 'sidePanelLeft';
    return { obj, side: s };
  });

  // Front fender — steering-local coordinates (see forks.ts).
  const frontFender = shell(
    [V2(0.3, -0.265), V2(0.14, -0.205), V2(0.0, -0.19), V2(-0.1, -0.205), V2(-0.14, -0.235)],
    (u) => 0.125 + 0.015 * Math.sin(Math.PI * u),
    0.03,
    m.plasticDS,
  );
  frontFender.name = 'frontFender';

  // Front number plate, facing forward along steering-local +X.
  const fpPts: Pt[] = [
    [-0.11, -0.075, 0.03],
    [0.11, -0.075, 0.03],
    [0.125, 0.095, 0.035],
    [-0.125, 0.095, 0.035],
  ];
  const fpMat = plateMaterial(plates, fpPts, 0.002, false);
  const frontPlate = extrude(roundedPoly(fpPts), 0.006, [fpMat, m.plastic], 0.002);
  frontPlate.geometry.rotateY(Math.PI / 2);
  frontPlate.position.set(0.075, -0.01, 0);
  frontPlate.name = 'frontPlate';

  return { tank, seat, airbox, rearFender, shrouds, sidePanels, frontFender, frontPlate };
}
