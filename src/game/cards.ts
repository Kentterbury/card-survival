import type { Rng } from './rng';
import { forward, LAST_ROW, type Keyword, type ModelId, type Side, type Target, type TargetKind, type Unit } from './types';

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
  freeze(uid: number): void;
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
  | { kind: 'draw'; selfDamage?: number }
  | { kind: 'heal' }
  | { kind: 'control' }
  | { kind: 'ramp' }
  | { kind: 'discover' }
  | { kind: 'disrupt' }
  | { kind: 'recycle' }
  | { kind: 'cycle' }
  | { kind: 'discount' }
  | { kind: 'copy' };

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
    id: 'shieldbearer', name: '방패병', type: 'minion', cost: 2, rarity: 'basic', attack: 0, health: 5, model: 'Knight', keywords: ['ward', 'anchored'],
    text: '<b>보호막</b>. <b>고정</b>',
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
    id: 'shadowblade', name: '그림자 단검수', type: 'minion', cost: 3, rarity: 'common', attack: 3, health: 2, model: 'Rogue_Hooded', keywords: ['swift', 'dash'],
    text: '<b>기습</b>. <b>질주</b>',
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
    id: 'siege_mage', name: '공성 마법사', type: 'minion', cost: 5, rarity: 'rare', attack: 2, health: 5, model: 'Mage', keywords: ['ranged', 'anchored'], scale: 1.1,
    text: '<b>사격</b>. <b>고정</b>. 턴 종료 시 적 영웅에게 피해 2.',
    onEndTurn: (api) => api.damageFoeHero(2),
  },
  {
    id: 'warden', name: '방벽 수호자', type: 'minion', cost: 3, rarity: 'common', attack: 2, health: 6, model: 'Knight', keywords: ['anchored'], scale: 1.1,
    text: '<b>고정</b>. <b>등장 시:</b> 양옆에 바리케이드 설치.',
    onSummon: (api, self) => { api.summon('barricade_token', self.lane - 1); api.summon('barricade_token', self.lane + 1); },
  },
  {
    id: 'priest', name: '전장 신관', type: 'minion', cost: 3, rarity: 'rare', attack: 1, health: 4, model: 'Mage', scale: 0.95,
    text: '턴 종료 시 내 영웅과 아군 모두 2 회복.',
    onEndTurn: (api) => { api.healHero(2); for (const m of api.allies()) api.healUnit(m.uid, 2); },
  },
  { id: 'mace_knight', name: '철퇴 기사', type: 'minion', cost: 3, rarity: 'common', attack: 3, health: 4, model: 'Knight', keywords: ['knockback'], text: '<b>넉백</b>' },
  { id: 'longbow', name: '장궁수', type: 'minion', cost: 3, rarity: 'common', attack: 2, health: 3, model: 'Rogue', keywords: ['ranged', 'pierce'], text: '<b>사격</b>. <b>관통</b>' },
  { id: 'glider', name: '활공 정찰병', type: 'minion', cost: 2, rarity: 'common', attack: 2, health: 1, model: 'Rogue_Hooded', keywords: ['flying'], scale: 0.9, text: '<b>비행</b>' },
  { id: 'phalanx', name: '대열 창병', type: 'minion', cost: 2, rarity: 'basic', attack: 1, health: 3, model: 'Knight', keywords: ['formation'], scale: 0.9, text: '<b>대열</b>' },
  { id: 'blood_blade', name: '피의 검사', type: 'minion', cost: 4, rarity: 'rare', attack: 3, health: 5, model: 'Barbarian', keywords: ['lifesteal'], text: '<b>흡혈</b>' },
  { id: 'stalwart', name: '불굴의 용사', type: 'minion', cost: 4, rarity: 'rare', attack: 3, health: 3, model: 'Knight', keywords: ['undying'], scale: 1.05, text: '<b>불사</b>' },
  { id: 'greatsword', name: '대검 용병', type: 'minion', cost: 4, rarity: 'rare', attack: 3, health: 5, model: 'Barbarian', keywords: ['cleave'], scale: 1.05, text: '<b>휩쓸기</b>' },
  { id: 'thornguard', name: '가시 방패병', type: 'minion', cost: 3, rarity: 'common', attack: 2, health: 5, model: 'Knight', keywords: ['thorns'], text: '<b>가시</b>' },
  { id: 'cover_knight', name: '엄호 기사', type: 'minion', cost: 4, rarity: 'rare', attack: 2, health: 7, model: 'Knight', keywords: ['cover'], scale: 1.1, text: '<b>엄호</b>' },
  { id: 'monk', name: '재생의 수도사', type: 'minion', cost: 3, rarity: 'common', attack: 2, health: 4, model: 'Mage', keywords: ['regenerate'], text: '<b>재생</b>' },
  { id: 'brawler', name: '광기의 투사', type: 'minion', cost: 2, rarity: 'common', attack: 1, health: 4, model: 'Barbarian', keywords: ['enrage'], scale: 0.9, text: '<b>분노</b>' },
  { id: 'vanguard_captain', name: '선봉장', type: 'minion', cost: 3, rarity: 'common', attack: 2, health: 4, model: 'Knight', keywords: ['vanguard'], text: '<b>선봉</b>' },
  { id: 'barricade_token', name: '바리케이드', type: 'minion', cost: 0, rarity: 'basic', attack: 0, health: 6, model: 'barrier', text: '움직이지도 공격하지도 않습니다.' },

  // ── Player spells ──────────────────────────────────────────
  {
    id: 'firebolt', name: '불꽃 화살', type: 'spell', cost: 2, rarity: 'basic', target: 'foe', icon: 'fire', ai: { kind: 'damage', amount: 3 },
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
    id: 'execute', name: '처형', type: 'spell', cost: 3, rarity: 'common', target: 'foeUnit', icon: 'skull', ai: { kind: 'damage', amount: 2 },
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
    cast: (api) => { for (const m of api.allies()) api.grantKeyword(m.uid, 'ward'); },
  },

  {
    id: 'thorn_armor', name: '가시 갑옷', type: 'spell', cost: 1, rarity: 'common', target: 'ally', icon: 'shield', ai: { kind: 'buff' },
    text: '아군 하수인 하나에게 +0/+2와 <b>가시</b>를 부여합니다.',
    cast: (api, t) => { if (t.kind === 'unit') { api.buff(t.uid, 0, 2); api.grantKeyword(t.uid, 'thorns'); } },
  },
  {
    id: 'renewal', name: '재생의 축복', type: 'spell', cost: 2, rarity: 'common', target: 'ally', icon: 'heart', ai: { kind: 'buff' },
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
    id: 'war_library', name: '전술 서고', type: 'spell', cost: 1, rarity: 'common', target: 'none', icon: 'scroll', ai: { kind: 'discover' },
    text: '<b>탐색</b>: 주문 카드 하나.',
    cast: (api) => api.discover('spell'),
  },
  {
    id: 'reinforce', name: '증원 요청', type: 'spell', cost: 2, rarity: 'common', target: 'none', icon: 'sword', ai: { kind: 'discover' },
    text: '<b>탐색</b>: 하수인 카드 하나. 그 카드의 비용이 1 줄어듭니다.',
    cast: (api) => api.discover('minion', -1),
  },
  {
    id: 'change_plans', name: '작전 변경', type: 'spell', cost: 1, rarity: 'common', target: 'none', icon: 'scroll', ai: { kind: 'cycle' },
    text: '손패를 모두 버리고, 버린 수만큼 카드를 뽑습니다.',
    cast: (api) => api.redrawHand(),
  },
  {
    id: 'salvage', name: '재활용', type: 'spell', cost: 2, rarity: 'common', target: 'none', icon: 'shield', ai: { kind: 'recycle' },
    text: '버린 카드 더미에서 무작위 카드 2장을 손으로 가져옵니다.',
    cast: (api) => api.recycle(2),
  },
  {
    id: 'chains', name: '봉인의 사슬', type: 'spell', cost: 2, rarity: 'rare', target: 'none', icon: 'frost', ai: { kind: 'disrupt' },
    text: '상대 손패 무작위 2장을 <b>봉인</b>합니다. 카드를 1장 뽑습니다.',
    cast: (api) => { api.lockFoeCards(2); api.draw(1); },
  },
  {
    id: 'pickpocket', name: '소매치기', type: 'spell', cost: 2, rarity: 'rare', target: 'none', icon: 'skull', ai: { kind: 'disrupt' },
    text: '상대 손패에서 무작위 카드 1장을 빼앗아 옵니다.',
    cast: (api) => api.stealFromFoeHand(1),
  },
  {
    id: 'grave_rob', name: '도굴', type: 'spell', cost: 1, rarity: 'common', target: 'none', icon: 'skull', ai: { kind: 'draw' },
    text: '상대 덱 맨 위 카드를 내 손으로 가져옵니다.',
    cast: (api) => api.drawFromFoeDeck(1),
  },
  {
    id: 'oblivion', name: '망각의 저주', type: 'spell', cost: 1, rarity: 'common', target: 'none', icon: 'curse', ai: { kind: 'disrupt' },
    text: '상대는 다음 턴에 카드를 뽑지 못합니다. 카드를 1장 뽑습니다.',
    cast: (api) => { api.foeSkipDraw(); api.draw(1); },
  },
  {
    id: 'mirror_image', name: '거울상', type: 'spell', cost: 2, rarity: 'rare', target: 'ally', icon: 'potion', ai: { kind: 'copy' },
    text: '아군 하수인 하나의 카드를 복사해 손으로 가져옵니다. 복사본은 비용이 1 줄어듭니다.',
    cast: (api, t) => {
      if (t.kind !== 'unit') return;
      const u = api.allies().find((m) => m.uid === t.uid);
      if (u) api.addCopy(u.defId, -1);
    },
  },
  {
    id: 'supply_wagon', name: '보급 마차', type: 'spell', cost: 3, rarity: 'rare', target: 'none', icon: 'potion', ai: { kind: 'discount' },
    text: '내 손패의 모든 카드 비용이 1 줄어듭니다. 카드를 1장 뽑습니다.',
    cast: (api) => { api.modifyHandCosts(-1); api.draw(1); },
  },

  // ── Enemy units ────────────────────────────────────────────
  { id: 'sk_minion', name: '해골 졸개', type: 'minion', cost: 1, rarity: 'basic', enemy: true, attack: 1, health: 2, model: 'Skeleton_Minion', text: '' },
  { id: 'sk_rogue', name: '해골 추적자', type: 'minion', cost: 2, rarity: 'basic', enemy: true, attack: 2, health: 2, model: 'Skeleton_Rogue', keywords: ['dash'], text: '<b>질주</b>' },
  { id: 'sk_warrior', name: '해골 전사', type: 'minion', cost: 3, rarity: 'basic', enemy: true, attack: 3, health: 4, model: 'Skeleton_Warrior', text: '' },
  { id: 'sk_mage', name: '해골 주술사', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 2, health: 3, model: 'Skeleton_Mage', keywords: ['ranged'], text: '<b>사격</b>' },
  { id: 'sk_guard', name: '무덤 수호병', type: 'minion', cost: 4, rarity: 'common', enemy: true, attack: 3, health: 6, model: 'Skeleton_Warrior', keywords: ['ward'], scale: 1.15, text: '<b>보호막</b>' },
  { id: 'sk_brute', name: '뼈 거인', type: 'minion', cost: 6, rarity: 'rare', enemy: true, attack: 6, health: 10, model: 'Skeleton_Warrior', keywords: ['knockback'], scale: 1.45, text: '<b>넉백</b>' },

  { id: 'sk_wraith', name: '해골 망령', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 2, health: 2, model: 'Skeleton_Rogue', keywords: ['flying'], scale: 0.9, text: '<b>비행</b>' },
  { id: 'sk_undying', name: '불사 해골', type: 'minion', cost: 2, rarity: 'basic', enemy: true, attack: 2, health: 1, model: 'Skeleton_Minion', keywords: ['undying'], text: '<b>불사</b>' },
  { id: 'sk_pikeman', name: '해골 창병', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 2, health: 4, model: 'Skeleton_Warrior', keywords: ['pierce'], scale: 0.95, text: '<b>관통</b>' },
  { id: 'sk_phalanx', name: '해골 방진병', type: 'minion', cost: 2, rarity: 'basic', enemy: true, attack: 1, health: 3, model: 'Skeleton_Warrior', keywords: ['formation'], scale: 0.9, text: '<b>대열</b>' },
  { id: 'sk_leech', name: '흡혈 주술사', type: 'minion', cost: 4, rarity: 'rare', enemy: true, attack: 2, health: 3, model: 'Skeleton_Mage', keywords: ['ranged', 'lifesteal'], text: '<b>사격</b>. <b>흡혈</b>' },

  { id: 'sk_captain', name: '해골 대장', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 2, health: 4, model: 'Skeleton_Warrior', keywords: ['vanguard'], text: '<b>선봉</b>' },
  { id: 'sk_berserker', name: '해골 광전사', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 2, health: 4, model: 'Skeleton_Minion', keywords: ['enrage'], scale: 1.1, text: '<b>분노</b>' },
  { id: 'sk_shieldwall', name: '해골 방패수', type: 'minion', cost: 4, rarity: 'rare', enemy: true, attack: 1, health: 7, model: 'Skeleton_Warrior', keywords: ['cover'], scale: 1.1, text: '<b>엄호</b>' },
  { id: 'sk_thorn', name: '뼈 가시벽', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 1, health: 6, model: 'Skeleton_Warrior', keywords: ['thorns'], text: '<b>가시</b>' },
  { id: 'sk_regen', name: '되살아나는 해골', type: 'minion', cost: 3, rarity: 'common', enemy: true, attack: 3, health: 3, model: 'Skeleton_Minion', keywords: ['regenerate'], scale: 1.05, text: '<b>재생</b>' },
  { id: 'sk_reaper', name: '해골 수확자', type: 'minion', cost: 5, rarity: 'rare', enemy: true, attack: 4, health: 5, model: 'Skeleton_Rogue', keywords: ['cleave'], scale: 1.2, text: '<b>휩쓸기</b>' },

  // ── Enemy spells ───────────────────────────────────────────
  {
    id: 'e_curse', name: '저주의 화살', type: 'spell', cost: 1, rarity: 'basic', enemy: true, target: 'foe', icon: 'curse', ai: { kind: 'damage', amount: 2 },
    text: '적 하나(영웅 포함)에게 피해를 2 줍니다.', cast: (api, t) => api.damage(t, 2),
  },
  {
    id: 'e_hex', name: '봉인의 저주', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'none', icon: 'curse', ai: { kind: 'disrupt' },
    text: '상대 손패 무작위 1장을 <b>봉인</b>하고 적 영웅에게 피해 1.',
    cast: (api) => { api.lockFoeCards(1); api.damageFoeHero(1); },
  },
  {
    id: 'e_insight', name: '망자의 지혜', type: 'spell', cost: 2, rarity: 'common', enemy: true, target: 'none', icon: 'scroll', ai: { kind: 'draw' },
    text: '카드를 2장 뽑습니다.',
    cast: (api) => api.draw(2),
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
