import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ModelId } from '../game/types';
import {
  DEFAULT_LOOKS, grip, KAYKIT_BOUNDS, LOOKS, SYNTY_ANIMS, SYNTY_CHAR_SCALE, SYNTY_PACKS, SYNTY_STATICS, SYNTY_TEXTURES,
  SYNTY_WEAPON_FILES, type Look,
} from './syntySet';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const SYNTY_BASE = `${import.meta.env.BASE_URL}synty/`;

/**
 * True when the private Synty set is deployed next to the game (public/synty/manifest.json).
 * Otherwise the bundled CC0 KayKit set is used.
 */
export let useSynty = false;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<GLTF>>();

export function loadGltf(path: string, base = BASE): Promise<GLTF> {
  let p = cache.get(base + path);
  if (!p) {
    p = loader.loadAsync(base + path);
    cache.set(base + path, p);
  }
  return p;
}

const loadSynty = (path: string) => loadGltf(path, SYNTY_BASE);

async function detectSynty(): Promise<boolean> {
  try {
    const res = await fetch(`${SYNTY_BASE}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return false;
    const manifest = (await res.json()) as { version?: number };
    return manifest.version === 1;
  } catch {
    return false;
  }
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

/**
 * The clips a unit uses for each role, in whichever asset set is active. In the Synty set the
 * look's weapons decide: a bow or crossbow shoots, anything else (swords, staffs, daggers, bare
 * hands) swings, so a dagger scout or a staff-wielding shaman never plays a bow draw.
 */
export function animsFor(model: ModelId, key?: string): AnimSet | undefined {
  if (model === 'barrier') return undefined;
  if (!useSynty) return ANIMS[model];
  const base = SYNTY_ANIMS[model];
  const look = lookFor(key, model);
  if ([look.r, look.l].some((f) => f && /bow/i.test(f))) return { ...base, idle: 'Idle_Bow', attack: 'Shoot' };
  if (base.attack === 'Shoot' || base.attack === 'Spellcast_Shoot') return { ...base, idle: 'Idle', attack: 'Attack_2' };
  return base;
}

let animLibs: { adventurer: THREE.AnimationClip[]; skeleton: THREE.AnimationClip[] } | null = null;

export async function preloadAll(onProgress?: (done: number, total: number) => void) {
  useSynty = await detectSynty();
  if (useSynty) return preloadSynty(onProgress);
  const jobs: Promise<unknown>[] = [
    ...CHARACTER_MODELS.map((m) => loadGltf(`characters/${m}.glb`)),
    loadGltf('characters/anims_adventurer.glb'),
    loadGltf('characters/anims_skeleton.glb'),
    ...DUNGEON_PIECES.map((p) => loadGltf(`dungeon/${p}.glb`)),
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

async function preloadSynty(onProgress?: (done: number, total: number) => void) {
  const statics = [...new Set(Object.values(SYNTY_STATICS).map((s) => s.file))];
  const jobs: Promise<unknown>[] = [
    ...SYNTY_PACKS.map((p) => loadSynty(`characters/Pack_${p}.glb`)),
    loadSynty('characters/anims.glb'),
    ...statics.map((f) => loadSynty(`dungeon/${f}.glb`)),
    ...SYNTY_WEAPON_FILES.map((w) => loadSynty(`weapons/${w}.glb`)),
    ...SYNTY_TEXTURES.map((t) => loadTexture(t)),
  ];
  let done = 0;
  jobs.forEach((j) => j.then(() => onProgress?.(++done, jobs.length)));
  await Promise.all(jobs);
  const lib = (await loadSynty('characters/anims.glb')).animations;
  animLibs = { adventurer: lib, skeleton: lib };
}

export async function instantiateStatic(name: string): Promise<THREE.Object3D> {
  if (useSynty && SYNTY_STATICS[name]) return instantiateSyntyStatic(name);
  const gltf = await loadGltf(`dungeon/${name}.glb`);
  const obj = gltf.scene.clone(true);
  prepareShadows(obj);
  return obj;
}

/** A Synty piece fitted into the bounding box of the KayKit piece it replaces. */
async function instantiateSyntyStatic(name: string): Promise<THREE.Object3D> {
  const spec = SYNTY_STATICS[name];
  const [tMin, tMax] = KAYKIT_BOUNDS[name];
  const target = new THREE.Box3(new THREE.Vector3(...tMin), new THREE.Vector3(...tMax));
  const tSize = target.getSize(new THREE.Vector3());
  const tCenter = target.getCenter(new THREE.Vector3());
  const piece = (await loadSynty(`dungeon/${spec.file}.glb`)).scene.clone(true);
  piece.rotation.y = spec.rotY ?? 0;
  const inner = new THREE.Group();
  inner.add(piece);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  if (spec.fit === 'box') {
    inner.scale.set(tSize.x / size.x, tSize.y / size.y, tSize.z / size.z);
  } else {
    inner.scale.setScalar(spec.fit === 'height' ? tSize.y / size.y : tSize.x / size.x);
  }
  // Align: centre on the target footprint, bottom on the target's bottom.
  const center = box.getCenter(new THREE.Vector3()).multiply(inner.scale);
  inner.position.set(tCenter.x - center.x, target.min.y - box.min.y * inner.scale.y, tCenter.z - center.z);
  const root = new THREE.Group();
  root.add(inner);
  prepareShadows(root);
  return root;
}

export interface CharacterInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
}

const textures = new Map<string, Promise<THREE.Texture>>();

/** A colour variant of a pack atlas, set up the way glTF textures are (no flip, sRGB, crisp). */
function loadTexture(name: string): Promise<THREE.Texture> {
  let t = textures.get(name);
  if (!t) {
    t = new THREE.TextureLoader().loadAsync(`${SYNTY_BASE}textures/${name}.png`).then((tex) => {
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      return tex;
    });
    textures.set(name, t);
  }
  return t;
}

/** One material per texture variant, shared by every unit wearing it. */
const variantMats = new Map<string, Promise<THREE.Material>>();
function variantMaterial(base: THREE.MeshStandardMaterial, tex: string): Promise<THREE.Material> {
  let m = variantMats.get(tex);
  if (!m) {
    m = loadTexture(tex).then((map) => {
      const mat = base.clone();
      mat.map = map;
      return mat;
    });
    variantMats.set(tex, m);
  }
  return m;
}

/** The look of a card (`cardId`), a hero (`hero:<id>`) or a commander (`boss:<name>`). */
export function lookFor(key: string | undefined, model: Exclude<ModelId, 'barrier'>): Look {
  return (key && LOOKS[key]) || DEFAULT_LOOKS[model];
}

/**
 * The key portraits are stored under: the look key in the Synty set (every card its own
 * picture), the ModelId with KayKit (one picture per model).
 */
export function artKey(key: string | undefined, model: ModelId): string {
  return useSynty && key && LOOKS[key] ? key : model;
}

async function instantiateSyntyCharacter(model: Exclude<ModelId, 'barrier'>, key?: string): Promise<CharacterInstance> {
  const look = lookFor(key, model);
  const gltf = await loadSynty(`characters/Pack_${look.pack}.glb`);
  const inner = SkeletonUtils.clone(gltf.scene);
  inner.scale.setScalar(SYNTY_CHAR_SCALE * (look.scale ?? 1));
  // The pack holds every character on one rig; keep just this look's body.
  const drop: THREE.Object3D[] = [];
  const mats: THREE.Mesh[] = [];
  inner.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    if (o.name === look.mesh) mats.push(o as THREE.Mesh);
    else drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  if (look.tex) {
    for (const m of mats) m.material = await variantMaterial(m.material as THREE.MeshStandardMaterial, look.tex);
  }
  for (const [file, hand] of [[look.r, 'r'], [look.l, 'l']] as const) {
    if (!file) continue;
    const bone = inner.getObjectByName(hand === 'r' ? 'Hand_R' : 'Hand_L');
    if (!bone) continue;
    const weapon = (await loadSynty(`weapons/${file}.glb`)).scene.clone(true);
    weapon.rotation.set(...(grip(file, hand).map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number]));
    // Weapons are in metres; the rig is in centimetres.
    weapon.scale.setScalar(100);
    weapon.userData.heldWeapon = true;
    bone.add(weapon);
  }
  // Callers scale and turn the returned root, so keep the unit conversion one level down.
  const root = new THREE.Group();
  root.add(inner);
  prepareShadows(root);
  const mixer = new THREE.AnimationMixer(root);
  return { root, mixer, clips: animLibs!.adventurer };
}

/** `look` is a card id, `hero:<id>` or `boss:<name>`; only the Synty set tells them apart. */
export async function instantiateCharacter(model: ModelId, look?: string): Promise<CharacterInstance> {
  if (useSynty && model !== 'barrier') return instantiateSyntyCharacter(model, look);
  const gltf = await loadGltf(`characters/${model}.glb`);
  const root = SkeletonUtils.clone(gltf.scene);
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
