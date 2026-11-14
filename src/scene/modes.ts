import * as THREE from 'three';
import type { BikeMode } from '../bike/DirtBike';
import type { SceneContext } from './setupScene';

/** Sky, fog and light settings for one environment. */
export interface Look {
  background: string;
  fogNear: number;
  fogFar: number;
  env: number;
  key: [string, number];
  rim: [string, number];
  hemi: [string, string, number];
}

export const SHOWROOM_LOOK: Look = {
  background: '#15171c',
  fogNear: 7,
  fogFar: 20,
  env: 0.7,
  key: ['#ffffff', 2.4],
  rim: ['#9fc4ff', 1.2],
  hemi: ['#dfe8ff', '#202020', 0.35],
};

/**
 * Switch lighting/sky and which ground is visible. In ride mode the look comes
 * from the active terrain preset.
 */
export function applyMode(
  ctx: SceneContext,
  mode: BikeMode,
  rideLook: Look,
  showroomFloor: THREE.Object3D,
  rideWorld: THREE.Object3D[],
): void {
  const look = mode === 'ride' ? rideLook : SHOWROOM_LOOK;
  const bg = new THREE.Color(look.background);
  ctx.scene.background = bg;
  ctx.scene.fog = new THREE.Fog(bg, look.fogNear, look.fogFar);
  ctx.scene.environmentIntensity = look.env;
  ctx.key.color.set(look.key[0]);
  ctx.key.intensity = look.key[1];
  ctx.rim.color.set(look.rim[0]);
  ctx.rim.intensity = look.rim[1];
  ctx.hemi.color.set(look.hemi[0]);
  ctx.hemi.groundColor.set(look.hemi[1]);
  ctx.hemi.intensity = look.hemi[2];
  showroomFloor.visible = mode === 'showroom';
  for (const o of rideWorld) o.visible = mode === 'ride';
  document.body.dataset.mode = mode;
}
