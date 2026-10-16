import type { CardDef } from './cards';
import { HEROES, heroDef } from './heroes';
import { ALL_BUNDLES } from './rewards';
import { STAGES, stageLabel } from './stages';

/** Where a card can be obtained or met, as short lines. */
export function sourcesOf(def: CardDef): string[] {
  const out: string[] = [];
  for (const h of HEROES) {
    const n = h.deck.filter((id) => id === def.id).length;
    if (n) out.push(`${h.name} 시작 덱${n > 1 ? ` ×${n}` : ''}`);
  }
  for (const b of ALL_BUNDLES) {
    const n = b.cards.filter((id) => id === def.id).length;
    if (n) out.push(`보상 꾸러미 「${b.name}」${n > 1 ? ` ×${n}` : ''}`);
  }
  STAGES.forEach((st, i) => {
    const n = st.deck.filter((id) => id === def.id).length;
    if (n) out.push(`${stageLabel(i)} ${st.hero.name}의 덱${n > 1 ? ` ×${n}` : ''}`);
  });
  const summonedBy: Record<string, string[]> = {
    sk_minion: ['상대 지휘술 「망자 소환」', '망자 소생', '도깨비불'],
    sk_undying: ['상대 지휘술 「망자 군단」', '대규모 소생'],
    sk_rogue: ['매복 습격'],
    wolf_pup: ['상대 지휘술 「무리 부르기」', '포위 사냥', '해골 조련사'],
    slime_small_token: ['초록 슬라임의 분열', '점액 융합의 분열'],
    slime_mid_token: ['거대 슬라임의 분열'],
    sk_hexling: ['주술사 소환진'],
  };
  for (const s of summonedBy[def.id] ?? []) out.push(s.startsWith('상대') ? `${s}으로 소환` : `「${s}」로 소환`);
  if (def.id === 'barricade_token') out.push('바리케이드 설치 · 방벽 수호자가 소환하는 토큰');
  if (!def.enemy && def.id !== 'barricade_token') {
    const who = def.hero ? `${heroDef(def.hero).name}만` : '모든 용병대장';
    if (def.rarity !== 'basic') out.push(`왕국 보급관 (${who})`);
    out.push(`탐색 (${who})`);
  }
  return out;
}
