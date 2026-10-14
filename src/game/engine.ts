import { card, STARTER_DECK, type EffectApi, type MinionCard } from './cards';
import { monsterDef } from './monsters';
import { rollRewards } from './rewards';
import { Rng } from './rng';
import { STAGES } from './stages';
import {
  HERO_POWER_COST, LANES, MAX_HAND, MAX_MANA, MAX_RESERVE, SPAWN_ROW,
  type CardInstance, type GameEvent, type Minion, type Monster, type Phase, type RewardBundle, type Target,
} from './types';

export const HERO_MAX_HEALTH = 30;
export const HEAL_BETWEEN_STAGES = 10;
export const HERO_POWER_DAMAGE = 1;

export interface GameState {
  phase: Phase;
  stage: number;
  turn: number;
  stagesCleared: number;
  hero: { health: number; maxHealth: number; powerUsed: boolean };
  mana: number;
  maxMana: number;
  reserve: number;
  /** The run's deck as card ids; grows with each reward. */
  deckList: string[];
  drawPile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  slots: (Minion | null)[];
  monsters: Monster[];
  /** Spawns that could not fit at the far end yet. */
  pendingSpawns: string[];
  rewards: RewardBundle[];
}

export class Game {
  readonly rng: Rng;
  state!: GameState;
  private nextUid = 1;
  private events: GameEvent[] = [];
  private readonly api: EffectApi;

  constructor(seed = Date.now()) {
    this.rng = new Rng(seed);
    this.api = this.createApi();
  }

  // ── Run / stage flow ─────────────────────────────────────────

  startRun(deck: string[] = STARTER_DECK): GameEvent[] {
    this.state = {
      phase: 'player', stage: 0, turn: 0, stagesCleared: 0,
      hero: { health: HERO_MAX_HEALTH, maxHealth: HERO_MAX_HEALTH, powerUsed: false },
      mana: 0, maxMana: 0, reserve: 0,
      deckList: [...deck], drawPile: [], hand: [], discard: [],
      slots: Array(LANES).fill(null), monsters: [], pendingSpawns: [], rewards: [],
    };
    return this.collect(() => this.beginStage());
  }

  chooseReward(index: number): GameEvent[] {
    const s = this.state;
    if (s.phase !== 'reward') return [];
    const bundle = s.rewards[index];
    if (!bundle) return [];
    s.deckList.push(...bundle.cards);
    s.rewards = [];
    s.stage++;
    return this.collect(() => this.beginStage());
  }

  get stageDef() {
    return STAGES[this.state.stage];
  }

  /** Waves still to come in this stage (for the UI preview). */
  upcomingWave(): string[] {
    return this.stageDef.waves[this.state.turn] ?? [];
  }

  private beginStage() {
    const s = this.state;
    s.turn = 0;
    s.maxMana = 0;
    s.reserve = 0;
    s.slots = Array(LANES).fill(null);
    s.monsters = [];
    s.pendingSpawns = [];
    s.hand = [];
    s.discard = [];
    s.drawPile = this.rng.shuffle(s.deckList.map((defId) => ({ iid: this.nextUid++, defId })));
    this.emit({ type: 'stageStart', stage: s.stage });
    this.spawnWave(0);
    this.draw(3);
    this.beginPlayerTurn();
  }

  private beginPlayerTurn() {
    const s = this.state;
    s.phase = 'player';
    s.turn++;
    s.maxMana = Math.min(MAX_MANA, s.maxMana + 1);
    s.mana = s.maxMana + s.reserve;
    s.reserve = 0;
    s.hero.powerUsed = false;
    for (const m of this.minions()) m.attacksLeft = m.attack > 0 ? 1 : 0;
    this.emit({ type: 'turnStart', turn: s.turn });
    this.draw(1);
  }

  // ── Player actions ───────────────────────────────────────────

  canPlay(handIndex: number): boolean {
    const s = this.state;
    const inst = s.hand[handIndex];
    return s.phase === 'player' && !!inst && card(inst.defId).cost <= s.mana && this.cardTargets(handIndex).length > 0;
  }

  /** Every legal target for a card in hand (`{kind:'none'}` for untargeted cards). */
  cardTargets(handIndex: number): Target[] {
    const inst = this.state.hand[handIndex];
    if (!inst) return [];
    const def = card(inst.defId);
    const emptySlots = (): Target[] =>
      this.state.slots.flatMap((m, lane) => (m ? [] : [{ kind: 'slot' as const, lane }]));
    if (def.type === 'minion') return emptySlots();
    switch (def.target) {
      case 'none': return [{ kind: 'none' }];
      case 'monster': return this.state.monsters.map((m) => ({ kind: 'monster' as const, uid: m.uid }));
      case 'minion': return this.minions().map((m) => ({ kind: 'minion' as const, uid: m.uid }));
      case 'lane': return Array.from({ length: LANES }, (_, lane) => ({ kind: 'lane' as const, lane }));
      case 'slot': return emptySlots();
    }
  }

  playCard(handIndex: number, target: Target = { kind: 'none' }): GameEvent[] {
    if (!this.canPlay(handIndex)) return [];
    if (!this.cardTargets(handIndex).some((t) => sameTarget(t, target))) return [];
    return this.collect(() => {
      const s = this.state;
      const [inst] = s.hand.splice(handIndex, 1);
      const def = card(inst.defId);
      s.mana -= def.cost;
      s.discard.push(inst);
      this.emit({ type: 'cardPlayed', card: inst, target });
      if (def.type === 'minion') {
        if (target.kind === 'slot') this.summonMinion(def.id, target.lane);
      } else {
        this.emit({ type: 'spell', defId: def.id, target });
        def.cast(this.api, target);
      }
      this.resolveDeaths();
      this.checkStageClear();
    });
  }

  attackTargets(minionUid: number): number[] {
    const m = this.minions().find((x) => x.uid === minionUid);
    if (!m || this.state.phase !== 'player' || m.attacksLeft <= 0 || m.attack <= 0) return [];
    return this.state.monsters
      .filter((x) => (m.keywords.has('ranged')
        ? x.lane === m.lane
        : x.row === 1 && Math.abs(x.lane - m.lane) <= 1))
      .map((x) => x.uid);
  }

  minionAttack(minionUid: number, monsterUid: number): GameEvent[] {
    if (!this.attackTargets(minionUid).includes(monsterUid)) return [];
    return this.collect(() => {
      const m = this.minions().find((x) => x.uid === minionUid)!;
      const target = this.state.monsters.find((x) => x.uid === monsterUid)!;
      const ranged = m.keywords.has('ranged');
      m.attacksLeft--;
      this.emit({ type: 'attack', attacker: m.uid, target: target.uid, ranged });
      this.damage(target.uid, m.attack, m.uid);
      if (!ranged && target.attack > 0) this.damage(m.uid, target.attack, target.uid);
      this.resolveDeaths();
      this.checkStageClear();
    });
  }

  canUseHeroPower(): boolean {
    const s = this.state;
    return s.phase === 'player' && !s.hero.powerUsed && s.mana >= HERO_POWER_COST && s.monsters.length > 0;
  }

  heroPower(monsterUid: number): GameEvent[] {
    if (!this.canUseHeroPower() || !this.state.monsters.some((m) => m.uid === monsterUid)) return [];
    return this.collect(() => {
      const s = this.state;
      s.mana -= HERO_POWER_COST;
      s.hero.powerUsed = true;
      const target: Target = { kind: 'monster', uid: monsterUid };
      this.emit({ type: 'heroPower', target });
      this.damage(monsterUid, HERO_POWER_DAMAGE, 'hero');
      this.resolveDeaths();
      this.checkStageClear();
    });
  }

  endTurn(): GameEvent[] {
    if (this.state.phase !== 'player') return [];
    return this.collect(() => {
      const s = this.state;
      s.reserve = Math.min(MAX_RESERVE, s.mana);
      for (const m of this.minions()) {
        const def = card(m.defId) as MinionCard;
        if (def.onEndTurn && m.health > 0) def.onEndTurn(this.api, m);
      }
      this.resolveDeaths();
      if (this.checkStageClear()) return;

      s.phase = 'enemy';
      this.emit({ type: 'enemyTurn' });
      this.monsterPhase();
      if (s.hero.health <= 0) {
        s.phase = 'defeat';
        this.emit({ type: 'defeat' });
        return;
      }
      this.spawnWave(s.turn);
      if (this.checkStageClear()) return;
      this.beginPlayerTurn();
    });
  }

  // ── Enemy turn ───────────────────────────────────────────────

  private monsterPhase() {
    const s = this.state;
    const order = [...s.monsters].sort((a, b) => a.row - b.row || a.lane - b.lane);
    for (const m of order) {
      if (m.health <= 0 || s.hero.health <= 0) continue;
      if (m.frozen) {
        m.frozen = false;
        continue;
      }
      if (m.row <= m.range) {
        const blocker = s.slots[m.lane];
        const melee = m.row === 1;
        if (blocker) {
          this.emit({ type: 'attack', attacker: m.uid, target: blocker.uid, ranged: !melee });
          this.damage(blocker.uid, m.attack, m.uid);
          if (melee && blocker.attack > 0) this.damage(m.uid, blocker.attack, blocker.uid);
        } else {
          this.emit({ type: 'attack', attacker: m.uid, target: 'hero', ranged: !melee });
          this.damageHero(m.attack, m.uid);
        }
        this.resolveDeaths();
      } else {
        this.advance(m);
      }
    }
    for (const m of s.monsters) {
      const helper = monsterDef(m.defId).summonsEachTurn;
      if (helper) s.pendingSpawns.push(helper);
    }
  }

  private advance(m: Monster) {
    const from = m.row;
    let row = m.row;
    for (let step = 0; step < m.speed && row > 1; step++) {
      if (this.monsterAt(m.lane, row - 1)) break;
      row--;
    }
    if (row !== from) {
      m.row = row;
      this.emit({ type: 'move', uid: m.uid, lane: m.lane, from, to: row });
    }
  }

  private spawnWave(index: number) {
    const s = this.state;
    const wave = this.stageDef.waves[index] ?? [];
    const queue = [...s.pendingSpawns, ...wave];
    s.pendingSpawns = [];
    for (const entry of queue) {
      const [id, laneStr] = entry.split('@');
      if (!this.spawnMonster(id, laneStr === undefined ? undefined : Number(laneStr))) s.pendingSpawns.push(entry);
    }
  }

  private spawnMonster(id: string, preferredLane?: number): boolean {
    const free = [...Array(LANES).keys()].filter((l) => !this.monsterAt(l, SPAWN_ROW));
    if (free.length === 0) return false;
    const lane = preferredLane !== undefined && free.includes(preferredLane) ? preferredLane : this.rng.pick(free);
    const def = monsterDef(id);
    const m: Monster = {
      side: 'monster', uid: this.nextUid++, defId: id, name: def.name, model: def.model,
      attack: def.attack, health: def.health, maxHealth: def.health,
      keywords: new Set(def.keywords ?? []), scale: def.scale ?? 1,
      lane, row: SPAWN_ROW, speed: def.speed, range: def.range, frozen: false, boss: !!def.boss,
    };
    this.state.monsters.push(m);
    this.emit({ type: 'spawn', uid: m.uid, lane, row: m.row, defId: id });
    return true;
  }

  // ── Shared mechanics ─────────────────────────────────────────

  private summonMinion(defId: string, lane: number) {
    const s = this.state;
    if (s.slots[lane]) return;
    const def = card(defId) as MinionCard;
    const m: Minion = {
      side: 'minion', uid: this.nextUid++, defId, name: def.name, model: def.model,
      attack: def.attack, health: def.health, maxHealth: def.health,
      keywords: new Set(def.keywords ?? []), scale: def.scale ?? 1,
      lane, attacksLeft: def.keywords?.includes('swift') && def.attack > 0 ? 1 : 0,
    };
    s.slots[lane] = m;
    this.emit({ type: 'summon', uid: m.uid, lane, defId });
    def.onSummon?.(this.api, m);
  }

  private damage(uid: number, amount: number, source: number | 'spell' | 'hero') {
    if (amount <= 0) return;
    const unit = this.unit(uid);
    if (!unit || unit.health <= 0) return;
    if (unit.keywords.has('ward')) {
      unit.keywords.delete('ward');
      this.emit({ type: 'wardBroken', uid });
      return;
    }
    unit.health -= amount;
    this.emit({ type: 'damage', uid, amount, source });
  }

  private damageHero(amount: number, source: number) {
    const hero = this.state.hero;
    hero.health = Math.max(0, hero.health - amount);
    this.emit({ type: 'damage', uid: 'hero', amount, source });
  }

  private resolveDeaths() {
    const s = this.state;
    for (;;) {
      const deadMonsters = s.monsters.filter((m) => m.health <= 0);
      const deadMinions = this.minions().filter((m) => m.health <= 0);
      if (deadMonsters.length === 0 && deadMinions.length === 0) return;
      s.monsters = s.monsters.filter((m) => m.health > 0);
      for (const m of deadMonsters) this.emit({ type: 'death', uid: m.uid });
      for (const m of deadMinions) {
        s.slots[m.lane] = null;
        this.emit({ type: 'death', uid: m.uid });
      }
      for (const m of deadMinions) (card(m.defId) as MinionCard).onDeath?.(this.api, m);
    }
  }

  private checkStageClear(): boolean {
    const s = this.state;
    if (s.phase === 'defeat' || s.phase === 'reward' || s.phase === 'victory') return true;
    const wavesLeft = this.stageDef.waves.slice(s.turn + (s.phase === 'enemy' ? 1 : 0)).some((w) => w.length > 0);
    if (s.monsters.length > 0 || s.pendingSpawns.length > 0 || wavesLeft) return false;
    s.stagesCleared++;
    this.emit({ type: 'stageClear', stage: s.stage });
    s.hero.health = Math.min(s.hero.maxHealth, s.hero.health + HEAL_BETWEEN_STAGES);
    if (s.stage >= STAGES.length - 1) {
      s.phase = 'victory';
      this.emit({ type: 'victory' });
    } else {
      s.phase = 'reward';
      s.rewards = rollRewards(this.rng, s.stagesCleared);
    }
    return true;
  }

  private draw(count: number) {
    const s = this.state;
    for (let i = 0; i < count; i++) {
      if (s.drawPile.length === 0 && s.discard.length > 0) {
        s.drawPile = this.rng.shuffle(s.discard);
        s.discard = [];
        this.emit({ type: 'reshuffle', count: s.drawPile.length });
      }
      const inst = s.drawPile.pop();
      if (!inst) return;
      if (s.hand.length >= MAX_HAND) {
        s.discard.push(inst);
        this.emit({ type: 'burn', card: inst });
      } else {
        s.hand.push(inst);
        this.emit({ type: 'draw', card: inst });
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  minions(): Minion[] {
    return this.state.slots.filter((m): m is Minion => m !== null);
  }

  unit(uid: number): Minion | Monster | undefined {
    return this.minions().find((m) => m.uid === uid) ?? this.state.monsters.find((m) => m.uid === uid);
  }

  monsterAt(lane: number, row: number): Monster | undefined {
    return this.state.monsters.find((m) => m.lane === lane && m.row === row && m.health > 0);
  }

  private emit(e: GameEvent) {
    this.events.push(e);
  }

  private collect(fn: () => void): GameEvent[] {
    this.events = [];
    fn();
    const out = this.events;
    this.events = [];
    return out;
  }

  private createApi(): EffectApi {
    return {
      rng: this.rng,
      monsters: () => this.state.monsters.filter((m) => m.health > 0),
      minions: () => this.minions().filter((m) => m.health > 0),
      monstersInLane: (lane) => this.state.monsters.filter((m) => m.lane === lane && m.health > 0),
      frontMonster: (lane) => this.state.monsters
        .filter((m) => m.lane === lane && m.health > 0)
        .sort((a, b) => a.row - b.row)[0],
      damage: (uid, amount) => this.damage(uid, amount, 'spell'),
      healHero: (amount) => {
        const hero = this.state.hero;
        const healed = Math.min(amount, hero.maxHealth - hero.health);
        hero.health += healed;
        if (healed > 0) this.emit({ type: 'heal', uid: 'hero', amount: healed });
      },
      draw: (count) => this.draw(count),
      buff: (uid, attack, health) => {
        const u = this.unit(uid);
        if (!u) return;
        u.attack += attack;
        u.health += health;
        u.maxHealth += health;
        this.emit({ type: 'buff', uid, attack, health });
      },
      freeze: (uid) => {
        const m = this.state.monsters.find((x) => x.uid === uid);
        if (!m || m.health <= 0) return;
        m.frozen = true;
        this.emit({ type: 'freeze', uid });
      },
      push: (uid, rows) => {
        const m = this.state.monsters.find((x) => x.uid === uid);
        if (!m || m.health <= 0) return;
        const from = m.row;
        let row = m.row;
        for (let i = 0; i < rows && row < SPAWN_ROW; i++) {
          if (this.monsterAt(m.lane, row + 1)) break;
          row++;
        }
        if (row !== from) {
          m.row = row;
          this.emit({ type: 'push', uid, lane: m.lane, from, to: row });
        }
      },
      summon: (defId, lane) => {
        if (lane >= 0 && lane < LANES) this.summonMinion(defId, lane);
      },
    };
  }
}

export function sameTarget(a: Target, b: Target): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'none': return true;
    case 'monster':
    case 'minion': return a.uid === (b as typeof a).uid;
    case 'lane':
    case 'slot': return a.lane === (b as typeof a).lane;
  }
}
