import { card, CARDS, type CardDef } from '../game/cards';
import { CARD_CHANGES, historyOf, recentBadges } from '../game/changelog';
import { HEROES, heroDef } from '../game/heroes';
import { sourcesOf } from '../game/sources';
import { createCardElement, keywordNotes } from './cardView';

/** Card book: every card in the game, filterable, with where each one comes from. */

type Group = 'changes' | 'all' | 'common' | 'enemy' | string; // a hero id for hero-exclusive cards
type TypeFilter = 'all' | 'minion' | 'spell';
type Sort = 'cost' | 'rarity' | 'name';

const RARITY_NAME = { basic: '기본', common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' } as const;
const RARITY_ORDER = { basic: 0, common: 1, rare: 2, epic: 3, legendary: 4 } as const;
/** NEW / 수정 badges for cards touched by the latest updates. */
const BADGES = recentBadges(2);

const plain = (html: string) => html.replace(/<[^>]+>/g, '');

function groupOf(def: CardDef): string {
  if (def.enemy) return 'enemy';
  return def.hero ?? 'common';
}

export class CardBook {
  private root: HTMLDivElement;
  private group: Group = 'changes';
  private type: TypeFilter = 'all';
  private sort: Sort = 'cost';
  private query = '';

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'cardbook';
    this.root.className = 'hidden';
    document.body.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        e.stopPropagation();
        this.closeDetail() || this.close();
      }
    }, { capture: true });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open() {
    this.root.classList.remove('hidden');
    this.render();
  }

  close() {
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  private render() {
    const groups: [Group, string][] = [
      ['changes', '최근 변경'], ['all', '전체'], ['common', '공용'], ...HEROES.map((h): [Group, string] => [h.id, h.name]), ['enemy', '적'],
    ];
    const chip = (attr: string, value: string, label: string, on: boolean) =>
      `<button class="chip${on ? ' on' : ''}" data-${attr}="${value}">${label}</button>`;
    this.root.innerHTML = `
      <div class="book-panel">
        <div class="book-head">
          <h2>카드북</h2>
          <input id="book-search" type="search" placeholder="이름·효과 검색" value="${this.query}">
          <button class="btn secondary" id="book-close">닫기</button>
        </div>
        <div class="book-filters">
          <div class="chips">${groups.map(([v, l]) => chip('group', v, l, this.group === v)).join('')}</div>
          <div class="chips">
            ${chip('type', 'all', '모두', this.type === 'all')}${chip('type', 'minion', '하수인', this.type === 'minion')}${chip('type', 'spell', '주문', this.type === 'spell')}
            <span class="sep"></span>
            ${chip('sort', 'cost', '비용순', this.sort === 'cost')}${chip('sort', 'rarity', '등급순', this.sort === 'rarity')}${chip('sort', 'name', '이름순', this.sort === 'name')}
          </div>
        </div>
        <div class="book-count"></div>
        <div class="book-grid"></div>
      </div>
      <div class="book-detail hidden"></div>`;
    this.root.querySelector('#book-close')!.addEventListener('click', () => this.close());
    this.root.querySelectorAll<HTMLElement>('[data-group]').forEach((b) => b.addEventListener('click', () => { this.group = b.dataset.group!; this.render(); }));
    this.root.querySelectorAll<HTMLElement>('[data-type]').forEach((b) => b.addEventListener('click', () => { this.type = b.dataset.type as TypeFilter; this.render(); }));
    this.root.querySelectorAll<HTMLElement>('[data-sort]').forEach((b) => b.addEventListener('click', () => { this.sort = b.dataset.sort as Sort; this.render(); }));
    const search = this.root.querySelector<HTMLInputElement>('#book-search')!;
    search.addEventListener('input', () => { this.query = search.value; this.renderGrid(); });
    // Typing must not trigger game shortcuts (Space ends the turn).
    search.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    this.renderGrid();
  }

  private filtered(): CardDef[] {
    const q = this.query.trim();
    const list = Object.values(CARDS).filter((c) =>
      (this.group === 'all' || groupOf(c) === this.group) &&
      (this.type === 'all' || c.type === this.type) &&
      (!q || c.name.includes(q) || plain(c.text).includes(q)));
    const byCost = (a: CardDef, b: CardDef) => a.cost - b.cost || a.name.localeCompare(b.name, 'ko');
    const sorters: Record<Sort, (a: CardDef, b: CardDef) => number> = {
      cost: byCost,
      rarity: (a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || byCost(a, b),
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
    };
    return list.sort(sorters[this.sort]);
  }

  private cardEl(defId: string): HTMLElement {
    const el = createCardElement(defId);
    const badge = BADGES.get(defId);
    if (badge) el.insertAdjacentHTML('beforeend', `<div class="book-badge ${badge}">${badge === 'new' ? 'NEW' : '수정'}</div>`);
    el.addEventListener('click', () => this.showDetail(defId));
    return el;
  }

  /** 최근 변경: one section per update, newest first, each card with what changed. */
  private renderChanges() {
    const q = this.query.trim();
    const match = (id: string) => {
      const c = card(id);
      return (this.type === 'all' || c.type === this.type) && (!q || c.name.includes(q) || plain(c.text).includes(q));
    };
    const grid = this.root.querySelector('.book-grid')!;
    grid.classList.add('changes');
    grid.innerHTML = '';
    let total = 0;
    for (const entry of CARD_CHANGES) {
      const items = [
        ...(entry.added ?? []).map((id) => ({ id, note: '새 카드' })),
        ...(entry.changed ?? []).map((c) => ({ id: c.id, note: c.note ?? '변경' })),
      ].filter((it) => match(it.id));
      if (!items.length && (q || this.type !== 'all')) continue;
      total += items.length;
      const section = document.createElement('section');
      section.className = 'book-section';
      section.innerHTML = `<h3>${entry.title}</h3>${entry.summary ? `<p>${entry.summary}</p>` : ''}<div class="book-section-cards"></div>`;
      const row = section.querySelector('.book-section-cards')!;
      for (const it of items) {
        const cell = document.createElement('div');
        cell.className = 'book-change';
        cell.appendChild(this.cardEl(it.id));
        cell.insertAdjacentHTML('beforeend', `<div class="book-change-note">${it.note}</div>`);
        row.appendChild(cell);
      }
      grid.appendChild(section);
    }
    this.root.querySelector('.book-count')!.textContent = `최근 업데이트 ${CARD_CHANGES.length}개 · 카드 ${total}장 (NEW·수정 표시는 최근 2개 업데이트)`;
    if (!grid.children.length) grid.innerHTML = '<div class="book-empty">조건에 맞는 카드가 없습니다.</div>';
  }

  private renderGrid() {
    if (this.group === 'changes') return this.renderChanges();
    this.root.querySelector('.book-grid')!.classList.remove('changes');
    const cards = this.filtered();
    const minions = cards.filter((c) => c.type === 'minion').length;
    this.root.querySelector('.book-count')!.textContent =
      `${cards.length}장 (하수인 ${minions} · 주문 ${cards.length - minions}) / 전체 ${Object.keys(CARDS).length}장`;
    const grid = this.root.querySelector('.book-grid')!;
    grid.innerHTML = '';
    for (const c of cards) grid.appendChild(this.cardEl(c.id));
    if (!cards.length) grid.innerHTML = '<div class="book-empty">조건에 맞는 카드가 없습니다.</div>';
  }

  private showDetail(defId: string) {
    const def = card(defId);
    const detail = this.root.querySelector<HTMLElement>('.book-detail')!;
    const owner = def.enemy ? '적 전용' : def.hero ? `${heroDef(def.hero).name} 전용` : '공용';
    const stats = def.type === 'minion' ? ` · ${def.attack}/${def.health}` : '';
    detail.innerHTML = `
      <div class="book-detail-inner">
        <div class="book-detail-card"></div>
        <div class="book-detail-info">
          <h3>${def.name}</h3>
          <div class="meta">${def.type === 'minion' ? '하수인' : '주문'}${stats} · 비용 ${def.cost} · ${RARITY_NAME[def.rarity]} · ${owner}</div>
          <div class="notes">${keywordNotes(defId) || '<div class="kw-note">특수 키워드 없음</div>'}</div>
          <div class="sources"><b>얻는 곳 · 만나는 곳</b>${sourcesOf(def).map((s) => `<div>${s}</div>`).join('') || '<div>—</div>'}</div>
          ${historyOf(defId).length ? `<div class="sources"><b>변경 기록</b>${historyOf(defId).map((s) => `<div>${s}</div>`).join('')}</div>` : ''}
          <div class="id">id: ${def.id}</div>
          <button class="btn secondary" id="book-detail-close">닫기</button>
        </div>
      </div>`;
    detail.querySelector('.book-detail-card')!.appendChild(createCardElement(defId));
    detail.classList.remove('hidden');
    detail.querySelector('#book-detail-close')!.addEventListener('click', () => this.closeDetail());
    detail.addEventListener('click', (e) => { if (e.target === detail) this.closeDetail(); });
  }

  /** Returns true if a detail view was open (and is now closed). */
  private closeDetail(): boolean {
    const detail = this.root.querySelector<HTMLElement>('.book-detail');
    if (!detail || detail.classList.contains('hidden')) return false;
    detail.classList.add('hidden');
    return true;
  }
}
