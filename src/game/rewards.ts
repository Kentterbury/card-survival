import type { Rng } from './rng';
import type { RewardBundle } from './types';

/** Themed three-card bundles offered after each stage; pick one to add to the deck. */
const BUNDLES: (RewardBundle & { tier: number })[] = [
  { id: 'steel', name: '강철 방벽', theme: '버티기', tier: 1, cards: ['shieldbearer', 'barricade', 'veteran'] },
  { id: 'fire', name: '불길', theme: '광역 피해', tier: 1, cards: ['firebolt', 'flamewave', 'firebolt'] },
  { id: 'frost', name: '혹한', theme: '빙결과 밀쳐내기', tier: 1, cards: ['frostring', 'shockwave', 'frostring'] },
  { id: 'shadow', name: '그림자 결사', theme: '빠른 공격', tier: 1, cards: ['shadowblade', 'shadowblade', 'regroup'] },
  { id: 'faith', name: '신앙', theme: '회복', tier: 1, cards: ['medic', 'sanctuary', 'medic'] },
  { id: 'war', name: '전장의 함성', theme: '하수인 강화', tier: 1, cards: ['berserker', 'rally', 'rally'] },
  { id: 'storm', name: '폭풍의 눈', theme: '번개', tier: 2, cards: ['stormcaller', 'chainspark', 'thunderbolt'] },
  { id: 'citadel', name: '성채', theme: '단단한 전열', tier: 2, cards: ['fortress', 'veteran', 'barricade'] },
  { id: 'warband', name: '전쟁 군단', theme: '강력한 하수인', tier: 2, cards: ['warlord', 'berserker', 'rally'] },
  { id: 'arcane', name: '대마법', theme: '전설급 주문', tier: 3, cards: ['archmage', 'meteor', 'regroup'] },
  { id: 'cataclysm', name: '대재앙', theme: '전장 정리', tier: 3, cards: ['pyroblast', 'flamewave', 'thunderbolt'] },
];

/** `cleared` is how many stages have been beaten so far (1 after the first stage). */
export function rollRewards(rng: Rng, cleared: number): RewardBundle[] {
  const maxTier = cleared >= 3 ? 3 : cleared >= 2 ? 2 : 1;
  const newest = rng.shuffle(BUNDLES.filter((b) => b.tier === maxTier));
  const rest = rng.shuffle(BUNDLES.filter((b) => b.tier <= maxTier && b !== newest[0]));
  return [newest[0], ...rest.slice(0, 2)].map(({ tier: _tier, ...b }) => b);
}
