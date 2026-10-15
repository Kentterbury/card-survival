import type { ModelId } from '../game/types';
import type { AnimSet } from './assets';

/**
 * The optional Synty asset set (licensed, kept in a private repository; see docs/SYNTY.md).
 * When `public/synty/manifest.json` exists the game uses these models instead of KayKit.
 * Everything here maps the KayKit names the game already uses onto the Synty files.
 */

/** Synty rigs are in centimetres; this brings them to the KayKit characters' height. */
export const SYNTY_CHAR_SCALE = 0.014;

type CharModel = Exclude<ModelId, 'barrier'>;

/** A static weapon held by a hand bone (offsets are in the rig's centimetre space; tuned by eye). */
export interface HeldWeapon {
  file: string;
  bone: 'Hand_R' | 'Hand_L';
  pos: [number, number, number];
  /** Euler XYZ in degrees. */
  rot: [number, number, number];
}

export const SYNTY_CHARACTERS: Record<CharModel, { weapons?: HeldWeapon[] }> = {
  Knight: {},
  Barbarian: { weapons: [{ file: 'SM_Wep_Axe_03', bone: 'Hand_R', pos: [0, 0, 0], rot: [90, 0, 45] }] },
  Mage: { weapons: [{ file: 'SM_Wep_Staff_01', bone: 'Hand_R', pos: [0, 0, 0], rot: [90, 0, 45] }] },
  Rogue: { weapons: [{ file: 'SM_Prop_Crossbow_01', bone: 'Hand_R', pos: [0, 0, 0], rot: [0, -90, 0] }] },
  Rogue_Hooded: { weapons: [{ file: 'SM_Prop_Bow_01', bone: 'Hand_L', pos: [0, 0, 0], rot: [0, 90, 0] }] },
  Skeleton_Minion: {},
  Skeleton_Warrior: {},
  Skeleton_Rogue: {},
  Skeleton_Mage: { weapons: [{ file: 'SM_Wep_Staff_01', bone: 'Hand_R', pos: [0, 0, 0], rot: [90, 0, 45] }] },
};

/** Clip names in characters/anims.glb (DoubleL animations retargeted onto the Synty rig). */
export const SYNTY_ANIMS: Record<CharModel, AnimSet> = {
  Knight: { idle: 'Idle', walk: 'Walk', attack: 'Attack_1', hit: 'Hit_1', death: '', cheer: 'Cheer' },
  Barbarian: { idle: 'Idle', walk: 'Walk', attack: 'Attack_3', hit: 'Hit_1', death: '', cheer: 'Cheer' },
  Mage: { idle: 'Idle', walk: 'Walk', attack: 'Spellcast_Shoot', hit: 'Hit_1', death: '', cheer: 'Cheer' },
  Rogue: { idle: 'Idle_Bow', walk: 'Walk', attack: 'Shoot', hit: 'Hit_1', death: '', cheer: 'Cheer' },
  Rogue_Hooded: { idle: 'Idle_Bow', walk: 'Walk', attack: 'Shoot', hit: 'Hit_1', death: '', cheer: 'Cheer' },
  Skeleton_Minion: { idle: 'Idle', walk: 'Walk', attack: 'Attack_1', hit: 'Hit_2', death: '', cheer: 'Taunt' },
  Skeleton_Warrior: { idle: 'Idle', walk: 'Walk', attack: 'Attack_3', hit: 'Hit_2', death: '', cheer: 'Taunt' },
  Skeleton_Rogue: { idle: 'Idle', walk: 'Walk', attack: 'Attack_2', hit: 'Hit_2', death: '', cheer: 'Taunt' },
  Skeleton_Mage: { idle: 'Idle', walk: 'Walk', attack: 'Spellcast_Shoot', hit: 'Hit_2', death: '', cheer: 'Taunt' },
};

/**
 * How a Synty piece replaces a KayKit piece. Each piece is fitted into the KayKit piece's
 * bounding box so the board layout (written for KayKit) keeps working:
 *  - box:    stretch to the box on every axis (floors, walls)
 *  - height: uniform scale to the box height, centred on its footprint
 *  - width:  uniform scale to the box width (x), centred on its footprint
 */
export interface StaticSpec {
  file: string;
  fit: 'box' | 'height' | 'width';
  /** Turn the Synty piece before fitting (radians), when it faces another way than KayKit's. */
  rotY?: number;
}

type Box = [[number, number, number], [number, number, number]];

/** Bounding boxes of the KayKit pieces (min, max), measured from public/assets/dungeon. */
export const KAYKIT_BOUNDS: Record<string, Box> = {
  banner_patternA_red: [[-0.75, 0.53, 0.38], [0.75, 3.73, 0.69]],
  banner_shield_blue: [[-1.12, 0.53, 0.32], [1.12, 3.73, 0.69]],
  barrel_large: [[-0.9, 0, -0.9], [0.9, 2, 0.9]],
  barrier: [[-2, 0, -0.25], [2, 1.1, 0.25]],
  barrier_column: [[-2, 0, -0.35], [2, 1.4, 0.35]],
  chest_gold: [[-0.85, 0, -0.7], [0.85, 1.3, 0.75]],
  column: [[-0.35, 0, -0.35], [0.35, 1.4, 0.35]],
  crates_stacked: [[-1.09, 0, -1.16], [1, 2.14, 1.09]],
  floor_dirt_large: [[-2, -0.1, -2], [2, 0.11, 2]],
  floor_tile_big_grate: [[-2, -0.1, -2], [2, 0.05, 2]],
  floor_tile_large: [[-2, -0.1, -2], [2, 0.05, 2]],
  floor_tile_large_rocks: [[-2, -0.1, -2], [2, 0.05, 2]],
  pillar: [[-0.75, 0, -0.75], [0.75, 4, 0.75]],
  pillar_decorated: [[-1.12, 0, -0.75], [1.12, 4, 0.96]],
  rubble_large: [[-4.07, 0, -1.59], [4.06, 3.5, 1.6]],
  sword_shield: [[-1.12, -0.81, -0.08], [1.12, 0.85, 0.25]],
  torch_mounted: [[-0.28, -0.38, 0], [0.28, 0.68, 0.62]],
  wall: [[-2, 0, -0.5], [2, 4, 0.5]],
  wall_corner: [[-2, 0, -0.5], [0.5, 4, 2]],
  wall_cracked: [[-2, 0, -0.63], [2, 4, 0.63]],
  wall_doorway: [[-2, 0, -0.5], [2, 4, 0.5]],
  wall_gated: [[-2, 0, -0.5], [2, 4, 0.5]],
};

export const SYNTY_STATICS: Record<string, StaticSpec> = {
  floor_tile_large: { file: 'SM_Env_Tiles_01', fit: 'box' },
  floor_tile_large_rocks: { file: 'SM_Env_Tiles_05', fit: 'box' },
  floor_dirt_large: { file: 'SM_Env_Tiles_09', fit: 'box' },
  floor_tile_big_grate: { file: 'SM_Env_Tiles_Rune_01', fit: 'box' },
  wall: { file: 'SM_Env_Wall_01', fit: 'box' },
  wall_cracked: { file: 'SM_Env_Wall_02', fit: 'box' },
  wall_doorway: { file: 'SM_Env_Wall_Archway_01', fit: 'box' },
  wall_gated: { file: 'SM_Env_Portcullis_01', fit: 'box' },
  wall_corner: { file: 'SM_Env_Wall_01', fit: 'box' },
  pillar: { file: 'SM_Env_Pillar_Round_01', fit: 'height' },
  pillar_decorated: { file: 'SM_Env_Pillar_Square_01', fit: 'height' },
  column: { file: 'SM_Env_Pillar_Square_01', fit: 'height' },
  torch_mounted: { file: 'SM_Prop_Torch_01', fit: 'height' },
  banner_patternA_red: { file: 'SM_Prop_Banner_01', fit: 'height' },
  banner_shield_blue: { file: 'SM_Prop_Banner_02', fit: 'height' },
  sword_shield: { file: 'SM_Prop_Banner_01', fit: 'height' },
  barrel_large: { file: 'SM_Prop_Barrel_Large_01', fit: 'height' },
  crates_stacked: { file: 'SM_Prop_Crate_Wood_01', fit: 'height' },
  rubble_large: { file: 'SM_Env_Rubble_01', fit: 'width' },
  chest_gold: { file: 'SM_Prop_Chest_01', fit: 'height' },
  barrier: { file: 'SM_Env_SpikeFence_01', fit: 'width' },
  barrier_column: { file: 'SM_Env_Fence_Goblin_01', fit: 'width' },
};

export const SYNTY_WEAPON_FILES = [...new Set(Object.values(SYNTY_CHARACTERS).flatMap((c) => c.weapons?.map((w) => w.file) ?? []))];
