import type { Rng } from './rng';
import type { Keyword, ModelId, Side, Target, TargetKind, Unit } from './types';

/** What card effects may do. Everything is relative to the side that plays the card. */
export interface EffectApi {
  rng: Rng;
  side: Side;
  foes(): Unit[];
  allies(): Unit[];
  foesInLane(lane: number): Unit[];
  /** The opposing unit in `lane` closest to the caster's side. */
  frontFoe(lane: number): Unit | undefined;
  /** Damage a unit, or a hero via `{ kind: 'hero' }`. */
  damage(target: Target, amount: number): void;
  damageFoeHero(amount: number): void;
  healHero(amount: number): void;
  draw(count: number): void;
  buff(uid: number, attack: number, health: number): void;
  /** Restore a unit's health, up to its maximum. */
  healUnit(uid: number, amount: number): void;
  grantWard(uid: number): void;
  /** Mana usable this turn (may go above the maximum). */
  gainMana(amount: number): void;
  /** Move an allied unit forward, toward the foe's side. */
  advance(uid: number, rows: number): void;
  freeze(uid: number): void;
  /** Push an opposing unit back toward its own side. */
  push(uid: number, rows: number): void;
  /** Summon on the caster's home row (no-op if that cell is taken). */
  summon(defId: string, lane: number): void;
  freeHomeLanes(): number[];
}

export type Rarity = 'basic' | 'common' | 'rare' | 'epic';
export type SpellIcon =
  | 'bolt' | 'fire' | 'frost' | 'storm' | 'wave' | 'heart' | 'shield' | 'scroll' | 'meteor' | 'sword'
  | 'skull' | 'curse' | 'arrows' | 'potion';

interface BaseCard {
  id: string;
  name: string;
  cost: number;
  rarity: Rarity;
  text: string;
  /** Cards only the enemy plays (shown with a different frame). */
  enemy?: boolean;
}

export interface MinionCard extends BaseCard {
  type: 'minion';
  attack: number;
  health: number;
  model: ModelId;
  keywords?: Keyword[];
  /** Default 1 (0 for 0-attack units, which hold their position). */
  speed?: number;
  scale?: number;
  onSummon?: (api: EffectApi, self: Unit) => void;
  onDeath?: (api: EffectApi, self: Unit) => void;
  onEndTurn?: (api: EffectApi, self: Unit) => void;
}

/** How the AI should judge a spell (used by the enemy and the test bot). */
export type SpellAi =
  | { kind: 'damage'; amount: number }
  | { kind: 'aoe' }
  | { kind: 'buff' }
  | { kind: 'buffAll' }
  | { kind: 'lane' }
  | { kind: 'summon' }
  | { kind: 'draw' }
  | { kind: 'heal' }
  | { kind: 'control' }
  | { kind: 'ramp' };

export interface SpellCard extends BaseCard {
  type: 'spell';
  target: TargetKind;
  icon: SpellIcon;
  ai: SpellAi;
  cast: (api: EffectApi, target: Target) => void;
}

export type CardDef = MinionCard | SpellCard;

/** Hits the first foe in the lane, or the foe hero if the lane is empty. */
const hitLaneFront = (api: EffectApi, lane: number, amount: number) => {
  const m = api.frontFoe(lane);
  if (m) api.damage({ kind: 'unit', uid: m.uid }, amount);
  else api.damageFoeHero(amount);
};

const randomFoeOrHero = (api: EffectApi, amount: number) => {
  const all = api.foes();
  if (all.length) api.damage({ kind: 'unit', uid: api.rng.pick(all).uid }, amount);
  else api.damageFoeHero(amount);
};

const CARD_LIST: CardDef[] = [
  // ── Player minions ─────────────────────────────────────────
  { id: 'squire', name: '견습 검사', type: 'minion', cost: 1, rarity: 'basic', attack: 1, health: 3, model: 'Knight', scale: 0.85, text: '' },
  { id: 'crossbowman', name: '석궁병', type: 'minion', cost: 2, rarity: 'basic', attack: 2, health: 2, model: 'Rogue', keywords: ['ranged'], text: '<b>사격</b>' },
  {
    id: 'shieldbearer', name: '방패병', type: 'minion', cost: 2, rarity: 'basic', attack: 0, health: 5, model: 'Knight', keywords: ['ward'],
    text: '<b>보호막</b>. 전진하지 않고 자리를 지킵니다.',
  },
  {
    id: 'apprentice', name: '견습 마법사', type: 'minion', cost: 2, rarity: 'basic', attack: 1, health: 2, model: 'Mage', keywords: ['ranged'],
    text: '<b>사격</b>. <b>등장 시:</b> 이 줄의 맨 앞 적에게 피해를 2 줍니다.',
    onSummon: (api, self) => hitLaneFront(api, self.lane, 2),
  },
  { id: 'berserker', name: '광전사', type: 'minion', cost: 3, rarity: 'basic', attack: 4, health: 3, model: 'Barbarian', keywords: ['swift'], text: '<b>기습</b>' },
  {
    id: 'medic', name: '야전 의무병', type: 'minion', cost: 2, rarity: 'common', attack: 1, health: 3, model: 'Mage', scale: 0.9,
    text: '<b>등장 시:</b> 내 영웅의 생명력을 5 회복합니다.', onSummon: (api) => api.healHero(5),
  },
  {
    id: 'shadowblade', name: '그림자 단검수', type: 'minion', cost: 3, rarity: 'common', attack: 3, health: 2, model: 'Rogue_Hooded', keywords: ['swift'], speed: 2,
    text: '<b>기습</b>. 2칸씩 전진합니다.',
  },
  {
    id: 'veteran', name: '노련한 창병', type: 'minion', cost: 4, rarity: 'common', attack: 3, health: 6, model: 'Knight',
    text: '<b>파괴 시:</b> 내 진영에 견습 검사를 소환합니다.', onDeath: (api, self) => api.summon('squire', self.lane),
  },
  { id: 'fortress', name: '성채 기사', type: 'minion', cost: 5, rarity: 'rare', attack: 4, health: 8, model: 'Knight', keywords: ['ward'], scale: 1.15, text: '<b>보호막</b>' },
  {
    id: 'warlord', name: '전쟁 군주', type: 'minion', cost: 6, rarity: 'rare', attack: 5, health: 6, model: 'Barbarian', scale: 1.2,
    text: '<b>등장 시:</b> 다른 아군 하수인 모두에게 +1/+1을 부여합니다.',
    onSummon: (api, self) => { for (const m of api.allies()) if (m.uid !== self.uid) api.buff(m.uid, 1, 1); },
  },
  {
    id: 'stormcaller', name: '폭풍 술사', type: 'minion', cost: 4, rarity: 'rare', attack: 2, health: 4, model: 'Mage', keywords: ['ranged'],
    text: '<b>사격</b>. 내 턴이 끝날 때 무작위 적에게 피해를 2 줍니다.', onEndTurn: (api) => randomFoeOrHero(api, 2),
  },
  {
    id: 'archmage', name: '대마법사', type: 'minion', cost: 7, rarity: 'epic', attack: 4, health: 6, model: 'Mage', keywords: ['ranged'], scale: 1.2,
    text: '<b>사격</b>. 내 턴이 끝날 때 모든 적 하수인에게 피해를 1 줍니다.',
    onEndTurn: (api) => { for (const m of api.foes()) api.damage({ kind: 'unit', uid: m.uid }, 1); },
  },
  {
    id: 'bomber', name: '화염 폭탄병', type: 'minion', cost: 3, rarity: 'common', attack: 2, health: 3, model: 'Barbarian', scale: 0.95,
    text: '<b>파괴 시:</b> 이 줄의 적 모두에게 피해 2.',
    onDeath: (api, self) => { for (const m of api.foesInLane(self.lane)) api.damage({ kind: 'unit', uid: m.uid }, 2); },
  },
  {
    id: 'siege_mage', name: '공성 마법사', type: 'minion', cost: 5, rarity: 'rare', attack: 2, health: 5, model: 'Mage', keywords: ['ranged'], speed: 0, scale: 1.1,
    text: '<b>사격</b>. 제자리 고정. 턴 종료 시 적 영웅에게 피해 2.',
    onEndTurn: (api) => api.damageFoeHero(2),
  },
  {
    id: 'warden', name: '방벽 수호자', type: 'minion', cost: 3, rarity: 'common', attack: 2, health: 6, model: 'Knight', speed: 0, scale: 1.1,
    text: '제자리 고정. <b>등장 시:</b> 양옆에 바리케이드 설치.',
    onSummon: (api, self) => { api.summon('barricade_token', self.lane - 1); api.summon('barricade_token', self.lane + 1); },
  },
  {
    id: 'priest', name: '전장 신관', type: 'minion', cost: 3, rarity: 'rare', attack: 1, health: 4, model: 'Mage', scale: 0.95,
    text: '턴 종료 시 내 영웅과 아군 모두 2 회복.',
    onEndTurn: (api) => { api.healHero(2); for (const m of api.allies()) api.healUnit(m.uid, 2); },
  },
  { id: 'barricade_token', name: '바리케이드', type: 'minion', cost: 0, rarity: 'basic', attack: 0, health: 6, model: 'barrier', text: '움직이지도 공격하지도 않습니다.' },

  // ── Player spells ──────────────────────────────────────────
  {
    id: 'firebolt', name: '불꽃 화살', type: 'spell', cost: 1, rarity: 'basic', target: 'foe', icon: 'fire', ai: { kind: 'damage', amount: 3 },
    text: '적 하나(영웅 포함)에게 피해를 3 줍니다.', cast: (api, t) => api.damage(t, 3),
  },
  {
    id: 'shockwave', name: '충격파', type: 'spell', cost: 2, rarity: 'basic', target: 'lane', icon: 'wave', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 1 주고 2칸 뒤로 밀어냅니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      // Push the farthest first so units do not block each other.
      const ms = [...api.foesInLane(t.lane)].reverse();
      for (const m of ms) { api.damage({ kind: 'unit', uid: m.uid }, 1); api.push(m.uid, 2); }
    },
  },
  {
    id: 'frostring', name: '서리 고리', type: 'spell', cost: 2, rarity: 'basic', target: 'lane', icon: 'frost', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 1 주고 <b>빙결</b>시킵니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      for (const m of api.foesInLane(t.lane)) { api.damage({ kind: 'unit', uid: m.uid }, 1); api.freeze(m.uid); }
    },
  },
  {
    id: 'rally', name: '결의', type: 'spell', cost: 1, rarity: 'basic', target: 'ally', icon: 'sword', ai: { kind: 'buff' },
    text: '아군 하수인 하나에게 +2/+2를 부여합니다.', cast: (api, t) => { if (t.kind === 'unit') api.buff(t.uid, 2, 2); },
  },
  {
    id: 'regroup', name: '재정비', type: 'spell', cost: 2, rarity: 'basic', target: 'none', icon: 'scroll', ai: { kind: 'draw' },
    text: '카드를 2장 뽑습니다.', cast: (api) => api.draw(2),
  },
  {
    id: 'thunderbolt', name: '낙뢰', type: 'spell', cost: 3, rarity: 'common', target: 'foe', icon: 'bolt', ai: { kind: 'damage', amount: 5 },
    text: '적 하나(영웅 포함)에게 피해를 5 줍니다.', cast: (api, t) => api.damage(t, 5),
  },
  {
    id: 'chainspark', name: '연쇄 전격', type: 'spell', cost: 3, rarity: 'rare', target: 'foeUnit', icon: 'storm', ai: { kind: 'damage', amount: 3 },
    text: '적 하수인 하나에게 피해를 3 주고, 양옆 줄의 맨 앞 적에게 피해를 2 줍니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const main = api.foes().find((m) => m.uid === t.uid);
      if (!main) return;
      api.damage(t, 3);
      for (const l of [main.lane - 1, main.lane + 1]) if (l >= 0 && l < 5) hitLaneFront(api, l, 2);
    },
  },
  {
    id: 'flamewave', name: '화염 파도', type: 'spell', cost: 4, rarity: 'rare', target: 'none', icon: 'fire', ai: { kind: 'aoe' },
    text: '모든 적 하수인에게 피해를 2 줍니다.',
    cast: (api) => { for (const m of api.foes()) api.damage({ kind: 'unit', uid: m.uid }, 2); },
  },
  {
    id: 'meteor', name: '운석 낙하', type: 'spell', cost: 6, rarity: 'epic', target: 'lane', icon: 'meteor', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 6 줍니다. 그 줄이 비어 있으면 적 영웅에게 6.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      const ms = api.foesInLane(t.lane);
      if (ms.length === 0) api.damageFoeHero(6);
      for (const m of ms) api.damage({ kind: 'unit', uid: m.uid }, 6);
    },
  },
  {
    id: 'pyroblast', name: '화염 작렬', type: 'spell', cost: 8, rarity: 'epic', target: 'foe', icon: 'meteor', ai: { kind: 'damage', amount: 9 },
    text: '적 하나(영웅 포함)에게 피해를 9 줍니다.', cast: (api, t) => api.damage(t, 9),
  },
  {
    id: 'barricade', name: '바리케이드 설치', type: 'spell', cost: 2, rarity: 'common', target: 'slot', icon: 'shield', ai: { kind: 'summon' },
    text: '내 진영 빈 칸에 0/6 바리케이드를 설치합니다.', cast: (api, t) => { if (t.kind === 'slot') api.summon('barricade_token', t.lane); },
  },
  {
    id: 'sanctuary', name: '성역의 빛', type: 'spell', cost: 3, rarity: 'rare', target: 'none', icon: 'heart', ai: { kind: 'heal' },
    text: '내 영웅의 생명력을 6 회복하고 아군 하수인 모두에게 +0/+2를 부여합니다.',
    cast: (api) => { api.healHero(6); for (const m of api.allies()) api.buff(m.uid, 0, 2); },
  },

  {
    id: 'volley', name: '일제 사격', type: 'spell', cost: 3, rarity: 'common', target: 'none', icon: 'arrows', ai: { kind: 'aoe' },
    text: '모든 줄의 맨 앞 적에게 피해를 1 줍니다. 비어 있는 줄마다 적 영웅에게 피해 1.',
    cast: (api) => { for (let lane = 0; lane < 5; lane++) hitLaneFront(api, lane, 1); },
  },
  {
    id: 'execute', name: '처형', type: 'spell', cost: 2, rarity: 'common', target: 'foeUnit', icon: 'skull', ai: { kind: 'damage', amount: 2 },
    text: '적 하수인 하나에게 피해를 2 줍니다. 이미 피해를 입은 하수인이면 처치합니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.foes().find((m) => m.uid === t.uid);
      if (u) api.damage(t, u.health < u.maxHealth ? u.health : 2);
    },
  },
  {
    id: 'war_drums', name: '진격의 북소리', type: 'spell', cost: 2, rarity: 'rare', target: 'none', icon: 'sword', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 공격력 +1을 주고 한 칸 전진시킵니다.',
    cast: (api) => {
      // Front-most first so allies do not block each other.
      const allies = [...api.allies()].sort((a, b) => (api.side === 'player' ? b.row - a.row : a.row - b.row));
      for (const m of allies) { api.buff(m.uid, 1, 0); api.advance(m.uid, 1); }
    },
  },
  {
    id: 'ice_prison', name: '얼음 감옥', type: 'spell', cost: 1, rarity: 'common', target: 'foeUnit', icon: 'frost', ai: { kind: 'control' },
    text: '적 하수인 하나를 <b>빙결</b>시키고 2칸 뒤로 밀어냅니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.freeze(t.uid); api.push(t.uid, 2); } },
  },
  {
    id: 'mana_potion', name: '마나 물약', type: 'spell', cost: 0, rarity: 'common', target: 'none', icon: 'potion', ai: { kind: 'ramp' },
    text: '이번 턴에만 마나를 2 얻습니다.',
    cast: (api) => api.gainMana(2),
  },
  {
    id: 'blessing', name: '수호의 축복', type: 'spell', cost: 3, rarity: 'rare', target: 'none', icon: 'shield', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 <b>보호막</b>을 부여합니다.',
    cast: (api) => { for (const m of api.allies()) api.grantWard(m.uid); },
  },

  // ── Enemy units ────────────────────────────────────────────
  { id: 'sk_minion', name: '해골 졸개', type: 'minion', cost: 1, rarity: 'basic', enemy: true, attack: 1, health: 2, model: 'Skeleton_Minion', text: '' },
  { id: 'sk_rogue', name: '해골 추적자', type: 'minion', cost: 2, rarity: 'basic', enemy: true, attack: 2, health: 2, model: 'Skeleton_Rogue', speed: 2, text: '2칸씩 전진합니다.' },
  { id: 'sk_warrior', name: '해골 전사', type: 'minion', cost: 3, rarity: 'basic', enemy: true, attack: 3, health: 4, model: 'Skeleton_Warrior', text: '' },
  { id: 'sk_mage', name: '해골 주술사', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 2, health: 3, model: 'Skeleton_Mage', keywords: ['ranged'], text: '<b>사격</b>' },
  { id: 'sk_guard', name: '무덤 수호병', type: 'minion', cost: 4, rarity: 'common', enemy: true, attack: 3, health: 6, model: 'Skeleton_Warrior', keywords: ['ward'], scale: 1.15, text: '<b>보호막</b>' },
  { id: 'sk_brute', name: '뼈 거인', type: 'minion', cost: 6, rarity: 'rare', enemy: true, attack: 6, health: 10, model: 'Skeleton_Warrior', scale: 1.45, text: '' },

  // ── Enemy spells ───────────────────────────────────────────
  {
    id: 'e_curse', name: '저주의 화살', type: 'spell', cost: 1, rarity: 'basic', enemy: true, target: 'foe', icon: 'curse', ai: { kind: 'damage', amount: 2 },
    text: '적 하나(영웅 포함)에게 피해를 2 줍니다.', cast: (api, t) => api.damage(t, 2),
  },
  {
    id: 'e_bonearmor', name: '뼈 갑옷', type: 'spell', cost: 1, rarity: 'basic', enemy: true, target: 'ally', icon: 'shield', ai: { kind: 'buff' },
    text: '아군 하수인 하나에게 +1/+2를 부여합니다.', cast: (api, t) => { if (t.kind === 'unit') api.buff(t.uid, 1, 2); },
  },
  {
    id: 'e_raise', name: '망자 소생', type: 'spell', cost: 2, rarity: 'basic', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'summon' },
    text: '빈 칸 두 곳에 해골 졸개를 소환합니다.',
    cast: (api) => { for (const lane of api.rng.shuffle(api.freeHomeLanes()).slice(0, 2)) api.summon('sk_minion', lane); },
  },
  {
    id: 'e_chill', name: '무덤의 한기', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'lane', icon: 'frost', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 1 주고 <b>빙결</b>시킵니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      for (const m of api.foesInLane(t.lane)) { api.damage({ kind: 'unit', uid: m.uid }, 1); api.freeze(m.uid); }
    },
  },
  {
    id: 'e_darkwave', name: '어둠의 파도', type: 'spell', cost: 3, rarity: 'common', enemy: true, target: 'none', icon: 'wave', ai: { kind: 'aoe' },
    text: '모든 적 하수인과 적 영웅에게 피해를 1 줍니다.',
    cast: (api) => { for (const m of api.foes()) api.damage({ kind: 'unit', uid: m.uid }, 1); api.damageFoeHero(1); },
  },
  {
    id: 'e_drain', name: '생명 흡수', type: 'spell', cost: 3, rarity: 'common', enemy: true, target: 'foe', icon: 'curse', ai: { kind: 'damage', amount: 3 },
    text: '적 하나(영웅 포함)에게 피해를 3 주고 내 영웅을 3 회복합니다.', cast: (api, t) => { api.damage(t, 3); api.healHero(3); },
  },
  {
    id: 'e_warcry', name: '망자의 함성', type: 'spell', cost: 3, rarity: 'rare', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 +1/+1을 부여합니다.', cast: (api) => { for (const m of api.allies()) api.buff(m.uid, 1, 1); },
  },
  {
    id: 'e_soulfire', name: '영혼의 불꽃', type: 'spell', cost: 5, rarity: 'rare', enemy: true, target: 'foe', icon: 'curse', ai: { kind: 'damage', amount: 6 },
    text: '적 하나(영웅 포함)에게 피해를 6 줍니다.', cast: (api, t) => api.damage(t, 6),
  },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(CARD_LIST.map((c) => [c.id, c]));

export function card(id: string): CardDef {
  const def = CARDS[id];
  if (!def) throw new Error(`unknown card ${id}`);
  return def;
}

/** Four minions, six spells. */
export const STARTER_DECK = [
  'squire', 'crossbowman', 'shieldbearer', 'berserker',
  'firebolt', 'firebolt', 'shockwave', 'frostring', 'rally', 'regroup',
];

export const KEYWORD_INFO: Record<Keyword, { name: string; text: string }> = {
  swift: { name: '기습', text: '소환된 턴에도 바로 전진하거나 공격합니다.' },
  ranged: { name: '사격', text: '자기 줄 앞쪽 3칸 안의 첫 번째 적을 쏩니다(아군 너머로도). 적이 없으면 전진하고, 적 영웅이 사거리 안이면 영웅을 쏩니다.' },
  ward: { name: '보호막', text: '처음 받는 피해를 무시합니다.' },
};
