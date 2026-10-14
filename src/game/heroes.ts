import type { EffectApi } from './cards';
import type { ModelId, Target, TargetKind } from './types';

/** A hero's 지휘술: costs 2 mana, once per turn. */
export interface HeroPower {
  id: string;
  name: string;
  text: string;
  target: TargetKind;
  cast: (api: EffectApi, target: Target) => void;
}

export const POWERS: Record<string, HeroPower> = {
  bolt: {
    id: 'bolt', name: '지휘의 번개', target: 'foe',
    text: '적 하나(영웅 포함)에게 피해를 1 줍니다.',
    cast: (api, t) => api.damage(t, 1),
  },
  insight: {
    id: 'insight', name: '비전 통찰', target: 'none',
    text: '카드를 1장 뽑습니다.',
    cast: (api) => api.draw(1),
  },
  charge: {
    id: 'charge', name: '돌격 명령', target: 'ally',
    text: '아군 하수인 하나에게 +1/+1을 주고 한 칸 전진시킵니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 1, 1); api.advance(t.uid, 1); } },
  },
  // Enemy commanders
  summon: {
    id: 'summon', name: '망자 소환', target: 'slot',
    text: '해골 졸개를 소환합니다.',
    cast: (api, t) => { if (t.kind === 'slot') api.summon('sk_minion', t.lane); },
  },
};

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  model: ModelId;
  health: number;
  power: string;
  deck: string[];
  blurb: string;
}

export const HEROES: HeroDef[] = [
  {
    id: 'captain', name: '수비대장', title: '균형', model: 'Knight', health: 32, power: 'bolt',
    blurb: '하수인과 주문을 고르게 쓰는 기본 영웅.',
    deck: ['squire', 'crossbowman', 'shieldbearer', 'berserker', 'firebolt', 'firebolt', 'shockwave', 'frostring', 'thunderbolt', 'regroup'],
  },
  {
    id: 'arcanist', name: '비전술사', title: '주문', model: 'Mage', health: 22, power: 'insight',
    blurb: '체력은 낮지만 카드를 많이 뽑고 주문으로 싸운다.',
    deck: ['apprentice', 'squire', 'shieldbearer', 'firebolt', 'firebolt', 'frostring', 'shockwave', 'war_library', 'regroup', 'blood_pact'],
  },
  {
    id: 'warchief', name: '전쟁 족장', title: '돌격', model: 'Barbarian', health: 32, power: 'charge',
    blurb: '하수인을 쏟아내고 밀어붙이는 공격형 영웅.',
    deck: ['squire', 'crossbowman', 'phalanx', 'phalanx', 'brawler', 'berserker', 'war_drums', 'firebolt', 'firebolt', 'shockwave'],
  },
];

export function heroDef(id: string): HeroDef {
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}
