// Writes docs/CARDS.md (카드 현황) and docs/MONSTERS.md (몬스터 현황) from the game data.
// Usage: npm run docs
import { writeFileSync } from 'node:fs';
import { renderCardsDoc, renderMonstersDoc } from '../src/docs/catalog';

writeFileSync('docs/CARDS.md', renderCardsDoc());
writeFileSync('docs/MONSTERS.md', renderMonstersDoc());
console.log('wrote docs/CARDS.md, docs/MONSTERS.md');
