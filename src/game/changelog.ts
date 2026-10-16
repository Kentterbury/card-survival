/**
 * Card change log, newest first. Shown in the in-game card book (최근 변경) so new and
 * reworked cards can be checked after each update. Add an entry whenever cards change.
 */
export interface CardChange {
  id: string;
  /** What changed for this card (omit for a newly added card). */
  note?: string;
}

export interface ChangeEntry {
  title: string;
  /** A line about the whole update, if any. */
  summary?: string;
  added?: string[];
  changed?: CardChange[];
}

export const CARD_CHANGES: ChangeEntry[] = [
  {
    title: '독화살 · 새 적 카드',
    summary: '일제 사격(줄마다 맨 앞 적에게 1)이 척후대장의 화살비와 같은 방식이라 독화살로 바꿨습니다. 새 상태 중독: 자기 턴 시작마다 피해 1. 적 지휘관마다 새 개념을 쓰는 카드를 넣었습니다(추적자 대장: 독·분신, 서고의 주술사: 금지된 주문, 납골당 수호자: 뼈 방패·얼음벽, 해골 군주: 역병 해골·시체 폭발).',
    added: ['e_poison_arrow', 'e_soul_mirror', 'e_dark_power', 'e_bone_shield', 'e_grave_frost', 'sk_plague', 'e_corpse_blast'],
    changed: [{ id: 'volley', note: '일제 사격 → 독화살: 적 하수인에게 2 + 3턴 중독 (5 → 3마나). 척후대장 생명력 20 → 22' }],
  },
  {
    title: '얼음 · 주문 마법 · 부패',
    summary: '빙결 규칙 변경: 빙결된 하수인은 행동하지 못하는 대신 어떤 피해도 받지 않고 반격도 하지 않습니다. 새 개념: 젖은 칸(받는 피해 +1, 3턴), 영웅 보호막, 주문 강화, 환영, 충돌, 구조물 빙벽. 균형: 빙결 규칙으로 약해진 비전술사 생명력 16 → 18.',
    added: ['ice_wall', 'blizzard', 'deep_freeze', 'ice_shield', 'a_empower', 'a_energy', 'a_illusion', 'a_telekinesis', 'decay', 'ice_wall_token'],
    changed: [
      { id: 'frostring', note: '빙결된 적은 이후 피해를 받지 않음' },
      { id: 'ice_prison', note: '빙결된 적은 이후 피해를 받지 않음' },
      { id: 'h_trapper', note: '빙결된 적은 이후 피해를 받지 않음' },
      { id: 'e_chill', note: '빙결된 아군은 이후 피해를 받지 않음' },
      { id: 'e_frostbolt', note: '빙결된 아군은 이후 피해를 받지 않음' },
    ],
  },
  {
    title: '주문 카드 그림 교체',
    summary: '같은 계열 주문이 같은 그림을 쓰던 것을 고쳐, 주문 55장이 모두 서로 다른 그림을 씁니다(일제 사격·정밀 사격·화살비 등). 색은 계열별로 그대로입니다. 성능 변경은 없습니다.',
    changed: [
      { id: 'firebolt', note: '새 그림' },
      { id: 'flamewave', note: '새 그림' },
      { id: 'meteor', note: '새 그림' },
      { id: 'pyroblast', note: '새 그림' },
      { id: 'frostring', note: '새 그림' },
      { id: 'ice_prison', note: '새 그림' },
      { id: 'chains', note: '새 그림' },
      { id: 'e_chill', note: '새 그림' },
      { id: 'e_frostbolt', note: '새 그림' },
      { id: 'shockwave', note: '새 그림' },
      { id: 'e_darkwave', note: '새 그림' },
      { id: 'thunderbolt', note: '새 그림' },
      { id: 'a_missiles', note: '새 그림' },
      { id: 'chainspark', note: '새 그림' },
      { id: 'a_storm', note: '새 그림' },
      { id: 'rally', note: '새 그림' },
      { id: 'war_drums', note: '새 그림' },
      { id: 'reinforce', note: '새 그림' },
      { id: 'c_shield_bash', note: '새 그림' },
      { id: 'w_horn', note: '새 그림' },
      { id: 'w_warcry', note: '새 그림' },
      { id: 'e_march', note: '새 그림' },
      { id: 'regroup', note: '새 그림' },
      { id: 'war_library', note: '새 그림' },
      { id: 'change_plans', note: '새 그림' },
      { id: 'a_focus', note: '새 그림' },
      { id: 'e_insight', note: '새 그림' },
      { id: 'barricade', note: '새 그림' },
      { id: 'blessing', note: '새 그림' },
      { id: 'thorn_armor', note: '새 그림' },
      { id: 'salvage', note: '새 그림' },
      { id: 'c_shieldwall', note: '새 그림' },
      { id: 'e_bonearmor', note: '새 그림' },
      { id: 'e_bonewall', note: '새 그림' },
      { id: 'sanctuary', note: '새 그림' },
      { id: 'renewal', note: '새 그림' },
      { id: 'volley', note: '새 그림' },
      { id: 'h_aimed', note: '새 그림' },
      { id: 'h_rain', note: '새 그림' },
      { id: 'execute', note: '새 그림' },
      { id: 'pickpocket', note: '새 그림' },
      { id: 'grave_rob', note: '새 그림' },
      { id: 'e_raise', note: '새 그림' },
      { id: 'e_warcry', note: '새 그림' },
      { id: 'e_ambush', note: '새 그림' },
      { id: 'e_mass_raise', note: '새 그림' },
      { id: 'mana_potion', note: '새 그림' },
      { id: 'mirror_image', note: '새 그림' },
      { id: 'supply_wagon', note: '새 그림' },
      { id: 'blood_pact', note: '새 그림' },
      { id: 'oblivion', note: '새 그림' },
      { id: 'e_curse', note: '새 그림' },
      { id: 'e_hex', note: '새 그림' },
      { id: 'e_drain', note: '새 그림' },
      { id: 'e_soulfire', note: '새 그림' },
    ],
  },
  {
    title: '해골 지휘관 덱 재구성',
    summary: '적 덱을 20마나·매 턴 +1에 맞게 다시 짰고, 지휘관마다 전술과 지휘술을 나눴습니다(추격 명령, 뼈 덧씌우기, 망자 군단 추가). 마법사 지휘관은 첫 턴 마나 4. 균형: 방패 명령 2 → 1마나, 비전술사 생명력 22 → 16.',
    added: ['sk_drummer', 'e_march', 'sk_assassin', 'e_ambush', 'sk_acolyte', 'e_frostbolt', 'e_bonewall', 'e_mass_raise', 'sk_deathknight'],
  },
  {
    title: '남은 마나 이월 없음',
    summary: '쓰지 않은 마나는 다음 턴으로 넘어가지 않습니다(양쪽 모두). 카드 변경은 없습니다. 보라색 추가 마나는 이제 마나 물약 같은 이번 턴 한정 마나만 뜻합니다.',
  },
  {
    title: '마나 상승 매 턴 +1',
    summary: '최대 마나가 매 턴 +2 → +1로 늘어납니다(최대 20). 카드 비용은 그대로. 균형을 위해 방패 명령 3 → 2, 돌격 명령 7 → 8마나.',
    changed: [
      { id: 'a_scholar', note: '비전술사 시작 덱에 들어감 (폭풍 술사 대신)' },
      { id: 'stormcaller', note: '비전술사 시작 덱에서 빠짐' },
    ],
  },
  {
    title: '척후대장 콘셉트 (용병 정찰병)',
    summary: '숲의 사냥꾼이 척후대장으로 바뀌면서 전용 카드 이름도 정찰병 느낌으로 바꿨습니다.',
    changed: [
      { id: 'h_trapper', note: '이름: 덫 사냥꾼 → 매복 척후병' },
      { id: 'h_sniper', note: '이름: 숲의 저격수 → 척후 저격수' },
    ],
  },
  {
    title: '영웅 전용 카드 16장',
    summary: '용병대장마다 콘셉트에 맞는 전용 카드 4장. 그 영웅에게만 보상·보급관·탐색으로 나옵니다.',
    added: [
      'c_shieldwall', 'c_shield_bash', 'c_standard', 'c_commander',
      'a_missiles', 'a_scholar', 'a_focus', 'a_storm',
      'w_horn', 'w_rider', 'w_warcry', 'w_axelord',
      'h_aimed', 'h_trapper', 'h_sniper', 'h_rain',
    ],
  },
  {
    title: '20마나 체계',
    summary: '모든 카드 비용을 최대 20마나 기준으로 다시 매겼습니다(예전 비용의 약 2배, 성능에 따라 ±1).',
    changed: [
      { id: 'mana_potion', note: '마나 +2 → +4' },
      { id: 'reinforce', note: '탐색한 카드 비용 감소 1 → 2' },
      { id: 'mirror_image', note: '복사본 비용 감소 1 → 2' },
      { id: 'supply_wagon', note: '손패 비용 감소 1 → 2' },
    ],
  },
  {
    title: '불꽃 화살 · 처형 너프',
    changed: [
      { id: 'firebolt', note: '비용 +1 (10마나 기준 1 → 2, 지금은 4)' },
      { id: 'execute', note: '비용 +1 (10마나 기준 2 → 3, 지금은 6)' },
    ],
  },
];

/** Cards touched by the most recent `n` updates: id → 'new' | 'changed'. */
export function recentBadges(n = 2): Map<string, 'new' | 'changed'> {
  const out = new Map<string, 'new' | 'changed'>();
  for (const e of CARD_CHANGES.slice(0, n)) {
    for (const id of e.added ?? []) if (!out.has(id)) out.set(id, 'new');
    for (const c of e.changed ?? []) if (!out.has(c.id)) out.set(c.id, 'changed');
  }
  return out;
}

/** Every change-log line about one card, newest first. */
export function historyOf(id: string): string[] {
  const out: string[] = [];
  for (const e of CARD_CHANGES) {
    if (e.added?.includes(id)) out.push(`${e.title}: 새 카드`);
    for (const c of e.changed ?? []) if (c.id === id) out.push(`${e.title}: ${c.note ?? '변경'}`);
  }
  return out;
}
