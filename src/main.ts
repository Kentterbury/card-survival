import * as THREE from 'three';
import './style.css';
import { card, CARDS, KEYWORD_INFO, type MinionCard, type SpellIcon } from './game/cards';
import { CAMP_HEAL, Game, HERO_MAX_HEALTH, migrateSave, sameTarget, type RunSave } from './game/engine';
import { heroDef, HEROES, POWERS } from './game/heroes';
import { HEAL_AMOUNT, HEAL_PRICE, REMOVE_PRICE } from './game/shop';
import { CHAPTERS, STAGES, stageLabel } from './game/stages';
import { isCreature, isStructure, type ModelId, type TargetKind } from './game/types';
import {
  LAST_ROW, MANA_PER_TURN, MAX_MANA, other, RANGED_RANGE, ROWS,
  type GameEvent, type HitTarget, type Side, type Target, type Unit,
} from './game/types';
import { CHARACTER_MODELS, preloadAll, useSynty } from './render/assets';
import { Board, cellPos, ENEMY_HERO_POS, HERO_POS } from './render/board';
import { Fx } from './render/fx';
import { renderPortraits } from './render/portraits';
import { updateTweens, wait } from './render/tween';
import { UnitView } from './render/unitView';
import { createCardElement, keywordNotes, portrait, setPortraits } from './ui/cardView';
import { spellArtSvg, spellIconSvg } from './ui/icons';
import { sound, type SfxName } from './audio/sound';
import { CardBook } from './ui/cardBook';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Shown under each chapter's title card. */
const CHAPTER_LINES = [
  '해골 군단의 선발대가 숲의 짐승들을 오염시켰다',
  '무너진 성문 너머, 해골 군단의 본진',
  '던전 아래 깊은 동굴, 군주가 기다린다',
];
const st0 = (i: number) => STAGES[i];

/** The sound each spell icon makes when cast. */
/** What each target kind asks the player to pick. */
const TARGET_WORDS: Record<TargetKind, string> = {
  foe: '적 하수인이나 적 영웅', foeUnit: '적 하수인', ally: '아군 하수인', lane: '줄', slot: '내 진영 빈 칸', none: '',
  wallCell: '나란한 빈 칸 두 개', anyUnit: '하수인(아군도 가능)', allySlot: '아군 하수인', move: '하수인이나 구조물',
  trapCell: '빈 칸', ownTrapCell: '내 진영 앞쪽 세 줄의 빈 칸', area2: '2×2 영역', chargeAlly: '자기 줄에 적이 있는 아군 하수인',
};

/** Two-step cards: the prompt for picking the unit, then the cell. */
const TWO_STEP: Partial<Record<TargetKind, [string, string]>> = {
  allySlot: ['환영으로 만들 아군을 고르세요', '환영을 세울 내 진영 빈 칸을 고르세요'],
  move: ['옮길 하수인이나 구조물을 고르세요', '한 칸 뒤나 옆을 고르세요 (차 있으면 충돌)'],
};

const SPELL_SOUND: Record<SpellIcon, SfxName> = {
  bolt: 'zap', storm: 'zap', fire: 'fire', meteor: 'fire', frost: 'frost', wave: 'whoosh', heart: 'heal', potion: 'heal',
  shield: 'buff', sword: 'buff', scroll: 'magic', skull: 'curse', curse: 'curse', arrows: 'shoot',
};

/** Pick-proxy uid of the enemy hero's 3D model. */
const ENEMY_HERO_UID = -2;

type Aim =
  /** `first`: the unit already picked by a two-step card (환영, 염력). */
  | { kind: 'card'; handIndex: number; el: HTMLElement; sticky: boolean; x0: number; y0: number; moved: boolean; first?: number }
  | { kind: 'power'; sticky: boolean; x0: number; y0: number; moved: boolean };

type PickResult = { unit?: Unit; enemyHero?: boolean; lane?: number; row?: number };

class App {
  game = new Game();
  cardBook = new CardBook();
  board = new Board($<HTMLCanvasElement>('scene'));
  fx = new Fx(this.board.scene, this.board.camera, $('float-layer'));
  views = new Map<number, UnitView>();
  enemyHero: UnitView | null = null;
  busy = false;
  /** Death animations still running in the background during playback. */
  private dying: Promise<void>[] = [];
  aim: Aim | null = null;
  pointer = { x: 0, y: 0 };
  lastPointerType = 'mouse';
  /** Hero health as currently shown, updated event by event during playback. */
  heroHp: Record<Side, number> = { player: HERO_MAX_HEALTH, enemy: 0 };
  /** Hero 보호막 as shown (follows events during playback, like heroHp). */
  heroArmor: Record<Side, number> = { player: 0, enemy: 0 };
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
    const subjects = [...CHARACTER_MODELS, 'barrier' as ModelId, 'ice_wall' as ModelId, 'siege' as ModelId].map((m) => ({ key: m as string, model: m }));
    // Forest beasts are drawn in code: every look gets its own picture in either set.
    for (const c of Object.values(CARDS)) if (c.type === 'minion' && isCreature(c.model)) subjects.push({ key: c.id, model: c.model });
    for (const st of STAGES) if (isCreature(st.hero.model)) subjects.push({ key: `boss:${st.hero.name}`, model: st.hero.model });
    if (useSynty) {
      // The Synty set gives every card, hero and commander its own look, so each gets a picture.
      for (const c of Object.values(CARDS)) if (c.type === 'minion' && !isStructure(c.model) && !isCreature(c.model)) subjects.push({ key: c.id, model: c.model });
      for (const h of HEROES) subjects.push({ key: `hero:${h.id}`, model: h.model });
      for (const st of STAGES) if (!isCreature(st.hero.model)) subjects.push({ key: `boss:${st.hero.name}`, model: st.hero.model });
    }
    setPortraits(await renderPortraits(subjects));
    await this.board.buildEnvironment();
    this.bindTooltip($('hero-power'), () => {
      const p = this.game.state ? this.game.powerOf('player') : POWERS.guard;
      return `<b>지휘술 · ${p.name}</b> (${p.cost} 마나)<br>${p.text} 턴마다 한 번 쓸 수 있습니다.`;
    });
    this.board.clearHighlights();
    this.bindInput();
    this.bindAudio();
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
    updateTweens(dt);
    this.board.update(dt, this.elapsed);
    for (const v of this.views.values()) v.update(dt);
    this.enemyHero?.update(dt);
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

  async startRun(heroId: string, resume?: RunSave) {
    this.closeModal();
    void enterMobileFullscreen();
    this.game = new Game(Date.now() & 0x7fffffff);
    const hero = heroDef(resume?.hero ?? heroId);
    $('hero-portrait').style.backgroundImage = `url(${portrait(hero.model, `hero:${hero.id}`)})`;
    const icon = { guard: 'shield', bolt: 'bolt', charge: 'sword', aim: 'arrows' } as const;
    $('hero-power').querySelector<HTMLElement>('.hp-icon')!.innerHTML = spellIconSvg(icon[hero.power as keyof typeof icon] ?? 'bolt');
    $('hero-power').querySelector<HTMLElement>('.hp-cost')!.textContent = String(POWERS[hero.power].cost);
    $('hud').classList.remove('hidden');
    await this.play(this.game.startRun(undefined, hero.id, resume));
  }

  // ── Save (per stage, in this browser) ────────────────────────

  private static readonly SAVE_KEY = 'card-survival-save-v1';

  private writeSave() {
    try {
      localStorage.setItem(App.SAVE_KEY, JSON.stringify(this.game.saveData()));
    } catch {
      // Storage may be unavailable (private mode); the run simply is not saved.
    }
  }

  private readSave(): RunSave | null {
    try {
      const raw = localStorage.getItem(App.SAVE_KEY);
      return raw ? (JSON.parse(raw) as RunSave) : null;
    } catch {
      return null;
    }
  }

  private clearSave() {
    try { localStorage.removeItem(App.SAVE_KEY); } catch { /* ignore */ }
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
        if (e.type === 'move') {
          // Units of one side march together.
          let j = i;
          while (j < events.length && events[j].type === 'move') j++;
          await Promise.all(events.slice(i, j).map((ev) => this.playEvent(ev)));
          i = j;
        } else if (e.type === 'death') {
          // Deaths play in the background, so everything that falls in one turn goes down together
          // instead of one after another.
          this.dying.push(this.playEvent(e));
          i++;
        } else {
          await this.playEvent(e);
          i++;
        }
      }
      // Let the last of the fallen finish before the board settles (and any end screen opens).
      await Promise.all(this.dying);
    } finally {
      this.dying = [];
      this.busy = false;
    }
    await this.sync();
    const phase = this.game.state.phase;
    if (this.game.state.choice?.side === 'player') this.showChoice();
    else if (phase === 'reward') this.showReward();
    else if (phase === 'victory') this.showEnd(true);
    else if (phase === 'defeat') this.showEnd(false);
  }

  /** Where a hit lands: a unit's body, or the hero edge of the attacker's lane. */
  private hitPos(target: HitTarget, lane = 2): THREE.Vector3 {
    if (target === 'player') return cellPos(lane, -0.8).setY(1.2);
    if (target === 'enemy') return cellPos(lane, ROWS - 0.2).setY(1.6);
    const v = this.views.get(target);
    return v ? v.group.position.clone().setY(1.1 * v.scale) : new THREE.Vector3();
  }

  private casterPos(side: Side): THREE.Vector3 {
    return side === 'player' ? HERO_POS.clone().setY(2.4) : ENEMY_HERO_POS.clone().setY(3.2);
  }

  private async createView(u: Pick<Unit, 'uid' | 'side' | 'defId' | 'lane' | 'row'>) {
    const def = card(u.defId) as MinionCard;
    const v = new UnitView(u.uid, u.side, def.model, def.scale ?? 1, $('badges'), def.id);
    this.views.set(u.uid, v);
    await v.load(u.side === 'player' ? 'enemy' : 'player');
    v.group.position.copy(cellPos(u.lane, u.row));
    v.setStats({ attack: def.attack, health: def.health, maxHealth: def.health });
    v.setWard(def.keywords?.includes('ward') ?? false);
    v.setFlying(def.keywords?.includes('flying') ?? false);
    v.setElite(!!def.elite);
    this.board.scene.add(v.group);
    return v;
  }

  private async setupEnemyHero() {
    this.enemyHero?.dispose();
    const h = this.game.stageDef.hero;
    const v = new UnitView(ENEMY_HERO_UID, 'hero', h.model, h.scale, $('badges'), `boss:${h.name}`);
    await v.load('player');
    v.group.position.copy(ENEMY_HERO_POS);
    this.board.scene.add(v.group);
    this.enemyHero = v;
    $('enemy-portrait').style.backgroundImage = `url(${portrait(h.model, `boss:${h.name}`)})`;
  }

  private heroFrameHit(side: Side) {
    const frame = $(side === 'player' ? 'hero-frame' : 'enemy-frame');
    frame.classList.remove('hit');
    void frame.offsetWidth;
    frame.classList.add('hit');
  }

  private async playEvent(e: GameEvent): Promise<void> {
    const s = this.game.state;
    switch (e.type) {
      case 'stageStart': {
        for (const v of this.views.values()) v.dispose();
        this.views.clear();
        $('history').innerHTML = '';
        const chapter = STAGES[e.stage].chapter;
        this.board.syncTraps([]);
        this.board.syncZones([]);
        await this.board.setEnvironment(CHAPTERS[chapter].env);
        await this.setupEnemyHero();
        this.heroHp = { player: s.sides.player.hero.health, enemy: s.sides.enemy.hero.health };
        this.writeSave();
        const st = STAGES[e.stage];
        this.renderHud();
        // A new chapter gets its own title card first.
        if (e.stage === 0 || STAGES[e.stage - 1].chapter !== chapter) {
          await this.banner(`${chapter + 1}장 · ${CHAPTERS[chapter].name}`, CHAPTER_LINES[chapter] ?? '', 2.2, 'chapter');
        }
        await this.banner(`${stageLabel(e.stage)} · ${st.hero.name}`, `${st.name} — ${st.subtitle}`, 1.8);
        return;
      }
      case 'turnStart':
        this.renderHud();
        if (e.side === 'player') {
          sound.play('myTurn');
          await this.banner('나의 차례', '', 0.7);
        }
        return;
      case 'enemyTurn':
        sound.play('enemyTurn');
        await this.banner('상대의 차례', '', 0.6, 'enemy');
        return;
      case 'reshuffle':
        if (e.side === 'player') this.fx.floatText(HERO_POS.clone().setY(2), '덱을 다시 섞음', 'info');
        return;
      case 'burn':
        if (e.side === 'player') this.fx.floatText(HERO_POS.clone().setY(2), `손패 가득! ${card(e.card.defId).name} 소멸`, 'info');
        return;
      case 'draw':
        if (e.side === 'enemy') this.renderEnemyInfo();
        return;
      case 'cardGained': {
        const name = card(e.card.defId).name;
        const verb = { steal: '빼앗음', copy: '복사', choice: '획득', discard: '되찾음' }[e.from];
        if (e.side === 'player') {
          this.fx.floatText(HERO_POS.clone().setY(2.4), `${name} ${verb}`, 'info');
          this.renderHand();
        } else {
          this.fx.floatText(ENEMY_HERO_POS.clone().setY(4), `상대가 카드 ${verb}`, 'info');
        }
        this.renderEnemyInfo();
        await wait(0.35);
        return;
      }
      case 'discard':
        if (e.side === 'player') this.fx.floatText(HERO_POS.clone().setY(2.2), `버림: ${card(e.card.defId).name}`, 'info');
        await wait(0.12);
        return;
      case 'notice': {
        const at = e.side === 'player' ? HERO_POS.clone().setY(2.6) : ENEMY_HERO_POS.clone().setY(4);
        this.fx.floatText(at, e.text, 'info');
        this.renderEnemyInfo();
        this.renderHand();
        await wait(0.4);
        return;
      }
      case 'choice':
        return;
      case 'cardPlayed':
        sound.play('card');
        this.addHistory(e.side, e.card.defId);
        await this.showPlayedCard(e.side, e.card.defId);
        return;
      case 'summon': {
        const v = await this.createView(e);
        sound.play('summon');
        const base = v.group.position.clone();
        if (e.side === 'enemy') {
          await v.spawnAnim();
        } else {
          v.group.position.y = 2.5;
          await v.moveTo(base, 0.22, false);
        }
        this.fx.burst(base.clone().setY(0.2), e.side === 'player' ? 0xffe29a : 0x9dff7a, 16, 3);
        this.board.addShake(0.12);
        return;
      }
      case 'move':
      case 'push': {
        const v = this.views.get(e.uid);
        if (!v) return;
        const dist = Math.abs(e.to - e.from);
        await v.moveTo(cellPos(e.lane, e.to), (e.type === 'push' ? 0.12 : 0.42) * dist + 0.1, e.type === 'move');
        return;
      }
      case 'attack': {
        const a = this.views.get(e.attacker);
        if (!a) return;
        const lane = this.game.unit(e.attacker)?.lane ?? Math.round(a.group.position.x / 2.6 + 2);
        const targetPos = this.hitPos(e.target, lane);
        if (e.ranged) {
          await a.attackAnim();
          const own = this.game.unit(e.attacker);
          const missile = own ? (card(own.defId) as MinionCard).missile : undefined;
          const kind = missile ?? (a.modelId === 'Rogue' ? 'arrow' : a.side === 'enemy' ? 'curse' : 'storm');
          sound.play(kind === 'arrow' ? 'shoot' : kind === 'curse' ? 'curse' : 'magic');
          await this.fx.projectile(a.group.position.clone().setY(1.3 * a.scale), targetPos, kind);
        } else {
          sound.play('swing');
          await a.lunge(targetPos.clone().setY(0));
        }
        return;
      }
      case 'damage': {
        if (typeof e.target === 'string') {
          const side = e.target;
          this.heroHp[side] = Math.max(0, this.heroHp[side] - e.amount);
          this.renderHeroHp();
          this.heroFrameHit(side);
          sound.play('heroHit');
          this.board.addShake(side === 'player' ? 0.5 : 0.3);
          if (side === 'enemy') this.enemyHero?.hitAnim();
          const at = side === 'player' ? HERO_POS.clone().setY(2.6) : ENEMY_HERO_POS.clone().setY(4);
          this.fx.floatText(at, `-${e.amount}`, 'dmg');
          await wait(0.15);
          return;
        }
        const v = this.views.get(e.target);
        if (!v) return;
        v.health -= e.amount;
        v.renderBadge();
        v.hitAnim();
        sound.play('hit');
        this.fx.floatText(v.headPosition(), `-${e.amount}`, 'dmg');
        await wait(0.12);
        return;
      }
      case 'wardBroken': {
        const v = this.views.get(e.uid);
        if (!v) return;
        v.setWard(false);
        sound.play('wardBreak');
        this.fx.floatText(v.headPosition(), '보호막!', 'buff');
        await wait(0.15);
        return;
      }
      case 'heal': {
        sound.play('heal');
        if (typeof e.target === 'number') {
          const v = this.views.get(e.target);
          if (!v) return;
          v.health += e.amount;
          v.renderBadge();
          this.fx.floatText(v.headPosition(), `+${e.amount}`, 'heal');
          await wait(0.1);
          return;
        }
        const side = e.target;
        this.heroHp[side] = Math.min(s.sides[side].hero.maxHealth, this.heroHp[side] + e.amount);
        this.renderHeroHp();
        const at = side === 'player' ? HERO_POS.clone() : ENEMY_HERO_POS.clone();
        this.fx.floatText(at.clone().setY(side === 'player' ? 2.6 : 4), `+${e.amount}`, 'heal');
        this.fx.burst(at.setY(1), 0x7dffb0, 20, 2);
        await wait(0.2);
        return;
      }
      case 'buff': {
        const v = this.views.get(e.uid);
        if (!v) return;
        v.attack += e.attack;
        v.health += e.health;
        v.maxHealth += e.health;
        v.renderBadge();
        v.flash(0xffd34d);
        sound.play('buff');
        this.fx.floatText(v.headPosition(), `+${e.attack}/+${e.health}`, 'buff');
        await wait(0.15);
        return;
      }
      case 'explosion': {
        const at = cellPos(e.lane, e.row).setY(0.8);
        sound.play('explosion');
        this.fx.burst(at, 0xff7a1a, 40, 6);
        this.fx.burst(at, 0xffd34d, 20, 4);
        this.board.addShake(0.45);
        await wait(0.25);
        return;
      }
      case 'revive': {
        const v = this.views.get(e.uid);
        if (!v) return;
        v.health = 1;
        v.renderBadge();
        v.flash(0xb8ff9a);
        sound.play('revive');
        this.fx.burst(v.group.position.clone().setY(1), 0xb8ff9a, 24, 3);
        this.fx.floatText(v.headPosition(), '불사!', 'buff');
        await wait(0.3);
        return;
      }
      case 'keywordGained': {
        const v = this.views.get(e.uid);
        if (!v) return;
        if (e.keyword === 'ward') v.setWard(true);
        else this.fx.floatText(v.headPosition(), KEYWORD_INFO[e.keyword].name, 'buff');
        await wait(0.12);
        return;
      }
      case 'poison': {
        const v = this.views.get(e.uid);
        if (!v || e.turns <= 0) return;
        sound.play('curse');
        v.flash(0x7dff5a);
        this.fx.burst(v.group.position.clone().setY(1.2), 0x8aff5a, 12, 1.5);
        this.fx.floatText(v.headPosition(), `중독 ${e.turns}`, 'info');
        await wait(0.12);
        return;
      }
      case 'immune': {
        const v = this.views.get(e.uid);
        if (!v) return;
        sound.play('wardBreak');
        v.flash(0x9fe8ff);
        this.fx.floatText(v.headPosition(), '빙결 · 무적', 'buff');
        await wait(0.15);
        return;
      }
      case 'armor': {
        const before = this.heroArmor[e.side];
        this.heroArmor[e.side] = e.total;
        this.renderHeroHp();
        const at = e.side === 'player' ? HERO_POS.clone().setY(2.6) : ENEMY_HERO_POS.clone().setY(4);
        if (e.total > before) {
          sound.play('buff');
          this.fx.floatText(at, `가호 +${e.total - before}`, 'buff');
          this.fx.burst(at.clone().setY(1.2), 0x9fe8ff, 20, 2);
        } else {
          sound.play('wardBreak');
          this.fx.floatText(at, `가호 -${before - e.total}`, 'info');
        }
        await wait(0.2);
        return;
      }
      case 'wet':
        this.board.setWet(e.lane, e.row, e.on);
        if (e.on) this.fx.burst(cellPos(e.lane, e.row).setY(0.3), 0x6ab8ff, 14, 1.5);
        return;
      case 'empower':
        if (e.side === 'player') {
          this.renderEmpower();
          if (e.amount > 0) {
            sound.play('magic');
            this.fx.floatText(HERO_POS.clone().setY(2.6), `주문 강화 +${e.amount}`, 'buff');
            this.fx.burst(HERO_POS.clone().setY(1.4), 0xb07dff, 26, 2.5);
            await wait(0.3);
          }
        }
        return;
      case 'illusionBroken': {
        const v = this.views.get(e.uid);
        if (!v) return;
        sound.play('magic');
        this.fx.floatText(v.headPosition(), '환영이었다!', 'info');
        this.fx.burst(v.group.position.clone().setY(1), 0xc9a8ff, 30, 3);
        await wait(0.15);
        return;
      }
      case 'shift': {
        const v = this.views.get(e.uid);
        if (!v) return;
        sound.play('magic');
        await v.moveTo(cellPos(e.lane, e.row), 0.35, false);
        return;
      }
      case 'collide': {
        const a = this.views.get(e.uid);
        const b = this.views.get(e.into);
        if (!a || !b) return;
        const home = a.group.position.clone();
        const mid = home.clone().lerp(b.group.position, 0.45);
        await a.moveTo(mid, 0.14, false);
        sound.play('explosion');
        this.fx.burst(mid.clone().setY(1), 0xffe0a0, 26, 3.5);
        this.fx.floatText(mid.clone().setY(2.6), '충돌!', 'dmg');
        this.board.addShake(0.35);
        void a.moveTo(home, 0.2, false);
        await wait(0.15);
        return;
      }
      case 'blizzard':
        sound.play('frost');
        this.board.addShake(0.3);
        await this.fx.nova('frost');
        return;
      case 'decay': {
        const at = cellPos(e.lane, e.row).setY(0.8);
        sound.play('curse');
        this.fx.burst(at, 0x7dff5a, 36, 4);
        this.fx.burst(at, 0x3a6a1a, 24, 2.5);
        for (const [dl, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (e.lane + dl >= 0 && e.lane + dl < 5 && e.row + dr >= 0 && e.row + dr <= LAST_ROW) {
            this.fx.burst(cellPos(e.lane + dl, e.row + dr).setY(0.6), 0x9dff6a, 12, 2);
          }
        }
        this.board.addShake(0.3);
        await wait(0.3);
        return;
      }
      case 'root': {
        const v = this.views.get(e.uid);
        if (!v) return;
        v.setRooted(e.turns > 0);
        if (e.turns > 0) {
          sound.play('curse');
          this.fx.floatText(v.headPosition(), `속박 ${e.turns}`, 'info');
          this.fx.burst(v.group.position.clone().setY(0.4), 0x6fc24a, 14, 1.6);
          await wait(0.15);
        }
        return;
      }
      case 'trap':
        this.board.setTrap(e.lane, e.row, e.on);
        if (e.on) {
          sound.play('buff');
          this.fx.burst(cellPos(e.lane, e.row).setY(0.3), 0xc9b48a, 12, 1.4);
          await wait(0.12);
        }
        return;
      case 'trapSprung': {
        sound.play('swing');
        const at = cellPos(e.lane, e.row).setY(0.5);
        this.fx.burst(at, 0xe0e0e0, 18, 2.2);
        this.board.addShake(0.2);
        const v = this.views.get(e.uid);
        if (v) this.fx.floatText(v.headPosition(), '덫!', 'dmg');
        await wait(0.2);
        return;
      }
      case 'split': {
        const at = cellPos(e.lane, e.row).setY(0.5);
        sound.play('hit');
        this.fx.burst(at, 0x7dff6a, 30, 3);
        this.fx.floatText(at.clone().setY(2), '분열!', 'info');
        await wait(0.2);
        return;
      }
      case 'zone':
        this.board.setZone(e.kind, e.lane, e.row, e.on);
        if (e.on) {
          sound.play(e.kind === 'smoke' ? 'whoosh' : 'buff');
          this.fx.floatText(cellPos(e.lane + 0.5, e.row + 0.5).setY(2), e.kind === 'smoke' ? '연막!' : '방어 진지', 'buff');
          await wait(0.25);
        }
        return;
      case 'mark': {
        const v = this.views.get(e.uid);
        if (!v || e.turns <= 0) return;
        sound.play('curse');
        v.flash(0xff5a5a);
        this.fx.floatText(v.headPosition(), `징표 ${e.turns}`, 'dmg');
        await wait(0.1);
        return;
      }
      case 'guarded': {
        const v = this.views.get(e.uid);
        if (!v) return;
        sound.play('wardBreak');
        this.fx.floatText(v.headPosition(), '진지 방어', 'buff');
        await wait(0.12);
        return;
      }
      case 'loaded': {
        const v = this.views.get(e.uid);
        if (!v) return;
        if (e.on) {
          sound.play('buff');
          this.fx.floatText(v.headPosition(), '장전', 'info');
          await wait(0.2);
        }
        return;
      }
      case 'bombard': {
        const v = this.views.get(e.uid);
        if (!v) return;
        sound.play('explosion');
        void v.attackAnim();
        const to = e.row > LAST_ROW || e.row < 0 ? this.hitPos(e.row < 0 ? 'player' : 'enemy', e.lane) : cellPos(e.lane, e.row).setY(0.6);
        await this.fx.projectile(v.group.position.clone().setY(2.2), to, 'meteor', 14, 0.6);
        this.board.addShake(0.5);
        return;
      }
      case 'freeze':
        sound.play('frost');
        this.views.get(e.uid)?.setFrozen(true);
        await wait(0.08);
        return;
      case 'death': {
        const v = this.views.get(e.uid);
        if (!v) return;
        this.views.delete(e.uid);
        sound.play('death');
        await v.die();
        v.dispose();
        return;
      }
      case 'spell':
        await this.spellFx(e.side, e.defId, e.target);
        return;
      case 'heroPower':
        if (e.side === 'enemy') {
          await this.castingGlow();
          void this.enemyHero?.playOnce('Spellcast_Raise', 1);
        }
        sound.play(e.side === 'player' ? 'magic' : 'curse');
        if (e.target.kind === 'hero' || (e.target.kind === 'unit' && this.game.powerOf(e.side).target !== 'ally')) {
          await this.fx.projectile(this.casterPos(e.side), this.targetPos(e.target), e.side === 'player' ? 'hero' : 'curse', 22);
        } else if (e.target.kind === 'unit') {
          const v = this.views.get(e.target.uid);
          if (v) this.fx.burst(v.group.position.clone().setY(1), 0xffd34d, 20, 2.5);
          await wait(0.15);
        } else if (e.target.kind === 'lane') {
          // Aim at the nearest live foe view in that lane (the unit may already be dead in the final state).
          const lane = e.target.lane;
          const from = this.casterPos(e.side);
          const laneX = cellPos(lane, 0).x;
          const front = [...this.views.values()]
            .filter((v) => !v.dead && v.side === other(e.side) && Math.abs(v.group.position.x - laneX) < 0.5)
            .sort((a, b) => a.group.position.distanceTo(from) - b.group.position.distanceTo(from))[0];
          const to = front ? front.group.position.clone().setY(1.1 * front.scale) : this.hitPos(other(e.side), lane);
          await this.fx.projectile(this.casterPos(e.side), to, 'arrow', 22);
        } else if (e.target.kind === 'none') {
          this.fx.burst(this.casterPos(e.side), 0x9ad8ff, 20, 2);
          await wait(0.15);
        }
        return;
      case 'stageClear':
        sound.play('stageClear');
        for (const v of this.views.values()) if (v.side === 'player') void v.playOnce('Cheer', 1);
        if (this.enemyHero) await this.enemyHero.die();
        await this.banner('승리!', `${stageLabel(e.stage)} ${STAGES[e.stage].hero.name} 처치 · 보수 금화 +${e.gold}`, 1.8);
        return;
      case 'defeat':
        sound.play('defeat');
        void this.enemyHero?.playOnce('Cheer', 1);
        await this.banner('패배', '', 1.2, 'enemy');
        return;
      case 'victory':
        sound.play('victory');
        await this.banner('계약 완수!', '해골 군주를 쓰러뜨렸습니다', 1.8);
        return;
    }
  }

  private targetPos(t: Target): THREE.Vector3 {
    if (t.kind === 'unit') return this.hitPos(t.uid);
    if (t.kind === 'hero') return t.side === 'player' ? HERO_POS.clone().setY(1.6) : ENEMY_HERO_POS.clone().setY(2.4);
    return new THREE.Vector3();
  }

  private async castingGlow() {
    const f = $('enemy-frame');
    f.classList.add('casting');
    await wait(0.25);
    f.classList.remove('casting');
  }

  private async showPlayedCard(side: Side, defId: string) {
    const def = card(defId);
    if (side === 'player' && def.type !== 'spell') return;
    const holder = document.createElement('div');
    holder.id = side === 'player' ? 'played-card' : 'enemy-played';
    if (side === 'enemy') holder.innerHTML = '<div class="label">상대가 사용</div>';
    holder.appendChild(createCardElement(defId));
    document.body.appendChild(holder);
    if (side === 'enemy') {
      this.renderEnemyInfo();
      void this.enemyHero?.playOnce('Spellcast_Raise', 1);
    }
    await wait(side === 'enemy' ? 0.9 : 0.55);
    holder.remove();
  }

  private async spellFx(side: Side, defId: string, target: Target) {
    const def = card(defId);
    if (def.type !== 'spell') return;
    sound.play(SPELL_SOUND[def.icon]);
    const from = this.casterPos(side);
    switch (target.kind) {
      case 'unit':
        if (def.target === 'ally') {
          const v = this.views.get(target.uid);
          if (v) this.fx.burst(v.group.position.clone().setY(1), 0xffd34d, 20, 2.5);
          await wait(0.2);
        } else {
          await this.fx.projectile(from, this.targetPos(target), def.icon, 20, 0.3);
        }
        return;
      case 'hero':
        await this.fx.projectile(from, this.targetPos(target), def.icon, 20, 0.3);
        return;
      case 'lane':
        if (def.icon === 'meteor') await this.fx.meteor(cellPos(target.lane, LAST_ROW / 2).setY(0.5));
        await this.fx.laneBlast(cellPos(target.lane, 0).x, def.icon);
        return;
      case 'none':
        await this.fx.nova(def.icon);
        return;
      case 'slot':
        return;
      case 'cell':
        if (def.target === 'trapCell') return;
        for (const lane of [target.lane, target.lane + 1]) this.fx.burst(cellPos(lane, target.row).setY(0.8), 0xbff0ff, 20, 2.5);
        await wait(0.15);
        return;
      case 'unitTo': {
        const v = this.views.get(target.uid);
        if (v) this.fx.burst(v.group.position.clone().setY(1), def.icon === 'potion' ? 0xc9a8ff : 0x9ad8ff, 22, 2.5);
        await wait(0.15);
        return;
      }
    }
  }

  /** Makes the 3D views match the authoritative game state. */
  private async sync() {
    const s = this.game.state;
    const alive = new Set<number>();
    for (const u of s.units) {
      if (u.health <= 0) continue;
      alive.add(u.uid);
      const v = this.views.get(u.uid) ?? (await this.createView(u));
      v.setStats(u);
      v.setWard(u.keywords.has('ward'));
      v.setFrozen(u.frozen);
      v.setRooted(!!u.rootedTurns);
      v.group.position.copy(cellPos(u.lane, u.row));
    }
    for (const [uid, v] of this.views) {
      if (!alive.has(uid)) {
        v.dispose();
        this.views.delete(uid);
      }
    }
    this.heroHp = { player: s.sides.player.hero.health, enemy: s.sides.enemy.hero.health };
    this.heroArmor = { player: s.sides.player.hero.armor ?? 0, enemy: s.sides.enemy.hero.armor ?? 0 };
    this.board.syncWet(s.wet);
    this.board.syncTraps(s.traps);
    this.board.syncZones(s.zones);
    this.renderHud();
    this.renderEmpower();
  }

  // ── HUD ──────────────────────────────────────────────────────

  private renderHud() {
    const s = this.game.state;
    if (!s) return;
    const st = STAGES[s.stage];
    const me = s.sides.player;
    $('stage-title').textContent = `${stageLabel(s.stage)} ${CHAPTERS[st.chapter].name} · ${st.name}`;
    $('stage-sub').innerHTML = `${s.turn}턴 · <span class="gold">${s.gold}</span>`;
    this.renderHeroHp();
    this.renderEnemyInfo();
    this.renderMana();
    this.renderHand();
    $('deck-count').textContent = String(me.drawPile.length);
    $('discard-count').textContent = `버린 카드 ${me.discard.length}`;
    this.renderControls();
    this.renderThreats();
  }

  private renderEnemyInfo() {
    const s = this.game.state;
    if (!s) return;
    const en = s.sides.enemy;
    const power = this.game.powerOf('enemy').text;
    $('enemy-name').textContent = en.hero.name;
    $('enemy-mana').textContent = `마나 ${en.mana}/${en.maxMana} · 덱 ${en.drawPile.length}`;
    $('enemy-hand').innerHTML = en.hand.map((c) => (c.locked ? '<i class="locked"></i>' : '<i></i>')).join('');
    $('enemy-frame').title = `${en.hero.name} — 지휘술(${this.game.powerOf('enemy').cost}): ${power}`;
  }

  private renderControls() {
    const g = this.game;
    const me = g.state.sides.player;
    const power = $<HTMLButtonElement>('hero-power');
    const canPower = !this.busy && g.canUseHeroPower();
    // Not `disabled`: a disabled button swallows taps, and we want to say why it cannot be used.
    power.classList.toggle('disabled', !canPower);
    power.classList.toggle('ready', canPower);
    power.classList.toggle('used', me.powerUsed);

    const endBtn = $<HTMLButtonElement>('end-turn');
    endBtn.disabled = this.busy || g.state.phase !== 'player';
    endBtn.classList.toggle('done', !this.busy && g.state.phase === 'player' && !this.hasMoves());
    $('hand').querySelectorAll<HTMLElement>('.card').forEach((el) => {
      const playable = !this.busy && g.canPlay(Number(el.dataset.index));
      el.classList.toggle('playable', playable);
      el.classList.toggle('unplayable', !playable && g.state.phase === 'player');
    });
  }

  private hasMoves(): boolean {
    const g = this.game;
    return g.state.sides.player.hand.some((_, i) => g.canPlay(i)) || g.canUseHeroPower();
  }

  private renderHeroHp() {
    $('hero-hp').textContent = String(this.heroHp.player);
    $('enemy-hp').textContent = String(this.heroHp.enemy);
    for (const side of ['player', 'enemy'] as const) {
      const el = $(side === 'player' ? 'hero-armor' : 'enemy-armor');
      const a = this.heroArmor[side];
      el.textContent = String(a);
      el.classList.toggle('on', a > 0);
    }
  }

  /** 주문 강화: glow on the hero and a +N tag on every spell in hand. */
  private renderEmpower() {
    const n = this.game.state?.sides.player.empower ?? 0;
    $('hero-frame').classList.toggle('empowered', n > 0);
    this.renderHand();
  }

  private renderMana() {
    const me = this.game.state.sides.player;
    // Mana above the maximum (e.g. 마나 물약) lasts only this turn.
    const bonus = Math.max(0, me.mana - me.maxMana);
    $('mana-text').textContent = `${me.mana - bonus}/${me.maxMana}${bonus ? ` (+${bonus})` : ''}`;
    let html = '';
    for (let i = 0; i < MAX_MANA; i++) {
      const cls = i < Math.min(me.mana, me.maxMana) ? 'full' : i < me.maxMana ? '' : 'locked';
      html += `<div class="gem ${cls}"></div>`;
    }
    for (let i = 0; i < bonus; i++) html += '<div class="gem bonus" title="이번 턴에만 쓸 수 있는 추가 마나"></div>';
    $('mana-gems').innerHTML = html;
  }

  /** Marks what every unit will do at the end of its side's turn. */
  private renderThreats() {
    // While events are playing, badges follow the events; the final state is applied by sync()
    // afterwards. Applying it mid-playback made later damage count twice (0 HP, then "healed").
    if (this.aim || this.busy) return;
    this.board.clearHighlights();
    for (const u of this.game.state.units) {
      const v = this.views.get(u.uid);
      if (!v || v.dead) continue;
      const next = !u.frozen && u.attack > 0 ? this.game.targetAhead(u) : null;
      if (next && next.hit === 'player') this.board.setCell(u.lane, u.row, 'danger');
      // Show situational attack (대열) on the badge.
      v.setStats({ ...u, attack: this.game.attackOf(u) });
      const mark = next && u.side === 'enemy' ? '<span class="threat" title="다음 턴에 공격">!</span>' : '';
      v.renderBadge(mark + (u.frozen ? `<span class="frozen-tag">❄${(u.frozenTurns ?? 1) > 1 ? u.frozenTurns : ''}</span>` : '')
        + (u.poison ? `<span class="poison-tag" title="중독: 턴마다 피해 1">☠${u.poison}</span>` : '')
        + (u.rootedTurns ? `<span class="root-tag" title="속박: 이동 못 함">🌿${u.rootedTurns}</span>` : '')
        + (u.marked ? `<span class="mark-tag" title="징표: 받는 피해 +1">🎯${u.marked}</span>` : '')
        + (u.loaded ? '<span class="mark-tag" title="장전: 이번 턴이 끝나면 발사">💥</span>' : '')
        + (this.game.inSmoke(u) ? '<span class="smoke-tag" title="연막: 적의 주문과 사격이 노리지 못함">🌫</span>' : ''));
    }
  }

  // ── Hand ─────────────────────────────────────────────────────

  private renderHand() {
    const hand = $('hand');
    const s = this.game.state;
    if (!s) return;
    const existing = new Map<number, HTMLElement>();
    hand.querySelectorAll<HTMLElement>('.card').forEach((el) => existing.set(Number(el.dataset.iid), el));
    const els = s.sides.player.hand.map((inst) => {
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
      const inst = s.sides.player.hand[i];
      const cost = this.game.costOf(inst);
      const base = card(inst.defId).cost;
      const def = card(inst.defId);
      el.querySelector('.card-cost')!.textContent = def.type === 'spell' && def.xCost ? 'X' : String(cost);
      // 주문 강화: every spell in hand shows the bonus it would get.
      const boost = def.type === 'spell' ? s.sides.player.empower : 0;
      el.classList.toggle('empowered', boost > 0);
      if (boost > 0) el.dataset.empower = `+${boost}`;
      el.classList.toggle('cheaper', cost < base);
      el.classList.toggle('pricier', cost > base);
      el.classList.toggle('locked', !!inst.locked);
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
    // iOS Safari cancels a touch when it decides the swipe is its own gesture (e.g. an upward
    // swipe from the bottom edge brings its toolbar back). Keep the card in hand, aimed, so the
    // next tap picks the target instead of leaving a half-dragged card stuck on screen.
    window.addEventListener('pointercancel', () => this.onCancel());
    // iOS also needs touchmove itself prevented to keep its page gestures (toolbar, bounce,
    // pinch) out of a drag; touch-action alone is not always enough there. Scrollable panels
    // (card book, modals) keep their scrolling.
    document.addEventListener('touchmove', (e) => {
      const t = e.target as Element | null;
      if (!t?.closest?.('.book-grid, .book-detail-inner, .panel')) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    $('scene').addEventListener('pointerdown', (e) => this.onBoardDown(e));
    $('enemy-frame').addEventListener('pointerdown', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      if (this.aim?.sticky) void this.resolveAim(e.clientX, e.clientY);
      else if (!this.aim) this.inspectEnemyHero();
    });
    window.addEventListener('pointerdown', (e) => { this.lastPointerType = e.pointerType; }, { capture: true });
    // Right click cancels; a touch long-press also fires contextmenu, which must not.
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.lastPointerType === 'mouse') this.cancelAim();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancelAim();
      if ((e.key === ' ' || e.key === 'Enter') && !this.cardBook.isOpen) void this.endTurn();
    });
    $('end-turn').addEventListener('click', () => void this.endTurn());
    $('hero-power').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.pointerType !== 'mouse') return; // touch: handled on release (tap) / long-press (tooltip)
      if (this.busy) return;
      if (!this.game.canUseHeroPower()) return this.powerBlocked();
      if (this.aim) this.cancelAim();
      if (this.usePowerIfUntargeted()) return;
      this.startAim({ kind: 'power', sticky: false, x0: e.clientX, y0: e.clientY, moved: false });
    });
    $('hero-power').addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' || this.tooltipWasLongPress) return;
      if (this.busy) return;
      if (!this.game.canUseHeroPower()) return this.powerBlocked();
      if (this.aim) this.cancelAim();
      if (this.usePowerIfUntargeted()) return;
      this.startAim({ kind: 'power', sticky: true, x0: e.clientX, y0: e.clientY, moved: false });
    });
    $('deck-btn').addEventListener('click', () => this.showDeck());
  }

  /** Tapping the 지휘술 when it cannot be used says why instead of doing nothing. */
  private powerBlocked() {
    const g = this.game;
    const me = g.state.sides.player;
    const kind = g.powerOf('player').target;
    const reason = g.state.phase !== 'player' ? '내 차례가 아닙니다.'
      : g.state.choice ? '탐색 카드를 먼저 고르세요.'
      : me.powerUsed ? '이번 턴에 이미 사용했습니다. (턴마다 한 번)'
      : me.mana < g.powerOf('player').cost ? `마나가 부족합니다. (${g.powerOf('player').cost} 필요, 현재 ${me.mana})`
      : kind === 'ally' ? '대상이 될 아군 하수인이 없습니다.'
      : '지금은 쓸 수 없습니다.';
    sound.play('error');
    const btn = $('hero-power');
    btn.classList.remove('shake');
    void btn.offsetWidth;
    btn.classList.add('shake');
    this.showHint(reason, 1600);
  }

  /** A short message above the 지휘술 button (reasons, aiming instructions). */
  private showHint(html: string, ms = 0) {
    const hint = $('hint');
    $('tooltip').classList.remove('show');
    hint.innerHTML = html;
    const r = $('hero-power').getBoundingClientRect();
    hint.style.left = `${Math.max(8, r.left)}px`;
    hint.style.bottom = `${window.innerHeight - r.top + 10}px`;
    hint.classList.add('show');
    window.clearTimeout(this.hintTimer);
    if (ms) this.hintTimer = window.setTimeout(() => hint.classList.remove('show'), ms);
  }

  private hintTimer = 0;

  /** Powers without a target fire as soon as the button is pressed. */
  private usePowerIfUntargeted(): boolean {
    if (this.game.powerOf('player').target !== 'none') return false;
    void this.play(this.game.heroPower({ kind: 'none' }));
    return true;
  }

  /** Audio starts on the first gesture (browser rule); the corner buttons toggle music and effects. */
  private bindAudio() {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    const music = $<HTMLButtonElement>('music-btn');
    const sfx = $<HTMLButtonElement>('sfx-btn');
    const render = () => {
      music.classList.toggle('off', !sound.musicOn);
      sfx.classList.toggle('off', !sound.sfxOn);
      music.title = sound.musicOn ? '배경음 끄기' : '배경음 켜기';
      sfx.title = sound.sfxOn ? '효과음 끄기' : '효과음 켜기';
    };
    music.addEventListener('click', () => { sound.unlock(); sound.setMusic(!sound.musicOn); render(); });
    $('book-btn').addEventListener('click', () => { sound.play('click'); this.cardBook.open(); });
    sfx.addEventListener('click', () => { sound.setSfx(!sound.sfxOn); sound.play('click'); render(); });
    render();
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
      const same = this.aim.kind === 'card' && this.aim.el === el;
      this.cancelAim();
      if (same) return;
    }
    const index = Number(el.dataset.index);
    if (!this.game.canPlay(index)) {
      sound.play('error');
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      return;
    }
    el.classList.remove('hover');
    $('inspect').classList.remove('show');
    // Keep getting this finger's moves even when it leaves the card (and the card moves with it).
    try { el.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    sound.play('draw');
    this.startAim({ kind: 'card', handIndex: index, el, sticky: false, x0: e.clientX, y0: e.clientY, moved: false });
  }

  private onBoardDown(e: PointerEvent) {
    this.pointer = { x: e.clientX, y: e.clientY };
    if (this.aim?.sticky) {
      void this.resolveAim(e.clientX, e.clientY);
      return;
    }
    if (!this.aim) this.inspectAt(e.clientX, e.clientY);
  }

  private onMove(e: PointerEvent) {
    this.pointer = { x: e.clientX, y: e.clientY };
    const aim = this.aim;
    if (!aim) {
      if (e.pointerType === 'mouse') this.inspectAt(e.clientX, e.clientY);
      return;
    }
    if (!aim.moved && Math.hypot(e.clientX - aim.x0, e.clientY - aim.y0) > 12) {
      aim.moved = true;
      if (aim.kind === 'card') {
        const kind = this.cardTargetKind(aim.handIndex);
        if (kind === 'slot' || kind === 'none') aim.el.classList.replace('aiming', 'dragging');
      }
    }
    this.updateAimVisuals();
  }

  private onCancel() {
    const aim = this.aim;
    if (!aim || aim.sticky) return;
    aim.sticky = true;
    if (aim.kind === 'card') aim.el.classList.replace('dragging', 'aiming');
    if (aim.kind === 'card') aim.el.style.transform = '';
    this.updateAimVisuals();
    if (aim.kind === 'card' && !$('hint').classList.contains('show')) this.showHint('대상을 탭하세요', 2500);
  }

  private onUp(e: PointerEvent) {
    const aim = this.aim;
    if (!aim || aim.sticky) return;
    if (!aim.moved) {
      // A click/tap without dragging: keep aiming until the next click/tap.
      aim.sticky = true;
      this.updateAimVisuals();
      return;
    }
    void this.resolveAim(e.clientX, e.clientY);
  }

  private startAim(aim: Aim) {
    this.aim = aim;
    $('inspect').classList.remove('show');
    if (aim.kind === 'power') {
      const p = this.game.powerOf('player');
      const what = TARGET_WORDS[p.target];
      this.showHint(`<b>${p.name}</b>: 대상을 고르세요 (${what})`);
    }
    if (aim.kind === 'card') {
      // The card being played is shown large on the left, out of the board's way.
      aim.el.classList.add('aiming');
      const defId = aim.el.dataset.defId!;
      const preview = $('aim-preview');
      preview.innerHTML = '';
      preview.appendChild(createCardElement(defId));
      const notes = keywordNotes(defId);
      if (notes) preview.insertAdjacentHTML('beforeend', `<div class="notes">${notes}</div>`);
      preview.classList.add('show');
      const def = card(defId);
      const steps = def.type === 'spell' ? TWO_STEP[def.target] : undefined;
      if (steps) this.showHint(`<b>${def.name}</b>: ${steps[0]}`);
      else if (def.type === 'spell' && ['wallCell', 'anyUnit', 'area2', 'ownTrapCell', 'chargeAlly'].includes(def.target)) this.showHint(`<b>${def.name}</b>: ${TARGET_WORDS[def.target]}을 고르세요`);
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
    $('hint').classList.remove('show');
    $('inspect').classList.remove('show');
    $('aim-preview').classList.remove('show');
    $('arrow-path').setAttribute('d', '');
    $('enemy-frame').classList.remove('targetable', 'hover');
    this.renderThreats();
  }

  private cardTargetKind(handIndex: number) {
    const def = card(this.game.state.sides.player.hand[handIndex].defId);
    return def.type === 'minion' ? 'slot' : def.target;
  }

  /**
   * What is under the pointer, judged by board tile (not by the 3D model's shape):
   * the unit standing on that tile, or the enemy hero for the strip past the last row.
   */
  private pick(x: number, y: number): PickResult {
    if (document.elementsFromPoint(x, y).some((el) => el.id === 'enemy-frame' || el.closest?.('#enemy-frame'))) {
      return { enemyHero: true };
    }
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const cell = this.board.pickGround(ndc);
    if (cell) {
      if (cell.row > LAST_ROW) return { enemyHero: true };
      return { unit: this.game.unitAt(cell.lane, cell.row), lane: cell.lane, row: cell.row };
    }
    // Pointing above the floor line, e.g. at the enemy hero's upper body.
    if (this.enemyHero && !this.enemyHero.dead) {
      this.ray.setFromCamera(ndc, this.board.camera);
      if (this.ray.intersectObject(this.enemyHero.proxy, false).length) return { enemyHero: true };
    }
    return {};
  }

  /** Over the hand itself: the strip the cards actually cover, not a fixed share of the screen. */
  private overHand(y: number) {
    const cards = $('hand').querySelectorAll<HTMLElement>('.card:not(.aiming):not(.dragging)');
    let top = window.innerHeight * 0.86;
    for (const c of cards) top = Math.min(top, c.getBoundingClientRect().top + c.offsetHeight * 0.35);
    return y > Math.max(top, window.innerHeight * 0.7);
  }

  /** Turns a pointer position into a target for the current aim, if any. */
  private targetAt(x: number, y: number): Target | null {
    const aim = this.aim;
    if (!aim || this.overHand(y)) return null;
    const p = this.pick(x, y);
    const foe = (): Target | null =>
      p.enemyHero ? { kind: 'hero', side: 'enemy' } : p.unit?.side === 'enemy' ? { kind: 'unit', uid: p.unit.uid } : null;
    const kind = aim.kind === 'power' ? this.game.powerOf('player').target : this.cardTargetKind(aim.handIndex);
    const cell = p.lane !== undefined && p.row !== undefined && p.row <= LAST_ROW ? { lane: p.lane, row: p.row } : null;
    switch (kind) {
      case 'none': return { kind: 'none' };
      case 'wallCell': {
        if (!cell) return null;
        // The wall covers this cell and the one to its right; on the right edge, the one to its left.
        const valid = this.validTargets();
        const at = (lane: number): Target => ({ kind: 'cell', lane, row: cell.row });
        if (valid.some((v) => sameTarget(v, at(cell.lane)))) return at(cell.lane);
        return cell.lane > 0 ? at(cell.lane - 1) : at(cell.lane);
      }
      case 'anyUnit': return p.unit ? { kind: 'unit', uid: p.unit.uid } : null;
      case 'trapCell':
      case 'ownTrapCell': return cell ? { kind: 'cell', lane: cell.lane, row: cell.row } : null;
      // The 2×2 area grows up and to the right from the cell; at the edges it shifts back inside.
      case 'area2': return cell ? { kind: 'cell', lane: Math.min(cell.lane, 3), row: Math.min(cell.row, LAST_ROW - 1) } : null;
      case 'chargeAlly': return p.unit?.side === 'player' ? { kind: 'unit', uid: p.unit.uid } : null;
      case 'allySlot':
      case 'move': {
        if (aim.kind !== 'card') return null;
        // Step one picks the unit (returned as a plain unit target); step two the cell.
        if (aim.first === undefined) return p.unit ? { kind: 'unit', uid: p.unit.uid } : null;
        return cell ? { kind: 'unitTo', uid: aim.first, lane: cell.lane, row: cell.row } : null;
      }
      case 'slot': return p.lane !== undefined ? { kind: 'slot', lane: p.lane } : null;
      case 'lane': return p.lane !== undefined ? { kind: 'lane', lane: p.lane } : null;
      case 'foe': return foe();
      case 'foeUnit': return p.unit?.side === 'enemy' ? { kind: 'unit', uid: p.unit.uid } : null;
      case 'ally': return p.unit?.side === 'player' ? { kind: 'unit', uid: p.unit.uid } : null;
    }
  }

  private validTargets(): Target[] {
    const aim = this.aim;
    if (!aim) return [];
    if (aim.kind !== 'card') return this.game.heroPowerTargets('player');
    const all = this.game.cardTargets(aim.handIndex);
    if (!TWO_STEP[this.cardTargetKind(aim.handIndex)]) return all;
    // Two-step cards: first the units that have somewhere to go, then that unit's cells.
    if (aim.first === undefined) {
      const uids = [...new Set(all.flatMap((t) => (t.kind === 'unitTo' ? [t.uid] : [])))];
      return uids.map((uid) => ({ kind: 'unit', uid }));
    }
    return all.filter((t) => t.kind === 'unitTo' && t.uid === aim.first);
  }

  private highlightTarget(t: Target, style: 'valid' | 'hover') {
    switch (t.kind) {
      case 'unit': {
        const u = this.game.unit(t.uid);
        if (u) this.board.setCell(u.lane, u.row, style);
        return;
      }
      case 'hero':
        $('enemy-frame').classList.add(style === 'hover' ? 'hover' : 'targetable');
        this.board.setHeroHighlight(style);
        return;
      case 'slot':
        this.board.setCell(t.lane, 0, style);
        return;
      case 'cell': {
        const kind = this.aim?.kind === 'card' ? this.cardTargetKind(this.aim.handIndex) : '';
        if (kind === 'area2') {
          // Every cell can be a corner, so only the hovered 2×2 lights up.
          if (style === 'hover') for (const [dl, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.board.setCell(t.lane + dl, t.row + dr, style);
          return;
        }
        this.board.setCell(t.lane, t.row, style);
        if (style === 'hover' && kind === 'wallCell') this.board.setCell(t.lane + 1, t.row, style);
        return;
      }
      case 'unitTo':
        this.board.setCell(t.lane, t.row, style);
        return;
      case 'lane':
        for (let r = 0; r <= LAST_ROW; r++) {
          const u = this.game.unitAt(t.lane, r);
          if (style === 'hover' || u?.side === 'enemy') this.board.setCell(t.lane, r, style);
        }
        return;
      case 'none':
        if (style === 'hover') for (const u of this.game.unitsOf('enemy')) this.board.setCell(u.lane, u.row, 'hover');
        return;
    }
  }

  private updateAimVisuals() {
    const aim = this.aim;
    if (!aim) return;
    const { x, y } = this.pointer;
    this.board.clearHighlights();
    $('enemy-frame').classList.remove('targetable', 'hover');
    const valid = this.validTargets();
    for (const t of valid) this.highlightTarget(t, 'valid');
    const t = this.targetAt(x, y);
    if (t && valid.some((v) => sameTarget(v, t))) this.highlightTarget(t, 'hover');
    if (aim.kind === 'card' && aim.first !== undefined) {
      const u = this.game.unit(aim.first);
      if (u) this.board.setCell(u.lane, u.row, 'hover');
    }

    let from: { x: number; y: number } | null = null;
    if (aim.kind === 'card') {
      const kind = this.cardTargetKind(aim.handIndex);
      if (aim.el.classList.contains('dragging')) {
        const tx = x - window.innerWidth / 2;
        const ty = y - window.innerHeight + aim.el.offsetHeight / 2;
        // A small ghost follows the pointer; the full card is shown on the left.
        aim.el.style.transform = `translate(${tx}px, ${ty}px) scale(${this.overHand(y) ? 0.9 : 0.5})`;
      } else if (kind !== 'slot' && kind !== 'none') {
        const r = $('aim-preview').querySelector('.card')!.getBoundingClientRect();
        from = { x: r.right, y: r.top + r.height * 0.4 };
      }
    } else {
      const r = $('hero-power').getBoundingClientRect();
      from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const path = $('arrow-path');
    if (from && aim.moved) {
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
    // Two-step cards: the first pick chooses the unit and keeps aiming for the cell.
    if (aim.kind === 'card' && aim.first === undefined && TWO_STEP[this.cardTargetKind(aim.handIndex)]) {
      if (!t || !valid || t.kind !== 'unit') {
        this.cancelAim();
        return;
      }
      aim.first = t.uid;
      aim.sticky = true;
      const def = card(aim.el.dataset.defId!);
      const u = this.game.unit(t.uid)!;
      const cost = def.type === 'spell' && def.xCost ? ` (마나 ${u.health})` : '';
      this.showHint(`<b>${def.name}</b>: ${u.name}${cost} — ${TWO_STEP[this.cardTargetKind(aim.handIndex)]![1]}`);
      this.updateAimVisuals();
      return;
    }
    this.cancelAim();
    if (!t || !valid) return;
    if (aim.kind === 'card') {
      aim.el.remove();
      await this.play(this.game.playCard(aim.handIndex, t));
    } else {
      await this.play(this.game.heroPower(t));
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
    if (p.enemyHero) {
      this.inspectEnemyHero();
      return;
    }
    const unit = p.unit;
    if (!unit) {
      inspect.classList.remove('show');
      inspect.dataset.uid = '';
      return;
    }
    if (inspect.dataset.uid === String(unit.uid) && inspect.classList.contains('show')) return;
    inspect.dataset.uid = String(unit.uid);
    const el = createCardElement(unit.defId, { attack: unit.attack, health: unit.health });
    inspect.innerHTML = '';
    inspect.appendChild(el);
    const status = [
      unit.side === 'enemy' ? '<b>적</b> 하수인' : '<b>아군</b> 하수인',
      `이동 ${unit.speed}칸 · 사거리 ${unit.range}칸`,
      unit.frozen ? `빙결: 행동하지 못하고 피해를 받지 않음 (${unit.frozenTurns ?? 1}턴)` : '',
      this.game.state.wet.some((w) => w.lane === unit.lane && w.row === unit.row) ? '젖은 칸: 받는 피해 +1' : '',
      unit.poison ? `중독: 자기 턴 시작마다 피해 1 (${unit.poison}턴)` : '',
      unit.rootedTurns ? `속박: 움직이지 못하지만 공격은 함 (${unit.rootedTurns}턴)` : '',
      unit.marked ? `징표: 받는 피해 +1 (${unit.marked}턴)` : '',
      this.game.inSmoke(unit) ? '연막 속: 적의 대상 지정 주문과 사격이 노리지 못함' : '',
      this.game.zoneAt('fort', unit.lane, unit.row, unit.side) ? '방어 진지: 받는 피해 −2' : '',
      unit.loaded ? '장전됨: 이번 내 턴이 끝나면 발사' : '',
      unit.fresh && !unit.keywords.has('swift') ? '이번 턴에 소환됨' : '',
    ].filter(Boolean).join('<br>');
    inspect.insertAdjacentHTML('beforeend', `<div class="notes"><div class="kw-note">${status}</div>${keywordNotes(unit.defId)}</div>`);
    inspect.classList.add('show');
  }

  private inspectEnemyHero() {
    const s = this.game.state;
    if (!s) return;
    const en = s.sides.enemy;
    const ep = this.game.powerOf('enemy');
    const power = `${ep.name} — ${ep.text}`;
    const inspect = $('inspect');
    inspect.dataset.uid = 'enemy';
    inspect.innerHTML = `<div class="notes"><div class="monster-note"><div class="title">${en.hero.name}</div>
      생명력 <b>${en.hero.health}/${en.hero.maxHealth}</b><br>마나 ${en.mana}/${en.maxMana} · 손패 ${en.hand.length}장 · 덱 ${en.drawPile.length}장
      <div style="margin-top:.6vh"><b>전술</b>: ${this.game.stageDef.concept}</div>
      <div style="margin-top:.6vh"><b>지휘술 (${ep.cost})</b>: ${power}</div></div></div>`;
    inspect.classList.add('show');
  }

  // ── Tooltip & recent plays ───────────────────────────────────

  private tooltipWasLongPress = false;

  /** Shows `html` above `el` on mouse hover, or after a long press on touch screens. */
  private bindTooltip(el: HTMLElement, html: () => string) {
    let timer = 0;
    const show = () => {
      const tip = $('tooltip');
      tip.innerHTML = html();
      tip.classList.add('show');
      const r = el.getBoundingClientRect();
      tip.style.left = `${Math.max(8, r.left)}px`;
      tip.style.top = '';
      tip.style.bottom = `${window.innerHeight - r.top + 10}px`;
    };
    const hide = () => $('tooltip').classList.remove('show');
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
    el.addEventListener('pointerleave', () => { clearTimeout(timer); hide(); });
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.tooltipWasLongPress = false;
      timer = window.setTimeout(() => { this.tooltipWasLongPress = true; show(); }, 450);
    });
    el.addEventListener('pointerup', () => {
      clearTimeout(timer);
      if (this.tooltipWasLongPress) window.setTimeout(hide, 600);
    }, { capture: true });
    el.addEventListener('pointercancel', () => { clearTimeout(timer); hide(); });
  }

  /** Newest first on the right edge; hover or tap one to see the card. */
  private addHistory(side: Side, defId: string) {
    const def = card(defId);
    const el = document.createElement('div');
    el.className = `hist ${side} ${def.type}`;
    if (def.type === 'minion') el.style.backgroundImage = `url(${portrait(def.model, def.id)})`;
    else el.innerHTML = spellArtSvg(def.id, def.icon);
    el.insertAdjacentHTML('beforeend', `<span class="who">${side === 'player' ? '나' : '상대'}</span>`);
    const showCard = () => {
      const inspect = $('inspect');
      inspect.dataset.uid = `hist-${defId}`;
      inspect.innerHTML = '';
      inspect.appendChild(createCardElement(defId));
      const notes = keywordNotes(defId);
      inspect.insertAdjacentHTML('beforeend',
        `<div class="notes"><div class="kw-note">${side === 'player' ? '내가' : '상대가'} 최근에 낸 카드</div>${notes}</div>`);
      inspect.classList.add('show');
    };
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showCard(); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') $('inspect').classList.remove('show'); });
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); showCard(); });
    const list = $('history');
    list.prepend(el);
    while (list.children.length > 6) list.lastElementChild!.remove();
  }

  // ── Banners & modals ─────────────────────────────────────────

  private async banner(big: string, small: string, seconds: number, cls = '') {
    const el = $('banner');
    el.className = cls;
    el.innerHTML = `<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}`;
    el.animate(
      [{ opacity: 0, transform: 'scale(1.15)' }, { opacity: 1, transform: 'scale(1)', offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
      { duration: (seconds * 1000) / this.speed, easing: 'ease-out' },
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
      <p>해골 군단이 왕국을 덮쳤습니다. 왕국은 금화를 걸고 용병을 모집했고, 당신은 그 계약을 받아들인 용병대장입니다. 오염된 숲을 지나 던전과 그 아래 동굴까지, 여덟 지휘관과 1:1로 맞붙어 쓰러뜨리고 보수를 받으세요.</p>
      <div class="rules">
        <div><b>승리</b> 상대 영웅의 생명력을 0으로 만들면 이깁니다. 내 영웅이 쓰러지면 패배합니다.</div>
        <div><b>마나</b> 첫 턴 마나는 영웅마다 다르고(상대 지휘관은 스테이지마다 ${STAGES[0].startMana}~${STAGES[STAGES.length - 1].startMana}), 이후 매 턴 최대 마나가 ${MANA_PER_TURN}씩 늘어납니다(최대 ${MAX_MANA}). 쓰지 않은 마나는 <b>다음 턴으로 넘어가지 않습니다</b>.</div>
        <div><b>하수인</b> 내 진영(맨 아래 줄)에 소환하면 내 턴이 끝날 때마다 <b>한 칸씩 전진</b>합니다. 앞을 막는 적이 있으면 대신 공격합니다.</div>
        <div><b>사격</b> 원거리 하수인은 자기 줄 앞쪽 ${RANGED_RANGE}칸 안의 첫 적을 쏩니다. 아군 너머로도 쏠 수 있습니다.</div>
        <div><b>영웅 공격</b> 앞에 아무도 없이 끝까지 가면 <b>상대 영웅을 직접 공격</b>합니다. 상대도 마찬가지입니다.</div>
        <div><b>조작</b> 카드를 <b>탭(클릭)한 뒤 대상을 탭</b>하거나 끌어다 놓으세요. 피해 주문은 <b>상대 영웅 초상화</b>도 노릴 수 있습니다.</div>
      </div>
      <button class="btn" id="start-btn">출정</button>
      <button class="btn secondary" id="book-open">카드북</button>
      <p class="credits"><a href="grip.html" target="_blank" rel="noopener">무기 위치 편집기</a> · 주문 그림: <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> (Lorc, Delapouite 외, CC BY 3.0)</p>`);
    m.querySelector('#book-open')!.addEventListener('click', () => this.cardBook.open());
    const raw = this.readSave();
    const save = raw && migrateSave(raw);
    if (save && STAGES[save.stage]) {
      const h = heroDef(save.hero);
      m.querySelector('#start-btn')!.insertAdjacentHTML('beforebegin',
        `<button class="btn" id="resume-btn">이어하기 · ${h.name} · ${stageLabel(save.stage)} ${STAGES[save.stage].name} · 생명력 ${save.health} · 금화 ${save.gold ?? 0}</button><br>`);
      m.querySelector('#start-btn')!.textContent = '새로 시작';
      m.querySelector('#start-btn')!.classList.add('secondary');
      m.querySelector('#resume-btn')!.addEventListener('click', () => void this.startRun(save.hero, save));
    }
    m.querySelector('#start-btn')!.addEventListener('click', () => this.showHeroSelect());
  }

  private showHeroSelect() {
    const m = this.openModal(`
      <h2>용병 계약</h2>
      <p>왕국과 계약할 용병대장을 고르세요. 생명력, 시작 마나, 지휘술, 시작 덱이 다릅니다.</p>
      <div class="heroes"></div>`);
    const row = m.querySelector('.heroes')!;
    for (const h of HEROES) {
      const p = POWERS[h.power];
      const minions = h.deck.filter((id) => card(id).type === 'minion').length;
      const el = document.createElement('div');
      el.className = 'hero-pick';
      el.innerHTML = `
        <div class="hero-face" style="background-image:url(${portrait(h.model, `hero:${h.id}`)})"></div>
        <h3>${h.name}</h3><div class="theme"><span class="nw">${h.title}</span> · <span class="nw">생명력 ${h.health}</span> · <span class="nw">시작 마나 ${h.startMana}</span></div>
        <div class="hero-power-desc"><b>지휘술 · ${p.name} (${p.cost}마나)</b><br>${p.text}</div>
        <div class="hero-blurb">${h.blurb}<br>시작 덱: 하수인 ${minions} · 주문 ${h.deck.length - minions}</div>`;
      el.addEventListener('click', () => void this.startRun(h.id));
      row.appendChild(el);
    }
  }

  /** Between stages: rest, or remove one card from the deck. */
  private showCamp() {
    const s = this.game.state;
    const hero = s.sides.player.hero;
    const m = this.openModal(`
      <h2>용병 야영지</h2>
      <p>다음 전투 전에 하나를 고르세요. 생명력 ${hero.health}/${hero.maxHealth} · 덱 ${s.deckList.length}장 · <span class="gold">${s.gold}</span></p>
      <div class="bundles">
        <div class="bundle" id="camp-rest"><h3>휴식</h3><div class="theme">생명력 ${CAMP_HEAL} 회복</div></div>
        <div class="bundle" id="camp-trim"><h3>정비</h3><div class="theme">덱에서 카드 1장 제거</div></div>
      </div>
      ${s.shop
        ? '<button class="btn secondary" id="camp-shop">왕국 보급관 찾아가기 (선택과 별개)</button>'
        : '<p class="dim">왕국 보급관은 챕터를 마칠 때마다(그리고 최종 결전 직전에) 찾아옵니다.</p>'}`);
    m.querySelector('#camp-shop')?.addEventListener('click', () => this.showShop());
    m.querySelector('#camp-rest')!.addEventListener('click', () => {
      this.closeModal();
      void this.play(this.game.campRest());
    });
    const trim = m.querySelector<HTMLElement>('#camp-trim')!;
    if (s.deckList.length <= 5) trim.classList.add('disabled');
    else trim.addEventListener('click', () => this.showTrim());
  }

  /** The merchant: spend gold on cards, a card removal or a healing draught, then return to the camp. */
  private showShop() {
    const s = this.game.state;
    const shop = s.shop;
    if (!shop) return this.showCamp();
    const hero = s.sides.player.hero;
    const deckFull = s.deckList.length <= 5;
    const m = this.openModal(`
      <h2>왕국 보급관</h2>
      <p>보수로 받은 금화로 병력과 물자를 사세요. 가진 금화 <span class="gold">${s.gold}</span> · 생명력 ${hero.health}/${hero.maxHealth} · 덱 ${s.deckList.length}장</p>
      <div class="shop-row"></div>
      <div class="shop-services">
        <div class="bundle ${shop.removed || deckFull || s.gold < REMOVE_PRICE ? 'disabled' : ''}" id="shop-remove">
          <h3>카드 제거</h3><div class="theme">${shop.removed ? '이번 방문에 이미 사용' : '덱에서 1장 제거'} · <span class="gold">${REMOVE_PRICE}</span></div></div>
        <div class="bundle ${shop.healed || hero.health >= hero.maxHealth || s.gold < HEAL_PRICE ? 'disabled' : ''}" id="shop-heal">
          <h3>회복 물약</h3><div class="theme">${shop.healed ? '이번 방문에 이미 사용' : `생명력 ${HEAL_AMOUNT} 회복`} · <span class="gold">${HEAL_PRICE}</span></div></div>
      </div>
      <button class="btn secondary" id="shop-back">야영지로 돌아가기</button>`);
    const row = m.querySelector('.shop-row')!;
    shop.offers.forEach((o, i) => {
      const item = document.createElement('div');
      item.className = 'shop-item';
      item.classList.toggle('sold', o.sold);
      item.classList.toggle('poor', !o.sold && s.gold < o.price);
      item.appendChild(createCardElement(o.defId));
      item.insertAdjacentHTML('beforeend', `<div class="price"><span class="gold">${o.price}</span></div>`);
      item.addEventListener('click', () => {
        if (!this.game.shopBuy(i)) { sound.play('error'); return; }
        sound.play('coin');
        this.writeSave();
        this.showShop();
      });
      row.appendChild(item);
    });
    m.querySelector('#shop-heal')!.addEventListener('click', () => {
      if (!this.game.shopHeal()) return;
      sound.play('heal');
      this.writeSave();
      this.showShop();
    });
    m.querySelector('#shop-remove')!.addEventListener('click', () => this.showTrim(true));
    m.querySelector('#shop-back')!.addEventListener('click', () => this.showCamp());
  }

  /** Pick a card to remove: free at the camp (ends the camp), or bought from the merchant. */
  private showTrim(paid = false) {
    const s = this.game.state;
    const title = paid ? `카드 제거 (<span class="gold">${REMOVE_PRICE}</span>): 뺄 카드를 고르세요` : '정비: 뺄 카드를 고르세요';
    const m = this.openModal(`<h2>${title}</h2><div class="deck-grid"></div><button class="btn secondary" id="trim-back">돌아가기</button>`);
    const grid = m.querySelector('.deck-grid')!;
    const order = s.deckList.map((id, i) => ({ id, i })).sort((a, b) => card(a.id).cost - card(b.id).cost || a.id.localeCompare(b.id));
    for (const { id, i } of order) {
      const el = createCardElement(id);
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        if (paid) {
          if (this.game.shopRemove(i)) sound.play('coin');
          this.writeSave();
          this.showShop();
          return;
        }
        this.closeModal();
        void this.play(this.game.campRemove(i));
      });
      grid.appendChild(el);
    }
    m.querySelector('#trim-back')!.addEventListener('click', () => (paid ? this.showShop() : this.showCamp()));
  }

  /** 탐색: pick one of three cards. */
  private showChoice() {
    const c = this.game.state.choice;
    if (!c) return;
    const extra = c.costMod < 0 ? ` 고른 카드는 비용이 ${-c.costMod} 줄어듭니다.` : '';
    const m = this.openModal(`
      <h2>탐색</h2>
      <p>카드 하나를 골라 손으로 가져옵니다.${extra}</p>
      <div class="bundles choice"></div>`);
    const row = m.querySelector('.bundles')!;
    c.options.forEach((id, i) => {
      const el = createCardElement(id);
      el.classList.add('choice-card');
      el.addEventListener('click', () => {
        this.closeModal();
        void this.play(this.game.chooseOption(i));
      });
      row.appendChild(el);
    });
  }

  private showReward() {
    const s = this.game.state;
    const hero = s.sides.player.hero;
    const bundles = s.rewards.map((b, i) => `
      <div class="bundle" data-i="${i}">
        <h3>${b.name}</h3><div class="theme">${b.theme}</div>
        <div class="mini-cards" data-cards="${b.cards.join(',')}"></div>
      </div>`).join('');
    const m = this.openModal(`
      <h2>${stageLabel(s.stage)} ${st0(s.stage).name} 완수!</h2>
      <p>왕국이 지원 물자를 보냈습니다. 꾸러미 하나를 골라 덱에 추가하세요. 생명력 ${hero.health}/${hero.maxHealth} · 덱 ${s.deckList.length}장 · <span class="gold">${s.gold}</span></p>
      <div class="bundles rewards">${bundles}</div>
      <button class="btn secondary" id="view-deck">현재 덱 보기</button>`);
    m.querySelector('.panel')!.classList.add('wide');
    m.querySelectorAll<HTMLElement>('.mini-cards').forEach((el) => {
      for (const id of el.dataset.cards!.split(',')) el.appendChild(createCardElement(id));
    });
    m.querySelectorAll<HTMLElement>('.bundle').forEach((el) =>
      el.addEventListener('click', () => {
        this.game.chooseReward(Number(el.dataset.i));
        this.writeSave();
        this.showCamp();
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
    const st = STAGES[s.stage];
    const m = this.openModal(`
      <h1>${won ? '계약 완수!' : '패배'}</h1>
      <p>${won ? '해골 군주가 무너지고 왕국에 새벽이 찾아왔습니다. 왕국은 약속한 보수를 지급했고, 당신의 용병단은 전설이 되었습니다.' : `${stageLabel(s.stage)} ${st.name}에서 ${st.hero.name}에게 쓰러졌습니다. 계약은 여기서 끝났습니다.`}</p>
      <p>클리어한 스테이지 ${s.stagesCleared}/${STAGES.length} · 최종 덱 ${s.deckList.length}장</p>
      <button class="btn" id="again">새 계약 맺기</button>`);
    this.clearSave();
    m.querySelector('#again')!.addEventListener('click', () => this.showHeroSelect());
  }
}

/** On phones, go fullscreen and try to lock landscape (Android; iOS ignores both). */
async function enterMobileFullscreen() {
  if (!matchMedia('(pointer: coarse)').matches || document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    // Not supported (e.g. iPhone Safari); the rotate hint covers portrait.
  }
}

const app = new App();
void app.init();
// Exposed for debugging and automated checks.
(window as unknown as { app: App }).app = app;
