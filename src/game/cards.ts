import type { Rng } from './rng';
import type { Keyword, Minion, ModelId, Monster, Target, TargetKind } from './types';

/** What card effects are allowed to do. Implemented by the engine. */
export interface EffectApi {
  rng: Rng;
  monsters(): Monster[];
  minions(): Minion[];
  monstersInLane(lane: number): Monster[];
  frontMonster(lane: number): Monster | undefined;
  damage(uid: number, amount: number): void;
  healHero(amount: number): void;
  draw(count: number): void;
  buff(uid: number, attack: number, health: number): void;
  freeze(uid: number): void;
  push(uid: number, rows: number): void;
  summon(defId: string, lane: number): void;
}

export type Rarity = 'basic' | 'common' | 'rare' | 'epic';
export type SpellIcon = 'bolt' | 'fire' | 'frost' | 'storm' | 'wave' | 'heart' | 'shield' | 'scroll' | 'meteor' | 'sword';

interface BaseCard {
  id: string;
  name: string;
  cost: number;
  rarity: Rarity;
  text: string;
}

export interface MinionCard extends BaseCard {
  type: 'minion';
  attack: number;
  health: number;
  model: ModelId;
  keywords?: Keyword[];
  scale?: number;
  onSummon?: (api: EffectApi, self: Minion) => void;
  onDeath?: (api: EffectApi, self: Minion) => void;
  onEndTurn?: (api: EffectApi, self: Minion) => void;
}

export interface SpellCard extends BaseCard {
  type: 'spell';
  target: TargetKind;
  icon: SpellIcon;
  cast: (api: EffectApi, target: Target) => void;
}

export type CardDef = MinionCard | SpellCard;

const randomMonster = (api: EffectApi) => {
  const all = api.monsters();
  return all.length ? api.rng.pick(all) : undefined;
};

const CARD_LIST: CardDef[] = [
  // ── Minions ────────────────────────────────────────────────
  {
    id: 'squire', name: '견습 검사', type: 'minion', cost: 1, rarity: 'basic',
    attack: 1, health: 3, model: 'Knight', scale: 0.85,
    text: '',
  },
  {
    id: 'crossbowman', name: '석궁병', type: 'minion', cost: 2, rarity: 'basic',
    attack: 2, health: 1, model: 'Rogue', keywords: ['ranged'],
    text: '<b>사격</b>',
  },
  {
    id: 'shieldbearer', name: '방패병', type: 'minion', cost: 2, rarity: 'basic',
    attack: 0, health: 5, model: 'Knight', keywords: ['ward'],
    text: '<b>보호막</b>',
  },
  {
    id: 'apprentice', name: '견습 마법사', type: 'minion', cost: 2, rarity: 'basic',
    attack: 1, health: 2, model: 'Mage', keywords: ['ranged'],
    text: '<b>사격</b>. <b>등장 시:</b> 이 줄의 맨 앞 몬스터에게 피해를 2 줍니다.',
    onSummon: (api, self) => {
      const m = api.frontMonster(self.lane);
      if (m) api.damage(m.uid, 2);
    },
  },
  {
    id: 'berserker', name: '광전사', type: 'minion', cost: 3, rarity: 'basic',
    attack: 4, health: 3, model: 'Barbarian', keywords: ['swift'],
    text: '<b>기습</b>',
  },
  {
    id: 'medic', name: '야전 의무병', type: 'minion', cost: 2, rarity: 'common',
    attack: 1, health: 3, model: 'Mage', scale: 0.9,
    text: '<b>등장 시:</b> 영웅의 생명력을 5 회복합니다.',
    onSummon: (api) => api.healHero(5),
  },
  {
    id: 'shadowblade', name: '그림자 단검수', type: 'minion', cost: 3, rarity: 'common',
    attack: 3, health: 2, model: 'Rogue_Hooded', keywords: ['swift', 'ranged'],
    text: '<b>기습</b>. <b>사격</b>',
  },
  {
    id: 'veteran', name: '노련한 창병', type: 'minion', cost: 4, rarity: 'common',
    attack: 3, health: 6, model: 'Knight',
    text: '<b>파괴 시:</b> 같은 칸에 견습 검사를 소환합니다.',
    onDeath: (api, self) => api.summon('squire', self.lane),
  },
  {
    id: 'fortress', name: '성채 기사', type: 'minion', cost: 5, rarity: 'rare',
    attack: 4, health: 8, model: 'Knight', keywords: ['ward'], scale: 1.15,
    text: '<b>보호막</b>',
  },
  {
    id: 'warlord', name: '전쟁 군주', type: 'minion', cost: 6, rarity: 'rare',
    attack: 5, health: 6, model: 'Barbarian', scale: 1.2,
    text: '<b>등장 시:</b> 다른 아군 하수인 모두에게 +1/+1을 부여합니다.',
    onSummon: (api, self) => {
      for (const m of api.minions()) if (m.uid !== self.uid) api.buff(m.uid, 1, 1);
    },
  },
  {
    id: 'stormcaller', name: '폭풍 술사', type: 'minion', cost: 4, rarity: 'rare',
    attack: 2, health: 4, model: 'Mage', keywords: ['ranged'],
    text: '<b>사격</b>. 내 턴이 끝날 때 무작위 몬스터에게 피해를 2 줍니다.',
    onEndTurn: (api) => {
      const m = randomMonster(api);
      if (m) api.damage(m.uid, 2);
    },
  },
  {
    id: 'archmage', name: '대마법사', type: 'minion', cost: 7, rarity: 'epic',
    attack: 4, health: 6, model: 'Mage', keywords: ['ranged'], scale: 1.2,
    text: '<b>사격</b>. 내 턴이 끝날 때 모든 몬스터에게 피해를 1 줍니다.',
    onEndTurn: (api) => {
      for (const m of api.monsters()) api.damage(m.uid, 1);
    },
  },
  {
    id: 'barricade_token', name: '바리케이드', type: 'minion', cost: 0, rarity: 'basic',
    attack: 0, health: 6, model: 'barrier',
    text: '공격하지 않습니다.',
  },

  // ── Spells ─────────────────────────────────────────────────
  {
    id: 'firebolt', name: '불꽃 화살', type: 'spell', cost: 1, rarity: 'basic',
    target: 'monster', icon: 'fire',
    text: '몬스터 하나에게 피해를 3 줍니다.',
    cast: (api, t) => { if (t.kind === 'monster') api.damage(t.uid, 3); },
  },
  {
    id: 'shockwave', name: '충격파', type: 'spell', cost: 2, rarity: 'basic',
    target: 'lane', icon: 'wave',
    text: '한 줄의 몬스터 모두에게 피해를 1 주고 2칸 뒤로 밀어냅니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      // Push from the back so monsters do not block each other.
      const ms = [...api.monstersInLane(t.lane)].sort((a, b) => b.row - a.row);
      for (const m of ms) { api.damage(m.uid, 1); api.push(m.uid, 2); }
    },
  },
  {
    id: 'frostring', name: '서리 고리', type: 'spell', cost: 2, rarity: 'common',
    target: 'lane', icon: 'frost',
    text: '한 줄의 몬스터 모두에게 피해를 1 주고 <b>빙결</b>시킵니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      for (const m of api.monstersInLane(t.lane)) { api.damage(m.uid, 1); api.freeze(m.uid); }
    },
  },
  {
    id: 'thunderbolt', name: '낙뢰', type: 'spell', cost: 3, rarity: 'common',
    target: 'monster', icon: 'bolt',
    text: '몬스터 하나에게 피해를 5 줍니다.',
    cast: (api, t) => { if (t.kind === 'monster') api.damage(t.uid, 5); },
  },
  {
    id: 'chainspark', name: '연쇄 전격', type: 'spell', cost: 3, rarity: 'rare',
    target: 'monster', icon: 'storm',
    text: '몬스터 하나에게 피해를 3 주고, 양옆 줄의 맨 앞 몬스터에게 피해를 2 줍니다.',
    cast: (api, t) => {
      if (t.kind !== 'monster') return;
      const main = api.monsters().find((m) => m.uid === t.uid);
      if (!main) return;
      const lane = main.lane;
      api.damage(main.uid, 3);
      for (const l of [lane - 1, lane + 1]) {
        const m = api.frontMonster(l);
        if (m) api.damage(m.uid, 2);
      }
    },
  },
  {
    id: 'flamewave', name: '화염 파도', type: 'spell', cost: 4, rarity: 'rare',
    target: 'none', icon: 'fire',
    text: '모든 몬스터에게 피해를 2 줍니다.',
    cast: (api) => { for (const m of api.monsters()) api.damage(m.uid, 2); },
  },
  {
    id: 'meteor', name: '운석 낙하', type: 'spell', cost: 6, rarity: 'epic',
    target: 'lane', icon: 'meteor',
    text: '한 줄의 몬스터 모두에게 피해를 6 줍니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      for (const m of api.monstersInLane(t.lane)) api.damage(m.uid, 6);
    },
  },
  {
    id: 'rally', name: '결의', type: 'spell', cost: 1, rarity: 'common',
    target: 'minion', icon: 'sword',
    text: '아군 하수인 하나에게 +2/+2를 부여합니다.',
    cast: (api, t) => { if (t.kind === 'minion') api.buff(t.uid, 2, 2); },
  },
  {
    id: 'regroup', name: '재정비', type: 'spell', cost: 2, rarity: 'common',
    target: 'none', icon: 'scroll',
    text: '카드를 2장 뽑습니다.',
    cast: (api) => api.draw(2),
  },
  {
    id: 'barricade', name: '바리케이드 설치', type: 'spell', cost: 2, rarity: 'common',
    target: 'slot', icon: 'shield',
    text: '빈 칸에 0/6 바리케이드를 설치합니다.',
    cast: (api, t) => { if (t.kind === 'slot') api.summon('barricade_token', t.lane); },
  },
  {
    id: 'sanctuary', name: '성역의 빛', type: 'spell', cost: 3, rarity: 'rare',
    target: 'none', icon: 'heart',
    text: '영웅의 생명력을 6 회복하고 아군 하수인 모두에게 +0/+2를 부여합니다.',
    cast: (api) => {
      api.healHero(6);
      for (const m of api.minions()) api.buff(m.uid, 0, 2);
    },
  },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(CARD_LIST.map((c) => [c.id, c]));

export function card(id: string): CardDef {
  const def = CARDS[id];
  if (!def) throw new Error(`unknown card ${id}`);
  return def;
}

export const STARTER_DECK = [
  'squire', 'squire', 'crossbowman', 'crossbowman', 'shieldbearer',
  'apprentice', 'berserker', 'firebolt', 'firebolt', 'shockwave',
];

export const KEYWORD_INFO: Record<Keyword, { name: string; text: string }> = {
  swift: { name: '기습', text: '소환된 턴에 바로 공격할 수 있습니다.' },
  ranged: { name: '사격', text: '같은 줄의 몬스터라면 거리와 상관없이 공격하며, 반격을 받지 않습니다.' },
  ward: { name: '보호막', text: '처음 받는 피해를 무시합니다.' },
};
