import './style.css';
import * as THREE from 'three';
import { DirtBike } from './bike/DirtBike';
import { createMaterials } from './bike/materials';
import { createOrbit } from './controls/orbit';
import { createGround } from './scene/ground';
import { setupScene } from './scene/setupScene';
import { createGui } from './ui/gui';

const container = document.getElementById('app')!;
const { renderer, scene, camera } = setupScene(container);

scene.add(createGround());

const mats = createMaterials();
const bike = new DirtBike(mats);
scene.add(bike.root);

const controls = createOrbit(camera, renderer.domElement);
createGui(bike, mats, controls, camera);

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.05);
  bike.update(dt);
  controls.update(dt);
  renderer.render(scene, camera);
});

// Handy for poking at the rig from the browser console.
Object.assign(window, { bike, scene, camera, controls });
