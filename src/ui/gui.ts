import type * as THREE from 'three';
import GUI from 'lil-gui';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BikeMode, DirtBike } from '../bike/DirtBike';
import type { Mats } from '../bike/materials';
import { resetCamera } from '../controls/orbit';
import { PRESETS } from '../terrain/presets';
import type { Terrain } from '../terrain/Terrain';

export interface GuiDeps {
  bike: DirtBike;
  mats: Mats;
  terrain: Terrain;
  controls: OrbitControls;
  camera: THREE.PerspectiveCamera;
  onMode: (mode: BikeMode) => void;
  onTerrain: (presetId: string) => void;
}

export function createGui({
  bike,
  mats: m,
  terrain,
  controls,
  camera,
  onMode,
  onTerrain,
}: GuiDeps): GUI {
  const gui = new GUI({ title: 'Dirt bike' });

  const modeCtl = gui
    .add(bike.state, 'mode', { 'Ride terrain': 'ride', Showroom: 'showroom' })
    .name('mode')
    .onChange((mode: BikeMode) => {
      onMode(mode);
      bounce.enable(mode === 'showroom');
      rough.enable(mode === 'ride');
    });

  // Picking a terrain also switches to ride mode, since that's where it shows.
  const ter = { terrain: terrain.preset.id };
  const options = Object.fromEntries(PRESETS.map((p) => [p.label, p.id]));
  gui
    .add(ter, 'terrain', options)
    .name('terrain')
    .onChange((id: string) => {
      onTerrain(id);
      if (bike.state.mode !== 'ride') modeCtl.setValue('ride');
    });

  const anim = gui.addFolder('Motion');
  anim.add(bike.state, 'speed', 0, 60, 1).name('speed (km/h)');
  const rough = anim
    .add(terrain, 'roughness', 0, 2, 0.05)
    .name('terrain roughness')
    .onFinishChange(() => terrain.rebuild());
  const bounce = anim.add(bike.state, 'bounce').name('bounce (showroom)');
  anim.add(bike.state, 'steer', -35, 35, 1).name('steering (°)');
  bounce.enable(bike.state.mode === 'showroom');
  rough.enable(bike.state.mode === 'ride');

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
  cf.close();

  const look = { number: bike.plates.number };
  gui
    .add(look, 'number')
    .name('race number')
    .onFinishChange((v: string) => bike.plates.setNumber(v.trim() || '0'));

  const view = gui.addFolder('View');
  view.add(controls, 'autoRotate').name('auto-rotate');
  view.add(bike.state, 'explode', 0, 1, 0.01).name('exploded view');
  view.add({ reset: () => resetCamera(camera, controls) }, 'reset').name('reset camera');

  if (window.innerWidth < 700) gui.close();
  return gui;
}
