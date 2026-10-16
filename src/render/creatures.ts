import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CreatureModel } from '../game/types';
import { loadGltf, type AnimSet, type CharacterInstance } from './assets';

/**
 * Forest beasts: animated Quaternius models (CC0, public/assets/creatures/*.glb, built by
 * tools/optimize-creatures.mjs). The same files serve the KayKit and the Synty set. Each card
 * picks a body, a size and colours.
 */
type CreatureFile = 'Wolf' | 'GreenBlob' | 'GreenSpikyBlob' | 'PinkBlob' | 'Pigeon';

export interface CreatureLook {
  file: CreatureFile;
  /** Wolves: colours for the fur (Main) and the lighter belly / muzzle (Main_Light). */
  fur?: number;
  belly?: number;
  /** Blobs: a colour multiplied over the texture atlas. */
  tint?: number;
  /** 슬라임 왕: a gold crown on top. */
  crown?: boolean;
}

const WOLF = (fur: number, belly: number): CreatureLook => ({ file: 'Wolf', fur, belly });
const BLOB = (file: CreatureFile, tint?: number, crown = false): CreatureLook => ({ file, tint, crown });

/** Looks by card id or `boss:<name>`. */
export const CREATURE_LOOKS: Record<string, CreatureLook> = {
  wolf_pup: WOLF(0x6b5a48, 0xc9b8a0),
  wolf: WOLF(0x4a4d52, 0x9ea3a8),
  wolf_hunter: WOLF(0x5a3a1e, 0xb08a5a),
  wolf_dire: WOLF(0x18181c, 0x3a3a42),
  'boss:늑대 우두머리': WOLF(0xc8ccd4, 0xf4f6fa),
  slime: BLOB('GreenBlob'),
  slime_small_token: BLOB('GreenBlob', 0xc8ffb0),
  slime_mid_token: BLOB('GreenBlob', 0xa8e8a0),
  slime_big: BLOB('GreenBlob', 0x7fb87a),
  slime_venom: BLOB('PinkBlob', 0xb07aff),
  slime_acid: BLOB('GreenSpikyBlob', 0xfff27a),
  'boss:슬라임 왕': BLOB('GreenBlob', 0x9ff0e0, true),
  // 척후대장's scouting hawk: the pigeon in hawk colours.
  h_hawk_token: { file: 'Pigeon', tint: 0xc89a6a },
};

const FILES: CreatureFile[] = ['Wolf', 'GreenBlob', 'GreenSpikyBlob', 'PinkBlob', 'Pigeon'];

/** Height of each body before the unit's own scale (KayKit characters are about 2.4). */
const HEIGHT: Record<CreatureFile, number> = { Wolf: 1.75, GreenBlob: 1.35, GreenSpikyBlob: 1.5, PinkBlob: 1.35, Pigeon: 1.1 };

/** Clip roles. Wolves run (Gallop) when they move; blobs hop in with a Jump. */
const ANIMS: Record<CreatureModel, AnimSet> = {
  wolf: { idle: 'Idle', walk: 'Gallop', attack: 'Attack', hit: 'Idle_HitReact1', death: 'Death', cheer: 'Idle' },
  slime: { idle: 'Idle', walk: 'Walk', attack: 'Bite_Front', hit: 'HitRecieve', death: 'Death', spawn: 'Jump', cheer: 'Jump' },
  bird: { idle: 'Flying_Idle', walk: 'Fast_Flying', attack: 'Headbutt', hit: 'HitReact', death: 'Death', cheer: 'Flying_Idle' },
};

export const creatureAnims = (model: CreatureModel): AnimSet => ANIMS[model];

const BASE = `${import.meta.env.BASE_URL}assets/creatures/`;
const load = (file: CreatureFile) => loadGltf(`${file}.glb`, BASE);

export function preloadCreatures(): Promise<unknown>[] {
  return FILES.map(load);
}

export function creatureLook(model: CreatureModel, key?: string): CreatureLook {
  return (key && CREATURE_LOOKS[key]) || (model === 'wolf' ? CREATURE_LOOKS.wolf : model === 'bird' ? CREATURE_LOOKS.h_hawk_token : CREATURE_LOOKS.slime);
}

/** A posed, animated creature (same shape as a character instance). */
export async function instantiateCreature(model: CreatureModel, key?: string): Promise<CharacterInstance> {
  const look = creatureLook(model, key);
  const gltf = await load(look.file);
  const inner = SkeletonUtils.clone(gltf.scene);
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const recolour = (m: THREE.Material) => {
      const mat = (m as THREE.MeshStandardMaterial).clone();
      if (look.fur !== undefined && mat.name === 'Main') mat.color.setHex(look.fur);
      if (look.belly !== undefined && mat.name === 'Main_Light') mat.color.setHex(look.belly);
      if (look.tint !== undefined) mat.color.setHex(look.tint);
      // Slimes glow faintly from inside, so the jelly reads in the night forest.
      if (look.file.includes('Blob') && mat.map) {
        mat.emissiveMap = mat.map;
        mat.emissive.setHex(look.tint ?? 0xffffff);
        mat.emissiveIntensity = 0.45;
        mat.roughness = 0.25;
      }
      return mat;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolour) : recolour(mesh.material);
  });
  // Bring every body to a common height, standing on the floor.
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const k = HEIGHT[look.file] / Math.max(0.01, box.max.y - box.min.y);
  inner.scale.multiplyScalar(k);
  inner.position.y -= box.min.y * k;
  const root = new THREE.Group();
  root.add(inner);
  if (look.crown) {
    const crown = crownMesh();
    crown.position.y = HEIGHT[look.file] * 0.98;
    root.add(crown);
  }
  return { root, mixer: new THREE.AnimationMixer(root), clips: gltf.animations };
}

function crownMesh() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffcf3a, metalness: 0.7, roughness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.4, flatShading: true });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.16, 10, 1, true), gold));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 4), gold);
    spike.position.set(Math.sin(a) * 0.34, 0.2, Math.cos(a) * 0.34);
    g.add(spike);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}
