import * as THREE from 'three';
import { loadGltf, useSynty } from './assets';

/** Footprint of the 공성 전차 on its cell (the longest side). */
const SIZE = 3.0;

/**
 * 공성 전차: the Synty Fantasy Kingdom trebuchet (synty/props/), or a small wooden catapult
 * built here for the KayKit set. Its throwing arm is `userData.arm` (code-built only).
 */
export async function makeSiege(): Promise<THREE.Group> {
  const root = new THREE.Group();
  const body = useSynty ? await syntyTrebuchet() : catapult();
  root.add(body);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  root.userData.arm = body.userData.arm;
  return root;
}

async function syntyTrebuchet(): Promise<THREE.Object3D> {
  const gltf = await loadGltf('props/SM_Wep_Trebuchet_01.glb', `${import.meta.env.BASE_URL}synty/`);
  const o = gltf.scene.clone(true);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const k = SIZE / Math.max(size.x, size.z);
  o.scale.setScalar(k);
  const c = box.getCenter(new THREE.Vector3());
  o.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  const g = new THREE.Group();
  g.add(o);
  return g;
}

function catapult(): THREE.Group {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x6a6e74, metalness: 0.6, roughness: 0.4, flatShading: true });
  const g = new THREE.Group();
  for (const x of [-0.65, 0.65]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.2), wood);
    rail.position.set(x, 0.45, 0);
    g.add(rail);
    for (const z of [-0.8, 0.8]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 10), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x * 1.18, 0.38, z);
      g.add(wheel);
    }
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.16), wood);
    post.position.set(x * 0.8, 1.05, -0.2);
    g.add(post);
  }
  for (const z of [-0.9, 0.9]) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.16), wood);
    cross.position.set(0, 0.45, z);
    g.add(cross);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 8), iron);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0, 1.55, -0.2);
  g.add(axle);
  // The throwing arm pivots on the axle; the bucket holds a stone.
  const arm = new THREE.Group();
  arm.position.copy(axle.position);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.0), wood);
  beam.position.z = 0.6;
  arm.add(beam);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.18, 8), dark);
  bucket.position.set(0, 0.1, 1.55);
  arm.add(bucket);
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 1, flatShading: true }));
  stone.position.set(0, 0.25, 1.55);
  arm.add(stone);
  arm.rotation.x = 0.55;
  g.add(arm);
  g.userData.arm = arm;
  return g;
}
