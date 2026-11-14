import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const DEFAULT_CAMERA = new THREE.Vector3(2.6, 1.35, 2.9);
export const DEFAULT_TARGET = new THREE.Vector3(0, 0.55, 0);

export function createOrbit(camera: THREE.PerspectiveCamera, dom: HTMLElement): OrbitControls {
  const c = new OrbitControls(camera, dom);
  c.target.copy(DEFAULT_TARGET);
  c.enableDamping = true;
  c.dampingFactor = 0.08;
  c.enablePan = false;
  c.minDistance = 1.2;
  c.maxDistance = 10;
  c.maxPolarAngle = Math.PI * 0.495; // never go below the floor
  c.autoRotateSpeed = 0.8;
  resetCamera(camera, c);
  return c;
}

/** Default view, pulled back on narrow (portrait) screens so the whole bike fits. */
export function resetCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls): void {
  const fit = Math.max(1, 1 / camera.aspect);
  camera.position.copy(DEFAULT_CAMERA).sub(DEFAULT_TARGET).multiplyScalar(fit).add(DEFAULT_TARGET);
  controls.target.copy(DEFAULT_TARGET);
  controls.update();
}
