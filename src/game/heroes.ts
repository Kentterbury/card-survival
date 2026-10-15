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
  aim: {
    id: 'aim', name: '조준 사격', target: 'lane',
    text: '줄 하나의 맨 앞 적 하수인에게 피해를 2 줍니다. 줄이 비었으면 적 영웅에게 피해 1.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      const m = api.frontFoe(t.lane);
      if (m) api.damage({ kind: 'unit', uid: m.uid }, 2);
      else api.damageFoeHero(1);
    },
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
  {
    id: 'hunter', name: '숲의 사냥꾼', title: '원거리', model: 'Rogue_Hooded', health: 22, power: 'aim',
    blurb: '방패병 뒤에서 궁수들이 줄째로 쏘아 떨어뜨린다.',
    deck: ['crossbowman', 'crossbowman', 'longbow', 'glider', 'shieldbearer', 'squire', 'firebolt', 'volley', 'frostring', 'regroup'],
  },
];

export function heroDef(id: string): HeroDef {
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}
