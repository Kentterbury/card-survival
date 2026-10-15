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
