import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ModelId } from '../game/types';

const BASE = `${import.meta.env.BASE_URL}assets/`;

/**
 * Optional Synty POLYGON replacements. They are licensed and cannot live in
 * this public repo, so the deploy workflow copies them into assets/synty/ from
 * a private repo. Anything listed in their manifest replaces the KayKit model
 * of the same name; without the folder the game runs on KayKit alone.
 */
interface SyntyManifest {
  characters: string[];
  dungeon: string[];
}
let synty: SyntyManifest = { characters: [], dungeon: [] };

async function loadSyntyManifest() {
  try {
    const res = await fetch(`${BASE}synty/manifest.json`);
    // Vite's dev server answers unknown paths with index.html.
    if (res.ok && res.headers.get('content-type')?.includes('json')) synty = await res.json();
  } catch {
    // No Synty build available; keep KayKit.
  }
}

const isSynty = (model: string) => synty.characters.includes(model);
const characterPath = (model: string) => (isSynty(model) ? `synty/characters/${model}.glb` : `characters/${model}.glb`);
const dungeonPath = (name: string) => (synty.dungeon.includes(name) ? `synty/dungeon/${name}.glb` : `dungeon/${name}.glb`);

/** Portrait camera framing: Synty's realistic heads are smaller and sit higher than KayKit's. */
export function portraitFraming(model: ModelId): { focus: number; distance: number } {
  return isSynty(model) ? { focus: 1.72, distance: 2.4 } : { focus: 1.45, distance: 3.4 };
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<GLTF>>();

export function loadGltf(path: string): Promise<GLTF> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(BASE + path);
    cache.set(path, p);
  }
  return p;
}

export const CHARACTER_MODELS: ModelId[] = [
  'Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded',
  'Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage',
];

export const DUNGEON_PIECES = [
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_dirt_large', 'floor_tile_big_grate',
  'wall', 'wall_cracked', 'wall_doorway', 'wall_gated', 'wall_corner', 'pillar', 'pillar_decorated', 'column',
  'torch_mounted', 'banner_patternA_red', 'banner_shield_blue', 'barrel_large',
  'crates_stacked', 'rubble_large', 'chest_gold', 'barrier', 'barrier_column', 'sword_shield',
] as const;

const WEAPONS = ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Crossbow', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_A'] as const;
type WeaponId = (typeof WEAPONS)[number];

/** Which built-in accessory meshes stay visible, and which separate weapons get attached. */
const LOADOUT: Partial<Record<ModelId, { keep: string[]; right?: WeaponId; left?: WeaponId }>> = {
  Knight: { keep: ['1H_Sword', 'Badge_Shield', 'Knight_Helmet', 'Knight_Cape'] },
  Barbarian: { keep: ['2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'] },
  Mage: { keep: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'] },
  Rogue: { keep: ['2H_Crossbow', 'Rogue_Cape'] },
  Rogue_Hooded: { keep: ['Knife', 'Knife_Offhand', 'Rogue_Cape'] },
  Skeleton_Minion: { keep: [], right: 'Skeleton_Blade' },
  Skeleton_Warrior: { keep: ['Skeleton_Warrior_Helmet'], right: 'Skeleton_Axe', left: 'Skeleton_Shield_Large_A' },
  Skeleton_Rogue: { keep: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'], right: 'Skeleton_Blade', left: 'Skeleton_Shield_Small_A' },
  Skeleton_Mage: { keep: ['Skeleton_Mage_Hat'], right: 'Skeleton_Staff' },
};

export interface AnimSet {
  idle: string;
  walk: string;
  attack: string;
  hit: string;
  death: string;
  spawn?: string;
  cheer: string;
}

export const ANIMS: Partial<Record<ModelId, AnimSet>> = {
  Knight: { idle: 'Idle', walk: 'Walking_A', attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', death: 'Death_A', cheer: 'Cheer' },
  Barbarian: { idle: '2H_Melee_Idle', walk: 'Walking_A', attack: '2H_Melee_Attack_Slice', hit: 'Hit_A', death: 'Death_A', cheer: 'Cheer' },
  Mage: { idle: 'Idle', walk: 'Walking_A', attack: 'Spellcast_Shoot', hit: 'Hit_A', death: 'Death_A', cheer: 'Cheer' },
  Rogue: { idle: 'Idle', walk: 'Walking_A', attack: '2H_Ranged_Shoot', hit: 'Hit_A', death: 'Death_A', cheer: 'Cheer' },
  Rogue_Hooded: { idle: 'Idle', walk: 'Walking_A', attack: 'Dualwield_Melee_Attack_Stab', hit: 'Hit_A', death: 'Death_A', cheer: 'Cheer' },
  Skeleton_Minion: { idle: 'Idle_Combat', walk: 'Walking_D_Skeletons', attack: '1H_Melee_Attack_Chop', hit: 'Hit_B', death: 'Death_A', spawn: 'Spawn_Ground_Skeletons', cheer: 'Taunt' },
  Skeleton_Warrior: { idle: 'Idle_Combat', walk: 'Walking_D_Skeletons', attack: '1H_Melee_Attack_Chop', hit: 'Hit_B', death: 'Death_A', spawn: 'Spawn_Ground_Skeletons', cheer: 'Taunt' },
  Skeleton_Rogue: { idle: 'Idle_Combat', walk: 'Walking_D_Skeletons', attack: '1H_Melee_Attack_Stab', hit: 'Hit_B', death: 'Death_A', spawn: 'Spawn_Ground_Skeletons', cheer: 'Taunt' },
  Skeleton_Mage: { idle: 'Idle_Combat', walk: 'Walking_D_Skeletons', attack: 'Spellcast_Shoot', hit: 'Hit_B', death: 'Death_A', spawn: 'Spawn_Ground_Skeletons', cheer: 'Taunt' },
};

let animLibs: { adventurer: THREE.AnimationClip[]; skeleton: THREE.AnimationClip[] } | null = null;

export async function preloadAll(onProgress?: (done: number, total: number) => void) {
  await loadSyntyManifest();
  const jobs: Promise<unknown>[] = [
    ...CHARACTER_MODELS.map((m) => loadGltf(characterPath(m))),
    loadGltf('characters/anims_adventurer.glb'),
    loadGltf('characters/anims_skeleton.glb'),
    ...DUNGEON_PIECES.map((p) => loadGltf(dungeonPath(p))),
    ...WEAPONS.map((w) => loadGltf(`weapons/${w}.glb`)),
  ];
  let done = 0;
  jobs.forEach((j) => j.then(() => onProgress?.(++done, jobs.length)));
  await Promise.all(jobs);
  const [adv, skl] = await Promise.all([loadGltf('characters/anims_adventurer.glb'), loadGltf('characters/anims_skeleton.glb')]);
  animLibs = { adventurer: adv.animations, skeleton: skl.animations };
}

function prepareShadows(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

export async function instantiateStatic(name: string): Promise<THREE.Object3D> {
  const gltf = await loadGltf(dungeonPath(name));
  const obj = gltf.scene.clone(true);
  prepareShadows(obj);
  return obj;
}

export interface CharacterInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
}

export async function instantiateCharacter(model: ModelId): Promise<CharacterInstance> {
  const gltf = await loadGltf(characterPath(model));
  const root = SkeletonUtils.clone(gltf.scene);
  if (isSynty(model)) {
    // Synty exports carry their own weapons and retargeted KayKit clips.
    prepareShadows(root);
    return { root, mixer: new THREE.AnimationMixer(root), clips: gltf.animations };
  }
  const loadout = LOADOUT[model];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    // Unskinned meshes are the optional accessories parented to hand slots.
    if (loadout && !loadout.keep.includes(o.name)) o.visible = false;
  });
  if (loadout?.right || loadout?.left) {
    for (const [slot, weapon] of [['handslotr', loadout.right], ['handslotl', loadout.left]] as const) {
      if (!weapon) continue;
      const bone = root.getObjectByName(slot) ?? root.getObjectByName(slot.replace('slot', 'slot.'));
      if (!bone) continue;
      const w = (await loadGltf(`weapons/${weapon}.glb`)).scene.clone(true);
      bone.add(w);
    }
  }
  prepareShadows(root);
  const mixer = new THREE.AnimationMixer(root);
  const clips = model.startsWith('Skeleton') ? animLibs!.skeleton : animLibs!.adventurer;
  return { root, mixer, clips };
}
