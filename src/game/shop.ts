import { CARDS, type Rarity } from './cards';
import type { Rng } from './rng';

/** Gold for clearing a stage: a base that grows per stage, plus a bonus for winning quickly. */
export function stageGold(stage: number, turns: number): number {
  return 20 + 5 * stage + 2 * Math.max(0, 10 - turns);
}

export const CARD_PRICE: Record<Rarity, number> = { basic: 10, common: 20, rare: 35, epic: 55 };
/** Price of removing one card from the deck at the merchant. */
export const REMOVE_PRICE = 25;
/** Price and size of the merchant's healing draught (once per visit). */
export const HEAL_PRICE = 20;
export const HEAL_AMOUNT = 8;

export interface ShopOffer {
  defId: string;
  price: number;
  sold: boolean;
}

/** The merchant's stock for one camp visit. */
export interface ShopState {
  offers: ShopOffer[];
  removed: boolean;
  healed: boolean;
}

/** Cards the player can be offered: non-basic player cards (no enemy cards or tokens). */
const POOL = Object.values(CARDS).filter((c) => !c.enemy && c.rarity !== 'basic');

/** Two commons, two rares and one epic, different cards each. */
export function rollShop(rng: Rng): ShopState {
  const pick = (rarity: Rarity, n: number) => rng.shuffle(POOL.filter((c) => c.rarity === rarity)).slice(0, n);
  const cards = [...pick('common', 2), ...pick('rare', 2), ...pick('epic', 1)];
  return {
    offers: cards.map((c) => ({ defId: c.id, price: CARD_PRICE[c.rarity], sold: false })),
    removed: false,
    healed: false,
  };
}
