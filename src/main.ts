import './style.css';
import * as THREE from 'three';
import { DirtBike } from './bike/DirtBike';
import { frontAxle, rearAxle } from './bike/dimensions';
import { createMaterials } from './bike/materials';
import { DEFAULT_TARGET, createOrbit } from './controls/orbit';
import { createGround } from './scene/ground';
import { applyMode } from './scene/modes';
import { setupScene } from './scene/setupScene';
import { Dust } from './terrain/dust';
import { Terrain } from './terrain/Terrain';
import { createGui } from './ui/gui';

const container = document.getElementById('app')!;
const ctx = setupScene(container);
const { renderer, scene, camera } = ctx;

const floor = createGround();
scene.add(floor);
const terrain = new Terrain();
scene.add(terrain.group);
const dust = new Dust();
scene.add(dust.points);

const mats = createMaterials();
const bike = new DirtBike(mats);
bike.ground = (x) => terrain.height(x, 0);
scene.add(bike.root);

const controls = createOrbit(camera, renderer.domElement);
const setMode = (mode: typeof bike.state.mode) =>
  applyMode(ctx, mode, terrain.preset.look, floor, [terrain.group, dust.points]);
setMode(bike.state.mode);

const setTerrain = (id: string) => {
  terrain.setPreset(id);
  dust.setColor(terrain.preset.dust.color);
  bike.resetRide();
  setMode(bike.state.mode);
};

createGui({ bike, mats, terrain, controls, camera, onMode: setMode, onTerrain: setTerrain });

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.05);
  bike.update(dt);

  const riding = bike.state.mode === 'ride';
  if (riding) {
    terrain.setDistance(bike.distance);
    const v = bike.state.speed / 3.6;
    const c = bike.contact;
    const k = terrain.preset.dust.rate;
    // Tyres touch down half a wheelbase either side of the bike's centre.
    if (c.rear) dust.emit(dt, rearAxle.x, c.rearGroundY, k * (4 + v * 7), v);
    if (c.front) dust.emit(dt, frontAxle.x, c.frontGroundY, k * v * 1.5, v);
  }
  dust.update(dt);

  // Camera follows the bike's ride height smoothly (and returns to the floor in showroom).
  const wantY = DEFAULT_TARGET.y + (riding ? bike.chassis.position.y : 0);
  const dy = (wantY - controls.target.y) * Math.min(1, dt * 2.5);
  controls.target.y += dy;
  camera.position.y += dy;

  controls.update(dt);
  renderer.render(scene, camera);
});

// Handy for poking at the rig from the browser console. (Don't expose the THREE
// namespace here: it would defeat tree-shaking and bloat the bundle.)
Object.assign(window, { bike, scene, camera, controls, renderer, terrain, dust });
