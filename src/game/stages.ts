import type { ModelId } from './types';

/** The enemy commander's 지휘술 (see POWERS in heroes.ts): `summon` 망자 소환, `curse` 저주의 손길. */
export type EnemyPower = 'summon' | 'curse';

export interface StageDef {
  name: string;
  subtitle: string;
  hero: { name: string; model: ModelId; scale: number; health: number };
  power: EnemyPower;
  deck: string[];
}

const x = (id: string, n: number) => Array<string>(n).fill(id);

export const STAGES: StageDef[] = [
  {
    name: '무너진 성문', subtitle: '해골 하사가 길을 막는다',
    hero: { name: '해골 하사', model: 'Skeleton_Warrior', scale: 1.5, health: 12 },
    power: 'summon',
    deck: [...x('sk_minion', 5), ...x('sk_rogue', 2), ...x('sk_warrior', 2), 'sk_captain', ...x('e_curse', 2), ...x('e_bonearmor', 2)],
  },
  {
    name: '횃불의 회랑', subtitle: '날랜 추적자들의 대장',
    hero: { name: '추적자 대장', model: 'Skeleton_Rogue', scale: 1.5, health: 16 },
    power: 'curse',
    deck: [...x('sk_minion', 2), ...x('sk_rogue', 3), ...x('sk_undying', 2), ...x('sk_wraith', 2), ...x('sk_berserker', 2), ...x('e_curse', 2), ...x('e_raise', 2)],
  },
  {
    name: '주술사의 서고', subtitle: '멀리서 날아오는 저주',
    hero: { name: '서고의 주술사', model: 'Skeleton_Mage', scale: 1.5, health: 20 },
    power: 'curse',
    deck: [...x('sk_minion', 3), ...x('sk_mage', 3), 'sk_leech', 'sk_shieldwall', 'sk_warrior', 'e_curse', 'e_hex', ...x('e_chill', 2), ...x('e_darkwave', 2), 'e_drain', 'e_insight'],
  },
  {
    name: '뼈의 납골당', subtitle: '거대한 것이 깨어난다',
    hero: { name: '납골당 수호자', model: 'Skeleton_Warrior', scale: 1.7, health: 24 },
    power: 'summon',
    deck: [...x('sk_phalanx', 3), ...x('sk_pikeman', 2), 'sk_thorn', 'sk_regen', ...x('sk_guard', 2), ...x('sk_brute', 2), ...x('e_bonearmor', 2), ...x('e_warcry', 2), 'e_raise'],
  },
  {
    name: '군주의 왕좌', subtitle: '최종 결전',
    hero: { name: '해골 군주', model: 'Skeleton_Mage', scale: 1.9, health: 30 },
    power: 'summon',
    deck: [
      ...x('sk_undying', 2), 'sk_wraith', 'sk_rogue', 'sk_pikeman', 'sk_reaper', 'sk_leech', 'sk_mage', 'sk_shieldwall', 'sk_guard', ...x('sk_brute', 2),
      'e_darkwave', 'e_drain', 'e_hex', ...x('e_soulfire', 2), 'e_warcry', 'e_insight',
    ],
  },
];
