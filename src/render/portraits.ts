import * as THREE from 'three';
import type { ModelId } from '../game/types';
import { animsFor, instantiateCharacter, instantiateStatic, useSynty } from './assets';
import { makeIceWall } from './iceWall';

/**
 * Renders a bust shot of each model once at startup so cards and the hero
 * frame can use real art from the 3D assets.
 */
export async function renderPortraits(subjects: { key: string; model: ModelId }[], size = 256): Promise<Map<string, string>> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  // Soft studio light: a bright ambient base, a gentle key from the camera side and a fill
  // from the other side, so the low-poly facets don't break the face into dark patches.
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x8a7a70, 2.4));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.1);
  key.position.set(1.5, 2.5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdde6ff, 0.6);
  fill.position.set(-3, 1, 3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd9a0, 0.5);
  rim.position.set(-2, 3, -3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const out = new Map<string, string>();

  for (const { key, model: id } of subjects) {
    let obj: THREE.Object3D;
    if (id === 'barrier' || id === 'ice_wall') {
      obj = id === 'barrier' ? await instantiateStatic('barrier') : makeIceWall();
      camera.position.set(0, 1.6, 5.5);
      camera.lookAt(0, 0.5, 0);
    } else {
      const inst = await instantiateCharacter(id, key);
      obj = inst.root;
      const idle = inst.clips.find((c) => c.name === animsFor(id, key)?.idle);
      if (idle) {
        inst.mixer.clipAction(idle).play();
        inst.mixer.update(0.4);
      }
      obj.rotation.y = 0.35;
      // Big weapons (great axes, staffs) would cover the face in a bust shot.
      obj.traverse((o) => { if (o.userData.heldWeapon) o.visible = false; });
      // Synty rigs are taller than KayKit's; frame them on the head bone so the face shows.
      const head = useSynty ? obj.getObjectByName('Head') : undefined;
      if (head) {
        obj.updateMatrixWorld(true);
        const p = head.getWorldPosition(new THREE.Vector3());
        camera.position.set(p.x + 0.3, p.y + 0.3, p.z + 2.6);
        camera.lookAt(p.x, p.y - 0.25, p.z);
      } else {
        camera.position.set(0.3, 1.9, 3.4);
        camera.lookAt(0, 1.45, 0);
      }
    }
    scene.add(obj);
    renderer.render(scene, camera);
    out.set(key, renderer.domElement.toDataURL('image/png'));
    scene.remove(obj);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
