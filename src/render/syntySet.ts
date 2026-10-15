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

export type Pack = 'Knights' | 'Kingdom' | 'Dungeon' | 'Fantasy';

/**
 * One character look: a mesh from a pack GLB (characters/Pack_<pack>.glb), an optional
 * colour variant of the pack atlas (textures/<tex>.png), weapons from weapons/ in each hand,
 * and a size multiplier. Animations still come from the card's ModelId (SYNTY_ANIMS).
 */
export interface Look {
  pack: Pack;
  mesh: string;
  tex?: string;
  /** Right-hand and left-hand weapon files (weapons/<file>.glb). */
  r?: string;
  l?: string;
  scale?: number;
}

const look = (pack: Pack, mesh: string, tex?: string, r?: string, l?: string, scale?: number): Look =>
  ({ pack, mesh, tex, r, l, scale });
const KN = (mesh: string, tex: string, r?: string, l?: string, scale?: number) => look('Knights', `Character_${mesh}`, `Knights_${tex}`, r, l, scale);
const KG = (mesh: string, r?: string, l?: string, scale?: number) => look('Kingdom', `SM_Chr_${mesh}_01`, undefined, r, l, scale);
const DG = (mesh: string, tex: number, r?: string, l?: string, scale?: number) => look('Dungeon', `Character_${mesh}`, `Dungeon_${tex}`, r, l, scale);
const FC = (mesh: string, tex: string, r?: string, l?: string, scale?: number) => look('Fantasy', `Character_${mesh}`, `Fantasy_${tex}`, r, l, scale);

/**
 * Looks by card id, `hero:<heroId>` and `boss:<commander name>`, so every unit and hero
 * reads differently. Anything missing falls back to DEFAULT_LOOKS by ModelId.
 */
export const LOOKS: Record<string, Look> = {
  // ── Heroes
  'hero:captain': DG('Hero_Knight_Male', 1, 'SM_Wep_Broadsword_01', 'SM_Wep_Shield_02'),
  'hero:arcanist': FC('Male_Wizard', '1A', 'SM_Wep_Staff_01'),
  'hero:warchief': FC('Male_King', '3A', 'SM_Wep_Ornate_GreatAxe_01'),
  'hero:hunter': FC('Female_Druid', '1A', undefined, 'SM_Prop_Bow_01'),
  // ── 수비대장's knights and soldiers: one mesh/colour/weapon set each
  squire: KN('Soldier_01', 'Blue', 'SM_Wep_Sword_01'),
  shieldbearer: KN('Soldier_01', 'Yellow', undefined, 'SM_Wep_Shield_01'),
  veteran: KN('Soldier_02', 'Blue', 'SM_Wep_Spear_08'),
  fortress: KN('Knight_02', 'Black', 'SM_Wep_Hammer_02', 'SM_Wep_Shield_03'),
  warden: DG('Hero_Knight_Female', 2, undefined, 'SM_Wep_Shield_Heater_01'),
  mace_knight: KN('Knight_03', 'Orange', 'SM_Wep_Mace_01'),
  phalanx: KG('Soldier_Male', 'SM_Wep_Spear_02', 'SM_Wep_Shield_04'),
  stalwart: KN('Knight_01', 'Yellow', 'SM_Wep_Broadsword_01'),
  thornguard: KN('Knight_01', 'Black', 'SM_Wep_Sword_05', 'SM_Wep_Shield_Spike_01'),
  cover_knight: KN('Knight_02', 'Blue', undefined, 'SM_Wep_Shield_02'),
  vanguard_captain: KG('Soldier_Female', 'SM_Wep_Sword_05', 'SM_Wep_Shield_04'),
  c_standard: KN('Soldier_02', 'Yellow', 'SM_Wep_Banner_01'),
  c_commander: KN('Knight_03', 'Yellow', 'SM_Wep_Zweihander_01'),
  // ── Mages and priests
  apprentice: KG('Mage', 'SM_Wep_Staff_03'),
  medic: KG('Nun'),
  stormcaller: FC('Male_Sorcerer', '2A', 'SM_Wep_Staff_06'),
  archmage: KG('Hermit', 'SM_Wep_Staff_Gem_01'),
  siege_mage: FC('Female_Witch', '1A', 'SM_Wep_Staff_01'),
  priest: KG('Priest', 'SM_Wep_Sceptre_04'),
  monk: KG('Monk', 'SM_Wep_Staff_03'),
  a_scholar: KG('FortuneTeller', 'SM_Wep_Sceptre_04'),
  // ── Axe mercenaries
  berserker: KG('Headsman', 'SM_Wep_Axe_03'),
  warlord: KN('Knight_01', 'Orange', 'SM_Wep_Ornate_GreatAxe_01'),
  bomber: KG('Peasant_Male'),
  blood_blade: KN('Soldier_01', 'Orange', 'SM_Wep_Cutlass_01'),
  greatsword: KN('Soldier_02', 'Orange', 'SM_Wep_Greatsword_Straight_01'),
  brawler: KG('Blacksmith_Male', 'SM_Wep_Hammer_02'),
  w_rider: KG('Rider', 'SM_Wep_Spear_02'),
  w_axelord: KN('Knight_02', 'Orange', 'SM_Wep_Axe_06'),
  // ── Scouts and archers
  crossbowman: FC('Male_Rouge_01', '1A', 'SM_Prop_Crossbow_01'),
  shadowblade: FC('Male_Rouge_01', '5A', 'SM_Wep_Dagger_05'),
  longbow: FC('Male_Peasant_01', '2A', undefined, 'SM_Prop_Bow_01'),
  glider: KG('Fairy', 'SM_Wep_Dagger_05'),
  h_trapper: FC('Female_Gypsy', '1A', undefined, 'SM_Prop_Bow_01'),
  h_sniper: FC('Male_Baird', '3A', 'SM_Prop_Crossbow_01'),
  // ── The undead: four bone colours, five skeleton bodies, ghosts and the hooded soul
  sk_minion: DG('Skeleton_Slave_01', 1, 'SM_Wep_Bone_01'),
  sk_rogue: DG('Skeleton_Soldier_02', 1, 'SM_Wep_BrokenSword_01'),
  sk_warrior: DG('Skeleton_Soldier_01', 1, 'SM_Wep_Sword_01', 'SM_Wep_Shield_Round_01'),
  sk_mage: DG('Tormented_Soul', 1, 'SM_Wep_Staff_01'),
  sk_guard: DG('Skeleton_Knight', 2, 'SM_Wep_Cutlass_01', 'SM_Wep_Shield_Gravestone_01'),
  sk_brute: DG('Skeleton_Knight', 4, 'SM_Wep_Hammer_Large_Metal_01'),
  sk_wraith: DG('Ghost_01', 1, 'SM_Wep_Dagger_05'),
  sk_undying: DG('Skeleton_Slave_01', 3, 'SM_Wep_BrokenSword_01'),
  sk_pikeman: DG('Skeleton_Soldier_01', 2, 'SM_Wep_Ornate_Spear_01'),
  sk_phalanx: DG('Skeleton_Soldier_01', 3, 'SM_Wep_Spear_02', 'SM_Wep_Shield_Bone_01'),
  sk_leech: DG('Tormented_Soul', 2, 'SM_Wep_Sceptre_04'),
  sk_captain: DG('Skeleton_Knight', 3, 'SM_Wep_Broadsword_01'),
  sk_berserker: DG('Skeleton_Soldier_02', 4, 'SM_Wep_Axe_03'),
  sk_shieldwall: DG('Skeleton_Soldier_01', 4, undefined, 'SM_Wep_Shield_Skull_01'),
  sk_thorn: DG('Skeleton_Slave_01', 2, undefined, 'SM_Wep_Shield_Spike_01'),
  sk_regen: DG('Skeleton_Slave_01', 4, 'SM_Wep_Bone_01'),
  sk_reaper: DG('Skeleton_Soldier_02', 3, 'SM_Wep_Halberd_06'),
  sk_drummer: DG('Skeleton_Slave_01', 1, 'SM_Wep_Mace_01'),
  sk_assassin: DG('Skeleton_Soldier_02', 2, 'SM_Wep_Dagger_05'),
  sk_acolyte: DG('Ghost_02', 1, 'SM_Wep_Staff_03'),
  sk_deathknight: DG('Skeleton_Knight', 1, 'SM_Wep_Greatsword_Straight_01'),
  // ── Commanders
  'boss:해골 하사': DG('Skeleton_Knight', 1, 'SM_Wep_Sword_05', 'SM_Wep_Shield_Skull_01'),
  'boss:추적자 대장': DG('Skeleton_Soldier_02', 1, 'SM_Wep_Cutlass_01'),
  'boss:서고의 주술사': DG('Tormented_Soul', 4, 'SM_Wep_Staff_Gem_01'),
  'boss:납골당 수호자': DG('Skeleton_Knight', 4, 'SM_Wep_Hammer_Large_Metal_01', 'SM_Wep_Shield_Gravestone_01'),
  'boss:해골 군주': DG('Skeleton_Knight', 3, 'SM_Wep_Staff_Gem_01', 'SM_Wep_Shield_Skull_01'),
};

/** Looks for anything without its own entry (by ModelId). */
export const DEFAULT_LOOKS: Record<CharModel, Look> = {
  Knight: KN('Knight_01', 'Blue', 'SM_Wep_Sword_01', 'SM_Wep_Shield_01'),
  Barbarian: KN('Knight_01', 'Orange', 'SM_Wep_Axe_03'),
  Mage: FC('Male_Wizard', '1A', 'SM_Wep_Staff_01'),
  Rogue: FC('Male_Rouge_01', '1A', 'SM_Prop_Crossbow_01'),
  Rogue_Hooded: FC('Female_Druid', '1A', undefined, 'SM_Prop_Bow_01'),
  Skeleton_Minion: DG('Skeleton_Slave_01', 1, 'SM_Wep_Bone_01'),
  Skeleton_Warrior: DG('Skeleton_Knight', 1, 'SM_Wep_Sword_01'),
  Skeleton_Rogue: DG('Skeleton_Soldier_02', 1, 'SM_Wep_Dagger_05'),
  Skeleton_Mage: DG('Tormented_Soul', 1, 'SM_Wep_Staff_01'),
};

/** Grip of each held item in the hand bone's space (Euler XYZ, degrees), tuned by eye. */
export function grip(file: string, hand: 'r' | 'l'): [number, number, number] {
  if (file.includes('Crossbow')) return [0, -90, 0];
  if (file.includes('Bow')) return [0, 90, 0];
  // Polygon Dungeon shields are modelled tilted; the Knights ones upright.
  if (hand === 'l') return /Shield_(Skull|Heater|Round|Gravestone|Bone|Spike)/.test(file) ? [0, 90, 45] : [0, 90, 0];
  return [90, 0, 45];
}

/** Every file a look can reference, so the loader can fetch them up front. */
export const SYNTY_PACKS: Pack[] = ['Knights', 'Kingdom', 'Dungeon', 'Fantasy'];
const allLooks = [...Object.values(LOOKS), ...Object.values(DEFAULT_LOOKS)];
export const SYNTY_WEAPON_FILES = [...new Set(allLooks.flatMap((l) => [l.r, l.l]).filter((f): f is string => !!f))];
export const SYNTY_TEXTURES = [...new Set(allLooks.map((l) => l.tex).filter((t): t is string => !!t))];

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


/**
 * Death clips (Mixamo downloads retargeted into anims.glb, see docs/SYNTY.md). Units whose clip
 * is not in the library fall back to the coded topple in UnitView.die().
 */
const DEATHS: Record<string, string[]> = {
  // Mixamo "Sword And Shield Death": shield bearers go down behind their shield.
  Death_Shield: ['hero:captain', 'shieldbearer', 'fortress', 'warden', 'thornguard', 'cover_knight', 'phalanx', 'vanguard_captain',
    'sk_guard', 'sk_shieldwall', 'sk_phalanx', 'sk_thorn', 'boss:해골 하사', 'boss:납골당 수호자'],
  // "Two Handed Sword Death": heavy two-handers.
  Death_Heavy: ['hero:warchief', 'greatsword', 'warlord', 'w_axelord', 'c_commander', 'stalwart', 'sk_brute', 'sk_deathknight', 'sk_reaper'],
  // "Falling Forward Death": fast skirmishers pitch forward.
  Death_Forward: ['shadowblade', 'w_rider', 'glider', 'berserker', 'sk_rogue', 'sk_assassin', 'sk_berserker', 'boss:추적자 대장'],
  // "Death From Front Headshot": archers snap back.
  Death_Shot: ['hero:hunter', 'crossbowman', 'longbow', 'h_trapper', 'h_sniper'],
  // "Dying": casters and priests sink to their knees.
  Death_Kneel: ['hero:arcanist', 'apprentice', 'medic', 'stormcaller', 'priest', 'monk', 'a_scholar', 'bomber'],
  // "Dying Backwards": dark casters stagger back.
  Death_Caster: ['archmage', 'siege_mage', 'sk_mage', 'sk_leech', 'sk_acolyte', 'boss:서고의 주술사', 'boss:해골 군주'],
  // "Zombie Dying": the rank-and-file dead collapse.
  Death_Undead: ['sk_minion', 'sk_undying', 'sk_regen', 'sk_drummer', 'sk_wraith', 'sk_warrior', 'sk_captain', 'sk_pikeman'],
};
const DEATH_OF = new Map(Object.entries(DEATHS).flatMap(([clip, keys]) => keys.map((k) => [k, clip] as const)));

/**
 * Death clips a look can use, best first: its own, then "Falling Back Death" (Death_Back) for
 * everyone else, then "Dying Backwards" while Death_Back is not downloaded.
 */
export function deathClipsFor(key: string | undefined): string[] {
  const own = key && DEATH_OF.get(key);
  return [...(own ? [own] : []), 'Death_Back', 'Death_Caster'];
}
