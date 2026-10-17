import type { Rng } from './rng';
import { forward, homeRow, LAST_ROW, type Keyword, type ModelId, type Side, type Target, type TargetKind, type Unit, type ZoneKind } from './types';

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
  grantKeyword(uid: number, keyword: Keyword): void;
  /** Mana usable this turn (may go above the maximum). */
  gainMana(amount: number): void;
  /** Move an allied unit forward, toward the foe's side. */
  advance(uid: number, rows: number): void;
  /** 빙결 for `turns` of the unit's own turns (default 1): it skips its actions and takes no damage. */
  freeze(uid: number, turns?: number): void;
  /** Damage every unit and both heroes (눈보라). */
  damageEverything(amount: number): void;
  /** Summon anywhere on the board; `lifetime` makes it melt after that many own turns. */
  summonAt(defId: string, lane: number, row: number, lifetime?: number): void;
  /** 보호막 on our hero: absorbs this much more damage. */
  armorHero(amount: number): void;
  /** 주문 강화: the next spell this turn deals this much more per hit. */
  empower(amount: number): void;
  /** 환영: copy an ally onto an empty home-row cell. */
  illusion(uid: number, lane: number): void;
  /** 염력: move a unit to a neighbouring cell (충돌 if it is taken). */
  telekinesis(uid: number, lane: number, row: number): void;
  /** 독: 1 damage at the start of each of the unit's turns, for `turns` turns (structures are immune). */
  poison(uid: number, turns: number): void;
  /** 속박: the unit cannot move for `turns` of its own turns (it still attacks). */
  root(uid: number, turns: number): void;
  /** 덫 on an empty cell: the first of our foes to step in takes damage and is rooted. */
  placeTrap(lane: number, row: number): boolean;
  /** Lower a unit's attack (never below 0). */
  weaken(uid: number, amount: number): void;
  /** 돌진: an ally runs to the nearest foe in its lane and slams it for its health, taking half back. */
  charge(uid: number): void;
  /** Shove a unit into a random free neighbouring cell. */
  nudge(uid: number): void;
  /** 징표: the unit takes +1 from every hit for `turns` of its own turns. */
  mark(uid: number, turns: number): void;
  /** A 2×2 zone with its lower-left cell at (lane, row), for `turns` rounds. */
  zone(kind: ZoneKind, lane: number, row: number, turns: number): void;
  /** Move an allied unit back toward our own side. */
  retreat(uid: number, rows: number): void;
  /** 공성 전차: lob a stone at a random foe minion (cross of five cells, 3 each; else the foe hero). */
  bombard(self: Unit): void;
  setLoaded(self: Unit, on: boolean): void;
  /** Kill an ally outright; returns the health it had. */
  sacrifice(uid: number): number;
  /** Units in the four cells next to a cell (north, south, east, west). */
  unitsBeside(lane: number, row: number): Unit[];
  /** Push an opposing unit back toward its own side. */
  push(uid: number, rows: number): void;
  /** Summon on the caster's home row (no-op if that cell is taken). */
  summon(defId: string, lane: number): void;
  freeHomeLanes(): number[];
  /** Every living unit (either side) in the 8 cells around a cell. */
  unitsAround(lane: number, row: number): Unit[];
  /** Purely visual: an explosion at a cell. */
  explode(lane: number, row: number): void;

  // ── Card / hand manipulation ──
  damageOwnHero(amount: number): void;
  handSize(): number;
  foeHandSize(): number;
  /** Take the top card of the opposing deck into our hand. */
  drawFromFoeDeck(count: number): void;
  /** Take random cards from the opposing hand into ours. */
  stealFromFoeHand(count: number): void;
  /** 봉인 random cards in the opposing hand for their next turn. */
  lockFoeCards(count: number): void;
  /** The opposing side skips its next draw. */
  foeSkipDraw(): void;
  /** Discard our whole hand and draw that many cards. */
  redrawHand(): void;
  /** Return random cards from our discard pile to our hand. */
  recycle(count: number): void;
  /** Add a fresh copy of a card to our hand. */
  addCopy(defId: string, costMod?: number): void;
  /** 탐색: pick one of three random player cards of a type. */
  discover(type: 'minion' | 'spell', costMod?: number): void;
  /** Change the cost of every card in our hand (negative = cheaper). */
  modifyHandCosts(delta: number): void;
}

export type Rarity = 'basic' | 'common' | 'rare' | 'epic' | 'legendary';
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
  /** Hero-exclusive card: only that hero is offered it (rewards, merchant, 탐색). */
  hero?: string;
}

export interface MinionCard extends BaseCard {
  type: 'minion';
  attack: number;
  health: number;
  model: ModelId;
  keywords?: Keyword[];
  scale?: number;
  /** 분열: what it splits into (two of them) when it dies. */
  splitInto?: string;
  /** Stronger elites: drawn with a burning aura and a star on the card. */
  elite?: boolean;
  /** What its ranged attack looks like (default: by model). */
  missile?: 'arrow' | 'curse' | 'storm';
  onSummon?: (api: EffectApi, self: Unit) => void;
  onDeath?: (api: EffectApi, self: Unit) => void;
  onEndTurn?: (api: EffectApi, self: Unit) => void;
}

/** How the AI should judge a spell (used by the enemy and the test bot). */
export type SpellAi =
  | { kind: 'damage'; amount: number }
  | { kind: 'aoe' }
  /** `grants`: skip allies that already have it. */
  | { kind: 'buff'; grants?: Keyword }
  | { kind: 'buffAll' }
  | { kind: 'lane' }
  | { kind: 'summon' }
  | { kind: 'draw'; selfDamage?: number }
  | { kind: 'heal' }
  | { kind: 'control' }
  | { kind: 'ramp' }
  | { kind: 'discover' }
  | { kind: 'disrupt' }
  | { kind: 'recycle' }
  | { kind: 'cycle' }
  | { kind: 'discount' }
  | { kind: 'copy' }
  | { kind: 'blizzard' }
  | { kind: 'armor' }
  | { kind: 'wall' }
  | { kind: 'illusion' }
  | { kind: 'empower' }
  | { kind: 'telekinesis' }
  | { kind: 'decay' }
  | { kind: 'trap' }
  | { kind: 'root' }
  | { kind: 'weaken' }
  | { kind: 'charge' }
  | { kind: 'zone'; zone: ZoneKind }
  | { kind: 'whirl' }
  /** Cards the AI leaves alone. */
  | { kind: 'skip' };

export interface SpellCard extends BaseCard {
  type: 'spell';
  target: TargetKind;
  icon: SpellIcon;
  ai: SpellAi;
  /** X-cost: also costs the targeted unit's health in mana (염력). */
  xCost?: boolean;
  cast: (api: EffectApi, target: Target) => void;
}

export type CardDef = MinionCard | SpellCard;

/** Hits the first foe in the lane, or the foe hero if the lane is empty. */
const hitLaneFront = (api: EffectApi, lane: number, amount: number) => {
  const m = api.frontFoe(lane);
  if (m) api.damage({ kind: 'unit', uid: m.uid }, amount);
  else api.damageFoeHero(amount);
};

/** Foes nearest the caster's home row first (the ones about to break through). */
const foesByDanger = (api: EffectApi) => {
  const home = homeRow(api.side);
  return [...api.foes()].sort((a, b) => Math.abs(a.row - home) - Math.abs(b.row - home));
};

/** 덫 on the cell a foe is about to step into; the most advanced foe first. */
export const trapAhead = (api: EffectApi): boolean => {
  for (const f of foesByDanger(api)) {
    if (f.keywords.has('flying') || f.attack <= 0) continue;
    if (api.placeTrap(f.lane, f.row + forward(f.side))) return true;
  }
  return false;
};

/** 속박: the foe closest to breaking through. */
export const rootFront = (api: EffectApi, turns: number) => {
  const f = foesByDanger(api).find((u) => u.attack > 0 && !u.rootedTurns);
  if (f) api.root(f.uid, turns);
};

const randomFoeOrHero = (api: EffectApi, amount: number) => {
  const all = api.foes();
  if (all.length) api.damage({ kind: 'unit', uid: api.rng.pick(all).uid }, amount);
  else api.damageFoeHero(amount);
};

const CARD_LIST: CardDef[] = [
  // ── Player minions ─────────────────────────────────────────
  { id: 'squire', name: '견습 검사', type: 'minion', cost: 2, rarity: 'basic', attack: 1, health: 3, model: 'Knight', scale: 0.85, text: '' },
  { id: 'crossbowman', name: '석궁병', type: 'minion', cost: 4, rarity: 'basic', attack: 2, health: 2, model: 'Rogue', keywords: ['ranged'], text: '<b>사격</b>' },
  {
    id: 'shieldbearer', name: '방패병', type: 'minion', cost: 3, rarity: 'basic', attack: 0, health: 5, model: 'Knight', keywords: ['ward', 'anchored'],
    text: '<b>보호막</b>. <b>고정</b>',
  },
  {
    id: 'apprentice', name: '견습 마법사', type: 'minion', cost: 4, rarity: 'basic', attack: 1, health: 2, model: 'Mage', keywords: ['ranged'],
    text: '<b>사격</b>. <b>등장 시:</b> 이 줄의 맨 앞 적에게 피해를 2 줍니다.',
    onSummon: (api, self) => hitLaneFront(api, self.lane, 2),
  },
  { id: 'berserker', name: '광전사', type: 'minion', cost: 6, rarity: 'basic', attack: 4, health: 3, model: 'Barbarian', keywords: ['swift'], text: '<b>기습</b>' },
  {
    id: 'medic', name: '야전 의무병', type: 'minion', cost: 4, rarity: 'common', attack: 1, health: 3, model: 'Mage', scale: 0.9,
    text: '<b>등장 시:</b> 내 영웅의 생명력을 5 회복합니다.', onSummon: (api) => api.healHero(5),
  },
  {
    id: 'shadowblade', name: '그림자 단검수', type: 'minion', cost: 6, rarity: 'common', attack: 3, health: 3, model: 'Rogue_Hooded', keywords: ['swift', 'dash'],
    text: '<b>기습</b>. <b>질주</b>',
  },
  {
    id: 'veteran', name: '노련한 창병', type: 'minion', cost: 8, rarity: 'common', attack: 3, health: 6, model: 'Knight',
    text: '<b>파괴 시:</b> 내 진영에 견습 검사를 소환합니다.', onDeath: (api, self) => api.summon('squire', self.lane),
  },
  { id: 'fortress', name: '성채 기사', type: 'minion', cost: 10, rarity: 'rare', attack: 4, health: 8, model: 'Knight', keywords: ['ward'], scale: 1.15, text: '<b>보호막</b>' },
  {
    id: 'warlord', name: '전쟁 군주', type: 'minion', cost: 12, rarity: 'rare', attack: 5, health: 6, model: 'Barbarian', scale: 1.2,
    text: '<b>등장 시:</b> 다른 아군 하수인 모두에게 +1/+1을 부여합니다.',
    onSummon: (api, self) => { for (const m of api.allies()) if (m.uid !== self.uid) api.buff(m.uid, 1, 1); },
  },
  {
    id: 'stormcaller', name: '폭풍 술사', type: 'minion', cost: 9, rarity: 'rare', attack: 2, health: 4, model: 'Mage', keywords: ['ranged'],
    text: '<b>사격</b>. 내 턴이 끝날 때 무작위 적에게 피해를 2 줍니다.', onEndTurn: (api) => randomFoeOrHero(api, 2),
  },
  {
    id: 'archmage', name: '대마법사', type: 'minion', cost: 14, rarity: 'epic', attack: 4, health: 6, model: 'Mage', keywords: ['ranged'], scale: 1.2,
    text: '<b>사격</b>. 내 턴이 끝날 때 모든 적 하수인에게 피해를 1 줍니다.',
    onEndTurn: (api) => { for (const m of api.foes()) api.damage({ kind: 'unit', uid: m.uid }, 1); },
  },
  {
    id: 'bomber', name: '화염 폭탄병', type: 'minion', cost: 5, rarity: 'common', attack: 2, health: 3, model: 'Barbarian', scale: 0.95,
    text: '<b>파괴 시:</b> 주변 1칸의 모든 캐릭터에게 피해 2(적 영웅 바로 앞이면 영웅도).',
    onDeath: (api, self) => {
      api.explode(self.lane, self.row);
      for (const u of api.unitsAround(self.lane, self.row)) api.damage({ kind: 'unit', uid: u.uid }, 2);
      // On the foe's last row the opposing hero is right next to it.
      const next = self.row + forward(api.side);
      if (next < 0 || next > LAST_ROW) api.damageFoeHero(2);
    },
  },
  {
    id: 'siege_mage', name: '공성 마법사', type: 'minion', cost: 10, rarity: 'rare', attack: 2, health: 5, model: 'Mage', keywords: ['ranged', 'anchored'], scale: 1.1,
    text: '<b>사격</b>. <b>고정</b>. 턴 종료 시 적 영웅에게 피해 2.',
    onEndTurn: (api) => api.damageFoeHero(2),
  },
  {
    id: 'warden', name: '방벽 수호자', type: 'minion', cost: 7, rarity: 'common', attack: 2, health: 4, model: 'Knight', keywords: ['anchored'], scale: 1.1,
    text: '<b>고정</b>. <b>등장 시:</b> 양옆에 바리케이드 설치.',
    onSummon: (api, self) => { api.summon('barricade_token', self.lane - 1); api.summon('barricade_token', self.lane + 1); },
  },
  {
    id: 'priest', name: '전장 신관', type: 'minion', cost: 7, rarity: 'rare', attack: 1, health: 4, model: 'Mage', scale: 0.95,
    text: '턴 종료 시 내 영웅과 아군 모두 2 회복.',
    onEndTurn: (api) => { api.healHero(2); for (const m of api.allies()) api.healUnit(m.uid, 2); },
  },
  { id: 'mace_knight', name: '철퇴 기사', type: 'minion', cost: 6, rarity: 'common', attack: 3, health: 4, model: 'Knight', keywords: ['knockback'], text: '<b>넉백</b>' },
  { id: 'longbow', name: '장궁수', type: 'minion', cost: 6, rarity: 'common', attack: 2, health: 3, model: 'Rogue', keywords: ['ranged', 'pierce'], text: '<b>사격</b>. <b>관통</b>' },
  { id: 'glider', name: '활공 정찰병', type: 'minion', cost: 3, rarity: 'common', attack: 2, health: 1, model: 'Rogue_Hooded', keywords: ['flying'], scale: 0.9, text: '<b>비행</b>' },
  { id: 'phalanx', name: '대열 창병', type: 'minion', cost: 3, rarity: 'basic', attack: 1, health: 3, model: 'Knight', keywords: ['formation'], scale: 0.9, text: '<b>대열</b>' },
  { id: 'blood_blade', name: '피의 검사', type: 'minion', cost: 8, rarity: 'rare', attack: 3, health: 5, model: 'Barbarian', keywords: ['lifesteal'], text: '<b>흡혈</b>' },
  { id: 'stalwart', name: '불굴의 용사', type: 'minion', cost: 7, rarity: 'rare', attack: 3, health: 4, model: 'Knight', keywords: ['undying'], scale: 1.05, text: '<b>불사</b>' },
  { id: 'greatsword', name: '대검 용병', type: 'minion', cost: 8, rarity: 'rare', attack: 3, health: 5, model: 'Barbarian', keywords: ['cleave'], scale: 1.05, text: '<b>휩쓸기</b>' },
  { id: 'thornguard', name: '가시 방패병', type: 'minion', cost: 6, rarity: 'common', attack: 2, health: 5, model: 'Knight', keywords: ['thorns'], text: '<b>가시</b>' },
  { id: 'cover_knight', name: '엄호 기사', type: 'minion', cost: 7, rarity: 'rare', attack: 2, health: 7, model: 'Knight', keywords: ['cover'], scale: 1.1, text: '<b>엄호</b>' },
  { id: 'monk', name: '재생의 수도사', type: 'minion', cost: 5, rarity: 'common', attack: 2, health: 4, model: 'Mage', keywords: ['regenerate'], text: '<b>재생</b>' },
  { id: 'brawler', name: '광기의 투사', type: 'minion', cost: 4, rarity: 'common', attack: 1, health: 4, model: 'Barbarian', keywords: ['enrage'], scale: 0.9, text: '<b>분노</b>' },
  { id: 'vanguard_captain', name: '선봉장', type: 'minion', cost: 6, rarity: 'common', attack: 2, health: 5, model: 'Knight', keywords: ['vanguard'], text: '<b>선봉</b>' },
  { id: 'barricade_token', name: '바리케이드', type: 'minion', cost: 0, rarity: 'basic', attack: 0, health: 6, model: 'barrier', text: '움직이지도 공격하지도 않습니다.' },
  {
    id: 'ice_wall_token', name: '빙벽', type: 'minion', cost: 0, rarity: 'basic', attack: 0, health: 5, model: 'ice_wall',
    text: '움직이지도 공격하지도 않습니다. 3턴 뒤 녹고, 부서지거나 녹은 칸은 <b>젖습니다</b>.',
  },

  // ── Player spells ──────────────────────────────────────────
  {
    id: 'firebolt', name: '불꽃 화살', type: 'spell', cost: 5, rarity: 'basic', target: 'foe', icon: 'fire', ai: { kind: 'damage', amount: 3 },
    text: '적 하나(영웅 포함)에게 피해를 3 줍니다.', cast: (api, t) => api.damage(t, 3),
  },
  {
    id: 'shockwave', name: '충격파', type: 'spell', cost: 4, rarity: 'basic', target: 'lane', icon: 'wave', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 1 주고 2칸 뒤로 밀어냅니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      // Push the farthest first so units do not block each other.
      const ms = [...api.foesInLane(t.lane)].reverse();
      for (const m of ms) { api.damage({ kind: 'unit', uid: m.uid }, 1); api.push(m.uid, 2); }
    },
  },
  {
    id: 'frostring', name: '서리 고리', type: 'spell', cost: 4, rarity: 'basic', target: 'lane', icon: 'frost', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 1 주고 <b>빙결</b>시킵니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      for (const m of api.foesInLane(t.lane)) { api.damage({ kind: 'unit', uid: m.uid }, 1); api.freeze(m.uid); }
    },
  },
  {
    id: 'rally', name: '결의', type: 'spell', cost: 3, rarity: 'basic', target: 'ally', icon: 'sword', ai: { kind: 'buff' },
    text: '아군 하수인 하나에게 +2/+2를 부여합니다.', cast: (api, t) => { if (t.kind === 'unit') api.buff(t.uid, 2, 2); },
  },
  {
    id: 'regroup', name: '재정비', type: 'spell', cost: 4, rarity: 'basic', target: 'none', icon: 'scroll', ai: { kind: 'draw' },
    text: '카드를 2장 뽑습니다.', cast: (api) => api.draw(2),
  },
  {
    id: 'thunderbolt', name: '낙뢰', type: 'spell', cost: 8, rarity: 'common', target: 'foe', icon: 'bolt', ai: { kind: 'damage', amount: 5 },
    text: '적 하나(영웅 포함)에게 피해를 5 줍니다.', cast: (api, t) => api.damage(t, 5),
  },
  {
    id: 'chainspark', name: '연쇄 전격', type: 'spell', cost: 7, rarity: 'rare', target: 'foeUnit', icon: 'storm', ai: { kind: 'damage', amount: 3 },
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
    id: 'flamewave', name: '화염 파도', type: 'spell', cost: 8, rarity: 'rare', target: 'none', icon: 'fire', ai: { kind: 'aoe' },
    text: '모든 적 하수인에게 피해를 2 줍니다.',
    cast: (api) => { for (const m of api.foes()) api.damage({ kind: 'unit', uid: m.uid }, 2); },
  },
  {
    id: 'meteor', name: '운석 낙하', type: 'spell', cost: 13, rarity: 'epic', target: 'lane', icon: 'meteor', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 6 줍니다. 그 줄이 비어 있으면 적 영웅에게 6.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      const ms = api.foesInLane(t.lane);
      if (ms.length === 0) api.damageFoeHero(6);
      for (const m of ms) api.damage({ kind: 'unit', uid: m.uid }, 6);
    },
  },
  {
    id: 'pyroblast', name: '화염 작렬', type: 'spell', cost: 17, rarity: 'epic', target: 'foe', icon: 'meteor', ai: { kind: 'damage', amount: 9 },
    text: '적 하나(영웅 포함)에게 피해를 9 줍니다.', cast: (api, t) => api.damage(t, 9),
  },
  {
    id: 'barricade', name: '바리케이드 설치', type: 'spell', cost: 3, rarity: 'common', target: 'slot', icon: 'shield', ai: { kind: 'summon' },
    text: '내 진영 빈 칸에 0/6 바리케이드를 설치합니다.', cast: (api, t) => { if (t.kind === 'slot') api.summon('barricade_token', t.lane); },
  },
  {
    id: 'sanctuary', name: '성역의 빛', type: 'spell', cost: 6, rarity: 'rare', target: 'none', icon: 'heart', ai: { kind: 'heal' },
    text: '내 영웅의 생명력을 6 회복하고 아군 하수인 모두에게 +0/+2를 부여합니다.',
    cast: (api) => { api.healHero(6); for (const m of api.allies()) api.buff(m.uid, 0, 2); },
  },

  {
    id: 'volley', name: '독화살', type: 'spell', cost: 3, rarity: 'common', target: 'foeUnit', icon: 'arrows', ai: { kind: 'damage', amount: 2 },
    text: '적 하수인에게 피해를 2 주고 3턴 동안 <b>중독</b>시킵니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.damage(t, 2); api.poison(t.uid, 3); } },
  },
  {
    id: 'execute', name: '처형', type: 'spell', cost: 6, rarity: 'common', target: 'foeUnit', icon: 'skull', ai: { kind: 'damage', amount: 2 },
    text: '적 하수인 하나에게 피해를 2 줍니다. 이미 피해를 입은 하수인이면 처치합니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.foes().find((m) => m.uid === t.uid);
      if (u) api.damage(t, u.health < u.maxHealth ? u.health : 2);
    },
  },
  {
    id: 'war_drums', name: '진격의 북소리', type: 'spell', cost: 5, rarity: 'rare', target: 'none', icon: 'sword', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 공격력 +1을 주고 한 칸 전진시킵니다.',
    cast: (api) => {
      // Front-most first so allies do not block each other.
      const allies = [...api.allies()].sort((a, b) => (api.side === 'player' ? b.row - a.row : a.row - b.row));
      for (const m of allies) { api.buff(m.uid, 1, 0); api.advance(m.uid, 1); }
    },
  },
  {
    id: 'ice_prison', name: '얼음 감옥', type: 'spell', cost: 3, rarity: 'common', target: 'foeUnit', icon: 'frost', ai: { kind: 'control' },
    text: '적 하수인 하나를 <b>빙결</b>시키고 2칸 뒤로 밀어냅니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.freeze(t.uid); api.push(t.uid, 2); } },
  },
  {
    id: 'mana_potion', name: '마나 물약', type: 'spell', cost: 0, rarity: 'common', target: 'none', icon: 'potion', ai: { kind: 'ramp' },
    text: '이번 턴에만 마나를 4 얻습니다.',
    cast: (api) => api.gainMana(4),
  },
  {
    id: 'blessing', name: '수호의 축복', type: 'spell', cost: 6, rarity: 'rare', target: 'none', icon: 'shield', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 <b>보호막</b>을 부여합니다.',
    cast: (api) => { for (const m of api.allies()) api.grantKeyword(m.uid, 'ward'); },
  },

  {
    id: 'thorn_armor', name: '가시 갑옷', type: 'spell', cost: 2, rarity: 'common', target: 'ally', icon: 'shield', ai: { kind: 'buff' },
    text: '아군 하수인 하나에게 +0/+2와 <b>가시</b>를 부여합니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 0, 2); api.grantKeyword(t.uid, 'thorns'); } },
  },
  {
    id: 'renewal', name: '재생의 축복', type: 'spell', cost: 4, rarity: 'common', target: 'ally', icon: 'heart', ai: { kind: 'buff' },
    text: '아군 하수인 하나의 생명력을 모두 회복하고 <b>재생</b>을 부여합니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.allies().find((m) => m.uid === t.uid);
      if (u) api.healUnit(u.uid, u.maxHealth);
      api.grantKeyword(t.uid, 'regenerate');
    },
  },

  // ── Utility ────────────────────────────────────────────────
  {
    id: 'blood_pact', name: '피의 계약', type: 'spell', cost: 0, rarity: 'common', target: 'none', icon: 'curse', ai: { kind: 'draw', selfDamage: 3 },
    text: '내 영웅에게 피해를 3 주고 카드를 2장 뽑습니다.',
    cast: (api) => { api.damageOwnHero(3); api.draw(2); },
  },
  {
    id: 'war_library', name: '전술 서고', type: 'spell', cost: 2, rarity: 'common', target: 'none', icon: 'scroll', ai: { kind: 'discover' },
    text: '<b>탐색</b>: 주문 카드 하나.',
    cast: (api) => api.discover('spell'),
  },
  {
    id: 'reinforce', name: '증원 요청', type: 'spell', cost: 4, rarity: 'common', target: 'none', icon: 'sword', ai: { kind: 'discover' },
    text: '<b>탐색</b>: 하수인 카드 하나. 그 카드의 비용이 2 줄어듭니다.',
    cast: (api) => api.discover('minion', -2),
  },
  {
    id: 'change_plans', name: '작전 변경', type: 'spell', cost: 2, rarity: 'common', target: 'none', icon: 'scroll', ai: { kind: 'cycle' },
    text: '손패를 모두 버리고, 버린 수만큼 카드를 뽑습니다.',
    cast: (api) => api.redrawHand(),
  },
  {
    id: 'salvage', name: '재활용', type: 'spell', cost: 4, rarity: 'common', target: 'none', icon: 'shield', ai: { kind: 'recycle' },
    text: '버린 카드 더미에서 무작위 카드 2장을 손으로 가져옵니다.',
    cast: (api) => api.recycle(2),
  },
  {
    id: 'chains', name: '봉인의 사슬', type: 'spell', cost: 4, rarity: 'rare', target: 'none', icon: 'frost', ai: { kind: 'disrupt' },
    text: '상대 손패 무작위 2장을 <b>봉인</b>합니다. 카드를 1장 뽑습니다.',
    cast: (api) => { api.lockFoeCards(2); api.draw(1); },
  },
  {
    id: 'pickpocket', name: '소매치기', type: 'spell', cost: 4, rarity: 'rare', target: 'none', icon: 'skull', ai: { kind: 'disrupt' },
    text: '상대 손패에서 무작위 카드 1장을 빼앗아 옵니다.',
    cast: (api) => api.stealFromFoeHand(1),
  },
  {
    id: 'grave_rob', name: '도굴', type: 'spell', cost: 2, rarity: 'common', target: 'none', icon: 'skull', ai: { kind: 'draw' },
    text: '상대 덱 맨 위 카드를 내 손으로 가져옵니다.',
    cast: (api) => api.drawFromFoeDeck(1),
  },
  {
    id: 'oblivion', name: '망각의 저주', type: 'spell', cost: 3, rarity: 'common', target: 'none', icon: 'curse', ai: { kind: 'disrupt' },
    text: '상대는 다음 턴에 카드를 뽑지 못합니다. 카드를 1장 뽑습니다.',
    cast: (api) => { api.foeSkipDraw(); api.draw(1); },
  },
  {
    id: 'mirror_image', name: '거울상', type: 'spell', cost: 4, rarity: 'rare', target: 'ally', icon: 'potion', ai: { kind: 'copy' },
    text: '아군 하수인 하나의 카드를 복사해 손으로 가져옵니다. 복사본은 비용이 2 줄어듭니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.allies().find((m) => m.uid === t.uid);
      if (u) api.addCopy(u.defId, -2);
    },
  },
  {
    id: 'supply_wagon', name: '보급 마차', type: 'spell', cost: 6, rarity: 'rare', target: 'none', icon: 'potion', ai: { kind: 'discount' },
    text: '내 손패의 모든 카드 비용이 2 줄어듭니다. 카드를 1장 뽑습니다.',
    cast: (api) => { api.modifyHandCosts(-2); api.draw(1); },
  },

  // ── 수비대장 전용: 보호막과 단단한 전열 ─────────────────────
  {
    id: 'c_shieldwall', name: '방패벽', type: 'spell', cost: 4, rarity: 'common', hero: 'captain', target: 'none', icon: 'shield', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 +0/+2를 부여합니다.',
    cast: (api) => { for (const u of api.allies()) api.buff(u.uid, 0, 2); },
  },
  {
    id: 'c_shield_bash', name: '방패 강타', type: 'spell', cost: 3, rarity: 'common', hero: 'captain', target: 'foeUnit', icon: 'sword', ai: { kind: 'damage', amount: 3 },
    text: '적 하수인 하나에게 피해를 3 줍니다. <b>보호막</b>이 있는 아군 하수인 하나마다 피해 +1.',
    cast: (api, t) => api.damage(t, 3 + api.allies().filter((u) => u.keywords.has('ward')).length),
  },
  {
    id: 'c_standard', name: '깃발 기수', type: 'minion', cost: 5, rarity: 'rare', hero: 'captain', attack: 2, health: 5, model: 'Knight', keywords: ['anchored'],
    text: '<b>고정</b>. 내 턴이 끝날 때 <b>보호막</b>이 없는 무작위 다른 아군 하수인 하나에게 <b>보호막</b>을 부여합니다.',
    onEndTurn: (api, self) => {
      const bare = api.allies().filter((u) => u.uid !== self.uid && !u.keywords.has('ward'));
      if (bare.length) api.grantKeyword(api.rng.pick(bare).uid, 'ward');
    },
  },
  {
    id: 'c_commander', name: '근위 기사단장', type: 'minion', cost: 9, rarity: 'epic', hero: 'captain', attack: 4, health: 6, model: 'Knight', keywords: ['ward'], scale: 1.15,
    text: '<b>보호막</b>. <b>등장 시:</b> 다른 아군 하수인 모두에게 <b>보호막</b>을 부여합니다.',
    onSummon: (api, self) => { for (const u of api.allies()) if (u.uid !== self.uid) api.grantKeyword(u.uid, 'ward'); },
  },

  // ── 비전술사 전용: 주문과 비전 ──────────────────────────────
  {
    id: 'a_missiles', name: '비전 화살비', type: 'spell', cost: 6, rarity: 'common', hero: 'arcanist', target: 'none', icon: 'bolt', ai: { kind: 'aoe' },
    text: '무작위 적에게 피해 1을 4번 나누어 줍니다(적 하수인이 없으면 적 영웅).',
    cast: (api) => { for (let i = 0; i < 4; i++) randomFoeOrHero(api, 1); },
  },
  {
    id: 'a_scholar', name: '비전 학자', type: 'minion', cost: 4, rarity: 'common', hero: 'arcanist', attack: 1, health: 3, model: 'Mage', keywords: ['ranged'], scale: 0.9,
    text: '<b>사격</b>. <b>등장 시:</b> <b>탐색</b>: 주문 카드 하나.',
    onSummon: (api) => api.discover('spell'),
  },
  {
    id: 'a_focus', name: '정신 집중', type: 'spell', cost: 5, rarity: 'rare', hero: 'arcanist', target: 'none', icon: 'scroll', ai: { kind: 'draw' },
    text: '카드를 2장 뽑습니다. 그 뒤 내 손패의 모든 카드 비용이 1 줄어듭니다.',
    cast: (api) => { api.draw(2); api.modifyHandCosts(-1); },
  },
  {
    id: 'a_storm', name: '비전 폭풍', type: 'spell', cost: 13, rarity: 'epic', hero: 'arcanist', target: 'none', icon: 'storm', ai: { kind: 'aoe' },
    text: '모든 적 하수인과 적 영웅에게 피해를 3 줍니다.',
    cast: (api) => { for (const u of api.foes()) api.damage({ kind: 'unit', uid: u.uid }, 3); api.damageFoeHero(3); },
  },

  // ── 전쟁 족장 전용: 돌격과 밀어붙이기 ───────────────────────
  {
    id: 'w_horn', name: '돌격 나팔', type: 'spell', cost: 3, rarity: 'common', hero: 'warchief', target: 'ally', icon: 'sword', ai: { kind: 'buff' },
    text: '아군 하수인 하나에게 공격력 +2를 주고 두 칸 전진시킵니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 2, 0); api.advance(t.uid, 2); } },
  },
  { id: 'w_rider', name: '돌격 기병', type: 'minion', cost: 7, rarity: 'common', hero: 'warchief', attack: 4, health: 4, model: 'Barbarian', keywords: ['dash', 'knockback'], text: '<b>질주</b>. <b>넉백</b>' },
  {
    id: 'w_warcry', name: '전투의 함성', type: 'spell', cost: 6, rarity: 'rare', hero: 'warchief', target: 'none', icon: 'sword', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 +2/+1을 부여합니다.',
    cast: (api) => { for (const u of api.allies()) api.buff(u.uid, 2, 1); },
  },
  {
    id: 'w_axelord', name: '족장의 도끼잡이', type: 'minion', cost: 11, rarity: 'epic', hero: 'warchief', attack: 6, health: 7, model: 'Barbarian', keywords: ['cleave'], scale: 1.15,
    text: '<b>휩쓸기</b>. <b>등장 시:</b> 다른 아군 하수인 모두를 한 칸 전진시킵니다.',
    onSummon: (api, self) => { for (const u of api.allies()) if (u.uid !== self.uid) api.advance(u.uid, 1); },
  },

  // ── 척후대장 전용: 정찰, 매복, 원거리 ──────────────────────
  {
    id: 'h_aimed', name: '정밀 사격', type: 'spell', cost: 3, rarity: 'common', hero: 'hunter', target: 'foeUnit', icon: 'arrows', ai: { kind: 'damage', amount: 3 },
    text: '적 하수인 하나에게 피해를 3 줍니다. 그 하수인이 죽으면 카드를 1장 뽑습니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.foes().find((f) => f.uid === t.uid);
      api.damage(t, 3);
      if (u && u.health <= 0) api.draw(1);
    },
  },
  {
    id: 'h_trapper', name: '매복 척후병', type: 'minion', cost: 5, rarity: 'common', hero: 'hunter', attack: 2, health: 3, model: 'Rogue_Hooded', keywords: ['ranged'],
    text: '<b>사격</b>. <b>등장 시:</b> 이 줄의 맨 앞 적을 빙결시킵니다.',
    onSummon: (api, self) => { const f = api.frontFoe(self.lane); if (f) api.freeze(f.uid); },
  },
  {
    id: 'h_sniper', name: '척후 저격수', type: 'minion', cost: 9, rarity: 'rare', hero: 'hunter', attack: 3, health: 5, model: 'Rogue', keywords: ['ranged', 'pierce'],
    text: '<b>사격</b>. <b>관통</b>. <b>등장 시:</b> 무작위 적에게 피해를 3 줍니다.',
    onSummon: (api) => randomFoeOrHero(api, 3),
  },
  {
    id: 'h_rain', name: '화살비', type: 'spell', cost: 11, rarity: 'epic', hero: 'hunter', target: 'none', icon: 'arrows', ai: { kind: 'aoe' },
    text: '모든 줄의 맨 앞 적에게 피해를 3 줍니다. 비어 있는 줄마다 적 영웅에게 피해 1.',
    cast: (api) => {
      for (let lane = 0; lane < 5; lane++) {
        const m = api.frontFoe(lane);
        if (m) api.damage({ kind: 'unit', uid: m.uid }, 3);
        else api.damageFoeHero(1);
      }
    },
  },

  // ── Enemy units ────────────────────────────────────────────
  { id: 'sk_minion', name: '해골 졸개', type: 'minion', cost: 2, rarity: 'basic', enemy: true, attack: 1, health: 2, model: 'Skeleton_Minion', text: '' },
  { id: 'sk_rogue', name: '해골 추적자', type: 'minion', cost: 4, rarity: 'basic', enemy: true, attack: 2, health: 3, model: 'Skeleton_Rogue', keywords: ['dash'], text: '<b>질주</b>' },
  { id: 'sk_warrior', name: '해골 전사', type: 'minion', cost: 6, rarity: 'basic', enemy: true, attack: 3, health: 5, model: 'Skeleton_Warrior', text: '' },
  { id: 'sk_mage', name: '해골 주술사', type: 'minion', cost: 5, rarity: 'common', enemy: true, attack: 2, health: 3, model: 'Skeleton_Mage', keywords: ['ranged'], text: '<b>사격</b>' },
  { id: 'sk_guard', name: '무덤 수호병', type: 'minion', cost: 8, rarity: 'common', enemy: true, attack: 3, health: 6, model: 'Skeleton_Warrior', keywords: ['ward'], scale: 1.15, text: '<b>보호막</b>' },
  { id: 'sk_brute', name: '뼈 거인', type: 'minion', cost: 12, rarity: 'rare', enemy: true, attack: 6, health: 9, model: 'Skeleton_Warrior', keywords: ['knockback'], scale: 1.45, text: '<b>넉백</b>' },

  { id: 'sk_wraith', name: '해골 망령', type: 'minion', cost: 5, rarity: 'common', enemy: true, attack: 2, health: 3, model: 'Skeleton_Rogue', keywords: ['flying'], scale: 0.9, text: '<b>비행</b>' },
  { id: 'sk_undying', name: '불사 해골', type: 'minion', cost: 4, rarity: 'basic', enemy: true, attack: 2, health: 2, model: 'Skeleton_Minion', keywords: ['undying'], text: '<b>불사</b>' },
  { id: 'sk_pikeman', name: '해골 창병', type: 'minion', cost: 6, rarity: 'common', enemy: true, attack: 2, health: 5, model: 'Skeleton_Warrior', keywords: ['pierce'], scale: 0.95, text: '<b>관통</b>' },
  { id: 'sk_phalanx', name: '해골 방진병', type: 'minion', cost: 3, rarity: 'basic', enemy: true, attack: 1, health: 3, model: 'Skeleton_Warrior', keywords: ['formation'], scale: 0.9, text: '<b>대열</b>' },
  { id: 'sk_leech', name: '흡혈 주술사', type: 'minion', cost: 8, rarity: 'rare', enemy: true, attack: 3, health: 4, model: 'Skeleton_Mage', keywords: ['ranged', 'lifesteal'], text: '<b>사격</b>. <b>흡혈</b>' },

  { id: 'sk_captain', name: '해골 대장', type: 'minion', cost: 6, rarity: 'common', enemy: true, attack: 2, health: 5, model: 'Skeleton_Warrior', keywords: ['vanguard'], text: '<b>선봉</b>' },
  { id: 'sk_berserker', name: '해골 광전사', type: 'minion', cost: 6, rarity: 'common', enemy: true, attack: 2, health: 5, model: 'Skeleton_Minion', keywords: ['enrage'], scale: 1.1, text: '<b>분노</b>' },
  { id: 'sk_shieldwall', name: '해골 방패수', type: 'minion', cost: 7, rarity: 'rare', enemy: true, attack: 3, health: 6, model: 'Skeleton_Warrior', keywords: ['cover'], scale: 1.1, text: '<b>엄호</b>' },
  { id: 'sk_thorn', name: '뼈 가시벽', type: 'minion', cost: 6, rarity: 'common', enemy: true, attack: 1, health: 6, model: 'Skeleton_Warrior', keywords: ['thorns'], text: '<b>가시</b>' },
  { id: 'sk_regen', name: '되살아나는 해골', type: 'minion', cost: 6, rarity: 'common', enemy: true, attack: 3, health: 3, model: 'Skeleton_Minion', keywords: ['regenerate'], scale: 1.05, text: '<b>재생</b>' },
  { id: 'sk_reaper', name: '해골 수확자', type: 'minion', cost: 10, rarity: 'rare', enemy: true, attack: 4, health: 6, model: 'Skeleton_Rogue', keywords: ['cleave'], scale: 1.2, text: '<b>휩쓸기</b>' },

  // ── Enemy spells ───────────────────────────────────────────
  {
    id: 'e_curse', name: '저주의 화살', type: 'spell', cost: 3, rarity: 'basic', enemy: true, target: 'foe', icon: 'curse', ai: { kind: 'damage', amount: 2 },
    text: '적 하나(영웅 포함)에게 피해를 2 줍니다.', cast: (api, t) => api.damage(t, 2),
  },
  {
    id: 'e_hex', name: '봉인의 저주', type: 'spell', cost: 4, rarity: 'common', enemy: true, target: 'none', icon: 'curse', ai: { kind: 'disrupt' },
    text: '상대 손패 무작위 1장을 <b>봉인</b>하고 적 영웅에게 피해 1.',
    cast: (api) => { api.lockFoeCards(1); api.damageFoeHero(1); },
  },
  {
    id: 'e_insight', name: '망자의 지혜', type: 'spell', cost: 4, rarity: 'common', enemy: true, target: 'none', icon: 'scroll', ai: { kind: 'draw' },
    text: '카드를 2장 뽑습니다.',
    cast: (api) => api.draw(2),
  },
  {
    id: 'e_bonearmor', name: '뼈 갑옷', type: 'spell', cost: 2, rarity: 'basic', enemy: true, target: 'ally', icon: 'shield', ai: { kind: 'buff' },
    text: '아군 하수인 하나에게 +1/+2를 부여합니다.', cast: (api, t) => { if (t.kind === 'unit') api.buff(t.uid, 1, 2); },
  },
  {
    id: 'e_raise', name: '망자 소생', type: 'spell', cost: 4, rarity: 'basic', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'summon' },
    text: '빈 칸 두 곳에 해골 졸개를 소환합니다.',
    cast: (api) => { for (const lane of api.rng.shuffle(api.freeHomeLanes()).slice(0, 2)) api.summon('sk_minion', lane); },
  },
  {
    id: 'e_chill', name: '무덤의 한기', type: 'spell', cost: 4, rarity: 'common', enemy: true, target: 'lane', icon: 'frost', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 1 주고 <b>빙결</b>시킵니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      for (const m of api.foesInLane(t.lane)) { api.damage({ kind: 'unit', uid: m.uid }, 1); api.freeze(m.uid); }
    },
  },
  {
    id: 'e_darkwave', name: '어둠의 파도', type: 'spell', cost: 6, rarity: 'common', enemy: true, target: 'none', icon: 'wave', ai: { kind: 'aoe' },
    text: '모든 적 하수인과 적 영웅에게 피해를 1 줍니다.',
    cast: (api) => { for (const m of api.foes()) api.damage({ kind: 'unit', uid: m.uid }, 1); api.damageFoeHero(1); },
  },
  {
    id: 'e_drain', name: '생명 흡수', type: 'spell', cost: 6, rarity: 'common', enemy: true, target: 'foe', icon: 'curse', ai: { kind: 'damage', amount: 3 },
    text: '적 하나(영웅 포함)에게 피해를 3 주고 내 영웅을 3 회복합니다.', cast: (api, t) => { api.damage(t, 3); api.healHero(3); },
  },
  {
    id: 'e_warcry', name: '망자의 함성', type: 'spell', cost: 6, rarity: 'rare', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 +1/+1을 부여합니다.', cast: (api) => { for (const m of api.allies()) api.buff(m.uid, 1, 1); },
  },
  {
    id: 'e_soulfire', name: '영혼의 불꽃', type: 'spell', cost: 10, rarity: 'rare', enemy: true, target: 'foe', icon: 'curse', ai: { kind: 'damage', amount: 6 },
    text: '적 하나(영웅 포함)에게 피해를 6 줍니다.', cast: (api, t) => api.damage(t, 6),
  },

  // ── 지휘관별 적 카드 ───────────────────────────────────────
  // 해골 하사: 졸개 물량과 진군
  {
    id: 'sk_drummer', name: '해골 북잡이', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 1, health: 3, model: 'Skeleton_Minion',
    text: '<b>등장 시:</b> 다른 아군 하수인 모두에게 공격력 +1을 부여합니다.',
    onSummon: (api, self) => { for (const m of api.allies()) if (m.uid !== self.uid) api.buff(m.uid, 1, 0); },
  },
  {
    id: 'e_march', name: '진군 명령', type: 'spell', cost: 3, rarity: 'common', enemy: true, target: 'none', icon: 'sword', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두를 한 칸 전진시킵니다.',
    cast: (api) => { for (const m of api.allies()) api.advance(m.uid, 1); },
  },
  // 추적자 대장: 기습과 매복
  { id: 'sk_assassin', name: '해골 암살자', type: 'minion', cost: 5, rarity: 'rare', enemy: true, attack: 3, health: 2, model: 'Skeleton_Rogue', keywords: ['swift', 'dash'], text: '<b>기습</b>. <b>질주</b>' },
  {
    id: 'e_ambush', name: '매복 습격', type: 'spell', cost: 4, rarity: 'common', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'summon' },
    text: '빈 칸 두 곳에 해골 추적자를 소환합니다.',
    cast: (api) => { for (const lane of api.rng.shuffle(api.freeHomeLanes()).slice(0, 2)) api.summon('sk_rogue', lane); },
  },
  // 서고의 주술사: 원거리 저주와 빙결
  { id: 'sk_acolyte', name: '해골 수습 주술사', type: 'minion', cost: 3, rarity: 'basic', enemy: true, attack: 1, health: 2, model: 'Skeleton_Mage', keywords: ['ranged'], scale: 0.85, text: '<b>사격</b>' },
  {
    id: 'e_frostbolt', name: '서리 저주', type: 'spell', cost: 3, rarity: 'common', enemy: true, target: 'foeUnit', icon: 'frost', ai: { kind: 'damage', amount: 2 },
    text: '적 하수인 하나에게 피해를 2 주고 <b>빙결</b>시킵니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.damage(t, 2); api.freeze(t.uid); } },
  },
  // 납골당 수호자: 뼈 장벽
  {
    id: 'e_bonewall', name: '뼈의 장벽', type: 'spell', cost: 5, rarity: 'common', enemy: true, target: 'none', icon: 'shield', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 +0/+3을 부여합니다.',
    cast: (api) => { for (const m of api.allies()) api.buff(m.uid, 0, 3); },
  },
  // 해골 군주: 사령술
  {
    id: 'e_mass_raise', name: '대규모 소생', type: 'spell', cost: 9, rarity: 'rare', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'summon' },
    text: '빈 칸 모두에 불사 해골을 소환합니다.',
    cast: (api) => { for (const lane of api.freeHomeLanes()) api.summon('sk_undying', lane); },
  },
  {
    id: 'sk_deathknight', name: '죽음의 기사', type: 'minion', cost: 11, rarity: 'epic', enemy: true, attack: 5, health: 7, model: 'Skeleton_Warrior', keywords: ['lifesteal', 'undying'], scale: 1.35,
    text: '<b>흡혈</b>. <b>불사</b>',
  },
  // ── 얼음 (common) ──────────────────────────────────────────
  {
    id: 'ice_wall', name: '빙벽', type: 'spell', cost: 3, rarity: 'common', target: 'wallCell', icon: 'frost', ai: { kind: 'wall' },
    text: '빈 칸 두 개(가로)에 0/5 <b>빙벽</b>을 세웁니다. 아무도 지나가지 못하며 3턴 뒤 녹습니다. 부서지거나 녹은 칸은 <b>젖습니다</b>.',
    cast: (api, t) => {
      if (t.kind !== 'cell') return;
      api.summonAt('ice_wall_token', t.lane, t.row, 3);
      api.summonAt('ice_wall_token', t.lane + 1, t.row, 3);
    },
  },
  {
    id: 'blizzard', name: '눈보라', type: 'spell', cost: 6, rarity: 'rare', target: 'none', icon: 'frost', ai: { kind: 'blizzard' },
    text: '<b>모든</b> 하수인과 양쪽 영웅에게 피해를 2 줍니다(아군 포함).',
    cast: (api) => api.damageEverything(2),
  },
  {
    id: 'deep_freeze', name: '동결', type: 'spell', cost: 2, rarity: 'common', target: 'anyUnit', icon: 'frost', ai: { kind: 'control' },
    text: '하수인 하나를 2턴 동안 <b>빙결</b>시킵니다. 아군에게 쓰면 지켜 줄 수 있습니다.',
    cast: (api, t) => { if (t.kind === 'unit') api.freeze(t.uid, 2); },
  },
  {
    id: 'ice_shield', name: '얼음 방패', type: 'spell', cost: 1, rarity: 'common', target: 'none', icon: 'shield', ai: { kind: 'armor' },
    text: '내 영웅에게 <b>가호</b> +2. 영웅이 받는 피해를 먼저 막아 줍니다.',
    cast: (api) => api.armorHero(2),
  },
  // ── 비전술사: 주문 마법사 ───────────────────────────────────
  {
    id: 'a_empower', name: '주문 강화', type: 'spell', cost: 1, rarity: 'rare', hero: 'arcanist', target: 'none', icon: 'storm', ai: { kind: 'empower' },
    text: '이번 턴에 내는 다음 주문의 피해가 타격마다 +2. 이번 턴에 주문을 내지 않으면 사라집니다.',
    cast: (api) => api.empower(2),
  },
  {
    id: 'a_energy', name: '에너지 미사일', type: 'spell', cost: 7, rarity: 'common', hero: 'arcanist', target: 'none', icon: 'bolt', ai: { kind: 'aoe' },
    text: '무작위 적(영웅 포함)에게 피해 2를 3번 줍니다.',
    cast: (api) => {
      for (let i = 0; i < 3; i++) {
        const foes = api.foes();
        const pick = api.rng.int(foes.length + 1);
        if (pick < foes.length) api.damage({ kind: 'unit', uid: foes[pick].uid }, 2);
        else api.damageFoeHero(2);
      }
    },
  },
  {
    id: 'a_illusion', name: '환영', type: 'spell', cost: 2, rarity: 'rare', hero: 'arcanist', target: 'allySlot', icon: 'potion', ai: { kind: 'illusion' },
    text: '아군 하나를 고른 뒤 내 진영 빈 칸을 골라, 똑같이 생긴 <b>환영</b>을 만듭니다.',
    cast: (api, t) => { if (t.kind === 'unitTo') api.illusion(t.uid, t.lane); },
  },
  {
    id: 'a_telekinesis', name: '염력', type: 'spell', cost: 0, rarity: 'epic', hero: 'arcanist', target: 'move', icon: 'wave', ai: { kind: 'telekinesis' }, xCost: true,
    text: '하수인이나 구조물을 한 칸 뒤나 옆으로 옮깁니다. 대상의 체력만큼 마나가 듭니다. 그 칸이 차 있으면 <b>충돌</b>합니다.',
    cast: (api, t) => { if (t.kind === 'unitTo') api.telekinesis(t.uid, t.lane, t.row); },
  },
  // ── 부패 (common) ──────────────────────────────────────────
  {
    id: 'decay', name: '부패', type: 'spell', cost: 2, rarity: 'rare', target: 'ally', icon: 'curse', ai: { kind: 'decay' },
    text: '아군 하나를 희생해, 그 체력만큼 상하좌우 칸의 모든 대상에게 피해를 줍니다(아군 포함).',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.allies().find((a) => a.uid === t.uid);
      if (!u) return;
      const { lane, row } = u;
      const hp = api.sacrifice(u.uid);
      for (const n of api.unitsBeside(lane, row)) api.damage({ kind: 'unit', uid: n.uid }, hp);
    },
  },
  // ── 적 (새 개념) ────────────────────────────────────────────
  {
    id: 'e_poison_arrow', name: '독 묻은 화살', type: 'spell', cost: 3, rarity: 'common', enemy: true, target: 'foeUnit', icon: 'curse', ai: { kind: 'damage', amount: 2 },
    text: '적 하수인에게 피해를 2 주고 3턴 동안 <b>중독</b>시킵니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.damage(t, 2); api.poison(t.uid, 3); } },
  },
  {
    id: 'e_soul_mirror', name: '망령의 분신', type: 'spell', cost: 2, rarity: 'rare', enemy: true, target: 'allySlot', icon: 'skull', ai: { kind: 'illusion' },
    text: '아군 하나를 고른 뒤 진영 빈 칸에 똑같이 생긴 <b>환영</b>을 만듭니다.',
    cast: (api, t) => { if (t.kind === 'unitTo') api.illusion(t.uid, t.lane); },
  },
  {
    id: 'e_dark_power', name: '금지된 주문', type: 'spell', cost: 1, rarity: 'rare', enemy: true, target: 'none', icon: 'curse', ai: { kind: 'empower' },
    text: '이번 턴에 내는 다음 주문의 피해가 타격마다 +2.',
    cast: (api) => api.empower(2),
  },
  {
    id: 'e_bone_shield', name: '뼈 방패', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'none', icon: 'shield', ai: { kind: 'armor' },
    text: '영웅에게 <b>가호</b> +2.',
    cast: (api) => api.armorHero(2),
  },
  {
    id: 'e_grave_frost', name: '무덤 얼음벽', type: 'spell', cost: 3, rarity: 'rare', enemy: true, target: 'wallCell', icon: 'frost', ai: { kind: 'wall' },
    text: '빈 칸 두 개(가로)에 0/5 <b>빙벽</b>을 세웁니다. 3턴 뒤 녹고, 부서지거나 녹은 칸은 <b>젖습니다</b>.',
    cast: (api, t) => {
      if (t.kind !== 'cell') return;
      api.summonAt('ice_wall_token', t.lane, t.row, 3);
      api.summonAt('ice_wall_token', t.lane + 1, t.row, 3);
    },
  },
  {
    id: 'sk_plague', name: '역병 해골', type: 'minion', cost: 5, rarity: 'rare', enemy: true, attack: 2, health: 4, model: 'Skeleton_Minion',
    text: '<b>파괴 시</b>: 상하좌우 칸의 적을 2턴 동안 <b>중독</b>시킵니다.',
    onDeath: (api, self) => { for (const u of api.unitsBeside(self.lane, self.row)) if (u.side !== api.side) api.poison(u.uid, 2); },
  },
  {
    id: 'e_corpse_blast', name: '시체 폭발', type: 'spell', cost: 3, rarity: 'rare', enemy: true, target: 'ally', icon: 'skull', ai: { kind: 'decay' },
    text: '아군 하나를 희생해, 그 체력만큼 상하좌우 칸의 모든 대상에게 피해를 줍니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.allies().find((a) => a.uid === t.uid);
      if (!u) return;
      const { lane, row } = u;
      const hp = api.sacrifice(u.uid);
      for (const n of api.unitsBeside(lane, row)) api.damage({ kind: 'unit', uid: n.uid }, hp);
    },
  },
  // ══ 1장 숲 ═════════════════════════════════════════════════
  // 늑대 우두머리: 속도
  { id: 'wolf_pup', name: '새끼 늑대', type: 'minion', cost: 1, rarity: 'basic', enemy: true, attack: 1, health: 2, model: 'wolf', keywords: ['swift'], scale: 0.62, text: '<b>기습</b>' },
  { id: 'wolf', name: '회색 늑대', type: 'minion', cost: 3, rarity: 'basic', enemy: true, attack: 2, health: 3, model: 'wolf', keywords: ['dash'], scale: 0.85, text: '<b>질주</b>' },
  { id: 'wolf_hunter', name: '사냥 늑대', type: 'minion', cost: 4, rarity: 'common', enemy: true, attack: 3, health: 3, model: 'wolf', keywords: ['formation'], scale: 0.92, text: '<b>대열</b>' },
  { id: 'wolf_dire', name: '다이어울프', type: 'minion', cost: 6, rarity: 'rare', enemy: true, attack: 4, health: 5, model: 'wolf', keywords: ['dash'], scale: 1.2, text: '<b>질주</b>' },
  {
    id: 'e_howl', name: '울부짖음', type: 'spell', cost: 3, rarity: 'common', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'buffAll' },
    text: '내 늑대 모두에게 공격력 +1을 부여합니다.',
    cast: (api) => { for (const m of api.allies()) if (m.model === 'wolf') api.buff(m.uid, 1, 0); },
  },
  {
    id: 'e_gale', name: '질풍', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'ally', icon: 'wave', ai: { kind: 'buff', grants: 'dash' },
    text: '아군 하수인 하나에게 <b>질주</b>를 부여하고 한 칸 전진시킵니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.grantKeyword(t.uid, 'dash'); api.advance(t.uid, 1); } },
  },
  {
    id: 'e_pack_ambush', name: '포위 사냥', type: 'spell', cost: 4, rarity: 'common', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'summon' },
    text: '빈 칸 두 곳에 새끼 늑대를 소환합니다.',
    cast: (api) => { for (const lane of api.rng.shuffle(api.freeHomeLanes()).slice(0, 2)) api.summon('wolf_pup', lane); },
  },
  {
    id: 'e_instinct', name: '사냥 본능', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'none', icon: 'scroll', ai: { kind: 'draw' },
    text: '카드를 1장 뽑고, 가장 약한 아군 하수인에게 +1/+1을 부여합니다.',
    cast: (api) => {
      api.draw(1);
      const weak = api.allies().filter((m) => m.attack > 0).sort((a, b) => a.attack + a.health - b.attack - b.health)[0];
      if (weak) api.buff(weak.uid, 1, 1);
    },
  },
  // 슬라임 왕: 분열
  {
    id: 'slime', name: '초록 슬라임', type: 'minion', cost: 3, rarity: 'basic', enemy: true, attack: 2, health: 2, model: 'slime', keywords: ['split'], splitInto: 'slime_small_token',
    text: '<b>분열</b>: 죽으면 작은 슬라임(1/1) 둘로 나뉩니다.',
  },
  { id: 'slime_venom', name: '독 슬라임', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 1, health: 3, model: 'slime', keywords: ['venom'], text: '<b>맹독</b>' },
  { id: 'slime_acid', name: '산성 슬라임', type: 'minion', cost: 4, rarity: 'common', enemy: true, attack: 1, health: 4, model: 'slime', keywords: ['thorns'], text: '<b>가시</b>' },
  {
    id: 'slime_big', name: '거대 슬라임', type: 'minion', cost: 8, rarity: 'rare', enemy: true, attack: 2, health: 6, model: 'slime', keywords: ['split'], splitInto: 'slime_mid_token', scale: 1.45,
    text: '<b>분열</b>: 죽으면 중간 슬라임(1/2) 둘로 나뉩니다.',
  },
  { id: 'slime_small_token', name: '작은 슬라임', type: 'minion', cost: 1, rarity: 'basic', enemy: true, attack: 1, health: 1, model: 'slime', scale: 0.6, text: '분열로 생겨납니다.' },
  { id: 'slime_mid_token', name: '중간 슬라임', type: 'minion', cost: 3, rarity: 'basic', enemy: true, attack: 1, health: 2, model: 'slime', scale: 0.95, text: '분열로 생겨납니다.' },
  {
    id: 'e_merge', name: '점액 융합', type: 'spell', cost: 5, rarity: 'rare', enemy: true, target: 'ally', icon: 'potion', ai: { kind: 'buff', grants: 'split' },
    text: '아군 하수인 하나에게 +1/+2와 <b>분열</b>을 부여합니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 1, 2); api.grantKeyword(t.uid, 'split'); } },
  },
  {
    id: 'e_slime_coat', name: '끈적한 껍질', type: 'spell', cost: 3, rarity: 'common', enemy: true, target: 'ally', icon: 'shield', ai: { kind: 'buff', grants: 'ward' },
    text: '아군 하수인 하나에게 +0/+3과 <b>보호막</b>을 부여합니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 0, 3); api.grantKeyword(t.uid, 'ward'); } },
  },
  {
    id: 'e_vines', name: '휘감는 덩굴', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'foeUnit', icon: 'curse', ai: { kind: 'root' },
    text: '적 하수인 하나를 2턴 동안 <b>속박</b>합니다.',
    cast: (api, t) => { if (t.kind === 'unit') api.root(t.uid, 2); },
  },
  {
    id: 'e_spore', name: '독 포자', type: 'spell', cost: 3, rarity: 'common', enemy: true, target: 'lane', icon: 'curse', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두를 2턴 동안 <b>중독</b>시킵니다.',
    cast: (api, t) => { if (t.kind === 'lane') for (const m of api.foesInLane(t.lane)) api.poison(m.uid, 2); },
  },
  // 해골 사냥꾼장: 불사와 덫
  {
    id: 'sk_hunter', name: '해골 사냥꾼', type: 'minion', cost: 4, rarity: 'basic', enemy: true, attack: 2, health: 2, model: 'Skeleton_Rogue', keywords: ['ranged'], missile: 'arrow',
    text: '<b>사격</b>',
  },
  { id: 'sk_moss', name: '이끼 해골', type: 'minion', cost: 4, rarity: 'basic', enemy: true, attack: 2, health: 3, model: 'Skeleton_Minion', keywords: ['undying'], text: '<b>불사</b>' },
  {
    id: 'sk_trapper', name: '덫꾼 해골', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 1, health: 3, model: 'Skeleton_Rogue', scale: 0.9,
    text: '<b>등장 시:</b> 가장 앞선 적이 밟을 칸에 <b>덫</b>을 놓습니다.',
    onSummon: (api) => { trapAhead(api); },
  },
  {
    id: 'sk_beastmaster', name: '해골 조련사', type: 'minion', cost: 5, rarity: 'common', enemy: true, attack: 1, health: 3, model: 'Skeleton_Warrior',
    text: '<b>등장 시:</b> 양옆에 새끼 늑대를 소환합니다.',
    onSummon: (api, self) => { api.summon('wolf_pup', self.lane - 1); api.summon('wolf_pup', self.lane + 1); },
  },
  {
    id: 'sk_barrow_knight', name: '고분 기사', type: 'minion', cost: 8, rarity: 'rare', enemy: true, attack: 3, health: 5, model: 'Skeleton_Warrior', keywords: ['undying', 'cleave'], scale: 1.3, elite: true,
    text: '<b>불사</b>. <b>휩쓸기</b>',
  },
  {
    id: 'sk_rotwood', name: '고목 망자', type: 'minion', cost: 10, rarity: 'epic', enemy: true, attack: 3, health: 6, model: 'Skeleton_Warrior', keywords: ['undying'], scale: 1.45, elite: true,
    text: '<b>불사</b>. <b>등장 시:</b> 같은 줄의 적 하수인 모두를 2턴 동안 <b>속박</b>합니다.',
    onSummon: (api, self) => { for (const m of api.foesInLane(self.lane)) api.root(m.uid, 2); },
  },
  {
    id: 'e_grave_moss', name: '무덤 이끼', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'ally', icon: 'skull', ai: { kind: 'buff', grants: 'undying' },
    text: '아군 하수인 하나에게 생명력 +1과 <b>불사</b>를 부여합니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 0, 1); api.grantKeyword(t.uid, 'undying'); } },
  },
  {
    id: 'e_trap', name: '곰 덫', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'trapCell', icon: 'sword', ai: { kind: 'trap' },
    text: '빈 칸 하나에 <b>덫</b>을 놓습니다.',
    cast: (api, t) => { if (t.kind === 'cell') api.placeTrap(t.lane, t.row); },
  },
  {
    id: 'e_grave_vines', name: '무덤 덩굴', type: 'spell', cost: 4, rarity: 'common', enemy: true, target: 'lane', icon: 'curse', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 1 주고 1턴 동안 <b>속박</b>합니다.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      for (const m of api.foesInLane(t.lane)) { api.damage({ kind: 'unit', uid: m.uid }, 1); api.root(m.uid, 1); }
    },
  },
  {
    id: 'e_wither', name: '시듦', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'foeUnit', icon: 'curse', ai: { kind: 'weaken' },
    text: '적 하수인 하나의 공격력을 2 깎습니다.',
    cast: (api, t) => { if (t.kind === 'unit') api.weaken(t.uid, 2); },
  },
  {
    id: 'e_wisp', name: '도깨비불', type: 'spell', cost: 3, rarity: 'rare', enemy: true, target: 'foeUnit', icon: 'fire', ai: { kind: 'damage', amount: 2 },
    text: '적 하수인 하나에게 피해를 2 줍니다. 그 하수인이 죽으면 그 자리에서 해골 졸개가 일어납니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.foes().find((f) => f.uid === t.uid);
      if (!u) return;
      api.damage(t, 2);
      if (u.health <= 0 && !u.keywords.has('undying')) api.summonAt('sk_minion', u.lane, u.row);
    },
  },
  // ══ 영웅 전용 추가 ══════════════════════════════════════════
  // 수비대장: 버티고, 지키고, 받아친다
  {
    id: 'c_wall_archer', name: '성벽 궁수', type: 'minion', cost: 4, rarity: 'common', hero: 'captain', attack: 1, health: 4, model: 'Rogue', keywords: ['ranged', 'anchored'],
    text: '<b>사격</b>. <b>고정</b>',
  },
  {
    id: 'c_bulwark', name: '철벽 수호자', type: 'minion', cost: 8, rarity: 'rare', hero: 'captain', attack: 3, health: 8, model: 'Knight', keywords: ['cover', 'thorns'], scale: 1.15,
    text: '<b>엄호</b>. <b>가시</b>',
  },
  {
    id: 'c_siege', name: '공성 전차', type: 'minion', cost: 11, rarity: 'epic', hero: 'captain', attack: 0, health: 7, model: 'siege', keywords: ['anchored'],
    text: '<b>고정</b>. 두 턴에 한 번, 내 턴이 끝날 때 무작위 적 하수인을 중심으로 십자 다섯 칸의 <b>모두</b>(아군 포함)에게 피해 3. 적 하수인이 없으면 적 영웅에게 3.',
    onEndTurn: (api, self) => {
      if (!self.loaded) api.setLoaded(self, true);
      else {
        api.setLoaded(self, false);
        api.bombard(self);
      }
    },
  },
  {
    id: 'c_raise_shields', name: '방패 올려', type: 'spell', cost: 4, rarity: 'common', hero: 'captain', target: 'ally', icon: 'shield', ai: { kind: 'buff', grants: 'ward' },
    text: '아군 하수인 하나에게 <b>보호막</b>과 +0/+2를 부여합니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 0, 2); api.grantKeyword(t.uid, 'ward'); } },
  },
  {
    id: 'c_charge', name: '돌진', type: 'spell', cost: 5, rarity: 'common', hero: 'captain', target: 'chargeAlly', icon: 'sword', ai: { kind: 'charge' },
    text: '아군 하수인 하나가 자기 줄의 가장 가까운 적까지 돌진해 <b>자기 체력만큼</b> 피해를 줍니다. 돌진한 하수인은 그 절반(올림)을 입습니다.',
    cast: (api, t) => { if (t.kind === 'unit') api.charge(t.uid); },
  },
  {
    id: 'c_counter', name: '반격 태세', type: 'spell', cost: 4, rarity: 'rare', hero: 'captain', target: 'none', icon: 'shield', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 <b>가시</b>를 부여합니다.',
    cast: (api) => { for (const m of api.allies()) api.grantKeyword(m.uid, 'thorns'); },
  },
  {
    id: 'c_last_stand', name: '최후의 보루', type: 'spell', cost: 7, rarity: 'rare', hero: 'captain', target: 'none', icon: 'shield', ai: { kind: 'armor' },
    text: '내 영웅에게 <b>가호</b> +4. <b>보호막</b>이 있는 아군 하수인 하나마다 +1.',
    cast: (api) => api.armorHero(4 + api.allies().filter((m) => m.keywords.has('ward')).length),
  },
  {
    id: 'c_bastion', name: '방어 진지', type: 'spell', cost: 4, rarity: 'rare', hero: 'captain', target: 'area2', icon: 'shield', ai: { kind: 'zone', zone: 'fort' },
    text: '원하는 2×2 칸에 3턴 동안 <b>방어 진지</b>를 세웁니다. 그 안의 아군 하수인은 받는 피해가 2 줄어듭니다.',
    cast: (api, t) => { if (t.kind === 'cell') api.zone('fort', t.lane, t.row, 3); },
  },
  // 전쟁 족장: 북소리와 광란
  {
    id: 'w_drummer', name: '전쟁 북잡이', type: 'minion', cost: 4, rarity: 'common', hero: 'warchief', attack: 1, health: 3, model: 'Barbarian', scale: 0.9,
    text: '<b>등장 시:</b> 다른 아군 하수인 모두에게 공격력 +1을 부여합니다.',
    onSummon: (api, self) => { for (const m of api.allies()) if (m.uid !== self.uid) api.buff(m.uid, 1, 0); },
  },
  {
    id: 'w_ravager', name: '광란의 도끼전사', type: 'minion', cost: 7, rarity: 'rare', hero: 'warchief', attack: 3, health: 5, model: 'Barbarian', keywords: ['swift', 'enrage'], scale: 1.1,
    text: '<b>기습</b>. <b>분노</b>',
  },
  {
    id: 'w_bloodcry', name: '피의 함성', type: 'spell', cost: 2, rarity: 'common', hero: 'warchief', target: 'ally', icon: 'sword', ai: { kind: 'buff' },
    text: '아군 하수인 하나에게 공격력 +3을 주고, 그 하수인에게 피해를 1 줍니다(<b>분노</b>도 깨웁니다).',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 3, 0); api.damage(t, 1); } },
  },
  {
    id: 'w_whirl', name: '도끼 회전', type: 'spell', cost: 4, rarity: 'common', hero: 'warchief', target: 'ally', icon: 'sword', ai: { kind: 'whirl' },
    text: '아군 하수인 하나가 양옆 줄 같은 행의 적들에게 자기 공격력만큼 피해를 줍니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.allies().find((a) => a.uid === t.uid);
      if (!u) return;
      for (const f of api.foes().filter((x) => x.row === u.row && Math.abs(x.lane - u.lane) === 1)) api.damage({ kind: 'unit', uid: f.uid }, u.attack);
    },
  },
  {
    id: 'w_victory', name: '승리의 함성', type: 'spell', cost: 5, rarity: 'rare', hero: 'warchief', target: 'none', icon: 'heart', ai: { kind: 'heal' },
    text: '아군 하수인 하나마다 내 영웅의 생명력을 1 회복합니다.',
    cast: (api) => api.healHero(api.allies().length),
  },
  {
    id: 'w_allout', name: '총돌격', type: 'spell', cost: 7, rarity: 'epic', hero: 'warchief', target: 'none', icon: 'sword', ai: { kind: 'buffAll' },
    text: '아군 하수인 모두에게 <b>질주</b>를 주고 한 칸 전진시킵니다.',
    cast: (api) => { for (const m of api.allies()) { api.grantKeyword(m.uid, 'dash'); api.advance(m.uid, 1); } },
  },
  // 척후대장: 덫, 교란, 연막
  {
    id: 'h_snarer', name: '덫 사냥꾼', type: 'minion', cost: 3, rarity: 'common', hero: 'hunter', attack: 1, health: 3, model: 'Rogue_Hooded', scale: 0.9,
    text: '<b>등장 시:</b> 두 칸 앞에 <b>덫</b>을 놓습니다.',
    onSummon: (api, self) => { api.placeTrap(self.lane, self.row + 2 * forward(self.side)); },
  },
  {
    id: 'h_falconer', name: '매 조련사', type: 'minion', cost: 6, rarity: 'rare', hero: 'hunter', attack: 2, health: 3, model: 'Rogue', keywords: ['ranged'],
    text: '<b>사격</b>. <b>등장 시:</b> 옆 칸에 정찰 매(1/1 <b>비행</b>)를 소환합니다.',
    onSummon: (api, self) => {
      for (const lane of api.rng.shuffle([self.lane - 1, self.lane + 1])) {
        if (api.freeHomeLanes().includes(lane)) { api.summon('h_hawk_token', lane); return; }
      }
    },
  },
  { id: 'h_hawk_token', name: '정찰 매', type: 'minion', cost: 1, rarity: 'basic', hero: 'hunter', attack: 1, health: 1, model: 'bird', keywords: ['flying'], scale: 0.8, text: '<b>비행</b>' },
  {
    id: 'h_trap', name: '사냥꾼의 덫', type: 'spell', cost: 1, rarity: 'common', hero: 'hunter', target: 'ownTrapCell', icon: 'sword', ai: { kind: 'trap' },
    text: '내 진영 앞쪽 세 줄 안의 빈 칸 하나에 <b>덫</b>을 놓습니다.',
    cast: (api, t) => { if (t.kind === 'cell') api.placeTrap(t.lane, t.row); },
  },
  {
    id: 'h_snare', name: '올가미', type: 'spell', cost: 2, rarity: 'common', hero: 'hunter', target: 'foeUnit', icon: 'arrows', ai: { kind: 'root' },
    text: '적 하수인 하나에게 피해를 1 주고 2턴 동안 <b>속박</b>합니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.damage(t, 1); api.root(t.uid, 2); } },
  },
  {
    id: 'h_disrupt', name: '교란 사격', type: 'spell', cost: 2, rarity: 'common', hero: 'hunter', target: 'foeUnit', icon: 'arrows', ai: { kind: 'damage', amount: 1 },
    text: '적 하수인 하나에게 피해를 1 주고, 무작위 옆 칸(상하좌우)으로 밀쳐냅니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.damage(t, 1); api.nudge(t.uid); } },
  },
  {
    id: 'h_retreat', name: '전술적 후퇴', type: 'spell', cost: 4, rarity: 'common', hero: 'hunter', target: 'none', icon: 'scroll', ai: { kind: 'skip' },
    text: '아군 하수인 모두를 한 칸씩 뒤로(내 진영 쪽) 물리고 카드를 1장 뽑습니다.',
    cast: (api) => {
      const home = homeRow(api.side);
      // Nearest our side first, so the ones behind make room for the ones in front.
      for (const m of [...api.allies()].sort((a, b) => Math.abs(a.row - home) - Math.abs(b.row - home))) api.retreat(m.uid, 1);
      api.draw(1);
    },
  },
  {
    id: 'h_weakspot', name: '약점 포착', type: 'spell', cost: 5, rarity: 'rare', hero: 'hunter', target: 'none', icon: 'arrows', ai: { kind: 'aoe' },
    text: '무작위 적 하수인 하나와 그 주변 1칸의 모든 적에게 <b>징표</b>를 새깁니다(2턴 동안 받는 피해 +1).',
    cast: (api) => {
      const foes = api.foes();
      if (!foes.length) return;
      const c = api.rng.pick(foes);
      for (const f of foes) if (Math.abs(f.lane - c.lane) <= 1 && Math.abs(f.row - c.row) <= 1) api.mark(f.uid, 2);
    },
  },
  {
    id: 'h_smoke', name: '연막탄 투척', type: 'spell', cost: 6, rarity: 'rare', hero: 'hunter', target: 'area2', icon: 'wave', ai: { kind: 'zone', zone: 'smoke' },
    text: '원하는 2×2 칸에 2턴 동안 <b>연막</b>을 피웁니다. 연막 속 하수인은 적의 대상 지정 주문과 원거리 공격의 표적이 되지 않습니다(무작위 공격은 맞음).',
    cast: (api, t) => { if (t.kind === 'cell') api.zone('smoke', t.lane, t.row, 2); },
  },
  {
    id: 'h_volley_trap', name: '일제 매복', type: 'spell', cost: 6, rarity: 'epic', hero: 'hunter', target: 'none', icon: 'arrows', ai: { kind: 'aoe' },
    text: '가장 앞선 적 셋이 밟을 칸에 <b>덫</b>을 하나씩 놓습니다.',
    cast: (api) => { for (let i = 0; i < 3; i++) trapAhead(api); },
  },
  // ══ 던전·동굴 지휘관 보강 ═══════════════════════════════════
  // 해골 대장: 강한 근접·원거리 하수인
  {
    id: 'sk_crossbow', name: '해골 석궁수', type: 'minion', cost: 6, rarity: 'common', enemy: true, attack: 3, health: 4, model: 'Skeleton_Rogue', keywords: ['ranged'], missile: 'arrow',
    text: '<b>사격</b>',
  },
  {
    id: 'sk_gladiator', name: '해골 검투사', type: 'minion', cost: 8, rarity: 'rare', enemy: true, attack: 4, health: 5, model: 'Skeleton_Warrior', keywords: ['vanguard', 'enrage'], scale: 1.15,
    text: '<b>선봉</b>. <b>분노</b>',
  },
  // 서고의 주술사: 주문과 원거리 짤짤이
  { id: 'sk_hexling', name: '해골 잡역 주술사', type: 'minion', cost: 2, rarity: 'basic', enemy: true, attack: 1, health: 1, model: 'Skeleton_Mage', keywords: ['ranged'], scale: 0.75, text: '<b>사격</b>' },
  {
    id: 'e_coven', name: '주술사 소환진', type: 'spell', cost: 4, rarity: 'common', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'summon' },
    text: '빈 칸 두 곳에 해골 잡역 주술사(1/1 <b>사격</b>)를 소환합니다.',
    cast: (api) => { for (const lane of api.rng.shuffle(api.freeHomeLanes()).slice(0, 2)) api.summon('sk_hexling', lane); },
  },
  // 납골당 수호자: 명치가 단단하다
  {
    id: 'sk_gatekeeper', name: '납골당 문지기', type: 'minion', cost: 9, rarity: 'rare', enemy: true, attack: 2, health: 9, model: 'Skeleton_Warrior', keywords: ['cover', 'thorns'], scale: 1.3,
    text: '<b>엄호</b>. <b>가시</b>',
  },
  // 해골 군주: 주문과 강력한 하수인
  {
    id: 'e_death_storm', name: '죽음의 폭풍', type: 'spell', cost: 8, rarity: 'rare', enemy: true, target: 'none', icon: 'skull', ai: { kind: 'aoe' },
    text: '모든 적 하수인에게 피해를 2 줍니다.',
    cast: (api) => { for (const m of api.foes()) api.damage({ kind: 'unit', uid: m.uid }, 2); },
  },
  {
    id: 'sk_archlich', name: '해골 대마도사', type: 'minion', cost: 12, rarity: 'epic', enemy: true, attack: 4, health: 7, model: 'Skeleton_Mage', keywords: ['ranged'], scale: 1.3, elite: true,
    text: '<b>사격</b>. 내 턴이 끝날 때 무작위 적(영웅 포함)에게 피해를 2 줍니다.',
    onEndTurn: (api) => randomFoeOrHero(api, 2),
  },
  // 해골 군주: 지옥의 불
  {
    id: 'e_hellfire', name: '지옥불', type: 'spell', cost: 9, rarity: 'epic', enemy: true, target: 'lane', icon: 'meteor', ai: { kind: 'lane' },
    text: '한 줄의 적 하수인 모두에게 피해를 5 줍니다. 그 줄이 비어 있으면 적 영웅에게 3.',
    cast: (api, t) => {
      if (t.kind !== 'lane') return;
      const ms = api.foesInLane(t.lane);
      if (ms.length === 0) api.damageFoeHero(3);
      for (const m of ms) api.damage({ kind: 'unit', uid: m.uid }, 5);
    },
  },
  {
    id: 'e_inferno_orb', name: '업화구', type: 'spell', cost: 8, rarity: 'epic', enemy: true, target: 'foe', icon: 'fire', ai: { kind: 'damage', amount: 6 },
    text: '적 하나(영웅 포함)에게 피해를 6 주고, 그 주변의 적 하수인에게 피해를 2 줍니다.',
    cast: (api, t) => {
      const u = t.kind === 'unit' ? api.foes().find((f) => f.uid === t.uid) : undefined;
      const around = u ? api.unitsAround(u.lane, u.row).filter((m) => m.side === u.side) : [];
      api.damage(t, 6);
      for (const m of around) api.damage({ kind: 'unit', uid: m.uid }, 2);
    },
  },
  {
    id: 'e_lord_doom', name: '군주의 종언', type: 'spell', cost: 13, rarity: 'legendary', enemy: true, target: 'none', icon: 'meteor', ai: { kind: 'aoe' },
    text: '모든 적 하수인에게 피해 5, 적 영웅에게 피해 4. 쓰러진 적마다 불사 해골을 일으킵니다.',
    cast: (api) => {
      const foes = api.foes();
      for (const m of foes) api.damage({ kind: 'unit', uid: m.uid }, 5);
      api.damageFoeHero(4);
      const fallen = foes.filter((m) => m.health <= 0).length;
      for (const lane of api.rng.shuffle(api.freeHomeLanes()).slice(0, fallen)) api.summon('sk_undying', lane);
    },
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
  split: { name: '분열', text: '죽으면 더 작은 슬라임 둘로 나뉩니다(그 칸과 옆 빈 칸).' },
  venom: { name: '맹독', text: '이 하수인에게 맞은 적은 2턴 동안 중독됩니다.' },
  illusion: { name: '환영', text: '똑같이 생겼지만 피해를 주지 못하고, 피해를 받으면 체력과 상관없이 사라집니다.' },
  swift: { name: '기습', text: '소환된 턴에도 바로 전진하거나 공격합니다.' },
  ranged: { name: '사격', text: '자기 줄 앞쪽 3칸 안의 첫 번째 적을 쏩니다(아군 너머로도). 적이 없으면 전진하고, 적 영웅이 사거리 안이면 영웅을 쏩니다.' },
  ward: { name: '보호막', text: '처음 받는 피해를 무시합니다.' },
  dash: { name: '질주', text: '매 턴 2칸씩 전진합니다.' },
  anchored: { name: '고정', text: '전진하지 않고 제자리를 지킵니다.' },
  knockback: { name: '넉백', text: '공격한 적을 1칸 뒤로 밀어냅니다.' },
  pierce: { name: '관통', text: '공격이 대상 바로 뒤 칸의 적까지 맞힙니다. 뒤가 끝줄 밖이면 적 영웅이 맞습니다.' },
  flying: { name: '비행', text: '하수인을 무시하고 날아서 전진하며 적 영웅만 공격합니다. 근접 공격으로는 맞지 않고, 사격과 주문으로만 맞힐 수 있습니다.' },
  formation: { name: '대열', text: '양옆 줄 같은 행에 아군이 있으면 공격력 +2.' },
  lifesteal: { name: '흡혈', text: '이 하수인이 준 피해만큼 내 영웅의 생명력을 회복합니다.' },
  undying: { name: '불사', text: '처음 죽을 때 생명력 1로 되살아납니다.' },
  cleave: { name: '휩쓸기', text: '하수인을 공격할 때 양옆 줄 같은 행의 적도 함께 공격합니다.' },
  thorns: { name: '가시', text: '근접 공격을 받으면 공격한 적에게 피해를 2 줍니다.' },
  cover: { name: '엄호', text: '같은 줄의 다른 아군을 대신해 적의 사격을 맞고, 적은 그 아군을 대상 지정 주문으로 노릴 수 없습니다.' },
  regenerate: { name: '재생', text: '내 턴이 시작될 때 생명력을 모두 회복합니다.' },
  enrage: { name: '분노', text: '피해를 받고 살아남을 때마다 공격력 +1.' },
  vanguard: { name: '선봉', text: '아군 중 가장 앞에 있으면 공격력 +2.' },
};
