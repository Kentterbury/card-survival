export const LANES = 5;
/** Rows 0..LAST_ROW. The player summons on row 0, the enemy on LAST_ROW. */
export const ROWS = 6;
export const LAST_ROW = ROWS - 1;
/** Mana runs on a 20-point scale: each hero's first-turn mana, then +1 every turn, up to 20. Unspent mana is lost. */
export const MAX_MANA = 20;
export const MANA_PER_TURN = 1;
export const MAX_HAND = 10;
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
  | 'cleave' | 'thorns' | 'cover' | 'regenerate' | 'enrage' | 'vanguard'
  /** 환영: a copy that deals no damage and vanishes when hit. */
  | 'illusion'
  /** 분열: splits into two smaller units when it dies. */
  | 'split'
  /** 맹독: whatever it hits is poisoned. */
  | 'venom';

/** Attack bonus a `formation` unit gets with an ally beside it. */
export const FORMATION_BONUS = 2;
/** Attack bonus for a `vanguard` unit that is its side's front-most unit. */
export const VANGUARD_BONUS = 2;
/** Damage a `thorns` unit deals back to melee attackers. */
export const THORNS_DAMAGE = 2;
/** Turns of 중독 a `venom` unit's hits inflict. */
export const VENOM_TURNS = 2;

export type ModelId =
  | 'Knight' | 'Barbarian' | 'Mage' | 'Rogue' | 'Rogue_Hooded'
  | 'Skeleton_Minion' | 'Skeleton_Warrior' | 'Skeleton_Rogue' | 'Skeleton_Mage'
  | 'barrier' | 'ice_wall' | 'siege'
  | 'wolf' | 'slime' | 'bird';

/** Structures: no character body (바리케이드, 빙벽, 공성 전차). */
export type StructureModel = 'barrier' | 'ice_wall' | 'siege';
/** Beasts: animated Quaternius models (src/render/creatures.ts), not the character packs. */
export type CreatureModel = 'wolf' | 'slime' | 'bird';
export type CharModel = Exclude<ModelId, StructureModel | CreatureModel>;
export const isStructure = (m: ModelId): m is StructureModel => m === 'barrier' || m === 'ice_wall' || m === 'siege';
export const isCreature = (m: ModelId): m is CreatureModel => m === 'wolf' || m === 'slime' || m === 'bird';

export type Target =
  | { kind: 'none' }
  | { kind: 'unit'; uid: number }
  | { kind: 'hero'; side: Side }
  | { kind: 'lane'; lane: number }
  | { kind: 'slot'; lane: number }
  /** Any cell on the board (빙벽: the left cell of a horizontal pair). */
  | { kind: 'cell'; lane: number; row: number }
  /** A unit and a cell for it (환영: copy it there; 염력: move it there). */
  | { kind: 'unitTo'; uid: number; lane: number; row: number };

/**
 * What a card may target, relative to whoever plays it:
 * `foe` = an opposing unit or the opposing hero, `foeUnit` = opposing units only,
 * `ally` = own units, `lane` = a whole lane, `slot` = an empty cell on the own home row.
 */
export type TargetKind = 'none' | 'foe' | 'foeUnit' | 'ally' | 'lane' | 'slot'
  /** 빙벽: two empty cells side by side, anywhere. */
  | 'wallCell'
  /** Any unit or structure, either side. */
  | 'anyUnit'
  /** 환영: an ally, then an empty cell on the own home row. */
  | 'allySlot'
  /** 염력: any unit, then the cell behind it or beside it. */
  | 'move'
  /** 곰 덫: any empty cell without a trap. */
  | 'trapCell'
  /** 사냥꾼의 덫: an empty cell without a trap in the three rows nearest the own side. */
  | 'ownTrapCell'
  /** 방어 진지, 연막탄: a 2×2 area (its lower-left cell). */
  | 'area2'
  /** 돌진: an ally with a foe somewhere ahead in its lane. */
  | 'chargeAlly';

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
  /** 빙결: skips its actions and takes no damage. */
  frozen: boolean;
  /** Own turns a freeze still lasts (missing = 1). */
  frozenTurns?: number;
  /** 독: takes 1 damage at the start of each of its side's turns, for this many turns. */
  poison?: number;
  /** Structures that melt: own turns left before it disappears (빙벽). */
  lifetime?: number;
  /** 속박: own unit phases left in which it cannot move (it still attacks and shoots). */
  rootedTurns?: number;
  /** 징표: takes +1 from every hit, for this many of its own turns. */
  marked?: number;
  /** 공성 전차: loaded, fires at the end of its next turn. */
  loaded?: boolean;
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
  /** 보호막 on a hero: absorbs this much damage first (얼음 방패). */
  armor?: number;
}

export interface SideState {
  hero: Hero;
  mana: number;
  maxMana: number;
  powerUsed: boolean;
  /** Skip the draw at the start of the next turn (망각의 저주). */
  skipDraw: boolean;
  /** 주문 강화: bonus damage for each hit of the next spell played this turn. */
  empower: number;
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
  /** A unit was poisoned (`turns` left). */
  | { type: 'poison'; uid: number; turns: number }
  /** A frozen unit shrugs off a hit. */
  | { type: 'immune'; uid: number }
  /** Hero armor changed (`total` is the new value). */
  | { type: 'armor'; side: Side; total: number }
  /** A cell got wet (`on`) or dried up. */
  | { type: 'wet'; lane: number; row: number; on: boolean }
  /** 주문 강화 set (`amount` > 0) or used up / faded (0). */
  | { type: 'empower'; side: Side; amount: number }
  /** An illusion was hit and vanishes. */
  | { type: 'illusionBroken'; uid: number }
  /** A unit moved to another cell, possibly another lane (염력). */
  | { type: 'shift'; uid: number; lane: number; row: number }
  /** A moved unit slammed into another (충돌). */
  | { type: 'collide'; uid: number; into: number }
  /** Visual sweeps: 눈보라 over the board, 부패 around a cell. */
  | { type: 'blizzard' }
  | { type: 'decay'; lane: number; row: number }
  /** 속박 set (`turns` > 0) or worn off (0). */
  | { type: 'root'; uid: number; turns: number }
  /** A trap was set (`on`) or sprung / cleared. */
  | { type: 'trap'; lane: number; row: number; on: boolean }
  /** A unit stepped into a trap (damage and 속박 follow). */
  | { type: 'trapSprung'; uid: number; lane: number; row: number }
  /** A 분열 unit burst; its pieces follow as summons. */
  | { type: 'split'; lane: number; row: number }
  /** A 2×2 zone (방어 진지 / 연막) was set up (`on`) or ran out. */
  | { type: 'zone'; kind: ZoneKind; lane: number; row: number; on: boolean }
  /** 징표 set (`turns` > 0) or faded (0). */
  | { type: 'mark'; uid: number; turns: number }
  /** A hit was softened to nothing by a 방어 진지. */
  | { type: 'guarded'; uid: number }
  /** 공성 전차 lobs a stone at a cell (the blast follows as damage). */
  | { type: 'bombard'; uid: number; lane: number; row: number }
  /** 공성 전차 is loaded (`on`) or has fired. */
  | { type: 'loaded'; uid: number; on: boolean }
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

/** 방어 진지: allies inside take 2 less from each hit. 연막: units inside cannot be targeted or shot by their foes. */
export type ZoneKind = 'fort' | 'smoke';
/** Damage a 방어 진지 takes off each hit on an ally inside. */
export const FORT_REDUCTION = 2;
