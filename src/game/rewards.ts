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
  { id: 'hunter', name: '명사수', theme: '정밀 타격', tier: 2, cards: ['volley', 'execute', 'execute'] },
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
  { id: 'glacier', name: '빙하', theme: '빙벽과 빙결', tier: 1, cards: ['ice_wall', 'deep_freeze', 'ice_shield'] },
  { id: 'whiteout', name: '백색 폭풍', theme: '눈보라와 젖은 땅', tier: 2, cards: ['blizzard', 'ice_wall', 'ice_shield'] },
  { id: 'rot', name: '부패의 제단', theme: '희생과 폭발', tier: 2, cards: ['decay', 'decay', 'brawler'] },
];

/** Bundles of hero-exclusive cards; one is always among the offers for that hero. */
const HERO_BUNDLES: (RewardBundle & { tier: number; hero: string })[] = [
  { id: 'bulwark', name: '방패 대열', theme: '수비대장 전용 · 보호막', hero: 'captain', tier: 1, cards: ['c_shieldwall', 'c_shield_bash', 'phalanx'] },
  { id: 'banner', name: '수비대의 깃발', theme: '수비대장 전용 · 보호막 유지', hero: 'captain', tier: 2, cards: ['c_standard', 'c_shield_bash', 'shieldbearer'] },
  { id: 'royalguard', name: '근위대', theme: '수비대장 전용 · 전설', hero: 'captain', tier: 3, cards: ['c_commander', 'c_shieldwall', 'veteran'] },
  { id: 'arcana', name: '비전 입문', theme: '비전술사 전용 · 비전 화살', hero: 'arcanist', tier: 1, cards: ['a_missiles', 'a_scholar', 'firebolt'] },
  { id: 'study', name: '비전 연구', theme: '비전술사 전용 · 드로우', hero: 'arcanist', tier: 2, cards: ['a_focus', 'a_scholar', 'frostring'] },
  { id: 'tempest', name: '비전 폭풍', theme: '비전술사 전용 · 전설', hero: 'arcanist', tier: 3, cards: ['a_storm', 'a_missiles', 'apprentice'] },
  { id: 'spellcraft', name: '주문 연마', theme: '비전술사 전용 · 주문 강화', hero: 'arcanist', tier: 1, cards: ['a_empower', 'a_energy', 'firebolt'] },
  { id: 'phantasm', name: '환영술', theme: '비전술사 전용 · 환영과 염력', hero: 'arcanist', tier: 2, cards: ['a_illusion', 'a_telekinesis', 'a_empower'] },
  { id: 'charge', name: '돌격대', theme: '전쟁 족장 전용 · 돌격', hero: 'warchief', tier: 1, cards: ['w_horn', 'w_rider', 'phalanx'] },
  { id: 'warhost', name: '전쟁 무리', theme: '전쟁 족장 전용 · 전체 강화', hero: 'warchief', tier: 2, cards: ['w_warcry', 'w_rider', 'brawler'] },
  { id: 'axelord', name: '족장의 친위대', theme: '전쟁 족장 전용 · 전설', hero: 'warchief', tier: 3, cards: ['w_axelord', 'w_horn', 'berserker'] },
  { id: 'traps', name: '매복조', theme: '척후대장 전용 · 매복과 빙결', hero: 'hunter', tier: 1, cards: ['h_trapper', 'h_aimed', 'crossbowman'] },
  { id: 'sniper', name: '저격조', theme: '척후대장 전용 · 정밀 사격', hero: 'hunter', tier: 2, cards: ['h_sniper', 'h_aimed', 'longbow'] },
  { id: 'arrowstorm', name: '척후대 총공세', theme: '척후대장 전용 · 전설', hero: 'hunter', tier: 3, cards: ['h_rain', 'h_trapper', 'glider'] },
  { id: 'walls', name: '성벽 수비대', theme: '수비대장 전용 · 성벽과 돌진', hero: 'captain', tier: 1, cards: ['c_wall_archer', 'c_raise_shields', 'c_charge'] },
  { id: 'ironwall', name: '철벽', theme: '수비대장 전용 · 진지와 반격', hero: 'captain', tier: 2, cards: ['c_bulwark', 'c_counter', 'c_bastion'] },
  { id: 'siegeworks', name: '공성대', theme: '수비대장 전용 · 공성 전차', hero: 'captain', tier: 3, cards: ['c_siege', 'c_last_stand', 'c_wall_archer'] },
  { id: 'wardrums', name: '북과 피', theme: '전쟁 족장 전용 · 북소리', hero: 'warchief', tier: 1, cards: ['w_drummer', 'w_bloodcry', 'w_whirl'] },
  { id: 'frenzy', name: '광란', theme: '전쟁 족장 전용 · 분노와 회복', hero: 'warchief', tier: 2, cards: ['w_ravager', 'w_victory', 'w_bloodcry'] },
  { id: 'allout', name: '총공격', theme: '전쟁 족장 전용 · 전설', hero: 'warchief', tier: 3, cards: ['w_allout', 'w_ravager', 'w_whirl'] },
  { id: 'trapline', name: '덫 사냥', theme: '척후대장 전용 · 덫과 올가미', hero: 'hunter', tier: 1, cards: ['h_snarer', 'h_trap', 'h_snare'] },
  { id: 'harass', name: '교란조', theme: '척후대장 전용 · 밀치고 물러나기', hero: 'hunter', tier: 1, cards: ['h_disrupt', 'h_retreat', 'h_snarer'] },
  { id: 'hawkeye', name: '매와 연막', theme: '척후대장 전용 · 연막과 징표', hero: 'hunter', tier: 2, cards: ['h_falconer', 'h_smoke', 'h_weakspot'] },
  { id: 'ambushline', name: '일제 매복', theme: '척후대장 전용 · 전설', hero: 'hunter', tier: 3, cards: ['h_volley_trap', 'h_falconer', 'h_trap'] },
];

/** Every bundle with its tier (and hero, for hero bundles), for data checks and docs. */
export const ALL_BUNDLES: (RewardBundle & { tier: number; hero?: string })[] = [...BUNDLES, ...HERO_BUNDLES];

/**
 * `cleared` is how many stages have been beaten so far (1 after the first stage).
 * Offers one bundle of the hero's own cards (the best tier unlocked) and two general ones.
 */
export function rollRewards(rng: Rng, cleared: number, hero = ''): RewardBundle[] {
  // Better bundles by chapter: forest 1, dungeon 2 (from the third clear), cave 3 (from the sixth).
  const maxTier = cleared >= 6 ? 3 : cleared >= 3 ? 2 : 1;
  const mine = rng.shuffle(HERO_BUNDLES.filter((b) => b.hero === hero && b.tier <= maxTier)).sort((a, b) => b.tier - a.tier);
  const newest = rng.shuffle(BUNDLES.filter((b) => b.tier === maxTier));
  const rest = rng.shuffle(BUNDLES.filter((b) => b.tier <= maxTier && b !== newest[0]));
  const general = [newest[0], ...rest.slice(0, 2)];
  const picks = mine[0] ? [mine[0], ...general.slice(0, 2)] : general;
  return rng.shuffle(picks).map(({ id, name, theme, cards }) => ({ id, name, theme, cards }));
}
