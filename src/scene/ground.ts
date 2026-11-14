import * as THREE from 'three';

/** Showroom floor: a large matte disc with a slightly lighter display pad under the bike. */
export function createGround(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ground';

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 96).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#1c1e23', roughness: 0.95 }),
  );
  floor.receiveShadow = true;
  g.add(floor);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 96).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#24272d', roughness: 0.75 }),
  );
  pad.position.y = 0.001;
  pad.receiveShadow = true;
  g.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.625, 128).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#14a3a8', emissive: '#0c5f62', roughness: 0.4 }),
  );
  ring.position.y = 0.002;
  g.add(ring);

  return g;
}
