import type { Keyword, ModelId } from './types';

export interface MonsterDef {
  id: string;
  name: string;
  model: ModelId;
  attack: number;
  health: number;
  speed: number;
  range: number;
  keywords?: Keyword[];
  scale?: number;
  boss?: boolean;
  text: string;
  /** Lanes are picked by the stage script; a boss can summon helpers each enemy turn. */
  summonsEachTurn?: string;
}

const LIST: MonsterDef[] = [
  { id: 'minion', name: '해골 졸개', model: 'Skeleton_Minion', attack: 1, health: 3, speed: 1, range: 1, text: '' },
  { id: 'rogue', name: '해골 추적자', model: 'Skeleton_Rogue', attack: 2, health: 3, speed: 2, range: 1, text: '2칸씩 전진합니다.' },
  { id: 'warrior', name: '해골 전사', model: 'Skeleton_Warrior', attack: 3, health: 6, speed: 1, range: 1, text: '' },
  { id: 'mage', name: '해골 주술사', model: 'Skeleton_Mage', attack: 2, health: 4, speed: 1, range: 3, text: '3칸 거리에서 공격합니다.' },
  { id: 'guard', name: '무덤 수호병', model: 'Skeleton_Warrior', attack: 3, health: 8, speed: 1, range: 1, keywords: ['ward'], scale: 1.15, text: '<b>보호막</b>' },
  { id: 'brute', name: '뼈 거인', model: 'Skeleton_Warrior', attack: 6, health: 14, speed: 1, range: 1, scale: 1.45, text: '' },
  {
    id: 'lich', name: '해골 군주', model: 'Skeleton_Mage', attack: 5, health: 45, speed: 1, range: 2, scale: 1.8, boss: true,
    text: '적 턴마다 해골 졸개를 소환합니다. 2칸 거리에서 공격합니다.', summonsEachTurn: 'minion',
  },
];

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(LIST.map((m) => [m.id, m]));

export function monsterDef(id: string): MonsterDef {
  const def = MONSTERS[id];
  if (!def) throw new Error(`unknown monster ${id}`);
  return def;
}
