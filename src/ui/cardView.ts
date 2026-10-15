import { card, KEYWORD_INFO, type CardDef } from '../game/cards';
import { heroDef } from '../game/heroes';
import type { Keyword, ModelId } from '../game/types';
import { artKey } from '../render/assets';
import { SPELL_BACKDROP, spellArtSvg } from './icons';

let portraits = new Map<string, string>();

export function setPortraits(p: Map<string, string>) {
  portraits = p;
}

/** `look` is a card id, `hero:<id>` or `boss:<name>`; falls back to the model's picture. */
export function portrait(model: ModelId, look?: string): string {
  return portraits.get(artKey(look, model)) ?? portraits.get(model) ?? '';
}

export function createCardElement(defId: string, opts: { attack?: number; health?: number } = {}): HTMLDivElement {
  const def = card(defId);
  const el = document.createElement('div');
  el.className = `card ${def.type} rarity-${def.rarity}${def.enemy ? ' enemy-card' : ''}${def.hero ? ' hero-card' : ''}`;
  el.dataset.defId = defId;
  el.innerHTML = cardInner(def, opts);
  return el;
}

function cardInner(def: CardDef, opts: { attack?: number; health?: number }): string {
  const art = def.type === 'minion'
    ? `<div class="card-art" style="background-image:url(${portrait(def.model, def.id)})"></div>`
    : `<div class="card-art spell-art" style="background:${SPELL_BACKDROP[def.icon]}">${spellArtSvg(def.id, def.icon)}</div>`;
  const stats = def.type === 'minion'
    ? `<div class="card-atk">${opts.attack ?? def.attack}</div><div class="card-hp">${opts.health ?? def.health}</div>`
    : '';
  const typeLabel = def.type === 'minion' ? '하수인' : '주문';
  return `
    <div class="card-frame">
      ${art}
      <div class="card-cost">${def.cost}</div>
      <div class="card-name"><span>${def.name}</span></div>
      <div class="card-type">${def.hero ? `<b>${heroDef(def.hero).name}</b> · ` : ''}${typeLabel}</div>
      <div class="card-text"><span>${def.text}</span></div>
      <div class="card-gem"></div>
    </div>
    ${stats}`;
}

/** Keyword glossary entries for the keywords on a card (for hover tooltips). */
export function keywordNotes(defId: string): string {
  const def = card(defId);
  const kws: Keyword[] = def.type === 'minion' ? def.keywords ?? [] : [];
  const text = def.text;
  const extra: string[] = [];
  if (text.includes('등장 시')) extra.push('<b>등장 시</b>: 이 하수인을 낼 때 효과가 발동합니다.');
  if (text.includes('파괴 시')) extra.push('<b>파괴 시</b>: 이 하수인이 죽을 때 효과가 발동합니다.');
  if (text.includes('빙결')) extra.push('<b>빙결</b>: 다음 적 턴에 행동하지 못합니다.');
  if (text.includes('탐색')) extra.push('<b>탐색</b>: 무작위 카드 3장 중 하나를 골라 손으로 가져옵니다.');
  if (text.includes('봉인')) extra.push('<b>봉인</b>: 봉인된 카드는 그 주인의 다음 턴 동안 낼 수 없습니다.');
  return [...kws.map((k) => `<b>${KEYWORD_INFO[k].name}</b>: ${KEYWORD_INFO[k].text}`), ...extra]
    .map((t) => `<div class="kw-note">${t}</div>`).join('');
}
