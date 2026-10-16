import type { ModelId } from './types';

/** The enemy commander's 지휘술 (see POWERS in heroes.ts): `summon` 망자 소환, `curse` 저주의 손길. */
export type EnemyPower = 'summon' | 'rush' | 'curse' | 'bonewall' | 'legion' | 'howl' | 'ooze' | 'snare';

export interface ChapterDef {
  name: string;
  /** Which board the chapter is fought on. */
  env: 'forest' | 'dungeon';
}

/** 1장 숲 → 2장 던전 → 3장 동굴. The cave board comes later; it uses the dungeon hall for now. */
export const CHAPTERS: ChapterDef[] = [
  { name: '숲', env: 'forest' },
  { name: '던전', env: 'dungeon' },
  { name: '동굴', env: 'dungeon' },
];

export interface StageDef {
  /** Index into CHAPTERS. */
  chapter: number;
  name: string;
  subtitle: string;
  /** The commander's play style, shown on the stage banner and in docs. */
  concept: string;
  hero: { name: string; model: ModelId; scale: number; health: number };
  power: EnemyPower;
  /** The commander's first-turn max mana (the two mage commanders start with more). */
  startMana: number;
  deck: string[];
}

const x = (id: string, n: number) => Array<string>(n).fill(id);

/**
 * Enemy decks are built for the 20-mana scale with +1 mana a turn: cheap cards
 * for the first turns, the bulk at 4–8 mana, and a few finishers that only show
 * up late. Each commander has a clear theme, plus one or two of the other forest
 * kinds and a couple of utility cards (some of them the player's own).
 */
export const STAGES: StageDef[] = [
  // ── 1장 숲
  {
    chapter: 0, name: '숲 어귀', subtitle: '늑대 떼가 길목을 지킨다', concept: '속도: 질주와 기습으로 몰아치는 늑대 떼',
    hero: { name: '늑대 우두머리', model: 'wolf', scale: 1.9, health: 14 },
    power: 'howl', startMana: 2,
    deck: [
      ...x('wolf_pup', 3), ...x('wolf', 2), ...x('wolf_hunter', 3), 'slime', 'sk_hunter',
      'e_howl', 'e_gale', 'e_pack_ambush', 'e_instinct', 'war_drums',
    ],
  },
  {
    chapter: 0, name: '이끼 늪', subtitle: '베어도 베어도 늘어난다', concept: '분열: 죽으면 쪼개지는 슬라임, 독과 덩굴',
    hero: { name: '슬라임 왕', model: 'slime', scale: 2.1, health: 16 },
    power: 'ooze', startMana: 2,
    deck: [
      ...x('slime', 4), ...x('slime_venom', 2), 'slime_acid', 'slime_big', 'wolf', 'sk_moss',
      'e_merge', 'e_slime_coat', 'e_vines', 'e_spore', 'regroup', 'change_plans',
    ],
  },
  {
    chapter: 0, name: '버려진 사냥터', subtitle: '죽어서도 사냥은 끝나지 않았다', concept: '불사: 쓰러져도 일어나는 해골 사냥꾼과 덫',
    hero: { name: '해골 사냥꾼장', model: 'Skeleton_Rogue', scale: 1.5, health: 20 },
    power: 'snare', startMana: 2,
    deck: [
      'sk_hunter', 'sk_moss', 'sk_trapper', 'sk_beastmaster', 'sk_barrow_knight', 'sk_rotwood', 'wolf', 'slime_venom',
      'e_grave_moss', 'e_trap', 'e_grave_vines', 'e_wither', 'e_wisp', 'chains', 'salvage',
    ],
  },
  // ── 2장 던전
  {
    chapter: 1, name: '무너진 성문', subtitle: '해골 하사가 길을 막는다', concept: '졸개 물량과 진군',
    hero: { name: '해골 하사', model: 'Skeleton_Warrior', scale: 1.5, health: 20 },
    power: 'summon', startMana: 3,
    deck: [
      ...x('sk_minion', 5), ...x('sk_drummer', 2), ...x('e_bonearmor', 2), ...x('e_curse', 2), 'e_march',
      ...x('sk_rogue', 2), 'sk_captain', 'sk_warrior',
    ],
  },
  {
    chapter: 1, name: '횃불의 회랑', subtitle: '해골 대장의 정예 부대', concept: '강력한 하수인: 앞에서 버티는 전사들과 뒤에서 쏘는 석궁수',
    hero: { name: '해골 대장', model: 'Skeleton_Rogue', scale: 1.55, health: 28 },
    power: 'rush', startMana: 3,
    deck: [
      ...x('sk_minion', 2), ...x('sk_rogue', 2), ...x('sk_hunter', 2), 'e_bonearmor', 'e_march', 'e_poison_arrow',
      ...x('sk_warrior', 2), 'sk_captain', 'sk_berserker', ...x('sk_crossbow', 2), 'sk_gladiator',
    ],
  },
  {
    chapter: 1, name: '주술사의 서고', subtitle: '멀리서 날아오는 저주', concept: '주문과 원거리: 값싼 주술사 떼가 뒤에서 쏘고 저주와 빙결을 퍼붓는다',
    hero: { name: '서고의 주술사', model: 'Skeleton_Mage', scale: 1.5, health: 24 },
    power: 'curse', startMana: 4,
    deck: [
      ...x('sk_hexling', 3), ...x('sk_acolyte', 2), 'e_coven', ...x('e_frostbolt', 2), 'e_chill', 'e_hex', 'e_insight', 'e_dark_power',
      ...x('sk_mage', 2), ...x('e_darkwave', 2), 'e_drain', 'sk_shieldwall', 'sk_leech',
    ],
  },
  // ── 3장 동굴
  {
    chapter: 2, name: '뼈의 납골당', subtitle: '거대한 것이 깨어난다', concept: '명치가 단단하다: 두꺼운 뼈 장벽과 가호로 지휘관을 감싼다',
    hero: { name: '납골당 수호자', model: 'Skeleton_Warrior', scale: 1.7, health: 32 },
    power: 'bonewall', startMana: 3,
    deck: [
      'e_bonearmor', ...x('e_bone_shield', 2), ...x('sk_phalanx', 3), 'e_bonewall', 'sk_thorn', 'sk_regen', 'sk_pikeman', 'sk_warrior',
      'sk_shieldwall', 'e_warcry', 'sk_guard', 'sk_gatekeeper', 'sk_brute',
    ],
  },
  {
    chapter: 2, name: '군주의 왕좌', subtitle: '최종 결전', concept: '강력한 주문과 하수인: 죽음의 폭풍, 대마도사와 죽음의 기사',
    hero: { name: '해골 군주', model: 'Skeleton_Mage', scale: 1.9, health: 40 },
    power: 'legion', startMana: 4,
    deck: [
      'sk_undying', 'e_grave_frost', ...x('sk_mage', 2), 'sk_plague', 'e_corpse_blast',
      'e_darkwave', 'e_drain', 'e_warcry', 'sk_shieldwall', 'sk_leech',
      'e_soul_mirror', 'e_mass_raise', 'e_death_storm', 'sk_reaper', 'e_soulfire', 'sk_deathknight', 'sk_archlich',
    ],
  },
];

/** "1-2": chapter and stage-within-chapter numbers for a stage index. */
export function stageLabel(stage: number): string {
  const st = STAGES[stage];
  if (!st) return '';
  const nth = STAGES.slice(0, stage + 1).filter((s) => s.chapter === st.chapter).length;
  return `${st.chapter + 1}-${nth}`;
}

/**
 * The merchant comes once a chapter: after its last stage, and in the final chapter right
 * before the last battle.
 */
export function shopAfter(stage: number): boolean {
  const next = STAGES[stage + 1];
  if (!next) return false;
  return next.chapter !== STAGES[stage].chapter || stage + 1 === STAGES.length - 1;
}

/** Saves from before the forest chapter (5 stages) start at the old dungeon stage, 3 later. */
export const OLD_SAVE_STAGE_SHIFT = 3;
