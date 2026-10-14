import { card, KEYWORD_INFO, type CardDef } from '../game/cards';
import type { Keyword, ModelId } from '../game/types';
import { SPELL_BACKDROP, spellIconSvg } from './icons';

let portraits = new Map<ModelId, string>();

export function setPortraits(p: Map<ModelId, string>) {
  portraits = p;
}

export function portrait(model: ModelId): string {
  return portraits.get(model) ?? '';
}

export function createCardElement(defId: string, opts: { attack?: number; health?: number } = {}): HTMLDivElement {
  const def = card(defId);
  const el = document.createElement('div');
  el.className = `card ${def.type} rarity-${def.rarity}`;
  el.dataset.defId = defId;
  el.innerHTML = cardInner(def, opts);
  return el;
}

function cardInner(def: CardDef, opts: { attack?: number; health?: number }): string {
  const art = def.type === 'minion'
    ? `<div class="card-art" style="background-image:url(${portrait(def.model)})"></div>`
    : `<div class="card-art spell-art" style="background:${SPELL_BACKDROP[def.icon]}">${spellIconSvg(def.icon)}</div>`;
  const stats = def.type === 'minion'
    ? `<div class="card-atk">${opts.attack ?? def.attack}</div><div class="card-hp">${opts.health ?? def.health}</div>`
    : '';
  const typeLabel = def.type === 'minion' ? '하수인' : '주문';
  return `
    <div class="card-frame">
      ${art}
      <div class="card-cost">${def.cost}</div>
      <div class="card-name"><span>${def.name}</span></div>
      <div class="card-type">${typeLabel}</div>
      <div class="card-text">${def.text}</div>
      ${stats}
      <div class="card-gem"></div>
    </div>`;
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
  return [...kws.map((k) => `<b>${KEYWORD_INFO[k].name}</b>: ${KEYWORD_INFO[k].text}`), ...extra]
    .map((t) => `<div class="kw-note">${t}</div>`).join('');
}
