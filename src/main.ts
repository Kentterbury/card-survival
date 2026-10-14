import * as THREE from 'three';
import './style.css';
import { card, type MinionCard } from './game/cards';
import { Game, HEAL_BETWEEN_STAGES, HERO_MAX_HEALTH, HERO_POWER_DAMAGE, sameTarget } from './game/engine';
import { monsterDef } from './game/monsters';
import { STAGES } from './game/stages';
import { HERO_POWER_COST, LANES, MAX_MANA, SPAWN_ROW, type GameEvent, type ModelId, type Target } from './game/types';
import { CHARACTER_MODELS, preloadAll } from './render/assets';
import { Board, cellPos, HERO_POS } from './render/board';
import { Fx } from './render/fx';
import { renderPortraits } from './render/portraits';
import { updateTweens, wait } from './render/tween';
import { UnitView } from './render/unitView';
import { createCardElement, keywordNotes, portrait, setPortraits } from './ui/cardView';
import { spellIconSvg } from './ui/icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const HERO_MODEL: ModelId = 'Knight';

type Aim =
  | { kind: 'card'; handIndex: number; el: HTMLElement; sticky: boolean; x0: number; y0: number; moved: boolean }
  | { kind: 'minion'; uid: number; sticky: boolean; x0: number; y0: number; moved: boolean }
  | { kind: 'hero'; sticky: boolean; x0: number; y0: number; moved: boolean };

type Pick = { uid?: number; side?: 'minion' | 'monster'; lane?: number; row?: number };

class App {
  game = new Game();
  board = new Board($<HTMLCanvasElement>('scene'));
  fx = new Fx(this.board.scene, this.board.camera, $('float-layer'));
  views = new Map<number, UnitView>();
  busy = false;
  aim: Aim | null = null;
  pointer = { x: 0, y: 0 };
  heroHpShown = HERO_MAX_HEALTH;
  /** Event type currently being animated (useful when debugging playback). */
  currentEvent = '';
  /** `?speed=4` speeds up all animation (handy for testing). */
  readonly speed = Number(new URLSearchParams(location.search).get('speed')) || 1;
  private lastFrame = performance.now();
  private elapsed = 0;
  private readonly ray = new THREE.Raycaster();

  async init() {
    await preloadAll((done, total) => {
      $('loading-fill').style.width = `${(done / total) * 100}%`;
    });
    $('loading-text').textContent = '초상화 그리는 중…';
    setPortraits(await renderPortraits([...CHARACTER_MODELS, 'barrier']));
    await this.board.buildEnvironment();
    $('hero-portrait').style.backgroundImage = `url(${portrait(HERO_MODEL)})`;
    $('hero-power').querySelector<HTMLElement>('.hp-icon')!.innerHTML = spellIconSvg('bolt');
    $('hero-power').title = `지휘의 번개 (${HERO_POWER_COST} 마나): 몬스터 하나에게 피해를 ${HERO_POWER_DAMAGE} 줍니다. 턴마다 한 번.`;
    this.board.clearHighlights();
    this.bindInput();
    window.addEventListener('resize', () => {
      this.board.resize();
      this.renderHand();
    });
    this.loop();
    $('loading').classList.add('hidden');
    this.showTitle();
  }

  // ── Main loop ────────────────────────────────────────────────

  private loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000) * this.speed;
    this.lastFrame = now;
    this.elapsed += dt;
    const time = this.elapsed;
    updateTweens(dt);
    this.board.update(dt, time);
    for (const v of this.views.values()) v.update(dt);
    this.fx.update(dt);
    this.placeBadges();
    this.board.render();
  };

  private placeBadges() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const v of this.views.values()) {
      if (v.dead) continue;
      const p = v.headPosition().project(this.board.camera);
      v.badge.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
      v.badge.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
    }
  }

  // ── Run flow ─────────────────────────────────────────────────

  async startRun() {
    this.closeModal();
    this.game = new Game(Date.now() & 0x7fffffff);
    this.heroHpShown = HERO_MAX_HEALTH;
    $('hud').classList.remove('hidden');
    await this.play(this.game.startRun());
  }

  async play(events: GameEvent[]) {
    if (events.length === 0) return;
    this.busy = true;
    // Only lock the controls here; the rest of the HUD follows the events as they play.
    this.renderControls();
    try {
      for (let i = 0; i < events.length;) {
        const e = events[i];
        this.currentEvent = e.type;
        if (e.type === 'move' || e.type === 'spawn') {
          let j = i;
          while (j < events.length && events[j].type === e.type) j++;
          await Promise.all(events.slice(i, j).map((ev) => this.playEvent(ev)));
          i = j;
        } else {
          await this.playEvent(e);
          i++;
        }
      }
    } finally {
      this.busy = false;
    }
    await this.sync();
    const phase = this.game.state.phase;
    if (phase === 'reward') this.showReward();
    else if (phase === 'victory') this.showEnd(true);
    else if (phase === 'defeat') this.showEnd(false);
  }

  private viewPos(uid: number | 'hero'): THREE.Vector3 {
    if (uid === 'hero') return HERO_POS.clone().setY(1.4);
    const v = this.views.get(uid);
    return v ? v.group.position.clone().setY(1.1 * v.scale) : new THREE.Vector3();
  }

  private async createView(uid: number, side: 'minion' | 'monster', defId: string, lane: number, row: number) {
    const isMinion = side === 'minion';
    const def = isMinion ? (card(defId) as MinionCard) : monsterDef(defId);
    const v = new UnitView(uid, side, def.model, def.scale ?? 1, $('badges'));
    this.views.set(uid, v);
    await v.load(isMinion ? 'enemy' : 'player');
    v.group.position.copy(cellPos(lane, row));
    v.setStats({ attack: def.attack, health: def.health, maxHealth: def.health });
    v.setWard(def.keywords?.includes('ward') ?? false);
    this.board.scene.add(v.group);
    return v;
  }

  private async playEvent(e: GameEvent): Promise<void> {
    const s = this.game.state;
    switch (e.type) {
      case 'stageStart': {
        for (const v of this.views.values()) v.dispose();
        this.views.clear();
        const st = STAGES[e.stage];
        this.renderHud();
        await this.banner(`스테이지 ${e.stage + 1} · ${st.name}`, st.subtitle, 1.6);
        return;
      }
      case 'turnStart':
        this.renderHud();
        await this.banner('나의 차례', '', 0.7);
        return;
      case 'enemyTurn':
        await this.banner('적의 차례', '', 0.6, 'enemy');
        return;
      case 'reshuffle':
        this.fx.floatText(HERO_POS.clone().setY(2), '덱을 다시 섞음', 'info');
        return;
      case 'burn':
        this.fx.floatText(HERO_POS.clone().setY(2), `손패 가득! ${card(e.card.defId).name} 소멸`, 'info');
        return;
      case 'draw':
        return;
      case 'cardPlayed': {
        if (card(e.card.defId).type !== 'spell') return;
        const holder = document.createElement('div');
        holder.id = 'played-card';
        holder.appendChild(createCardElement(e.card.defId));
        document.body.appendChild(holder);
        await wait(0.55);
        holder.remove();
        return;
      }
      case 'summon': {
        const v = await this.createView(e.uid, 'minion', e.defId, e.lane, 0);
        const base = v.group.position.clone();
        v.group.position.y = 2.5;
        await v.moveTo(base, 0.22, false);
        this.fx.burst(base.clone().setY(0.2), 0xffe29a, 16, 3);
        this.board.addShake(0.15);
        return;
      }
      case 'spawn': {
        const v = await this.createView(e.uid, 'monster', e.defId, e.lane, e.row);
        await v.spawnAnim();
        return;
      }
      case 'move':
      case 'push': {
        const v = this.views.get(e.uid);
        if (!v) return;
        const dist = Math.abs(e.to - e.from);
        await v.moveTo(cellPos(e.lane, e.to), (e.type === 'push' ? 0.12 : 0.45) * dist + 0.1, e.type === 'move');
        return;
      }
      case 'attack': {
        const a = this.views.get(e.attacker);
        if (!a) return;
        const targetPos = this.viewPos(e.target);
        if (e.ranged) {
          const mon = a.side === 'monster';
          await a.attackAnim();
          const kind = a.modelId === 'Rogue' ? 'arrow' : mon ? 'curse' : 'storm';
          await this.fx.projectile(a.group.position.clone().setY(1.3 * a.scale), targetPos, kind);
        } else {
          await a.lunge(targetPos.clone().setY(0));
        }
        return;
      }
      case 'damage': {
        if (e.uid === 'hero') {
          this.heroHpShown = Math.max(0, this.heroHpShown - e.amount);
          this.renderHeroHp();
          const frame = $('hero-frame');
          frame.classList.remove('hit');
          void frame.offsetWidth;
          frame.classList.add('hit');
          this.board.addShake(0.5);
          this.fx.floatText(HERO_POS.clone().setY(2.6), `-${e.amount}`, 'dmg');
          return;
        }
        const v = this.views.get(e.uid);
        if (!v) return;
        v.health -= e.amount;
        v.renderBadge();
        v.hitAnim();
        this.fx.floatText(v.headPosition(), `-${e.amount}`, 'dmg');
        await wait(0.12);
        return;
      }
      case 'wardBroken': {
        const v = this.views.get(e.uid);
        if (!v) return;
        v.setWard(false);
        this.fx.floatText(v.headPosition(), '보호막!', 'buff');
        await wait(0.15);
        return;
      }
      case 'heal':
        this.heroHpShown = Math.min(s.hero.maxHealth, this.heroHpShown + e.amount);
        this.renderHeroHp();
        this.fx.floatText(HERO_POS.clone().setY(2.6), `+${e.amount}`, 'heal');
        this.fx.burst(HERO_POS.clone().setY(1), 0x7dffb0, 20, 2);
        await wait(0.2);
        return;
      case 'buff': {
        const v = this.views.get(e.uid);
        if (!v) return;
        v.attack += e.attack;
        v.health += e.health;
        v.maxHealth += e.health;
        v.renderBadge();
        v.flash(0xffd34d);
        this.fx.floatText(v.headPosition(), `+${e.attack}/+${e.health}`, 'buff');
        await wait(0.15);
        return;
      }
      case 'freeze': {
        const v = this.views.get(e.uid);
        v?.setFrozen(true);
        await wait(0.08);
        return;
      }
      case 'death': {
        const v = this.views.get(e.uid);
        if (!v) return;
        this.views.delete(e.uid);
        await v.die();
        v.dispose();
        return;
      }
      case 'spell':
        await this.spellFx(e.defId, e.target);
        return;
      case 'heroPower':
        if (e.target.kind === 'monster') {
          await this.fx.projectile(HERO_POS.clone().setY(2.2), this.viewPos(e.target.uid), 'hero', 22);
        }
        return;
      case 'stageClear':
        for (const v of this.views.values()) if (v.side === 'minion') void v.playOnce('Cheer', 1);
        await this.banner('스테이지 클리어!', `생명력 ${HEAL_BETWEEN_STAGES} 회복`, 1.6);
        return;
      case 'defeat':
        await this.banner('패배', '', 1.2, 'enemy');
        return;
      case 'victory':
        await this.banner('승리!', '해골 군주를 쓰러뜨렸습니다', 1.8);
        return;
    }
  }

  private async spellFx(defId: string, target: Target) {
    const def = card(defId);
    if (def.type !== 'spell') return;
    const from = HERO_POS.clone().setY(2.4);
    switch (target.kind) {
      case 'monster':
        await this.fx.projectile(from, this.viewPos(target.uid), def.icon, 20, 0.3);
        return;
      case 'lane':
        if (def.icon === 'meteor') await this.fx.meteor(cellPos(target.lane, 3).setY(0.5));
        await this.fx.laneBlast(cellPos(target.lane, 0).x, def.icon);
        return;
      case 'minion': {
        const v = this.views.get(target.uid);
        if (v) this.fx.burst(v.group.position.clone().setY(1), 0xffd34d, 20, 2.5);
        await wait(0.2);
        return;
      }
      case 'none':
        await this.fx.nova(def.icon);
        return;
      case 'slot':
        return;
    }
  }

  /** Makes the 3D views match the authoritative game state. */
  private async sync() {
    const s = this.game.state;
    const alive = new Set<number>();
    for (const m of this.game.minions()) {
      alive.add(m.uid);
      const v = this.views.get(m.uid) ?? (await this.createView(m.uid, 'minion', m.defId, m.lane, 0));
      v.setStats(m);
      v.setWard(m.keywords.has('ward'));
      v.group.position.copy(cellPos(m.lane, 0));
    }
    for (const m of s.monsters) {
      alive.add(m.uid);
      const v = this.views.get(m.uid) ?? (await this.createView(m.uid, 'monster', m.defId, m.lane, m.row));
      v.setStats(m);
      v.setWard(m.keywords.has('ward'));
      v.setFrozen(m.frozen);
      v.group.position.copy(cellPos(m.lane, m.row));
    }
    for (const [uid, v] of this.views) {
      if (!alive.has(uid)) {
        v.dispose();
        this.views.delete(uid);
      }
    }
    this.heroHpShown = s.hero.health;
    this.renderHud();
  }

  // ── HUD ──────────────────────────────────────────────────────

  private renderHud() {
    const g = this.game;
    const s = g.state;
    if (!s) return;
    const st = STAGES[s.stage];
    $('stage-title').textContent = `스테이지 ${s.stage + 1}/${STAGES.length} · ${st.name}`;
    const wavesLeft = st.waves.slice(s.turn).filter((w) => w.length > 0).length;
    $('stage-sub').textContent = `${s.turn}턴 · 남은 웨이브 ${wavesLeft}`;
    this.renderHeroHp();
    this.renderNextWave();
    this.renderMana();
    this.renderHand();
    $('deck-count').textContent = String(s.drawPile.length);
    $('discard-count').textContent = `버린 카드 ${s.discard.length}`;
    this.renderControls();
    this.renderThreats();
  }

  private renderControls() {
    const g = this.game;
    const s = g.state;
    const power = $<HTMLButtonElement>('hero-power');
    const canPower = !this.busy && g.canUseHeroPower();
    power.disabled = !canPower;
    power.classList.toggle('ready', canPower);
    power.classList.toggle('used', s.hero.powerUsed);

    const endBtn = $<HTMLButtonElement>('end-turn');
    endBtn.disabled = this.busy || s.phase !== 'player';
    endBtn.classList.toggle('done', !this.busy && s.phase === 'player' && !this.hasMoves());
    this.renderBadgeStates();
    $('hand').querySelectorAll<HTMLElement>('.card').forEach((el) => {
      const playable = !this.busy && g.canPlay(Number(el.dataset.index));
      el.classList.toggle('playable', playable);
      el.classList.toggle('unplayable', !playable && s.phase === 'player');
    });
  }

  private hasMoves(): boolean {
    const g = this.game;
    return g.state.hand.some((_, i) => g.canPlay(i))
      || g.minions().some((m) => g.attackTargets(m.uid).length > 0)
      || g.canUseHeroPower();
  }

  private renderHeroHp() {
    $('hero-hp').textContent = String(this.heroHpShown);
  }

  private renderNextWave() {
    const s = this.game.state;
    const el = $('next-wave');
    const next = [...s.pendingSpawns, ...this.game.upcomingWave()];
    if (s.phase !== 'player' || next.length === 0) {
      el.innerHTML = '<div class="label">다음 등장</div><div>없음</div>';
      return;
    }
    const counts = new Map<string, number>();
    for (const e of next) {
      const id = e.split('@')[0];
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    el.innerHTML = '<div class="label">다음 등장</div>' + [...counts].map(([id, n]) => {
      const d = monsterDef(id);
      return `<span class="chip"><img src="${portrait(d.model)}" alt="">${d.name}${n > 1 ? ` ×${n}` : ''}</span>`;
    }).join('');
  }

  private renderMana() {
    const s = this.game.state;
    const reserveShown = Math.max(0, s.mana - s.maxMana);
    $('mana-text').textContent = `${s.mana - reserveShown}/${s.maxMana}${reserveShown ? ` (+${reserveShown})` : ''}`;
    let html = '';
    for (let i = 0; i < MAX_MANA; i++) {
      const cls = i < Math.min(s.mana, s.maxMana) ? 'full' : i < s.maxMana ? '' : 'locked';
      html += `<div class="gem ${cls}"></div>`;
    }
    for (let i = 0; i < reserveShown; i++) html += '<div class="gem reserve" title="이월된 마나"></div>';
    $('mana-gems').innerHTML = html;
  }

  private renderBadgeStates() {
    for (const m of this.game.minions()) {
      const v = this.views.get(m.uid);
      v?.badge.classList.toggle('can-attack', !this.busy && this.game.attackTargets(m.uid).length > 0);
    }
  }

  private renderThreats() {
    if (this.aim) return;
    this.board.clearHighlights();
    for (const m of this.game.state.monsters) {
      const v = this.views.get(m.uid);
      const threat = m.row <= m.range && !m.frozen;
      if (threat) this.board.setCell(m.lane, m.row, 'danger');
      if (v && !v.dead) {
        v.setStats(m);
        v.renderBadge((threat ? '<span class="threat" title="다음 적 턴에 공격">!</span>' : '') + (m.frozen ? '<span class="frozen-tag">❄</span>' : ''));
      }
    }
  }

  // ── Hand ─────────────────────────────────────────────────────

  private renderHand() {
    const hand = $('hand');
    const s = this.game.state;
    if (!s) return;
    const existing = new Map<number, HTMLElement>();
    hand.querySelectorAll<HTMLElement>('.card').forEach((el) => existing.set(Number(el.dataset.iid), el));
    const els = s.hand.map((inst) => {
      let el = existing.get(inst.iid);
      existing.delete(inst.iid);
      if (!el) {
        const created = createCardElement(inst.defId);
        created.dataset.iid = String(inst.iid);
        created.classList.add('in-hand', 'drawn');
        created.addEventListener('pointerenter', () => this.hoverCard(created, true));
        created.addEventListener('pointerleave', () => this.hoverCard(created, false));
        created.addEventListener('pointerdown', (ev) => this.onCardDown(ev, created));
        hand.appendChild(created);
        el = created;
      }
      return el;
    });
    for (const el of existing.values()) el.remove();
    const n = els.length;
    const cardW = els[0]?.offsetWidth || 100;
    const spacing = Math.min(cardW * 0.85, (window.innerWidth * 0.5) / Math.max(1, n));
    els.forEach((el, i) => {
      const off = i - (n - 1) / 2;
      el.style.setProperty('--x', `${off * spacing}px`);
      el.style.setProperty('--y', `${Math.abs(off) ** 2 * 2.2 + cardW * 0.08}px`);
      el.style.setProperty('--r', `${off * 3.5}deg`);
      el.style.zIndex = String(10 + i);
      el.dataset.index = String(i);
    });
  }

  private hoverCard(el: HTMLElement, on: boolean) {
    if (this.aim) return;
    el.classList.toggle('hover', on);
    const inspect = $('inspect');
    if (on && el.dataset.defId) {
      const notes = keywordNotes(el.dataset.defId);
      inspect.innerHTML = notes ? `<div class="notes">${notes}</div>` : '';
      inspect.classList.toggle('show', !!notes);
    } else {
      inspect.classList.remove('show');
    }
  }

  // ── Input ────────────────────────────────────────────────────

  private bindInput() {
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    $('scene').addEventListener('pointerdown', (e) => this.onBoardDown(e));
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); this.cancelAim(); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancelAim();
      if (e.key === ' ' || e.key === 'Enter') void this.endTurn();
    });
    $('end-turn').addEventListener('click', () => void this.endTurn());
    $('hero-power').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.busy || !this.game.canUseHeroPower()) return;
      this.startAim({ kind: 'hero', sticky: false, x0: e.clientX, y0: e.clientY, moved: false });
    });
    $('deck-btn').addEventListener('click', () => this.showDeck());
  }

  private async endTurn() {
    if (this.busy || this.game.state?.phase !== 'player' || !$('modal').classList.contains('hidden')) return;
    this.cancelAim();
    await this.play(this.game.endTurn());
  }

  private onCardDown(e: PointerEvent, el: HTMLElement) {
    e.stopPropagation();
    if (this.busy) return;
    if (this.aim) {
      this.cancelAim();
      return;
    }
    const index = Number(el.dataset.index);
    if (!this.game.canPlay(index)) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      return;
    }
    el.classList.remove('hover');
    $('inspect').classList.remove('show');
    this.startAim({ kind: 'card', handIndex: index, el, sticky: false, x0: e.clientX, y0: e.clientY, moved: false });
  }

  private onBoardDown(e: PointerEvent) {
    this.pointer = { x: e.clientX, y: e.clientY };
    if (this.aim?.sticky) {
      void this.resolveAim(e.clientX, e.clientY);
      return;
    }
    if (this.busy || this.aim) return;
    const p = this.pick(e.clientX, e.clientY);
    if (p.uid !== undefined && p.side === 'minion' && this.game.attackTargets(p.uid).length > 0) {
      this.startAim({ kind: 'minion', uid: p.uid, sticky: false, x0: e.clientX, y0: e.clientY, moved: false });
    }
  }

  private onMove(e: PointerEvent) {
    this.pointer = { x: e.clientX, y: e.clientY };
    const aim = this.aim;
    if (!aim) {
      this.inspectAt(e.clientX, e.clientY);
      return;
    }
    if (Math.hypot(e.clientX - aim.x0, e.clientY - aim.y0) > 12) aim.moved = true;
    this.updateAimVisuals();
  }

  private onUp(e: PointerEvent) {
    const aim = this.aim;
    if (!aim || aim.sticky) return;
    if (!aim.moved) {
      // A click without dragging: keep aiming until the next click.
      aim.sticky = true;
      this.updateAimVisuals();
      return;
    }
    void this.resolveAim(e.clientX, e.clientY);
  }

  private startAim(aim: Aim) {
    this.aim = aim;
    $('inspect').classList.remove('show');
    if (aim.kind === 'card') {
      const kind = this.cardTargetKind(aim.handIndex);
      aim.el.classList.add(kind === 'slot' || kind === 'none' ? 'dragging' : 'aiming');
    }
    this.updateAimVisuals();
  }

  private cancelAim() {
    const aim = this.aim;
    if (!aim) return;
    if (aim.kind === 'card') {
      aim.el.classList.remove('dragging', 'aiming');
      aim.el.style.transform = '';
    }
    this.aim = null;
    $('arrow-path').setAttribute('d', '');
    this.renderThreats();
  }

  private cardTargetKind(handIndex: number) {
    const def = card(this.game.state.hand[handIndex].defId);
    return def.type === 'minion' ? 'slot' : def.target;
  }

  /** What is under the pointer: a unit, and/or a board cell. */
  private pick(x: number, y: number): Pick {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.board.camera);
    const proxies = [...this.views.values()].filter((v) => !v.dead).map((v) => v.proxy);
    const hit = this.ray.intersectObjects(proxies, false)[0];
    const out: Pick = {};
    if (hit) {
      const uid = hit.object.userData.uid as number;
      const unit = this.game.unit(uid);
      if (unit) {
        out.uid = uid;
        out.side = unit.side;
        out.lane = unit.lane;
        out.row = unit.side === 'monster' ? unit.row : 0;
        return out;
      }
    }
    const cell = this.board.pickGround(ndc);
    if (cell) {
      out.lane = cell.lane;
      out.row = cell.row;
      const m = this.game.monsterAt(cell.lane, cell.row);
      if (m) { out.uid = m.uid; out.side = 'monster'; }
      else if (cell.row === 0 && this.game.state.slots[cell.lane]) {
        out.uid = this.game.state.slots[cell.lane]!.uid;
        out.side = 'minion';
      }
    }
    return out;
  }

  private overHand(y: number) {
    return y > window.innerHeight * 0.8;
  }

  /** Turns a pointer position into a target for the current aim, if any. */
  private targetAt(x: number, y: number): Target | null {
    const aim = this.aim;
    if (!aim || this.overHand(y)) return null;
    const p = this.pick(x, y);
    if (aim.kind === 'minion' || aim.kind === 'hero') {
      return p.side === 'monster' && p.uid !== undefined ? { kind: 'monster', uid: p.uid } : null;
    }
    switch (this.cardTargetKind(aim.handIndex)) {
      case 'none': return { kind: 'none' };
      case 'slot': return p.lane !== undefined ? { kind: 'slot', lane: p.lane } : null;
      case 'lane': return p.lane !== undefined ? { kind: 'lane', lane: p.lane } : null;
      case 'monster': return p.side === 'monster' ? { kind: 'monster', uid: p.uid! } : null;
      case 'minion': return p.side === 'minion' ? { kind: 'minion', uid: p.uid! } : null;
    }
  }

  private validTargets(): Target[] {
    const aim = this.aim;
    if (!aim) return [];
    if (aim.kind === 'card') return this.game.cardTargets(aim.handIndex);
    if (aim.kind === 'minion') return this.game.attackTargets(aim.uid).map((uid) => ({ kind: 'monster' as const, uid }));
    return this.game.state.monsters.map((m) => ({ kind: 'monster' as const, uid: m.uid }));
  }

  private highlightTarget(t: Target, style: 'valid' | 'hover') {
    const s = this.game.state;
    switch (t.kind) {
      case 'monster': {
        const m = s.monsters.find((x) => x.uid === t.uid);
        if (m) this.board.setCell(m.lane, m.row, style);
        return;
      }
      case 'minion': {
        const m = this.game.minions().find((x) => x.uid === t.uid);
        if (m) this.board.setCell(m.lane, 0, style);
        return;
      }
      case 'slot':
        this.board.setCell(t.lane, 0, style);
        return;
      case 'lane':
        for (let r = style === 'hover' ? 0 : 1; r <= SPAWN_ROW; r++) {
          if (style === 'hover' || this.game.monsterAt(t.lane, r)) this.board.setCell(t.lane, r, style);
        }
        return;
      case 'none':
        if (style === 'hover') for (const m of s.monsters) this.board.setCell(m.lane, m.row, 'hover');
        return;
    }
  }

  private updateAimVisuals() {
    const aim = this.aim;
    if (!aim) return;
    const { x, y } = this.pointer;
    this.board.clearHighlights();
    const valid = this.validTargets();
    for (const t of valid) this.highlightTarget(t, 'valid');
    const t = this.targetAt(x, y);
    if (t && valid.some((v) => sameTarget(v, t))) this.highlightTarget(t, 'hover');

    let from: { x: number; y: number } | null = null;
    if (aim.kind === 'card') {
      const kind = this.cardTargetKind(aim.handIndex);
      if (kind === 'slot' || kind === 'none') {
        const tx = x - window.innerWidth / 2;
        const ty = y - window.innerHeight + aim.el.offsetHeight / 2;
        aim.el.style.transform = `translate(${tx}px, ${ty}px) scale(${this.overHand(y) ? 1.1 : 0.85})`;
      } else {
        const r = aim.el.getBoundingClientRect();
        from = { x: r.left + r.width / 2, y: r.top + r.height * 0.15 };
      }
    } else if (aim.kind === 'minion') {
      const v = this.views.get(aim.uid);
      if (v) {
        const p = v.group.position.clone().setY(1).project(this.board.camera);
        from = { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
      }
    } else {
      const r = $('hero-power').getBoundingClientRect();
      from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const path = $('arrow-path');
    if (from) {
      const cx = (from.x + x) / 2;
      const cy = Math.min(from.y, y) - 80;
      path.setAttribute('d', `M${from.x},${from.y} Q${cx},${cy} ${x},${y}`);
    } else {
      path.setAttribute('d', '');
    }
  }

  private async resolveAim(x: number, y: number) {
    const aim = this.aim;
    if (!aim) return;
    const t = this.targetAt(x, y);
    const valid = t && this.validTargets().some((v) => sameTarget(v, t));
    this.cancelAim();
    if (!t || !valid) return;
    if (aim.kind === 'card') {
      aim.el.remove();
      await this.play(this.game.playCard(aim.handIndex, t));
    } else if (aim.kind === 'minion' && t.kind === 'monster') {
      await this.play(this.game.minionAttack(aim.uid, t.uid));
    } else if (aim.kind === 'hero' && t.kind === 'monster') {
      await this.play(this.game.heroPower(t.uid));
    }
    this.renderHud();
  }

  private inspectAt(x: number, y: number) {
    const inspect = $('inspect');
    if (this.overHand(y) || !this.game.state) {
      if (!inspect.querySelector('.notes:only-child')) inspect.classList.remove('show');
      return;
    }
    const p = this.pick(x, y);
    const unit = p.uid !== undefined ? this.game.unit(p.uid) : undefined;
    if (!unit) {
      inspect.classList.remove('show');
      return;
    }
    if (inspect.dataset.uid === String(unit.uid) && inspect.classList.contains('show')) return;
    inspect.dataset.uid = String(unit.uid);
    if (unit.side === 'minion') {
      const el = createCardElement(unit.defId, { attack: unit.attack, health: unit.health });
      inspect.innerHTML = '';
      inspect.appendChild(el);
      const notes = keywordNotes(unit.defId);
      if (notes) inspect.insertAdjacentHTML('beforeend', `<div class="notes">${notes}</div>`);
    } else {
      const d = monsterDef(unit.defId);
      const ward = unit.keywords.has('ward') ? ' · 보호막' : '';
      inspect.innerHTML = `<div class="notes"><div class="monster-note"><div class="title">${d.name}</div>
        공격력 <b>${unit.attack}</b> · 생명력 <b>${unit.health}/${unit.maxHealth}</b>${ward}<br>
        이동 ${d.speed}칸 · 사거리 ${d.range}칸${d.boss ? ' · <b>보스</b>' : ''}
        ${d.text ? `<div style="margin-top:.6vh">${d.text}</div>` : ''}
        ${unit.frozen ? '<div style="color:#9fe6ff">빙결됨: 다음 턴 행동 불가</div>' : ''}</div></div>`;
    }
    inspect.classList.add('show');
  }

  // ── Banners & modals ─────────────────────────────────────────

  private async banner(big: string, small: string, seconds: number, cls = '') {
    const el = $('banner');
    el.className = cls;
    el.innerHTML = `<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}`;
    el.animate(
      [{ opacity: 0, transform: 'scale(1.15)' }, { opacity: 1, transform: 'scale(1)', offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
      { duration: seconds * 1000, easing: 'ease-out' },
    );
    await wait(seconds * 0.55);
  }

  private openModal(html: string) {
    const m = $('modal');
    m.innerHTML = `<div class="panel">${html}</div>`;
    m.classList.remove('hidden');
    return m;
  }

  private closeModal() {
    $('modal').classList.add('hidden');
  }

  private showTitle() {
    const m = this.openModal(`
      <h1>카드 서바이벌</h1>
      <p>무덤에서 깨어난 해골 군단이 성채로 밀려옵니다. 카드로 하수인을 배치하고 주문을 외워 방어선을 지키세요.</p>
      <div class="rules">
        <div><b>마나</b> 매 턴 최대 마나가 1씩 늘어납니다(최대 ${MAX_MANA}). 쓰지 않은 마나는 <b>1까지 다음 턴으로 이월</b>됩니다.</div>
        <div><b>방어선</b> 앞쪽 ${LANES}칸에 하수인을 소환합니다. 몬스터는 각 줄을 따라 한 칸씩 다가옵니다.</div>
        <div><b>공격</b> 근접 하수인은 맨 앞줄(자기 줄과 양옆) 몬스터를, <b>사격</b> 하수인은 자기 줄의 몬스터라면 어디든 공격합니다.</div>
        <div><b>위험</b> 막는 하수인이 없는 줄의 몬스터는 <b>영웅</b>을 직접 공격합니다. 붉은 칸은 다음 적 턴에 공격할 몬스터입니다.</div>
        <div><b>스테이지</b> 정해진 웨이브를 모두 막으면 클리어. 클리어할 때마다 <b>카드 꾸러미</b> 하나를 골라 덱에 추가합니다.</div>
        <div><b>조작</b> 카드를 끌어 놓거나 클릭 후 대상을 클릭하세요. 하수인을 끌어 몬스터를 공격합니다. 우클릭/ESC 취소, Space 턴 종료.</div>
      </div>
      <button class="btn" id="start-btn">출정</button>`);
    m.querySelector('#start-btn')!.addEventListener('click', () => void this.startRun());
  }

  private showReward() {
    const s = this.game.state;
    const bundles = s.rewards.map((b, i) => `
      <div class="bundle" data-i="${i}">
        <h3>${b.name}</h3><div class="theme">${b.theme}</div>
        <div class="mini-cards" data-cards="${b.cards.join(',')}"></div>
      </div>`).join('');
    const m = this.openModal(`
      <h2>스테이지 ${s.stage + 1} 클리어!</h2>
      <p>카드 꾸러미 하나를 골라 덱에 추가하세요. 생명력 ${s.hero.health}/${s.hero.maxHealth} · 덱 ${s.deckList.length}장</p>
      <div class="bundles">${bundles}</div>
      <button class="btn secondary" id="view-deck">현재 덱 보기</button>`);
    m.querySelectorAll<HTMLElement>('.mini-cards').forEach((el) => {
      for (const id of el.dataset.cards!.split(',')) el.appendChild(createCardElement(id));
    });
    m.querySelectorAll<HTMLElement>('.bundle').forEach((el) =>
      el.addEventListener('click', () => {
        this.closeModal();
        void this.play(this.game.chooseReward(Number(el.dataset.i)));
      }));
    m.querySelector('#view-deck')!.addEventListener('click', () => this.showDeck(() => this.showReward()));
  }

  private showDeck(back?: () => void) {
    const s = this.game.state;
    if (!s) return;
    const ids = [...s.deckList].sort((a, b) => card(a).cost - card(b).cost || a.localeCompare(b));
    const m = this.openModal(`<h2>덱 (${ids.length}장)</h2><div class="deck-grid"></div><button class="btn secondary" id="close-deck">닫기</button>`);
    const grid = m.querySelector('.deck-grid')!;
    for (const id of ids) grid.appendChild(createCardElement(id));
    m.querySelector('#close-deck')!.addEventListener('click', () => (back ? back() : this.closeModal()));
  }

  private showEnd(won: boolean) {
    const s = this.game.state;
    const m = this.openModal(`
      <h1>${won ? '승리!' : '패배'}</h1>
      <p>${won ? '해골 군주가 무너지고 성채에 새벽이 찾아왔습니다.' : `방어선이 무너졌습니다. 스테이지 ${s.stage + 1} · ${STAGES[s.stage].name}에서 쓰러졌습니다.`}</p>
      <p>클리어한 스테이지 ${s.stagesCleared}/${STAGES.length} · 최종 덱 ${s.deckList.length}장</p>
      <button class="btn" id="again">다시 도전</button>`);
    m.querySelector('#again')!.addEventListener('click', () => void this.startRun());
  }
}

const app = new App();
void app.init();
// Exposed for debugging and automated checks.
(window as unknown as { app: App }).app = app;
