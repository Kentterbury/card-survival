import { aiTakeTurn } from './ai';
import { card, STARTER_DECK, type EffectApi, type MinionCard } from './cards';
import { rollRewards } from './rewards';
import { Rng } from './rng';
import { STAGES, type EnemyPower } from './stages';
import {
  forward, HERO_POWER_COST, homeRow, LANES, LAST_ROW, MAX_HAND, MAX_MANA, MAX_RESERVE, other, RANGED_RANGE,
  type CardInstance, type GameEvent, type HitTarget, type Phase, type RewardBundle, type Side, type SideState,
  type Target, type Unit,
} from './types';

export const HERO_MAX_HEALTH = 30;
export const HEAL_BETWEEN_STAGES = 10;
export const HERO_POWER_DAMAGE = 1;
export const PLAYER_HERO = { name: '수비대장', model: 'Knight' as const, scale: 1.3 };

export interface GameState {
  phase: Phase;
  stage: number;
  /** Player turn number within the stage. */
  turn: number;
  stagesCleared: number;
  /** The run's deck as card ids; grows with each reward. */
  deckList: string[];
  sides: Record<Side, SideState>;
  units: Unit[];
  rewards: RewardBundle[];
}

export class Game {
  readonly rng: Rng;
  state!: GameState;
  private nextUid = 1;
  private events: GameEvent[] = [];
  private readonly apis: Record<Side, EffectApi>;

  constructor(seed = Date.now()) {
    this.rng = new Rng(seed);
    this.apis = { player: this.createApi('player'), enemy: this.createApi('enemy') };
  }

  // ── Run / stage flow ─────────────────────────────────────────

  startRun(deck: string[] = STARTER_DECK): GameEvent[] {
    this.state = {
      phase: 'player', stage: 0, turn: 0, stagesCleared: 0,
      deckList: [...deck],
      sides: {
        player: this.emptySide({ ...PLAYER_HERO, health: HERO_MAX_HEALTH, maxHealth: HERO_MAX_HEALTH }),
        enemy: this.emptySide({ ...PLAYER_HERO, health: 1, maxHealth: 1 }),
      },
      units: [], rewards: [],
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

  get enemyPower(): EnemyPower {
    return this.stageDef.power;
  }

  /** True once the stage is decided (win, loss or reward screen). */
  get over(): boolean {
    const p = this.state.phase;
    return p === 'reward' || p === 'victory' || p === 'defeat';
  }

  side(side: Side): SideState {
    return this.state.sides[side];
  }

  private emptySide(hero: SideState['hero']): SideState {
    return { hero, mana: 0, maxMana: 0, reserve: 0, powerUsed: false, drawPile: [], hand: [], discard: [] };
  }

  private beginStage() {
    const s = this.state;
    const st = this.stageDef;
    const playerHero = s.sides.player.hero;
    s.sides.player = this.emptySide(playerHero);
    s.sides.enemy = this.emptySide({ ...st.hero, maxHealth: st.hero.health });
    s.sides.player.drawPile = this.makePile(s.deckList);
    s.sides.enemy.drawPile = this.makePile(st.deck);
    s.units = [];
    s.turn = 0;
    this.emit({ type: 'stageStart', stage: s.stage });
    this.draw('player', 3);
    this.draw('enemy', 3);
    this.beginTurn('player');
  }

  private makePile(ids: string[]): CardInstance[] {
    return this.rng.shuffle(ids.map((defId) => ({ iid: this.nextUid++, defId })));
  }

  private beginTurn(side: Side) {
    const s = this.state;
    const me = s.sides[side];
    s.phase = side;
    if (side === 'player') s.turn++;
    me.maxMana = Math.min(MAX_MANA, me.maxMana + 1);
    me.mana = me.maxMana + me.reserve;
    me.reserve = 0;
    me.powerUsed = false;
    for (const u of s.units) if (u.side === side) u.fresh = false;
    this.emit({ type: 'turnStart', side, turn: s.turn });
    this.draw(side, 1);
  }

  /** Ends the player's turn and plays out the whole enemy turn. */
  endTurn(): GameEvent[] {
    if (this.state.phase !== 'player') return [];
    return this.collect(() => {
      this.finishTurn('player');
      if (this.over) return;
      this.emit({ type: 'enemyTurn' });
      this.beginTurn('enemy');
      aiTakeTurn(this, 'enemy');
      if (this.over) return;
      this.finishTurn('enemy');
      if (this.over) return;
      this.beginTurn('player');
    });
  }

  private finishTurn(side: Side) {
    const me = this.side(side);
    me.reserve = Math.min(MAX_RESERVE, me.mana);
    for (const u of this.unitsOf(side)) {
      const def = card(u.defId) as MinionCard;
      if (def.onEndTurn && u.health > 0) def.onEndTurn(this.apis[side], u);
      this.resolveDeaths();
      if (this.checkOutcome()) return;
    }
    this.unitPhase(side);
  }

  // ── Cards & hero powers (both sides) ─────────────────────────

  canPlay(handIndex: number): boolean {
    return this.canPlayAs('player', handIndex);
  }

  cardTargets(handIndex: number): Target[] {
    return this.targetsFor('player', handIndex);
  }

  playCard(handIndex: number, target: Target = { kind: 'none' }): GameEvent[] {
    return this.collect(() => this.playCardAs('player', handIndex, target));
  }

  canPlayAs(side: Side, handIndex: number): boolean {
    const me = this.side(side);
    const inst = me.hand[handIndex];
    return this.state.phase === side && !!inst && card(inst.defId).cost <= me.mana && this.targetsFor(side, handIndex).length > 0;
  }

  /** Every legal target for a card in `side`'s hand (`{kind:'none'}` for untargeted cards). */
  targetsFor(side: Side, handIndex: number): Target[] {
    const inst = this.side(side).hand[handIndex];
    if (!inst) return [];
    const def = card(inst.defId);
    const kind = def.type === 'minion' ? 'slot' : def.target;
    return this.targetsOfKind(side, kind);
  }

  private targetsOfKind(side: Side, kind: string): Target[] {
    const foeUnits = (): Target[] => this.unitsOf(other(side)).map((u) => ({ kind: 'unit' as const, uid: u.uid }));
    switch (kind) {
      case 'none': return [{ kind: 'none' }];
      case 'foe': return [...foeUnits(), { kind: 'hero', side: other(side) }];
      case 'foeUnit': return foeUnits();
      case 'ally': return this.unitsOf(side).map((u) => ({ kind: 'unit' as const, uid: u.uid }));
      case 'lane': return Array.from({ length: LANES }, (_, lane) => ({ kind: 'lane' as const, lane }));
      case 'slot': return this.freeHomeLanes(side).map((lane) => ({ kind: 'slot' as const, lane }));
      default: return [];
    }
  }

  /** Plays a card for either side. Returns false if the play was illegal. */
  playCardAs(side: Side, handIndex: number, target: Target): boolean {
    if (!this.canPlayAs(side, handIndex)) return false;
    if (!this.targetsFor(side, handIndex).some((t) => sameTarget(t, target))) return false;
    const me = this.side(side);
    const [inst] = me.hand.splice(handIndex, 1);
    const def = card(inst.defId);
    me.mana -= def.cost;
    me.discard.push(inst);
    this.emit({ type: 'cardPlayed', side, card: inst, target });
    if (def.type === 'minion') {
      if (target.kind === 'slot') this.summonUnit(side, def.id, target.lane);
    } else {
      this.emit({ type: 'spell', side, defId: def.id, target });
      def.cast(this.apis[side], target);
    }
    this.resolveDeaths();
    this.checkOutcome();
    return true;
  }

  heroPowerTargets(side: Side = 'player'): Target[] {
    const me = this.side(side);
    if (this.state.phase !== side || me.powerUsed || me.mana < HERO_POWER_COST) return [];
    const kind = side === 'enemy' && this.enemyPower === 'summon' ? 'slot' : 'foe';
    return this.targetsOfKind(side, kind);
  }

  canUseHeroPower(): boolean {
    return this.heroPowerTargets('player').length > 0;
  }

  heroPower(target: Target): GameEvent[] {
    return this.collect(() => this.heroPowerAs('player', target));
  }

  heroPowerAs(side: Side, target: Target): boolean {
    if (!this.heroPowerTargets(side).some((t) => sameTarget(t, target))) return false;
    const me = this.side(side);
    me.mana -= HERO_POWER_COST;
    me.powerUsed = true;
    this.emit({ type: 'heroPower', side, target });
    if (target.kind === 'slot') this.summonUnit(side, 'sk_minion', target.lane);
    else this.damage(target, HERO_POWER_DAMAGE);
    this.resolveDeaths();
    this.checkOutcome();
    return true;
  }

  // ── Unit phase: every unit of a side advances or strikes ─────

  private unitPhase(side: Side) {
    const dir = forward(side);
    const order = this.unitsOf(side).sort((a, b) => (b.row - a.row) * dir || a.lane - b.lane);
    for (const u of order) {
      if (u.health <= 0) continue;
      if (u.frozen) {
        u.frozen = false;
        continue;
      }
      if (u.fresh && !u.keywords.has('swift')) continue;
      if (u.attack <= 0) continue;
      const target = this.targetAhead(u);
      if (target) this.strike(u, target.hit, target.dist);
      else this.advance(u);
      this.resolveDeaths();
      if (this.checkOutcome()) return;
    }
  }

  /** First foe within range straight ahead in the unit's lane; past the last row is the foe hero. */
  targetAhead(u: Unit): { hit: Unit | Side; dist: number } | null {
    const dir = forward(u.side);
    for (let d = 1; d <= u.range; d++) {
      const r = u.row + d * dir;
      if (r < 0 || r > LAST_ROW) return { hit: other(u.side), dist: d };
      const occ = this.unitAt(u.lane, r);
      if (occ && occ.side !== u.side) return { hit: occ, dist: d };
      // Melee units cannot reach past an ally; ranged units shoot over them.
      if (occ && u.range === 1) return null;
    }
    return null;
  }

  private strike(u: Unit, hit: Unit | Side, dist: number) {
    const ranged = dist > 1;
    const target: HitTarget = typeof hit === 'string' ? hit : hit.uid;
    this.emit({ type: 'attack', attacker: u.uid, target, ranged });
    if (typeof hit === 'string') {
      this.damageHero(hit, u.attack);
      return;
    }
    this.damageUnit(hit, u.attack);
    if (!ranged && hit.attack > 0) this.damageUnit(u, hit.attack);
  }

  private advance(u: Unit) {
    const dir = forward(u.side);
    const from = u.row;
    for (let step = 0; step < u.speed; step++) {
      const next = u.row + dir;
      if (next < 0 || next > LAST_ROW || this.unitAt(u.lane, next)) break;
      u.row = next;
    }
    if (u.row !== from) this.emit({ type: 'move', uid: u.uid, lane: u.lane, from, to: u.row });
  }

  // ── Shared mechanics ─────────────────────────────────────────

  private summonUnit(side: Side, defId: string, lane: number) {
    const row = homeRow(side);
    if (lane < 0 || lane >= LANES || this.unitAt(lane, row)) return;
    const def = card(defId) as MinionCard;
    const keywords = new Set(def.keywords ?? []);
    const u: Unit = {
      uid: this.nextUid++, defId, side, name: def.name, model: def.model,
      attack: def.attack, health: def.health, maxHealth: def.health, keywords, scale: def.scale ?? 1,
      lane, row, speed: def.speed ?? (def.attack > 0 ? 1 : 0), range: keywords.has('ranged') ? RANGED_RANGE : 1,
      frozen: false, fresh: true,
    };
    this.state.units.push(u);
    this.emit({ type: 'summon', uid: u.uid, side, lane, row, defId });
    def.onSummon?.(this.apis[side], u);
  }

  private damage(target: Target, amount: number) {
    if (target.kind === 'hero') this.damageHero(target.side, amount);
    else if (target.kind === 'unit') {
      const u = this.unit(target.uid);
      if (u) this.damageUnit(u, amount);
    }
  }

  private damageUnit(u: Unit, amount: number) {
    if (amount <= 0 || u.health <= 0) return;
    if (u.keywords.has('ward')) {
      u.keywords.delete('ward');
      this.emit({ type: 'wardBroken', uid: u.uid });
      return;
    }
    u.health -= amount;
    this.emit({ type: 'damage', target: u.uid, amount });
  }

  private damageHero(side: Side, amount: number) {
    if (amount <= 0) return;
    const hero = this.side(side).hero;
    hero.health = Math.max(0, hero.health - amount);
    this.emit({ type: 'damage', target: side, amount });
  }

  private resolveDeaths() {
    const s = this.state;
    for (;;) {
      const dead = s.units.filter((u) => u.health <= 0);
      if (dead.length === 0) return;
      s.units = s.units.filter((u) => u.health > 0);
      for (const u of dead) this.emit({ type: 'death', uid: u.uid });
      for (const u of dead) (card(u.defId) as MinionCard).onDeath?.(this.apis[u.side], u);
    }
  }

  /** Ends the stage if a hero has fallen. Returns true when the stage is over. */
  private checkOutcome(): boolean {
    const s = this.state;
    if (this.over) return true;
    if (s.sides.enemy.hero.health <= 0) {
      s.stagesCleared++;
      this.emit({ type: 'stageClear', stage: s.stage });
      const hero = s.sides.player.hero;
      hero.health = Math.min(hero.maxHealth, hero.health + HEAL_BETWEEN_STAGES);
      if (s.stage >= STAGES.length - 1) {
        s.phase = 'victory';
        this.emit({ type: 'victory' });
      } else {
        s.phase = 'reward';
        s.rewards = rollRewards(this.rng, s.stagesCleared);
      }
      return true;
    }
    if (s.sides.player.hero.health <= 0) {
      s.phase = 'defeat';
      this.emit({ type: 'defeat' });
      return true;
    }
    return false;
  }

  private draw(side: Side, count: number) {
    const me = this.side(side);
    for (let i = 0; i < count; i++) {
      if (me.drawPile.length === 0 && me.discard.length > 0) {
        me.drawPile = this.rng.shuffle(me.discard);
        me.discard = [];
        this.emit({ type: 'reshuffle', side, count: me.drawPile.length });
      }
      const inst = me.drawPile.pop();
      if (!inst) return;
      if (me.hand.length >= MAX_HAND) {
        me.discard.push(inst);
        this.emit({ type: 'burn', side, card: inst });
      } else {
        me.hand.push(inst);
        this.emit({ type: 'draw', side, card: inst });
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  unitsOf(side: Side): Unit[] {
    return this.state.units.filter((u) => u.side === side && u.health > 0);
  }

  unit(uid: number): Unit | undefined {
    return this.state.units.find((u) => u.uid === uid);
  }

  unitAt(lane: number, row: number): Unit | undefined {
    return this.state.units.find((u) => u.lane === lane && u.row === row && u.health > 0);
  }

  freeHomeLanes(side: Side): number[] {
    const row = homeRow(side);
    return [...Array(LANES).keys()].filter((l) => !this.unitAt(l, row));
  }

  private shove(uid: number, rows: number, dir: number) {
    const u = this.unit(uid);
    if (!u || u.health <= 0) return;
    const from = u.row;
    for (let i = 0; i < rows; i++) {
      const next = u.row + dir;
      if (next < 0 || next > LAST_ROW || this.unitAt(u.lane, next)) break;
      u.row = next;
    }
    if (u.row !== from) this.emit({ type: 'push', uid, lane: u.lane, from, to: u.row });
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

  private createApi(side: Side): EffectApi {
    const foeSide = other(side);
    const dir = forward(side);
    return {
      rng: this.rng,
      side,
      foes: () => this.unitsOf(foeSide),
      allies: () => this.unitsOf(side),
      // Ordered from the caster's side outward.
      foesInLane: (lane) => this.unitsOf(foeSide).filter((u) => u.lane === lane).sort((a, b) => (a.row - b.row) * dir),
      frontFoe: (lane) => this.unitsOf(foeSide).filter((u) => u.lane === lane).sort((a, b) => (a.row - b.row) * dir)[0],
      damage: (target, amount) => this.damage(target, amount),
      damageFoeHero: (amount) => this.damageHero(foeSide, amount),
      healHero: (amount) => {
        const hero = this.side(side).hero;
        const healed = Math.min(amount, hero.maxHealth - hero.health);
        hero.health += healed;
        if (healed > 0) this.emit({ type: 'heal', target: side, amount: healed });
      },
      healUnit: (uid, amount) => {
        const u = this.unit(uid);
        if (!u || u.health <= 0) return;
        const healed = Math.min(amount, u.maxHealth - u.health);
        u.health += healed;
        if (healed > 0) this.emit({ type: 'heal', target: uid, amount: healed });
      },
      grantWard: (uid) => {
        const u = this.unit(uid);
        if (!u || u.health <= 0 || u.keywords.has('ward')) return;
        u.keywords.add('ward');
        this.emit({ type: 'wardGained', uid });
      },
      gainMana: (amount) => {
        this.side(side).mana += amount;
      },
      draw: (count) => this.draw(side, count),
      buff: (uid, attack, health) => {
        const u = this.unit(uid);
        if (!u || u.health <= 0) return;
        u.attack += attack;
        u.health += health;
        u.maxHealth += health;
        this.emit({ type: 'buff', uid, attack, health });
      },
      freeze: (uid) => {
        const u = this.unit(uid);
        if (!u || u.health <= 0) return;
        u.frozen = true;
        this.emit({ type: 'freeze', uid });
      },
      // Both move a unit in the caster's forward direction: foes get pushed back, allies advance.
      push: (uid, rows) => this.shove(uid, rows, dir),
      advance: (uid, rows) => this.shove(uid, rows, dir),
      summon: (defId, lane) => this.summonUnit(side, defId, lane),
      freeHomeLanes: () => this.freeHomeLanes(side),
    };
  }
}

export function sameTarget(a: Target, b: Target): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'none': return true;
    case 'unit': return a.uid === (b as typeof a).uid;
    case 'hero': return a.side === (b as typeof a).side;
    case 'lane':
    case 'slot': return a.lane === (b as typeof a).lane;
  }
}
