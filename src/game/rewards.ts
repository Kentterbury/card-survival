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
  { id: 'drums', name: '진격의 북', theme: '밀어붙이기', tier: 1, cards: ['war_drums', 'bomber', 'apprentice'] },
  { id: 'icewall', name: '빙벽', theme: '묶어두기', tier: 1, cards: ['ice_prison', 'ice_prison', 'warden'] },
  { id: 'supply', name: '보급', theme: '마나와 드로우', tier: 1, cards: ['mana_potion', 'mana_potion', 'regroup'] },
  { id: 'hunter', name: '사냥꾼', theme: '정밀 타격', tier: 2, cards: ['volley', 'execute', 'execute'] },
  { id: 'sanctum', name: '성소', theme: '보호와 치유', tier: 2, cards: ['priest', 'blessing', 'medic'] },
  { id: 'siege', name: '공성전', theme: '영웅 압박', tier: 3, cards: ['siege_mage', 'volley', 'bomber'] },
  { id: 'vanguard', name: '돌격대', theme: '밀어내며 전진', tier: 1, cards: ['mace_knight', 'phalanx', 'phalanx'] },
  { id: 'scouts', name: '정찰대', theme: '하늘과 원거리', tier: 1, cards: ['glider', 'glider', 'longbow'] },
  { id: 'blood', name: '피와 강철', theme: '버티며 회복', tier: 2, cards: ['blood_blade', 'stalwart', 'mace_knight'] },
  { id: 'rage', name: '광전사단', theme: '맞을수록 강해지기', tier: 1, cards: ['brawler', 'brawler', 'vanguard_captain'] },
  { id: 'thicket', name: '가시덤불', theme: '반격', tier: 1, cards: ['thornguard', 'thorn_armor', 'thorn_armor'] },
  { id: 'abbey', name: '수도원', theme: '회복과 보호', tier: 2, cards: ['monk', 'renewal', 'cover_knight'] },
  { id: 'mercs', name: '용병단', theme: '전열 돌파', tier: 2, cards: ['greatsword', 'vanguard_captain', 'brawler'] },
  { id: 'scholar', name: '학자의 서재', theme: '탐색과 드로우', tier: 1, cards: ['war_library', 'reinforce', 'blood_pact'] },
  { id: 'thieves', name: '도둑 길드', theme: '훔치기', tier: 1, cards: ['pickpocket', 'grave_rob', 'grave_rob'] },
  { id: 'logistics', name: '병참', theme: '재활용과 할인', tier: 2, cards: ['supply_wagon', 'salvage', 'change_plans'] },
  { id: 'hexer', name: '저주술사', theme: '상대 방해', tier: 2, cards: ['chains', 'oblivion', 'mirror_image'] },
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
