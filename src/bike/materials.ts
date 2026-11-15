import * as THREE from 'three';

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
const phys = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);

export function createMaterials() {
  // Low clearcoat and reduced environment reflection keep the color saturated
  // instead of washing it out with white studio reflections.
  const plastic = phys({
    color: '#0099a3',
    roughness: 0.45,
    clearcoat: 0.15,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.35,
  });
  // Thin single-surface shells (fenders, fork guards) need both faces rendered.
  const plasticDS = plastic.clone();
  plasticDS.side = THREE.DoubleSide;

  return {
    plastic,
    plasticDS,
    accent: phys({ color: '#1b1d22', roughness: 0.4, clearcoat: 0.5 }),
    white: phys({ color: '#f2f2ee', roughness: 0.35, clearcoat: 0.6 }),
    tank: std({ color: '#d9d6cc', roughness: 0.55 }),
    dark: std({ color: '#1a1b1e', roughness: 0.6, metalness: 0.1 }),
    seat: std({ color: '#202226', roughness: 0.85 }),

    frame: std({ color: '#b9bec6', metalness: 0.85, roughness: 0.32 }),
    forkOuter: std({ color: '#2a2c31', metalness: 0.8, roughness: 0.28 }),
    forkLug: std({ color: '#3a3d42', metalness: 0.8, roughness: 0.35 }),
    gold: std({ color: '#d4a548', metalness: 1, roughness: 0.2 }),
    anodized: std({ color: '#f2a33a', metalness: 0.6, roughness: 0.3 }),
    rim: std({ color: '#22252b', metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }),
    bar: std({ color: '#2b2d31', metalness: 0.7, roughness: 0.35 }),
    steel: std({ color: '#d6d9de', metalness: 1, roughness: 0.22 }),
    chrome: std({ color: '#ffffff', metalness: 1, roughness: 0.06 }),
    rubber: std({ color: '#121314', roughness: 0.92 }),
    leverBody: std({ color: '#1e1f23', metalness: 0.55, roughness: 0.38 }),
    leverAlloy: std({ color: '#c4c8ce', metalness: 0.9, roughness: 0.3 }),
    sightGlass: phys({ color: '#5a3d14', metalness: 0.1, roughness: 0.05, clearcoat: 1 }),
    killRed: phys({ color: '#d0201c', roughness: 0.35, clearcoat: 0.6 }),
    hose: std({ color: '#17181a', roughness: 0.55, metalness: 0.15 }),
    disc: std({ color: '#b8bcc2', metalness: 1, roughness: 0.3 }),
    chain: std({ color: '#3c3f44', metalness: 0.9, roughness: 0.45 }),
    chainGold: std({ color: '#c99a3e', metalness: 1, roughness: 0.32 }),
    spring: std({ color: '#e8c32a', metalness: 0.3, roughness: 0.35 }),
    shockBody: std({ color: '#2e3036', metalness: 0.8, roughness: 0.3 }),

    engine: std({ color: '#3a3d43', metalness: 0.55, roughness: 0.45 }),
    engineCover: std({ color: '#8a8f98', metalness: 0.8, roughness: 0.35 }),
    header: std({ color: '#9c8a76', metalness: 1, roughness: 0.28 }),
    silencer: std({ color: '#c4c8ce', metalness: 0.9, roughness: 0.38 }),
    radiator: std({ color: '#2b2e33', metalness: 0.6, roughness: 0.5 }),
  };
}

export type Mats = ReturnType<typeof createMaterials>;
