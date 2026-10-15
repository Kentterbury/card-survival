import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/game/cards';
import { SPELL_ART } from '../src/ui/spellArt';

describe('spell art', () => {
  const spells = Object.values(CARDS).filter((c) => c.type === 'spell');

  it('gives every spell card its own picture', () => {
    for (const s of spells) expect(SPELL_ART[s.id], s.id).toBeTruthy();
    const pictures = spells.map((s) => SPELL_ART[s.id]);
    expect(new Set(pictures).size).toBe(pictures.length);
  });
});
