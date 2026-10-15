import type { EffectApi } from './cards';
import type { ModelId, Target, TargetKind } from './types';

/** A hero's 지휘술: once per turn, for its own mana cost. */
export interface HeroPower {
  id: string;
  name: string;
  cost: number;
  text: string;
  target: TargetKind;
  cast: (api: EffectApi, target: Target) => void;
}

export const POWERS: Record<string, HeroPower> = {
  guard: {
    id: 'guard', name: '방패 명령', cost: 1, target: 'ally',
    text: '아군 하수인 하나에게 <b>보호막</b>을 부여합니다.',
    cast: (api, t) => { if (t.kind === 'unit') api.grantKeyword(t.uid, 'ward'); },
  },
  bolt: {
    id: 'bolt', name: '비전 화살', cost: 4, target: 'foe',
    text: '적 하나(영웅 포함)에게 피해를 1 줍니다.',
    cast: (api, t) => api.damage(t, 1),
  },
  charge: {
    id: 'charge', name: '돌격 명령', cost: 8, target: 'ally',
    text: '아군 하수인 하나에게 +1/+1을 주고 한 칸 전진시킵니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 1, 1); api.advance(t.uid, 1); } },
  },
  aim: {
    id: 'aim', name: '조준 사격', cost: 5, target: 'lane',
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
    id: 'summon', name: '망자 소환', cost: 4, target: 'slot',
    text: '해골 졸개를 소환합니다.',
    cast: (api, t) => { if (t.kind === 'slot') api.summon('sk_minion', t.lane); },
  },
  rush: {
    id: 'rush', name: '추격 명령', cost: 3, target: 'ally',
    text: '아군 하수인 하나를 한 칸 전진시킵니다.',
    cast: (api, t) => { if (t.kind === 'unit') api.advance(t.uid, 1); },
  },
  bonewall: {
    id: 'bonewall', name: '뼈 덧씌우기', cost: 4, target: 'ally',
    text: '아군 하수인 하나에게 +0/+3을 부여합니다.',
    cast: (api, t) => { if (t.kind === 'unit') api.buff(t.uid, 0, 3); },
  },
  legion: {
    id: 'legion', name: '망자 군단', cost: 6, target: 'slot',
    text: '불사 해골을 소환합니다.',
    cast: (api, t) => { if (t.kind === 'slot') api.summon('sk_undying', t.lane); },
  },
  curse: {
    id: 'curse', name: '저주의 손길', cost: 4, target: 'foe',
    text: '적 하나(영웅 포함)에게 피해를 1 줍니다.',
    cast: (api, t) => api.damage(t, 1),
  },
};

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  model: ModelId;
  health: number;
  /** Max mana on the first turn; it then grows by MANA_PER_TURN as usual. */
  startMana: number;
  power: string;
  deck: string[];
  blurb: string;
}

export const HEROES: HeroDef[] = [
  {
    id: 'captain', name: '수비대장', title: '방어', model: 'Knight', health: 36, startMana: 2, power: 'guard',
    blurb: '성문 수비를 도맡아 온 방패 용병단장. 전열을 세우고 버티며 반격한다.',
    deck: ['squire', 'phalanx', 'phalanx', 'shieldbearer', 'crossbowman', 'crossbowman', 'veteran', 'mace_knight', 'firebolt', 'frostring'],
  },
  {
    id: 'arcanist', name: '비전술사', title: '주문', model: 'Mage', health: 18, startMana: 5, power: 'bolt',
    blurb: '금화를 받고 마법을 파는 떠돌이 비전술사. 체력은 낮지만 주문이 강하다.',
    deck: ['apprentice', 'apprentice', 'shieldbearer', 'firebolt', 'firebolt', 'frostring', 'shockwave', 'thunderbolt', 'war_library', 'a_scholar'],
  },
  {
    id: 'warchief', name: '전쟁 족장', title: '돌격', model: 'Barbarian', health: 32, startMana: 4, power: 'charge',
    blurb: '북방에서 건너온 도끼 용병단의 족장. 하수인을 쏟아내 밀어붙인다.',
    deck: ['squire', 'crossbowman', 'phalanx', 'phalanx', 'brawler', 'berserker', 'war_drums', 'firebolt', 'firebolt', 'shockwave'],
  },
  {
    id: 'hunter', name: '척후대장', title: '정찰', model: 'Rogue_Hooded', health: 20, startMana: 3, power: 'aim',
    blurb: '왕국군의 눈이 되어 주는 척후 용병. 정찰병과 궁수로 먼저 보고 먼저 쏜다.',
    deck: ['crossbowman', 'crossbowman', 'longbow', 'glider', 'glider', 'shieldbearer', 'firebolt', 'volley', 'frostring', 'regroup'],
  },
];

export function heroDef(id: string): HeroDef {
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}
