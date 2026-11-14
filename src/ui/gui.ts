import type * as THREE from 'three';
import GUI from 'lil-gui';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { DirtBike } from '../bike/DirtBike';
import type { Mats } from '../bike/materials';
import { resetCamera } from '../controls/orbit';

export function createGui(
  bike: DirtBike,
  m: Mats,
  controls: OrbitControls,
  camera: THREE.PerspectiveCamera,
): GUI {
  const gui = new GUI({ title: 'Dirt bike' });

  const colorGroups: Record<string, THREE.MeshStandardMaterial[]> = {
    plastics: [m.plastic, m.plasticDS],
    graphics: [m.accent],
    frame: [m.frame],
    rims: [m.rim],
    anodized: [m.anodized],
    spring: [m.spring],
    seat: [m.seat],
  };
  const colors: Record<string, string> = {};
  const cf = gui.addFolder('Colors');
  for (const [key, list] of Object.entries(colorGroups)) {
    colors[key] = '#' + list[0].color.getHexString();
    cf.addColor(colors, key).onChange((v: string) => list.forEach((mat) => mat.color.set(v)));
  }

  const look = { number: bike.plates.number };
  gui
    .add(look, 'number')
    .name('race number')
    .onFinishChange((v: string) => bike.plates.setNumber(v.trim() || '0'));

  const view = gui.addFolder('View');
  view.add(controls, 'autoRotate').name('auto-rotate');
  view.add(bike.state, 'explode', 0, 1, 0.01).name('exploded view');
  view.add({ reset: () => resetCamera(camera, controls) }, 'reset').name('reset camera');

  const anim = gui.addFolder('Animation');
  anim.add(bike.state, 'speed', 0, 60, 1).name('wheel speed (km/h)');
  anim.add(bike.state, 'bounce').name('suspension bounce');
  anim.add(bike.state, 'steer', -35, 35, 1).name('steering (°)');

  if (window.innerWidth < 700) gui.close();
  return gui;
}
