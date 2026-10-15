export const LANES = 5;
/** Rows 0..LAST_ROW. The player summons on row 0, the enemy on LAST_ROW. */
export const ROWS = 6;
export const LAST_ROW = ROWS - 1;
/** Mana runs on a 20-point scale: 3 on the first turn, +2 every turn after, up to 20. */
export const MAX_MANA = 20;
export const FIRST_TURN_MANA = 3;
export const MANA_PER_TURN = 2;
export const MAX_HAND = 10;
/** Unspent mana carried into the next turn, at most this much. */
export const MAX_RESERVE = 2;
/** How far units with the `ranged` keyword shoot along their lane. */
export const RANGED_RANGE = 3;

export type Side = 'player' | 'enemy';
export const other = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');
/** Direction a side's units advance in (row delta per step). */
export const forward = (s: Side): number => (s === 'player' ? 1 : -1);
export const homeRow = (s: Side): number => (s === 'player' ? 0 : LAST_ROW);

export type Keyword =
  | 'swift' | 'ranged' | 'ward'
  | 'dash' | 'anchored' | 'knockback' | 'pierce' | 'flying' | 'formation' | 'lifesteal' | 'undying'
  | 'cleave' | 'thorns' | 'cover' | 'regenerate' | 'enrage' | 'vanguard';

/** Attack bonus a `formation` unit gets with an ally beside it. */
export const FORMATION_BONUS = 2;
/** Attack bonus for a `vanguard` unit that is its side's front-most unit. */
export const VANGUARD_BONUS = 2;
/** Damage a `thorns` unit deals back to melee attackers. */
export const THORNS_DAMAGE = 2;

export type ModelId =
  | 'Knight' | 'Barbarian' | 'Mage' | 'Rogue' | 'Rogue_Hooded'
  | 'Skeleton_Minion' | 'Skeleton_Warrior' | 'Skeleton_Rogue' | 'Skeleton_Mage'
  | 'barrier';

export type Target =
  | { kind: 'none' }
  | { kind: 'unit'; uid: number }
  | { kind: 'hero'; side: Side }
  | { kind: 'lane'; lane: number }
  | { kind: 'slot'; lane: number };

/**
 * What a card may target, relative to whoever plays it:
 * `foe` = an opposing unit or the opposing hero, `foeUnit` = opposing units only,
 * `ally` = own units, `lane` = a whole lane, `slot` = an empty cell on the own home row.
 */
export type TargetKind = 'none' | 'foe' | 'foeUnit' | 'ally' | 'lane' | 'slot';

export interface Unit {
  uid: number;
  defId: string;
  side: Side;
  name: string;
  model: ModelId;
  attack: number;
  health: number;
  maxHealth: number;
  keywords: Set<Keyword>;
  /** Visual size multiplier for elites. */
  scale: number;
  lane: number;
  row: number;
  /** Cells advanced per turn (0 = holds position). */
  speed: number;
  /** Cells ahead this unit can strike (1 = melee). */
  range: number;
  frozen: boolean;
  /** Summoned this turn: does not act at the end of it unless `swift`. */
  fresh: boolean;
}

export interface CardInstance {
  iid: number;
  defId: string;
  /** Added to the card's printed cost (negative = cheaper). */
  costMod?: number;
  /** 봉인: cannot be played until the end of its owner's next turn. */
  locked?: boolean;
}

/** A pending 탐색 pick: choose one of these cards to add to the hand. */
export interface PendingChoice {
  side: Side;
  options: string[];
  costMod: number;
}

export interface Hero {
  name: string;
  model: ModelId;
  scale: number;
  health: number;
  maxHealth: number;
}

export interface SideState {
  hero: Hero;
  mana: number;
  maxMana: number;
  reserve: number;
  powerUsed: boolean;
  /** Skip the draw at the start of the next turn (망각의 저주). */
  skipDraw: boolean;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
}

/** `camp`: between stages, after picking a reward bundle (rest or trim the deck). */
export type Phase = 'player' | 'enemy' | 'reward' | 'camp' | 'victory' | 'defeat';

export interface RewardBundle {
  id: string;
  name: string;
  theme: string;
  cards: string[];
}

/** A hit target in events: a unit uid, or the hero of the given side. */
export type HitTarget = number | Side;

export type GameEvent =
  | { type: 'stageStart'; stage: number }
  | { type: 'turnStart'; side: Side; turn: number }
  | { type: 'draw'; side: Side; card: CardInstance }
  | { type: 'burn'; side: Side; card: CardInstance }
  | { type: 'reshuffle'; side: Side; count: number }
  | { type: 'cardPlayed'; side: Side; card: CardInstance; target: Target }
  | { type: 'summon'; uid: number; side: Side; lane: number; row: number; defId: string }
  | { type: 'move'; uid: number; lane: number; from: number; to: number }
  | { type: 'push'; uid: number; lane: number; from: number; to: number }
  | { type: 'attack'; attacker: number; target: HitTarget; ranged: boolean }
  | { type: 'damage'; target: HitTarget; amount: number }
  | { type: 'wardBroken'; uid: number }
  | { type: 'heal'; target: HitTarget; amount: number }
  | { type: 'keywordGained'; uid: number; keyword: Keyword }
  | { type: 'cardGained'; side: Side; card: CardInstance; from: 'steal' | 'copy' | 'choice' | 'discard' }
  | { type: 'discard'; side: Side; card: CardInstance }
  | { type: 'notice'; side: Side; text: string }
  | { type: 'choice'; side: Side; options: string[] }
  | { type: 'explosion'; lane: number; row: number }
  | { type: 'revive'; uid: number }
  | { type: 'buff'; uid: number; attack: number; health: number }
  | { type: 'freeze'; uid: number }
  | { type: 'death'; uid: number }
  | { type: 'spell'; side: Side; defId: string; target: Target }
  | { type: 'heroPower'; side: Side; target: Target }
  | { type: 'enemyTurn' }
  | { type: 'stageClear'; stage: number; gold: number }
  | { type: 'defeat' }
  | { type: 'victory' };
