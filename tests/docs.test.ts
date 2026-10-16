import { describe, expect, it } from 'vitest';
import { renderCardsDoc, renderMonstersDoc } from '../src/docs/catalog';
import cardsDoc from '../docs/CARDS.md?raw';
import monstersDoc from '../docs/MONSTERS.md?raw';

// The status docs are generated from the game data; run `npm run docs` after changing cards or stages.
describe('card and monster status docs', () => {
  it('docs/CARDS.md is up to date', () => {
    expect(cardsDoc).toBe(renderCardsDoc());
  });
  it('docs/MONSTERS.md is up to date', () => {
    expect(monstersDoc).toBe(renderMonstersDoc());
  });
});
