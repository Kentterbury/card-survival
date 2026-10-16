import { CARDS, KEYWORD_INFO, type CardDef, type MinionCard, type SpellCard } from '../game/cards';
import { curveDeviation, minionValue } from '../game/curve';
import { HEROES, heroDef, POWERS } from '../game/heroes';
import { ALL_BUNDLES } from '../game/rewards';
import { sourcesOf } from '../game/sources';
import { CHAPTERS, STAGES, stageLabel } from '../game/stages';
import { isCreature, type TargetKind } from '../game/types';
import { CREATURE_LOOKS } from '../render/creatures';
import { LOOKS } from '../render/syntySet';

/**
 * docs/CARDS.md (카드 현황) and docs/MONSTERS.md (몬스터 현황), generated from the game data.
 * `npm run docs` rewrites them; tests/docs.test.ts fails when they are out of date.
 */

const RARITY = { basic: '기본', common: '일반', rare: '희귀', epic: '영웅' } as const;
const TARGET: Record<TargetKind, string> = {
  none: '대상 없음', foe: '적 하나(영웅 포함)', foeUnit: '적 하수인', ally: '아군 하수인', lane: '줄 하나', slot: '내 진영 빈 칸',
  wallCell: '나란한 빈 칸 두 개', anyUnit: '하수인 하나(아군 포함)', allySlot: '아군 하나 + 빈 칸', move: '하수인 + 옆/뒤 칸', trapCell: '빈 칸',
  ownTrapCell: '내 진영 앞쪽 세 줄의 빈 칸', area2: '2×2 영역', chargeAlly: '자기 줄에 적이 있는 아군',
};

const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\|/g, '/').trim();
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');
const row = (cols: (string | number)[]) => `| ${cols.map((c) => cell(String(c))).join(' | ')} |`;
const table = (head: string[], rows: (string | number)[][]) =>
  rows.length ? [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n') : '_없음_';
const byCost = (a: CardDef, b: CardDef) => a.cost - b.cost || a.name.localeCompare(b.name, 'ko');
const kw = (c: MinionCard) => (c.keywords ?? []).map((k) => KEYWORD_INFO[k].name).join(', ') || '-';
const stats = (c: MinionCard) => `${c.attack}/${c.health}`;
const round = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => (round(n) > 0 ? `+${round(n)}` : String(round(n)));
const effect = (c: CardDef) => {
  const t = plain(c.text);
  if (c.type !== 'minion') return t;
  // Minion text repeats its keywords first ("질주. 등장 시: …"); keep only the rest.
  const names = (c.keywords ?? []).map((k) => KEYWORD_INFO[k].name);
  const rest = t.split(/\.\s*/).filter((part) => part && !names.includes(part.trim())).join('. ');
  return rest || '-';
};
const deckList = (ids: string[]) => {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => `${CARDS[id].name}${n > 1 ? ` ×${n}` : ''}`).join(', ');
};

const HEADER = (title: string) => `# ${title}

> 게임 데이터(\`src/game/*.ts\`)에서 자동으로 만든 문서입니다. 손으로 고치지 말고 \`npm run docs\`로 다시 만드세요.
> 카드·스테이지를 바꾸고 이 파일을 갱신하지 않으면 \`npm test\`(tests/docs.test.ts)가 실패합니다.
`;

// ── 카드 현황 ────────────────────────────────────────────────

export function renderCardsDoc(): string {
  const all = Object.values(CARDS);
  const player = all.filter((c) => !c.enemy);
  const out: string[] = [HEADER('카드 현황')];
  out.push('## 요약\n');
  out.push(table(['구분', '하수인', '주문', '합계'], [
    ['공용', ...counts(player.filter((c) => !c.hero))],
    ...HEROES.map((h) => [`${h.name} 전용`, ...counts(player.filter((c) => c.hero === h.id))]),
    ['적 전용 (몬스터 현황 참고)', ...counts(all.filter((c) => c.enemy))],
    ['전체', ...counts(all)],
  ]));

  out.push('\n## 영웅\n');
  out.push(table(['영웅', '생명력', '시작 마나', '지휘술 (마나)', '시작 덱'], HEROES.map((h) => {
    const p = POWERS[h.power];
    return [h.name, h.health, h.startMana, `${p.name} (${p.cost}): ${plain(p.text)}`, deckList(h.deck)];
  })));

  const groups: [string, CardDef[]][] = [
    ['공용 카드', player.filter((c) => !c.hero)],
    ...HEROES.map((h): [string, CardDef[]] => [`${h.name} 전용 카드`, player.filter((c) => c.hero === h.id)]),
  ];
  for (const [title, cards] of groups) {
    out.push(`\n## ${title}\n`);
    out.push('### 하수인\n');
    out.push(minionTable(cards.filter((c): c is MinionCard => c.type === 'minion').sort(byCost)));
    out.push('\n### 주문\n');
    out.push(spellTable(cards.filter((c): c is SpellCard => c.type === 'spell').sort(byCost)));
  }

  out.push('\n## 보상 꾸러미\n');
  out.push('스테이지를 깰 때마다 셋 중 하나를 고릅니다. 등급은 클리어 수로 열립니다(1~2번째 1등급, 3번째부터 2등급, 6번째부터 3등급).\n');
  out.push(table(['등급', '꾸러미', '테마', '전용', '카드'], [...ALL_BUNDLES]
    .sort((a, b) => (a.hero ?? '').localeCompare(b.hero ?? '') || a.tier - b.tier)
    .map((b) => [b.tier, b.name, b.theme, b.hero ? heroDef(b.hero).name : '공용', deckList(b.cards)])));

  out.push('\n## 하수인 비용 곡선\n');
  out.push('가치 = 공격력 + 체력(공격력 0이면 ×0.7) + 키워드 점수 + 효과 점수, 기준 = 비용 + 2. 희귀 +1, 영웅 등급 +2, 영웅 전용 +1까지 허용하고 그 범위에서 ±1 안이어야 합니다(`src/game/curve.ts`). 표의 「곡선」은 허용치를 뺀 차이입니다.\n');
  return out.join('\n') + '\n';
}

function counts(cards: CardDef[]): number[] {
  const m = cards.filter((c) => c.type === 'minion').length;
  return [m, cards.length - m, cards.length];
}

function minionTable(cards: MinionCard[]): string {
  return table(['비용', '이름', '공/체', '키워드', '효과', '등급', '가치', '곡선', '얻는 곳'], cards.map((c) => [
    c.cost, `${c.elite ? '★' : ''}${c.name}`, stats(c), kw(c), effect(c), RARITY[c.rarity],
    ...(c.id.endsWith('_token') ? ['-', '토큰'] : [round(minionValue(c)), signed(curveDeviation(c))]), sourcesOf(c).join(' · ') || '-',
  ]));
}

function spellTable(cards: SpellCard[]): string {
  return table(['비용', '이름', '대상', '효과', '등급', '얻는 곳'], cards.map((c) => [
    c.xCost ? 'X' : c.cost, c.name, TARGET[c.target], plain(c.text), RARITY[c.rarity], sourcesOf(c).join(' · ') || '-',
  ]));
}

// ── 몬스터 현황 ──────────────────────────────────────────────

/** How a monster looks: the Quaternius body for beasts, the Synty character for skeletons. */
function looksOf(model: string, key: string): string {
  if (isCreature(model as never)) {
    const l = CREATURE_LOOKS[key];
    return l ? `Quaternius ${l.file}` : `Quaternius (${model})`;
  }
  const s = LOOKS[key];
  const synty = s ? `Synty ${s.mesh.replace(/^(Character_|SM_Chr_)/, '')}${s.tint ? ' (이끼색)' : ''}` : 'Synty 기본';
  return `KayKit ${model} / ${synty}`;
}

export function renderMonstersDoc(): string {
  const enemy = Object.values(CARDS).filter((c) => c.enemy);
  const out: string[] = [HEADER('몬스터 현황')];

  out.push('## 챕터와 지휘관\n');
  out.push(table(['스테이지', '이름', '지휘관', '생명력', '시작 마나', '지휘술 (마나)', '전술', '덱', '외형'], STAGES.map((st, i) => {
    const p = POWERS[st.power];
    return [`${stageLabel(i)} ${CHAPTERS[st.chapter].name}`, st.name, st.hero.name, st.hero.health, st.startMana,
      `${p.name} (${p.cost}): ${plain(p.text)}`, st.concept, `${st.deck.length}장`, looksOf(st.hero.model, `boss:${st.hero.name}`)];
  })));

  STAGES.forEach((st, i) => {
    out.push(`\n## ${stageLabel(i)} ${st.name} — ${st.hero.name}\n`);
    out.push(`${st.subtitle}. **${st.concept}**\n`);
    const counts = new Map<string, number>();
    for (const id of st.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
    const rows = [...counts].map(([id, n]) => ({ c: CARDS[id], n })).sort((a, b) => byCost(a.c, b.c));
    out.push(table(['장수', '비용', '이름', '종류', '공/체', '키워드', '효과'], rows.map(({ c, n }) => [
      n, c.cost, `${c.type === 'minion' && c.elite ? '★' : ''}${c.name}${c.enemy ? '' : ' (플레이어 카드)'}`, c.type === 'minion' ? '하수인' : '주문',
      c.type === 'minion' ? stats(c) : '-', c.type === 'minion' ? kw(c) : '-', effect(c),
    ])));
  });

  const appearsIn = (id: string) => STAGES.map((st, i) => (st.deck.includes(id) ? stageLabel(i) : '')).filter(Boolean).join(', ');
  out.push('\n## 적 하수인 전체\n');
  out.push(table(['비용', '이름', '공/체', '키워드', '효과', '등급', '곡선', '나오는 곳', '외형'], enemy
    .filter((c): c is MinionCard => c.type === 'minion').sort(byCost).map((c) => [
      c.cost, `${c.elite ? '★' : ''}${c.name}`, stats(c), kw(c), effect(c), RARITY[c.rarity],
      c.id.endsWith('_token') ? '토큰' : signed(curveDeviation(c)),
      [appearsIn(c.id), ...sourcesOf(c).filter((s) => !s.includes('의 덱'))].filter(Boolean).join(' · ') || '-',
      looksOf(c.model, c.id),
    ])));

  out.push('\n## 적 주문 전체\n');
  out.push(table(['비용', '이름', '대상', '효과', '등급', '나오는 곳'], enemy
    .filter((c): c is SpellCard => c.type === 'spell').sort(byCost).map((c) => [
      c.cost, c.name, TARGET[c.target], plain(c.text), RARITY[c.rarity], appearsIn(c.id) || '-',
    ])));

  out.push('\n## 키워드\n');
  out.push(table(['키워드', '설명'], Object.values(KEYWORD_INFO).map((k) => [k.name, plain(k.text)])));
  return out.join('\n') + '\n';
}
