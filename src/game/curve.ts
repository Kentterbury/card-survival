import type { MinionCard, Rarity } from './cards';
import type { Keyword } from './types';

/**
 * Minion cost curve. A minion is worth its attack + health, plus points for its keywords and
 * its card effect; a fair minion is worth `cost + 2`. Rarer and hero-exclusive cards may sit a
 * little above the curve. tests/curve.test.ts keeps every minion inside its band.
 */

/** Stat points a keyword is worth. */
export const KEYWORD_POINTS: Record<Keyword, number> = {
  swift: 1, dash: 1, formation: 1, vanguard: 1, enrage: 1, thorns: 1, knockback: 1, pierce: 1, venom: 1, cover: 1,
  ranged: 2, flying: 2, ward: 2, lifesteal: 2, cleave: 2, regenerate: 2, undying: 2, split: 2,
  anchored: 0, illusion: 0,
};

/** Stat points of card effects (등장 시, 파괴 시, 턴 종료 시 …), by card id. */
export const EFFECT_POINTS: Record<string, number> = {
  sk_drummer: 2, sk_trapper: 1.5, medic: 2, apprentice: 2, a_scholar: 2, bomber: 2, c_standard: 3, h_trapper: 2,
  sk_plague: 1.5, sk_beastmaster: 4, warden: 4, priest: 4, veteran: 2, stormcaller: 4, c_commander: 3, h_sniper: 3,
  siege_mage: 4, sk_rotwood: 2, w_axelord: 1, warlord: 3, archmage: 5,
  c_siege: 11, w_drummer: 2, h_snarer: 1.5, h_falconer: 4, sk_archlich: 4,
};

/** How far above the curve a card may sit. */
export const RARITY_ALLOWANCE: Record<Rarity, number> = { basic: 0, common: 0, rare: 1, epic: 2 };
/** Extra allowance for hero-exclusive cards (they carry the hero's identity). */
export const HERO_ALLOWANCE = 1;

export function minionValue(c: MinionCard): number {
  // A wall that never attacks gets less out of its health.
  const body = c.attack + (c.attack === 0 ? c.health * 0.7 : c.health);
  const kw = (c.keywords ?? []).reduce((v, k) => v + KEYWORD_POINTS[k], 0);
  return body + kw + (EFFECT_POINTS[c.id] ?? 0);
}

/** Points above (+) or below (−) the curve, after the rarity / hero allowance. */
export function curveDeviation(c: MinionCard): number {
  const allowance = RARITY_ALLOWANCE[c.rarity] + (c.hero ? HERO_ALLOWANCE : 0);
  return minionValue(c) - (c.cost + 2) - allowance;
}
