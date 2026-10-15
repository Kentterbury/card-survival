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

/** General cards the merchant sells: non-basic player cards (no enemy, hero-exclusive or token cards). */
const POOL = Object.values(CARDS).filter((c) => !c.enemy && !c.hero && c.rarity !== 'basic');

/** Two commons, two rares and one epic, plus one card exclusive to the hero; all different. */
export function rollShop(rng: Rng, hero = ''): ShopState {
  const pick = (rarity: Rarity, n: number) => rng.shuffle(POOL.filter((c) => c.rarity === rarity)).slice(0, n);
  const own = rng.shuffle(Object.values(CARDS).filter((c) => c.hero === hero)).slice(0, 1);
  const cards = [...pick('common', 2), ...pick('rare', 2), ...pick('epic', 1), ...own];
  return {
    offers: cards.map((c) => ({ defId: c.id, price: CARD_PRICE[c.rarity], sold: false })),
    removed: false,
    healed: false,
  };
}
