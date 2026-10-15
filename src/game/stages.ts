import type { ModelId } from './types';

/** The enemy commander's 지휘술 (see POWERS in heroes.ts): `summon` 망자 소환, `curse` 저주의 손길. */
export type EnemyPower = 'summon' | 'rush' | 'curse' | 'bonewall' | 'legion';

export interface StageDef {
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
 * up late. Each commander has a clear theme.
 */
export const STAGES: StageDef[] = [
  {
    name: '무너진 성문', subtitle: '해골 하사가 길을 막는다', concept: '졸개 물량과 진군',
    hero: { name: '해골 하사', model: 'Skeleton_Warrior', scale: 1.5, health: 12 },
    power: 'summon', startMana: 3,
    deck: [
      ...x('sk_minion', 5), ...x('sk_drummer', 2), ...x('e_bonearmor', 2), ...x('e_curse', 2), 'e_march',
      ...x('sk_rogue', 2), 'sk_captain', 'sk_warrior',
    ],
  },
  {
    name: '횃불의 회랑', subtitle: '날랜 추적자들의 대장', concept: '빠른 기습과 매복',
    hero: { name: '추적자 대장', model: 'Skeleton_Rogue', scale: 1.5, health: 18 },
    power: 'rush', startMana: 3,
    deck: [
      ...x('sk_minion', 2), ...x('e_curse', 2), ...x('sk_rogue', 3), ...x('sk_undying', 2), ...x('e_ambush', 2),
      ...x('sk_wraith', 2), ...x('sk_assassin', 2), 'sk_berserker',
    ],
  },
  {
    name: '주술사의 서고', subtitle: '멀리서 날아오는 저주', concept: '원거리 저주와 빙결',
    hero: { name: '서고의 주술사', model: 'Skeleton_Mage', scale: 1.5, health: 20 },
    power: 'curse', startMana: 4,
    deck: [
      ...x('sk_acolyte', 3), ...x('e_frostbolt', 2), ...x('e_chill', 2), 'e_hex', 'e_insight',
      ...x('sk_mage', 3), ...x('e_darkwave', 2), 'e_drain', 'sk_shieldwall', 'sk_leech',
    ],
  },
  {
    name: '뼈의 납골당', subtitle: '거대한 것이 깨어난다', concept: '뼈 장벽과 거인',
    hero: { name: '납골당 수호자', model: 'Skeleton_Warrior', scale: 1.7, health: 20 },
    power: 'bonewall', startMana: 3,
    deck: [
      ...x('e_bonearmor', 2), ...x('sk_phalanx', 3), 'e_bonewall', 'sk_thorn', 'sk_regen', ...x('sk_pikeman', 2), 'sk_warrior',
      'e_warcry', 'sk_guard', 'sk_brute',
    ],
  },
  {
    name: '군주의 왕좌', subtitle: '최종 결전', concept: '사령술과 불사의 군단',
    hero: { name: '해골 군주', model: 'Skeleton_Mage', scale: 1.9, health: 30 },
    power: 'legion', startMana: 4,
    deck: [
      ...x('sk_undying', 2), 'e_hex', 'e_insight', 'sk_wraith', ...x('sk_mage', 2), 'sk_assassin', 'sk_warrior',
      'e_darkwave', 'e_drain', 'e_warcry', 'sk_shieldwall', 'sk_leech',
      'e_mass_raise', 'sk_reaper', 'e_soulfire', 'sk_deathknight',
    ],
  },
];
