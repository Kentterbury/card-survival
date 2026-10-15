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
      <div class="card-cost">${def.type === 'spell' && def.xCost ? 'X' : def.cost}</div>
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
  if (text.includes('빙결')) extra.push('<b>빙결</b>: 얼어 있는 동안 행동하지 못하지만, 어떤 피해도 받지 않습니다(반격도 못 함).');
  if (text.includes('젖')) extra.push('<b>젖은 칸</b>: 그 칸에 선 하수인은 받는 피해가 1 늘어납니다. 3턴 뒤 마릅니다.');
  if (text.includes('충돌')) extra.push('<b>충돌</b>: 옮긴 대상의 체력 절반(올림)만큼 두 대상이 각각 피해를 입고, 옮긴 대상은 제자리에 남습니다.');
  if (text.includes('영웅에게 <b>보호막</b>')) extra.push('<b>영웅 보호막</b>: 영웅이 받는 피해를 그 수치만큼 먼저 막습니다. 스테이지가 끝나면 사라집니다.');
  if (text.includes('<b>환영</b>')) extra.push('<b>환영</b>: 똑같이 생겼지만 피해를 주지 못하고, 피해를 받으면 체력과 상관없이 사라집니다.');
  if (text.includes('<b>빙벽</b>')) extra.push('<b>빙벽</b>: 0/5 구조물. 아무도 지나가지 못하고 3턴 뒤 녹습니다.');
  if (text.includes('탐색')) extra.push('<b>탐색</b>: 무작위 카드 3장 중 하나를 골라 손으로 가져옵니다.');
  if (text.includes('봉인')) extra.push('<b>봉인</b>: 봉인된 카드는 그 주인의 다음 턴 동안 낼 수 없습니다.');
  return [...kws.map((k) => `<b>${KEYWORD_INFO[k].name}</b>: ${KEYWORD_INFO[k].text}`), ...extra]
    .map((t) => `<div class="kw-note">${t}</div>`).join('');
}
