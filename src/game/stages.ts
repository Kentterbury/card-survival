import type { ModelId } from './types';

/** `summon`: 2 mana, summon a 해골 졸개. `bolt`: 2 mana, 1 damage to any foe (hero included). */
export type EnemyPower = 'summon' | 'bolt';

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
    deck: [...x('sk_minion', 6), ...x('sk_rogue', 2), ...x('sk_warrior', 3), ...x('e_curse', 2), ...x('e_bonearmor', 2)],
  },
  {
    name: '횃불의 회랑', subtitle: '날랜 추적자들의 대장',
    hero: { name: '추적자 대장', model: 'Skeleton_Rogue', scale: 1.5, health: 16 },
    power: 'bolt',
    deck: [...x('sk_minion', 4), ...x('sk_rogue', 5), ...x('sk_warrior', 2), ...x('e_curse', 2), ...x('e_raise', 2), 'e_bonearmor'],
  },
  {
    name: '주술사의 서고', subtitle: '멀리서 날아오는 저주',
    hero: { name: '서고의 주술사', model: 'Skeleton_Mage', scale: 1.5, health: 20 },
    power: 'bolt',
    deck: [...x('sk_minion', 3), ...x('sk_mage', 4), ...x('sk_warrior', 2), ...x('e_curse', 2), ...x('e_chill', 2), ...x('e_darkwave', 2), 'e_drain'],
  },
  {
    name: '뼈의 납골당', subtitle: '거대한 것이 깨어난다',
    hero: { name: '납골당 수호자', model: 'Skeleton_Warrior', scale: 1.7, health: 24 },
    power: 'summon',
    deck: [...x('sk_minion', 3), ...x('sk_warrior', 3), ...x('sk_guard', 3), ...x('sk_brute', 2), ...x('e_bonearmor', 2), ...x('e_warcry', 2), 'e_raise'],
  },
  {
    name: '군주의 왕좌', subtitle: '최종 결전',
    hero: { name: '해골 군주', model: 'Skeleton_Mage', scale: 1.9, health: 30 },
    power: 'summon',
    deck: [
      ...x('sk_minion', 2), ...x('sk_rogue', 2), ...x('sk_warrior', 2), ...x('sk_mage', 2), ...x('sk_guard', 2), ...x('sk_brute', 2),
      'e_darkwave', ...x('e_drain', 2), ...x('e_soulfire', 2), 'e_warcry',
    ],
  },
];
