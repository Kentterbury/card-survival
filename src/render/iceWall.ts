import * as THREE from 'three';

/** A jagged slab of ice for the 빙벽 structure (procedural; no asset needed). */
export function makeIceWall(): THREE.Group {
  const g = new THREE.Group();
  const ice = new THREE.MeshStandardMaterial({
    color: 0xa8e8ff, emissive: 0x1d5a78, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.05,
    transparent: true, opacity: 0.82, flatShading: true,
  });
  const core = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 0.7), ice);
  core.position.y = 0.75;
  g.add(core);
  // Shards along the top and the sides so it reads as ice, not glass.
  const shards: [number, number, number, number, number][] = [
    [-0.7, 1.5, 0, 0.32, 0.9], [-0.15, 1.6, 0.05, 0.38, 1.1], [0.45, 1.5, -0.05, 0.3, 0.8],
    [0.85, 1.3, 0.1, 0.25, 0.6], [-1.0, 1.1, -0.1, 0.22, 0.5],
  ];
  for (const [x, y, z, r, h] of shards) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), ice);
    s.position.set(x, y + h / 2 - 0.1, z);
    s.rotation.z = (x > 0 ? -1 : 1) * 0.15;
    g.add(s);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
