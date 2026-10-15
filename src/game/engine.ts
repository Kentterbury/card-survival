import { aiTakeTurn } from './ai';
import { heroDef, POWERS, type HeroPower } from './heroes';
import { card, CARDS, type EffectApi, type MinionCard } from './cards';
import { rollRewards } from './rewards';
import { HEAL_AMOUNT, HEAL_PRICE, REMOVE_PRICE, rollShop, stageGold, type ShopState } from './shop';
import { Rng } from './rng';
import { STAGES, type EnemyPower } from './stages';
import {
  FORMATION_BONUS, forward, homeRow, isStructure, LANES, LAST_ROW, MANA_PER_TURN, MAX_HAND, MAX_MANA, other, RANGED_RANGE,
  THORNS_DAMAGE, VANGUARD_BONUS,
  type CardInstance, type GameEvent, type HitTarget, type Keyword, type PendingChoice, type Phase, type RewardBundle, type Side, type SideState,
  type Target, type Unit,
} from './types';

/** Rounds a soaked cell stays wet. */
export const WET_TURNS = 3;
/** Extra damage a unit standing on a wet cell takes from every hit. */
export const WET_BONUS = 1;
/** Keywords an illusion does not copy: it has no real body to shield, heal or hit back with. */
const ILLUSION_DROPS: Keyword[] = ['ward', 'undying', 'regenerate', 'thorns', 'enrage', 'lifesteal', 'cleave', 'pierce', 'knockback'];

export const HERO_MAX_HEALTH = 30;
/** Health restored by resting at the camp between stages. */
export const CAMP_HEAL = 12;

/** Where a saved run resumes: the start of `stage`, with this deck and health. */
export interface RunSave {
  hero: string;
  deck: string[];
  stage: number;
  stagesCleared: number;
  health: number;
  /** Missing in saves from before gold existed. */
  gold?: number;
}

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
  /** Set while a 탐색 pick is waiting for an answer. */
  choice: PendingChoice | null;
  /** The player's hero (see heroes.ts). */
  heroId: string;
  /** Earned by clearing stages, spent at the merchant. */
  gold: number;
  /** The merchant's stock while at the camp. */
  shop: ShopState | null;
  /** 젖은 칸: left by a broken or melted 빙벽; units there take +1 from every hit. */
  wet: { lane: number; row: number; turns: number }[];
}

export class Game {
  readonly rng: Rng;
  state!: GameState;
  private nextUid = 1;
  private events: GameEvent[] = [];
  /** 주문 강화 bonus added to every hit of the spell being cast. */
  private spellBonus = 0;
  private readonly apis: Record<Side, EffectApi>;

  constructor(seed = Date.now()) {
    this.rng = new Rng(seed);
    this.apis = { player: this.createApi('player'), enemy: this.createApi('enemy') };
  }

  // ── Run / stage flow ─────────────────────────────────────────

  /**
   * Starts a run. `deck` overrides the hero's starter deck (tests); `resume`
   * continues a saved run at the start of its stage.
   */
  startRun(deck?: string[], heroId = 'captain', resume?: RunSave): GameEvent[] {
    const hero = heroDef(resume?.hero ?? heroId);
    const maxHealth = hero.health;
    this.state = {
      phase: 'player', stage: resume?.stage ?? 0, turn: 0, stagesCleared: resume?.stagesCleared ?? 0,
      deckList: [...(resume?.deck ?? deck ?? hero.deck)],
      heroId: hero.id,
      gold: resume?.gold ?? 0,
      shop: null,
      sides: {
        player: this.emptySide({ name: hero.name, model: hero.model, scale: 1.3, health: resume?.health ?? maxHealth, maxHealth }),
        enemy: this.emptySide({ name: '', model: 'Skeleton_Minion', scale: 1, health: 1, maxHealth: 1 }),
      },
      units: [], rewards: [], choice: null, wet: [],
    };
    return this.collect(() => this.beginStage());
  }

  /** Snapshot for saving: resumes at the start of the next (or current) stage. */
  saveData(): RunSave {
    const s = this.state;
    // At the camp the reward is already in the deck, so resume at the next stage.
    const stage = s.phase === 'camp' ? s.stage + 1 : s.stage;
    return { hero: s.heroId, deck: [...s.deckList], stage, stagesCleared: s.stagesCleared, health: s.sides.player.hero.health, gold: s.gold };
  }

  /** The 지휘술 a side uses. */
  powerOf(side: Side): HeroPower {
    return side === 'player' ? POWERS[heroDef(this.state.heroId).power] : POWERS[this.stageDef.power];
  }

  chooseReward(index: number): GameEvent[] {
    const s = this.state;
    if (s.phase !== 'reward') return [];
    const bundle = s.rewards[index];
    if (!bundle) return [];
    s.deckList.push(...bundle.cards);
    s.rewards = [];
    s.phase = 'camp';
    s.shop = rollShop(this.rng, s.heroId);
    return [];
  }

  /** Merchant: buy an offered card into the deck. */
  shopBuy(index: number): boolean {
    const s = this.state;
    const offer = s.shop?.offers[index];
    if (s.phase !== 'camp' || !offer || offer.sold || s.gold < offer.price) return false;
    s.gold -= offer.price;
    offer.sold = true;
    s.deckList.push(offer.defId);
    return true;
  }

  /** Merchant: remove a card from the deck (once per visit). */
  shopRemove(deckIndex: number): boolean {
    const s = this.state;
    if (s.phase !== 'camp' || !s.shop || s.shop.removed || s.gold < REMOVE_PRICE) return false;
    if (!s.deckList[deckIndex] || s.deckList.length <= 5) return false;
    s.gold -= REMOVE_PRICE;
    s.shop.removed = true;
    s.deckList.splice(deckIndex, 1);
    return true;
  }

  /** Merchant: buy a healing draught (once per visit). */
  shopHeal(): boolean {
    const s = this.state;
    const hero = s.sides.player.hero;
    if (s.phase !== 'camp' || !s.shop || s.shop.healed || s.gold < HEAL_PRICE || hero.health >= hero.maxHealth) return false;
    s.gold -= HEAL_PRICE;
    s.shop.healed = true;
    hero.health = Math.min(hero.maxHealth, hero.health + HEAL_AMOUNT);
    return true;
  }

  /** Camp option: rest and recover health, then move on. */
  campRest(): GameEvent[] {
    const s = this.state;
    if (s.phase !== 'camp') return [];
    const hero = s.sides.player.hero;
    hero.health = Math.min(hero.maxHealth, hero.health + CAMP_HEAL);
    return this.leaveCamp();
  }

  /** Camp option: remove one card from the deck, then move on. */
  campRemove(deckIndex: number): GameEvent[] {
    const s = this.state;
    if (s.phase !== 'camp' || !s.deckList[deckIndex] || s.deckList.length <= 5) return [];
    s.deckList.splice(deckIndex, 1);
    return this.leaveCamp();
  }

  private leaveCamp(): GameEvent[] {
    this.state.shop = null;
    this.state.stage++;
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
    return p === 'reward' || p === 'camp' || p === 'victory' || p === 'defeat';
  }

  side(side: Side): SideState {
    return this.state.sides[side];
  }

  private emptySide(hero: SideState['hero']): SideState {
    return { hero, mana: 0, maxMana: 0, powerUsed: false, skipDraw: false, empower: 0, drawPile: [], hand: [], discard: [] };
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
    s.wet = [];
    s.turn = 0;
    s.choice = null;
    // Hero armor does not carry over between stages.
    s.sides.player.hero.armor = 0;
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
    const first = side === 'player' ? heroDef(s.heroId).startMana : this.stageDef.startMana;
    me.maxMana = me.maxMana === 0 ? first : Math.min(MAX_MANA, me.maxMana + MANA_PER_TURN);
    // Mana refills to the maximum; whatever was left last turn is gone.
    me.mana = me.maxMana;
    me.powerUsed = false;
    for (const u of s.units) if (u.side === side) u.fresh = false;
    this.emit({ type: 'turnStart', side, turn: s.turn });
    // Structures with a lifetime (빙벽) melt after that many of their owner's turns.
    for (const u of this.unitsOf(side)) {
      if (u.lifetime === undefined) continue;
      u.lifetime--;
      if (u.lifetime <= 0) u.health = 0;
    }
    this.resolveDeaths();
    // Wet cells dry out over whole rounds.
    if (side === 'player') {
      for (const w of s.wet) w.turns--;
      for (const w of s.wet.filter((x) => x.turns <= 0)) this.emit({ type: 'wet', lane: w.lane, row: w.row, on: false });
      s.wet = s.wet.filter((x) => x.turns > 0);
    }
    for (const u of this.unitsOf(side)) {
      if (u.keywords.has('regenerate') && u.health < u.maxHealth) this.healUnit(u, u.maxHealth - u.health);
    }
    if (me.skipDraw) {
      me.skipDraw = false;
      this.emit({ type: 'notice', side, text: '드로우 봉쇄!' });
    } else {
      this.draw(side, 1);
    }
  }

  /** Ends the player's turn and plays out the whole enemy turn. */
  endTurn(): GameEvent[] {
    if (this.state.phase !== 'player' || this.state.choice) return [];
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
    // 봉인 lasts through one of the owner's turns.
    for (const c of me.hand) c.locked = false;
    // 주문 강화 only lasts for the turn it was cast in.
    if (me.empower > 0) {
      me.empower = 0;
      this.emit({ type: 'empower', side, amount: 0 });
    }
    for (const u of this.unitsOf(side)) {
      const def = card(u.defId) as MinionCard;
      if (def.onEndTurn && u.health > 0 && !u.keywords.has('illusion')) def.onEndTurn(this.apis[side], u);
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
    return this.state.phase === side && !this.state.choice && !!inst && !inst.locked
      && this.costOf(inst) <= me.mana && this.targetsFor(side, handIndex).length > 0;
  }

  /** Extra mana a card costs for a given target (염력: the moved unit's health). */
  targetCost(defId: string, target: Target): number {
    const def = card(defId);
    if (def.type !== 'spell' || !def.xCost || target.kind !== 'unitTo') return 0;
    return this.unit(target.uid)?.health ?? 0;
  }

  /** Current cost of a card instance, after any cost changes. */
  costOf(inst: CardInstance): number {
    return Math.max(0, card(inst.defId).cost + (inst.costMod ?? 0));
  }

  /** Resolves a pending 탐색 pick for the player. */
  chooseOption(index: number): GameEvent[] {
    return this.collect(() => this.resolveChoice(index));
  }

  resolveChoice(index: number) {
    const c = this.state.choice;
    if (!c || !c.options[index]) return;
    this.state.choice = null;
    this.addToHand(c.side, { iid: this.nextUid++, defId: c.options[index], costMod: c.costMod || undefined }, 'choice');
  }

  /** Every legal target for a card in `side`'s hand (`{kind:'none'}` for untargeted cards). */
  targetsFor(side: Side, handIndex: number): Target[] {
    const inst = this.side(side).hand[handIndex];
    if (!inst) return [];
    const def = card(inst.defId);
    const kind = def.type === 'minion' ? 'slot' : def.target;
    const targets = this.targetsOfKind(side, kind);
    // X-cost cards: only targets we can pay for.
    const left = this.side(side).mana - this.costOf(inst);
    return def.type === 'spell' && def.xCost ? targets.filter((t) => this.targetCost(def.id, t) <= left) : targets;
  }

  private targetsOfKind(side: Side, kind: string): Target[] {
    // Foes guarded by an 엄호 unit in their lane cannot be picked by targeted cards.
    const foeUnits = (): Target[] => this.unitsOf(other(side))
      .filter((u) => !this.coverFor(u))
      .map((u) => ({ kind: 'unit' as const, uid: u.uid }));
    switch (kind) {
      case 'none': return [{ kind: 'none' }];
      case 'foe': return [...foeUnits(), { kind: 'hero', side: other(side) }];
      case 'foeUnit': return foeUnits();
      case 'ally': return this.unitsOf(side).map((u) => ({ kind: 'unit' as const, uid: u.uid }));
      case 'lane': return Array.from({ length: LANES }, (_, lane) => ({ kind: 'lane' as const, lane }));
      case 'slot': return this.freeHomeLanes(side).map((lane) => ({ kind: 'slot' as const, lane }));
      case 'wallCell': {
        const out: Target[] = [];
        for (let row = 0; row <= LAST_ROW; row++) {
          for (let lane = 0; lane < LANES - 1; lane++) {
            if (!this.unitAt(lane, row) && !this.unitAt(lane + 1, row)) out.push({ kind: 'cell', lane, row });
          }
        }
        return out;
      }
      case 'anyUnit': return [...foeUnits(), ...this.unitsOf(side).map((u) => ({ kind: 'unit' as const, uid: u.uid }))];
      case 'allySlot': {
        const lanes = this.freeHomeLanes(side);
        const row = homeRow(side);
        return this.unitsOf(side)
          .filter((u) => !isStructure(u.model) && !u.keywords.has('illusion'))
          .flatMap((u) => lanes.map((lane) => ({ kind: 'unitTo' as const, uid: u.uid, lane, row })));
      }
      case 'move': {
        const out: Target[] = [];
        const units = [...this.unitsOf(other(side)).filter((u) => !this.coverFor(u)), ...this.unitsOf(side)];
        for (const u of units) {
          // Back (toward the unit's own side) or sideways.
          for (const [lane, row] of [[u.lane, u.row - forward(u.side)], [u.lane - 1, u.row], [u.lane + 1, u.row]]) {
            if (lane >= 0 && lane < LANES && row >= 0 && row <= LAST_ROW) out.push({ kind: 'unitTo', uid: u.uid, lane, row });
          }
        }
        return out;
      }
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
    me.mana -= this.costOf(inst) + this.targetCost(def.id, target);
    this.emit({ type: 'cardPlayed', side, card: inst, target });
    if (def.type === 'minion') {
      if (target.kind === 'slot') this.summonUnit(side, def.id, target.lane);
    } else {
      // 주문 강화 is spent by the next spell, whatever it is.
      const bonus = me.empower;
      if (bonus > 0) {
        me.empower = 0;
        this.emit({ type: 'empower', side, amount: 0 });
      }
      this.emit({ type: 'spell', side, defId: def.id, target });
      this.spellBonus = bonus;
      def.cast(this.apis[side], target);
      this.spellBonus = 0;
    }
    // Into the discard pile only after resolving, so a card cannot draw or recycle itself.
    me.discard.push({ iid: inst.iid, defId: inst.defId });
    this.resolveDeaths();
    this.checkOutcome();
    return true;
  }

  heroPowerTargets(side: Side = 'player'): Target[] {
    const me = this.side(side);
    if (this.state.phase !== side || this.state.choice || me.powerUsed || me.mana < this.powerOf(side).cost) return [];
    return this.targetsOfKind(side, this.powerOf(side).target);
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
    me.mana -= this.powerOf(side).cost;
    me.powerUsed = true;
    this.emit({ type: 'heroPower', side, target });
    this.powerOf(side).cast(this.apis[side], target);
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
        u.frozenTurns = (u.frozenTurns ?? 1) - 1;
        if (u.frozenTurns <= 0) {
          u.frozen = false;
          u.frozenTurns = undefined;
        }
        continue;
      }
      if (u.fresh && !u.keywords.has('swift')) continue;
      if (u.attack <= 0) continue;
      const target = this.targetAhead(u);
      if (target) {
        const victim = typeof target.hit === 'string' ? null : target.hit;
        const cell = victim ? { lane: victim.lane, row: victim.row } : null;
        this.strike(u, target.hit, target.dist);
        this.resolveDeaths();
        if (this.checkOutcome()) return;
        // 돌파: a melee kill lets the attacker step into the cell it cleared,
        // so a stream of cheap blockers cannot stall a lane forever.
        if (cell && victim!.health <= 0 && target.dist === 1 && u.health > 0 && u.speed > 0 && !this.unitAt(cell.lane, cell.row)) {
          const from = u.row;
          u.row = cell.row;
          this.emit({ type: 'move', uid: u.uid, lane: u.lane, from, to: u.row });
        }
      } else {
        this.advance(u);
      }
      this.resolveDeaths();
      if (this.checkOutcome()) return;
    }
  }

  /** First foe within range straight ahead in the unit's lane; past the last row is the foe hero. */
  targetAhead(u: Unit): { hit: Unit | Side; dist: number } | null {
    const dir = forward(u.side);
    const flying = u.keywords.has('flying');
    for (let d = 1; d <= u.range; d++) {
      const r = u.row + d * dir;
      if (r < 0 || r > LAST_ROW) return { hit: other(u.side), dist: d };
      // Flyers ignore units and only go for the hero.
      if (flying) continue;
      const occ = this.unitAt(u.lane, r);
      if (occ && occ.side !== u.side) {
        // Melee units cannot reach a flyer; only ranged attacks and spells can.
        if (occ.keywords.has('flying') && u.range === 1) return null;
        // A shot at range is taken by an 엄호 unit in that lane, if it is within reach.
        const cover = d > 1 ? this.coverFor(occ) : undefined;
        if (cover) {
          const cd = Math.abs(cover.row - u.row);
          if ((cover.row - u.row) * dir > 0 && cd <= u.range) return { hit: cover, dist: cd };
        }
        return { hit: occ, dist: d };
      }
      // Melee units cannot reach past an ally; ranged units shoot over them.
      if (occ && u.range === 1) return null;
    }
    return null;
  }

  /** Attack including situational bonuses (대열). */
  attackOf(u: Unit): number {
    let atk = u.attack;
    if (u.keywords.has('formation')) {
      const beside = [u.lane - 1, u.lane + 1].some((l) => {
        const n = this.unitAt(l, u.row);
        return n && n.side === u.side;
      });
      if (beside) atk += FORMATION_BONUS;
    }
    if (u.keywords.has('vanguard')) {
      const progress = (x: Unit) => (x.side === 'player' ? x.row : LAST_ROW - x.row);
      if (this.unitsOf(u.side).every((x) => progress(x) <= progress(u))) atk += VANGUARD_BONUS;
    }
    return atk;
  }

  /** Another living 엄호 unit guarding `u`'s lane, if any. */
  coverFor(u: Unit): Unit | undefined {
    return this.unitsOf(u.side).find((c) => c !== u && c.lane === u.lane && c.keywords.has('cover'));
  }

  private strike(u: Unit, hit: Unit | Side, dist: number) {
    const ranged = dist > 1;
    const dir = forward(u.side);
    // An illusion swings like the real thing but its blows do nothing.
    const atk = u.keywords.has('illusion') ? 0 : this.attackOf(u);
    const target: HitTarget = typeof hit === 'string' ? hit : hit.uid;
    this.emit({ type: 'attack', attacker: u.uid, target, ranged });
    let dealt = 0;
    if (typeof hit === 'string') {
      dealt += this.damageHero(hit, atk);
    } else {
      dealt += this.damageUnit(hit, atk);
      if (u.keywords.has('cleave')) {
        for (const l of [hit.lane - 1, hit.lane + 1]) {
          const n = this.unitAt(l, hit.row);
          if (n && n.side !== u.side) dealt += this.damageUnit(n, atk);
        }
      }
      if (!ranged && hit.keywords.has('thorns')) this.damageUnit(u, THORNS_DAMAGE);
      if (u.keywords.has('pierce')) {
        // The cell behind the target; past the last row that is the foe hero.
        const r = hit.row + dir;
        if (r < 0 || r > LAST_ROW) dealt += this.damageHero(other(u.side), atk);
        else {
          const behind = this.unitAt(u.lane, r);
          if (behind && behind.side !== u.side) dealt += this.damageUnit(behind, atk);
        }
      }
      // Melee blows are simultaneous: the target strikes back even if this kills it
      // (unless it is frozen solid, or only an illusion).
      if (!ranged && hit.attack > 0 && !hit.frozen && !hit.keywords.has('illusion')) {
        const back = this.damageUnit(u, this.attackOf(hit));
        if (back > 0 && hit.keywords.has('lifesteal')) this.healHero(hit.side, back);
      }
      if (u.keywords.has('knockback') && hit.health > 0) this.shove(hit.uid, 1, dir);
    }
    if (dealt > 0 && u.keywords.has('lifesteal')) this.healHero(u.side, dealt);
  }

  private advance(u: Unit) {
    const dir = forward(u.side);
    const from = u.row;
    for (let step = 0; step < u.speed; step++) {
      let next = u.row + dir;
      // Flyers pass over anything in the way and land on the next free cell.
      if (u.keywords.has('flying')) while (next >= 0 && next <= LAST_ROW && this.unitAt(u.lane, next)) next += dir;
      if (next < 0 || next > LAST_ROW || this.unitAt(u.lane, next)) break;
      u.row = next;
    }
    if (u.row !== from) this.emit({ type: 'move', uid: u.uid, lane: u.lane, from, to: u.row });
  }

  // ── Shared mechanics ─────────────────────────────────────────

  private summonUnit(side: Side, defId: string, lane: number, row = homeRow(side)): Unit | undefined {
    if (lane < 0 || lane >= LANES || row < 0 || row > LAST_ROW || this.unitAt(lane, row)) return undefined;
    const def = card(defId) as MinionCard;
    const keywords = new Set(def.keywords ?? []);
    const u: Unit = {
      uid: this.nextUid++, defId, side, name: def.name, model: def.model,
      attack: def.attack, health: def.health, maxHealth: def.health, keywords, scale: def.scale ?? 1,
      lane, row, speed: unitSpeed(def.attack, keywords), range: keywords.has('ranged') ? RANGED_RANGE : 1,
      frozen: false, fresh: true,
    };
    this.state.units.push(u);
    this.emit({ type: 'summon', uid: u.uid, side, lane, row, defId });
    def.onSummon?.(this.apis[side], u);
    return u;
  }

  /** 환영: a copy of an ally on an empty cell; it hits for nothing and dies to any damage. */
  private summonIllusion(side: Side, of: Unit, lane: number) {
    const row = homeRow(side);
    if (this.unitAt(lane, row)) return;
    const keywords = new Set([...of.keywords].filter((k) => !ILLUSION_DROPS.includes(k)));
    keywords.add('illusion');
    const u: Unit = {
      ...of, uid: this.nextUid++, keywords, lane, row, frozen: false, frozenTurns: undefined, lifetime: undefined, fresh: true,
      speed: unitSpeed(of.attack, keywords),
    };
    this.state.units.push(u);
    this.emit({ type: 'summon', uid: u.uid, side, lane, row, defId: u.defId });
  }

  /** 염력: move a unit to a neighbouring cell; into an occupied one, both take half its health (충돌). */
  private telekinesis(uid: number, lane: number, row: number) {
    const u = this.unit(uid);
    if (!u || u.health <= 0) return;
    const there = this.unitAt(lane, row);
    if (!there) {
      u.lane = lane;
      u.row = row;
      this.emit({ type: 'shift', uid, lane, row });
      return;
    }
    const hit = Math.ceil(u.health / 2);
    this.emit({ type: 'collide', uid, into: there.uid });
    this.damageUnit(u, hit);
    this.damageUnit(there, hit);
  }

  private isWet(lane: number, row: number) {
    return this.state.wet.some((w) => w.lane === lane && w.row === row);
  }

  private soak(lane: number, row: number) {
    const w = this.state.wet.find((x) => x.lane === lane && x.row === row);
    if (w) w.turns = WET_TURNS;
    else {
      this.state.wet.push({ lane, row, turns: WET_TURNS });
      this.emit({ type: 'wet', lane, row, on: true });
    }
  }

  private damage(target: Target, amount: number) {
    if (target.kind === 'hero') this.damageHero(target.side, amount);
    else if (target.kind === 'unit') {
      const u = this.unit(target.uid);
      if (u) this.damageUnit(u, amount);
    }
  }

  /** Returns the damage actually dealt (0 when a ward soaks it). */
  private damageUnit(u: Unit, amount: number): number {
    if (amount <= 0 || u.health <= 0) return 0;
    // 빙결: frozen solid, nothing gets through.
    if (u.frozen) {
      this.emit({ type: 'immune', uid: u.uid });
      return 0;
    }
    // 환영: any hit makes it vanish, whatever its health.
    if (u.keywords.has('illusion')) {
      this.emit({ type: 'illusionBroken', uid: u.uid });
      const all = u.health;
      u.health = 0;
      this.emit({ type: 'damage', target: u.uid, amount: all });
      return 0;
    }
    if (this.isWet(u.lane, u.row)) amount += WET_BONUS;
    if (u.keywords.has('ward')) {
      u.keywords.delete('ward');
      this.emit({ type: 'wardBroken', uid: u.uid });
      return 0;
    }
    u.health -= amount;
    this.emit({ type: 'damage', target: u.uid, amount });
    if (u.keywords.has('enrage') && u.health > 0) {
      u.attack += 1;
      this.emit({ type: 'buff', uid: u.uid, attack: 1, health: 0 });
    }
    return amount;
  }

  private healUnit(u: Unit, amount: number) {
    const healed = Math.min(amount, u.maxHealth - u.health);
    if (healed <= 0 || u.health <= 0) return;
    u.health += healed;
    this.emit({ type: 'heal', target: u.uid, amount: healed });
  }

  private healHero(side: Side, amount: number) {
    const hero = this.side(side).hero;
    const healed = Math.min(amount, hero.maxHealth - hero.health);
    hero.health += healed;
    if (healed > 0) this.emit({ type: 'heal', target: side, amount: healed });
  }

  private damageHero(side: Side, amount: number): number {
    if (amount <= 0) return 0;
    const hero = this.side(side).hero;
    if (hero.armor) {
      const soaked = Math.min(hero.armor, amount);
      hero.armor -= soaked;
      amount -= soaked;
      this.emit({ type: 'armor', side, total: hero.armor });
      if (amount <= 0) return 0;
    }
    hero.health = Math.max(0, hero.health - amount);
    this.emit({ type: 'damage', target: side, amount });
    return amount;
  }

  private resolveDeaths() {
    const s = this.state;
    for (;;) {
      for (const u of s.units) {
        if (u.health <= 0 && u.keywords.has('undying')) {
          u.keywords.delete('undying');
          u.health = 1;
          this.emit({ type: 'revive', uid: u.uid });
        }
      }
      const dead = s.units.filter((u) => u.health <= 0);
      if (dead.length === 0) return;
      s.units = s.units.filter((u) => u.health > 0);
      for (const u of dead) this.emit({ type: 'death', uid: u.uid });
      // A broken or melted 빙벽 leaves its cell wet.
      for (const u of dead) if (u.model === 'ice_wall') this.soak(u.lane, u.row);
      for (const u of dead) if (!u.keywords.has('illusion')) (card(u.defId) as MinionCard).onDeath?.(this.apis[u.side], u);
    }
  }

  /** Ends the stage if a hero has fallen. Returns true when the stage is over. */
  private checkOutcome(): boolean {
    const s = this.state;
    if (this.over) return true;
    if (s.sides.enemy.hero.health <= 0) {
      s.stagesCleared++;
      const gold = stageGold(s.stage, s.turn);
      s.gold += gold;
      this.emit({ type: 'stageClear', stage: s.stage, gold });
      if (s.stage >= STAGES.length - 1) {
        s.phase = 'victory';
        this.emit({ type: 'victory' });
      } else {
        s.phase = 'reward';
        s.rewards = rollRewards(this.rng, s.stagesCleared, s.heroId);
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

  private addToHand(side: Side, inst: CardInstance, from: 'steal' | 'copy' | 'choice' | 'discard') {
    const me = this.side(side);
    if (me.hand.length >= MAX_HAND) {
      me.discard.push(inst);
      this.emit({ type: 'burn', side, card: inst });
      return;
    }
    me.hand.push(inst);
    this.emit({ type: 'cardGained', side, card: inst, from });
  }

  /** Random player-collectible cards of a type, for 탐색. */
  /** 탐색 pool: player cards of a type, including the player's own hero cards (never another hero's). */
  private discoverOptions(type: 'minion' | 'spell', side: Side): string[] {
    const hero = side === 'player' ? this.state.heroId : '';
    const pool = Object.values(CARDS)
      .filter((c) => c.type === type && !c.enemy && !c.id.endsWith('_token') && (!c.hero || c.hero === hero))
      .map((c) => c.id);
    return this.rng.shuffle(pool).slice(0, 3);
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
      // Spell damage gets the 주문 강화 bonus while a spell is being cast.
      damage: (target, amount) => this.damage(target, amount + this.spellBonus),
      damageFoeHero: (amount) => this.damageHero(foeSide, amount + this.spellBonus),
      damageEverything: (amount) => {
        const hit = amount + this.spellBonus;
        this.emit({ type: 'blizzard' });
        for (const u of [...this.state.units]) if (u.health > 0) this.damageUnit(u, hit);
        this.damageHero(side, hit);
        this.damageHero(foeSide, hit);
      },
      summonAt: (defId, lane, row, lifetime) => {
        const u = this.summonUnit(side, defId, lane, row);
        if (u && lifetime) u.lifetime = lifetime;
      },
      armorHero: (amount) => {
        const hero = this.side(side).hero;
        hero.armor = (hero.armor ?? 0) + amount;
        this.emit({ type: 'armor', side, total: hero.armor });
      },
      empower: (amount) => {
        this.side(side).empower = amount;
        this.emit({ type: 'empower', side, amount });
      },
      illusion: (uid, lane) => {
        const u = this.unit(uid);
        if (u && u.health > 0) this.summonIllusion(side, u, lane);
      },
      telekinesis: (uid, lane, row) => this.telekinesis(uid, lane, row),
      sacrifice: (uid) => {
        const u = this.unit(uid);
        if (!u || u.health <= 0) return 0;
        const hp = u.health;
        // A sacrifice is final: no 불사 comeback.
        u.keywords.delete('undying');
        u.health = 0;
        this.emit({ type: 'decay', lane: u.lane, row: u.row });
        this.emit({ type: 'damage', target: u.uid, amount: hp });
        return hp;
      },
      unitsBeside: (lane, row) => this.state.units.filter((u) =>
        u.health > 0 && Math.abs(u.lane - lane) + Math.abs(u.row - row) === 1),
      healHero: (amount) => this.healHero(side, amount),
      healUnit: (uid, amount) => {
        const u = this.unit(uid);
        if (u) this.healUnit(u, amount);
      },
      grantKeyword: (uid, keyword) => {
        const u = this.unit(uid);
        if (!u || u.health <= 0 || u.keywords.has(keyword)) return;
        u.keywords.add(keyword);
        this.emit({ type: 'keywordGained', uid, keyword });
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
      freeze: (uid, turns = 1) => {
        const u = this.unit(uid);
        if (!u || u.health <= 0) return;
        u.frozen = true;
        u.frozenTurns = Math.max(u.frozenTurns ?? 0, turns);
        this.emit({ type: 'freeze', uid });
      },
      // Both move a unit in the caster's forward direction: foes get pushed back, allies advance.
      push: (uid, rows) => this.shove(uid, rows, dir),
      advance: (uid, rows) => this.shove(uid, rows, dir),
      summon: (defId, lane) => this.summonUnit(side, defId, lane),
      freeHomeLanes: () => this.freeHomeLanes(side),
      unitsAround: (lane, row) => this.state.units.filter((u) =>
        u.health > 0 && Math.abs(u.lane - lane) <= 1 && Math.abs(u.row - row) <= 1 && !(u.lane === lane && u.row === row)),
      explode: (lane, row) => this.emit({ type: 'explosion', lane, row }),
      damageOwnHero: (amount) => this.damageHero(side, amount),
      handSize: () => this.side(side).hand.length,
      foeHandSize: () => this.side(foeSide).hand.length,
      drawFromFoeDeck: (count) => {
        for (let i = 0; i < count; i++) {
          const inst = this.side(foeSide).drawPile.pop();
          if (!inst) return;
          this.addToHand(side, { iid: inst.iid, defId: inst.defId }, 'steal');
        }
      },
      stealFromFoeHand: (count) => {
        const foeHand = this.side(foeSide).hand;
        for (let i = 0; i < count && foeHand.length > 0; i++) {
          const [inst] = foeHand.splice(this.rng.int(foeHand.length), 1);
          this.addToHand(side, { iid: inst.iid, defId: inst.defId }, 'steal');
        }
      },
      lockFoeCards: (count) => {
        const free = this.rng.shuffle(this.side(foeSide).hand.filter((c) => !c.locked)).slice(0, count);
        for (const c of free) c.locked = true;
        if (free.length) this.emit({ type: 'notice', side: foeSide, text: `손패 ${free.length}장 봉인!` });
      },
      foeSkipDraw: () => {
        this.side(foeSide).skipDraw = true;
        this.emit({ type: 'notice', side: foeSide, text: '다음 드로우 봉쇄' });
      },
      redrawHand: () => {
        const me = this.side(side);
        const old = me.hand.splice(0);
        for (const c of old) {
          me.discard.push({ iid: c.iid, defId: c.defId });
          this.emit({ type: 'discard', side, card: c });
        }
        this.draw(side, old.length);
      },
      recycle: (count) => {
        const me = this.side(side);
        for (let i = 0; i < count && me.discard.length > 0; i++) {
          const [inst] = me.discard.splice(this.rng.int(me.discard.length), 1);
          this.addToHand(side, inst, 'discard');
        }
      },
      addCopy: (defId, costMod) => this.addToHand(side, { iid: this.nextUid++, defId, costMod }, 'copy'),
      discover: (type, costMod = 0) => {
        const options = this.discoverOptions(type, side);
        if (options.length === 0) return;
        if (side === 'player') {
          // The player picks in the UI (or the test bot via aiTakeTurn).
          this.state.choice = { side, options, costMod };
          this.emit({ type: 'choice', side, options });
        } else {
          const best = [...options].sort((a, b) => card(b).cost - card(a).cost)[0];
          this.addToHand(side, { iid: this.nextUid++, defId: best, costMod: costMod || undefined }, 'choice');
        }
      },
      modifyHandCosts: (delta) => {
        for (const c of this.side(side).hand) c.costMod = (c.costMod ?? 0) + delta;
        this.emit({ type: 'notice', side, text: delta < 0 ? `손패 비용 ${delta}` : `손패 비용 +${delta}` });
      },
    };
  }
}

/** 질주 = 2 cells, 고정 or 0 attack = holds position, otherwise 1 cell per turn. */
export function unitSpeed(attack: number, keywords: Set<Keyword>): number {
  if (keywords.has('anchored') || attack <= 0) return 0;
  return keywords.has('dash') ? 2 : 1;
}

export function sameTarget(a: Target, b: Target): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'none': return true;
    case 'unit': return a.uid === (b as typeof a).uid;
    case 'hero': return a.side === (b as typeof a).side;
    case 'lane':
    case 'slot': return a.lane === (b as typeof a).lane;
    case 'cell': return a.lane === (b as typeof a).lane && a.row === (b as typeof a).row;
    case 'unitTo': {
      const o = b as typeof a;
      return a.uid === o.uid && a.lane === o.lane && a.row === o.row;
    }
  }
}
