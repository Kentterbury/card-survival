import * as THREE from 'three';
import type { ModelId } from '../game/types';
import { ANIMS, instantiateCharacter, instantiateStatic, portraitFraming } from './assets';

/**
 * Renders a bust shot of each model once at startup so cards and the hero
 * frame can use real art from the 3D assets.
 */
export async function renderPortraits(models: ModelId[], size = 256): Promise<Map<ModelId, string>> {
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
  const out = new Map<ModelId, string>();

  for (const id of models) {
    let obj: THREE.Object3D;
    if (id === 'barrier') {
      obj = await instantiateStatic('barrier');
      camera.position.set(0, 1.6, 5.5);
      camera.lookAt(0, 0.5, 0);
    } else {
      const inst = await instantiateCharacter(id);
      obj = inst.root;
      const idle = inst.clips.find((c) => c.name === ANIMS[id]?.idle);
      if (idle) {
        inst.mixer.clipAction(idle).play();
        inst.mixer.update(0.4);
      }
      obj.rotation.y = 0.35;
      const { focus, distance } = portraitFraming(id);
      camera.position.set(0.3, focus + 0.45 * (distance / 3.4), distance);
      camera.lookAt(0, focus, 0);
    }
    scene.add(obj);
    renderer.render(scene, camera);
    out.set(id, renderer.domElement.toDataURL('image/png'));
    scene.remove(obj);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
