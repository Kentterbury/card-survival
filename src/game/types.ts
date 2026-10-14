export const LANES = 5;
/** Monster rows: 1 is right in front of the defense line, SPAWN_ROW is where waves appear. */
export const SPAWN_ROW = 6;
export const MAX_MANA = 10;
export const MAX_HAND = 10;
/** Unspent mana carried into the next turn, at most this much. */
export const MAX_RESERVE = 1;
export const HERO_POWER_COST = 2;

export type Keyword = 'swift' | 'ranged' | 'ward';

export type ModelId =
  | 'Knight' | 'Barbarian' | 'Mage' | 'Rogue' | 'Rogue_Hooded'
  | 'Skeleton_Minion' | 'Skeleton_Warrior' | 'Skeleton_Rogue' | 'Skeleton_Mage'
  | 'barrier';

export type Target =
  | { kind: 'none' }
  | { kind: 'monster'; uid: number }
  | { kind: 'minion'; uid: number }
  | { kind: 'lane'; lane: number }
  | { kind: 'slot'; lane: number };

export type TargetKind = Target['kind'];

export interface Unit {
  uid: number;
  defId: string;
  name: string;
  model: ModelId;
  attack: number;
  health: number;
  maxHealth: number;
  keywords: Set<Keyword>;
  /** Visual size multiplier for elites and bosses. */
  scale: number;
}

export interface Minion extends Unit {
  side: 'minion';
  lane: number;
  attacksLeft: number;
}

export interface Monster extends Unit {
  side: 'monster';
  lane: number;
  row: number;
  speed: number;
  /** Rows from the defense line this monster can strike from (1 = melee). */
  range: number;
  frozen: boolean;
  boss: boolean;
}

export interface CardInstance {
  iid: number;
  defId: string;
}

export type Phase = 'player' | 'enemy' | 'reward' | 'victory' | 'defeat';

export interface RewardBundle {
  id: string;
  name: string;
  theme: string;
  cards: string[];
}

export type GameEvent =
  | { type: 'stageStart'; stage: number }
  | { type: 'turnStart'; turn: number }
  | { type: 'draw'; card: CardInstance }
  | { type: 'burn'; card: CardInstance }
  | { type: 'reshuffle'; count: number }
  | { type: 'cardPlayed'; card: CardInstance; target: Target }
  | { type: 'summon'; uid: number; lane: number; defId: string }
  | { type: 'spawn'; uid: number; lane: number; row: number; defId: string }
  | { type: 'move'; uid: number; lane: number; from: number; to: number }
  | { type: 'attack'; attacker: number; target: number | 'hero'; ranged: boolean }
  | { type: 'damage'; uid: number | 'hero'; amount: number; source: number | 'spell' | 'hero' }
  | { type: 'wardBroken'; uid: number }
  | { type: 'heal'; uid: number | 'hero'; amount: number }
  | { type: 'buff'; uid: number; attack: number; health: number }
  | { type: 'freeze'; uid: number }
  | { type: 'push'; uid: number; lane: number; from: number; to: number }
  | { type: 'death'; uid: number }
  | { type: 'spell'; defId: string; target: Target }
  | { type: 'heroPower'; target: Target }
  | { type: 'enemyTurn' }
  | { type: 'stageClear'; stage: number }
  | { type: 'defeat' }
  | { type: 'victory' };
