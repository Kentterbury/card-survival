import * as THREE from 'three';
import type { ModelId } from '../game/types';
import { animsFor, instantiateCharacter, instantiateStatic, useSynty } from './assets';

/**
 * Renders a bust shot of each model once at startup so cards and the hero
 * frame can use real art from the 3D assets.
 */
export async function renderPortraits(subjects: { key: string; model: ModelId }[], size = 256): Promise<Map<string, string>> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x403040, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 1.5);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const out = new Map<string, string>();

  for (const { key, model: id } of subjects) {
    let obj: THREE.Object3D;
    if (id === 'barrier') {
      obj = await instantiateStatic('barrier');
      camera.position.set(0, 1.6, 5.5);
      camera.lookAt(0, 0.5, 0);
    } else {
      const inst = await instantiateCharacter(id, key);
      obj = inst.root;
      const idle = inst.clips.find((c) => c.name === animsFor(id)?.idle);
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
