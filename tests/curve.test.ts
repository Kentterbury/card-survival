import { describe, expect, it } from 'vitest';
import { CARDS, type MinionCard } from '../src/game/cards';
import { curveDeviation, EFFECT_POINTS } from '../src/game/curve';

const minions = Object.values(CARDS).filter((c): c is MinionCard => c.type === 'minion' && !c.id.endsWith('_token'));

describe('minion cost curve', () => {
  it('every minion is within one point of the curve (after its rarity / hero allowance)', () => {
    const off = minions.map((c) => ({ id: c.id, dev: curveDeviation(c) })).filter((x) => Math.abs(x.dev) > 1);
    expect(off).toEqual([]);
  });

  it('every minion with a card effect has its effect valued', () => {
    const effect = /등장 시|파괴 시|턴이 끝날 때|턴 종료 시/;
    const missing = minions.filter((c) => (effect.test(c.text) || c.onSummon || c.onDeath || c.onEndTurn) && EFFECT_POINTS[c.id] === undefined).map((c) => c.id);
    expect(missing).toEqual([]);
  });
});
