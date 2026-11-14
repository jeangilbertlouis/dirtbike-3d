import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

/** 2D point, optionally with a per-corner rounding radius. */
export type Pt = [number, number] | [number, number, number];

const UP = new THREE.Vector3(0, 1, 0);

export const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  name = '',
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  return m;
}

/** Re-orient a Y-aligned geometry (cylinder) so its axis runs along Z. */
export function axisZ<T extends THREE.BufferGeometry>(geo: T): T {
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** Smooth tube through a list of points. */
export function tube(
  points: THREE.Vector3[],
  radius: number,
  mat: THREE.Material,
  segments = 64,
  closed = false,
  radial = 12,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return mesh(new THREE.TubeGeometry(curve, segments, radius, radial, closed), mat);
}

/** Cylinder from point a to point b (optionally tapered to radiusB at b). */
export function rod(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
  radial = 16,
  radiusB = radius,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.CylinderGeometry(radiusB, radius, dir.length(), radial);
  const m = mesh(geo, mat);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  return m;
}

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Set an instance of a unit-height Y cylinder so it spans a → b. */
export function setInstanceRod(
  inst: THREE.InstancedMesh,
  i: number,
  a: THREE.Vector3,
  b: THREE.Vector3,
): void {
  _d.subVectors(b, a);
  const len = _d.length();
  _q.setFromUnitVectors(UP, _d.normalize());
  _p.addVectors(a, b).multiplyScalar(0.5);
  _s.set(1, len, 1);
  inst.setMatrixAt(i, _m.compose(_p, _q, _s));
}

/** Polygon with rounded corners (radius per vertex, or the default). */
export function roundedPoly(pts: Pt[], radius = 0.02): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const r = p[2] ?? radius;
    const d1 = Math.hypot(prev[0] - p[0], prev[1] - p[1]);
    const d2 = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const r1 = Math.min(r, d1 / 2);
    const r2 = Math.min(r, d2 / 2);
    const ax = p[0] + ((prev[0] - p[0]) / d1) * r1;
    const ay = p[1] + ((prev[1] - p[1]) / d1) * r1;
    const bx = p[0] + ((next[0] - p[0]) / d2) * r2;
    const by = p[1] + ((next[1] - p[1]) / d2) * r2;
    if (i === 0) s.moveTo(ax, ay);
    else s.lineTo(ax, ay);
    s.quadraticCurveTo(p[0], p[1], bx, by);
  }
  s.closePath();
  return s;
}

/**
 * Extrude a 2D shape (in the XY plane) along Z, centred on z = 0, with smooth
 * (creased) normals. `deform` can reshape vertices before normals are computed.
 */
export function extrude(
  shape: THREE.Shape,
  depth: number,
  mat: THREE.Material | THREE.Material[],
  bevel = 0.003,
  deform?: (pos: THREE.BufferAttribute) => void,
  bevelSegments = 3,
): THREE.Mesh {
  const ext = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments: 24,
  });
  ext.translate(0, 0, -depth / 2);
  if (deform) deform(ext.getAttribute('position') as THREE.BufferAttribute);
  const geo = toCreasedNormals(ext, Math.PI / 5);
  return mesh(geo, mat);
}

/**
 * Thin curved shell (fenders): sweeps along a 2D path in XY, `width(u)` across Z,
 * with the edges drooping by `droop` in -Y.
 */
export function shell(
  path: THREE.Vector2[],
  width: (u: number) => number,
  droop: number,
  mat: THREE.Material,
  segments = 48,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    path.map((p) => new THREE.Vector3(p.x, p.y, 0)),
    false,
    'centripetal',
  );
  const p = new THREE.Vector3();
  const geo = new ParametricGeometry(
    (u: number, v: number, target: THREE.Vector3) => {
      curve.getPoint(u, p);
      const k = 2 * v - 1;
      target.set(p.x, p.y - droop * k * k, (k * width(u)) / 2);
    },
    segments,
    12,
  );
  return mesh(geo, mat);
}

/**
 * Map a texture onto an extruded cap using planar XY coordinates (ExtrudeGeometry
 * caps use raw x/y as UVs). `flip` mirrors horizontally for caps seen from -Z.
 */
export function planarMap(
  tex: THREE.Texture,
  minX: number,
  minY: number,
  w: number,
  h: number,
  flip = false,
): void {
  if (flip) {
    tex.repeat.set(-1 / w, 1 / h);
    tex.offset.set((minX + w) / w, -minY / h);
  } else {
    tex.repeat.set(1 / w, 1 / h);
    tex.offset.set(-minX / w, -minY / h);
  }
}

/** Wrap an object in a pivot so it can be tilted about a horizontal axis at `pivotY`. */
export function tiltedSide(
  obj: THREE.Object3D,
  side: number,
  z: number,
  tilt: number,
  pivotY: number,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, pivotY, side * z);
  g.rotation.x = -side * tilt;
  obj.position.y -= pivotY;
  g.add(obj);
  return g;
}
