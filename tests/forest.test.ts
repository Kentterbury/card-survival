import { describe, expect, it } from 'vitest';
import { card, CARDS, type MinionCard } from '../src/game/cards';
import { Game, migrateSave, TRAP_DAMAGE, unitSpeed } from '../src/game/engine';
import { POWERS } from '../src/game/heroes';
import { STAGES, stageLabel } from '../src/game/stages';
import { RANGED_RANGE, type Side, type Target, type Unit } from '../src/game/types';

let uidSeq = 12000;
function place(g: Game, defId: string, side: Side, lane: number, row: number): Unit {
  const d = card(defId) as MinionCard;
  const keywords = new Set(d.keywords ?? []);
  const u: Unit = {
    uid: uidSeq++, defId, side, name: d.name, model: d.model, attack: d.attack, health: d.health, maxHealth: d.health,
    keywords, scale: 1, lane, row, speed: unitSpeed(d.attack, keywords), range: keywords.has('ranged') ? RANGED_RANGE : 1,
    frozen: false, fresh: false,
  };
  g.state.units.push(u);
  return u;
}

function game() {
  const g = new Game(7);
  g.startRun(Array(10).fill('squire'), 'captain');
  g.state.units = [];
  g.side('player').hand = [];
  g.side('player').mana = 20;
  return g;
}

/** Plays an enemy card as if it were the enemy's turn. */
function enemyPlay(g: Game, id: string, target: Target = { kind: 'none' }) {
  g.state.phase = 'enemy';
  const e = g.side('enemy');
  e.hand = [{ iid: 99000 + uidSeq++, defId: id }];
  e.mana = 20;
  const ok = g.playCardAs('enemy', 0, target);
  g.state.phase = 'player';
  return ok;
}

/** Ends the player turn with the enemy unable to do anything. */
function passTurn(g: Game) {
  const e = g.side('enemy');
  e.hand = [];
  e.drawPile = [];
  e.discard = [];
  e.powerUsed = true;
  e.maxMana = -1;
  g.endTurn();
  g.side('player').mana = 20;
}

const at = (g: Game, lane: number, row: number) => g.unitAt(lane, row);

describe('1장 숲: stages', () => {
  it('has three forest stages in front of the dungeon, numbered by chapter', () => {
    expect(STAGES).toHaveLength(8);
    expect(STAGES.slice(0, 3).map((s) => s.hero.name)).toEqual(['늑대 우두머리', '슬라임 왕', '해골 사냥꾼장']);
    expect(STAGES.map((_, i) => stageLabel(i))).toEqual(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2']);
    expect(STAGES[4].hero.name).toBe('해골 대장');
    for (const s of STAGES) for (const id of s.deck) expect(CARDS[id], id).toBeDefined();
  });

  it('forest decks mix in the other kinds and some utility cards', () => {
    const kinds = (i: number) => new Set(STAGES[i].deck.map((id) => card(id)).filter((c) => c.type === 'minion').map((c) => (c as MinionCard).model === 'wolf' ? 'wolf' : (c as MinionCard).model === 'slime' ? 'slime' : 'skeleton'));
    for (const i of [0, 1, 2]) {
      expect(kinds(i).size).toBe(3);
      expect(STAGES[i].deck.some((id) => !card(id).enemy)).toBe(true);
    }
  });

  it('older saves move three stages on, to the same commander as before', () => {
    expect(migrateSave({ hero: 'captain', deck: [], stage: 0, stagesCleared: 0, health: 30 })).toMatchObject({ stage: 3, stagesCleared: 3, v: 2 });
    expect(migrateSave({ hero: 'captain', deck: [], stage: 2, stagesCleared: 2, health: 30, v: 2 }).stage).toBe(2);
    const g = new Game(1);
    g.startRun(undefined, 'captain', { hero: 'captain', deck: Array(10).fill('squire'), stage: 1, stagesCleared: 1, health: 30 });
    expect(g.stageDef.hero.name).toBe('해골 대장');
    expect(g.saveData().v).toBe(2);
  });
});

describe('속박 and 덫', () => {
  it('a rooted unit stays put for its turns but still fights', () => {
    const g = game();
    const mine = place(g, 'squire', 'player', 2, 1);
    expect(enemyPlay(g, 'e_vines', { kind: 'unit', uid: mine.uid })).toBe(true);
    expect(mine.rootedTurns).toBe(2);
    passTurn(g);
    expect(mine.row).toBe(1);
    const foe = place(g, 'sk_minion', 'enemy', 2, 2);
    foe.health = 5;
    passTurn(g);
    expect(mine.row).toBe(1);
    // We hit it on our turn, it hit back on its own: 1 + 1.
    expect(foe.health).toBe(5 - 2);
    expect(mine.rootedTurns).toBeUndefined();
    foe.health = 0;
    g.state.units = g.state.units.filter((u) => u !== foe);
    passTurn(g);
    expect(mine.row).toBe(2);
  });

  it('a trap stops the first foe that steps in, hurts it and roots it for a turn', () => {
    const g = game();
    const mine = place(g, 'squire', 'player', 2, 0);
    expect(enemyPlay(g, 'e_trap', { kind: 'cell', lane: 2, row: 1 })).toBe(true);
    expect(g.trapAt(2, 1)).toBeDefined();
    passTurn(g);
    expect(mine.row).toBe(1);
    expect(mine.health).toBe(3 - TRAP_DAMAGE);
    expect(g.trapAt(2, 1)).toBeUndefined();
    passTurn(g);
    expect(mine.row).toBe(1);
    passTurn(g);
    expect(mine.row).toBe(2);
  });

  it('dashers stop on the trap, and a side never trips its own traps', () => {
    const g = game();
    const runner = place(g, 'shadowblade', 'player', 1, 0);
    enemyPlay(g, 'e_trap', { kind: 'cell', lane: 1, row: 1 });
    enemyPlay(g, 'e_trap', { kind: 'cell', lane: 3, row: 4 });
    const wolf = place(g, 'wolf', 'enemy', 3, 5);
    passTurn(g);
    expect(runner.row).toBe(1);
    expect(wolf.row).toBe(3);
    expect(g.trapAt(3, 4)).toBeDefined();
  });

  it('덫 놓기 sets a trap in front of the most advanced foe; 점액 분출 roots it', () => {
    const g = game();
    const far = place(g, 'squire', 'player', 0, 0);
    const near = place(g, 'squire', 'player', 3, 3);
    POWERS.snare.cast((g as unknown as { apis: Record<Side, never> }).apis.enemy, { kind: 'none' });
    expect(g.trapAt(3, 4)).toBeDefined();
    expect(g.trapAt(0, 1)).toBeUndefined();
    POWERS.ooze.cast((g as unknown as { apis: Record<Side, never> }).apis.enemy, { kind: 'none' });
    expect(near.rootedTurns).toBe(1);
    expect(far.rootedTurns).toBeUndefined();
  });

  it('고목 망자 roots every foe in its lane', () => {
    const g = game();
    const a = place(g, 'squire', 'player', 2, 1);
    const b = place(g, 'squire', 'player', 2, 3);
    const c = place(g, 'squire', 'player', 1, 3);
    enemyPlay(g, 'sk_rotwood', { kind: 'slot', lane: 2 });
    expect(a.rootedTurns).toBe(2);
    expect(b.rootedTurns).toBe(2);
    expect(c.rootedTurns).toBeUndefined();
    expect((card('sk_rotwood') as MinionCard).elite).toBe(true);
    expect((card('sk_barrow_knight') as MinionCard).elite).toBe(true);
  });
});

describe('분열 and 맹독', () => {
  it('a slime splits into two small slimes on its cell and the one beside it', () => {
    const g = game();
    g.side('player').hand = [{ iid: 1, defId: 'firebolt' }];
    const slime = place(g, 'slime', 'enemy', 2, 3);
    g.playCard(0, { kind: 'unit', uid: slime.uid });
    const pieces = g.unitsOf('enemy');
    expect(pieces.map((u) => u.defId)).toEqual(['slime_small_token', 'slime_small_token']);
    expect(pieces[0]).toMatchObject({ lane: 2, row: 3 });
    expect(Math.abs(pieces[1].lane - 2) + Math.abs(pieces[1].row - 3)).toBe(1);
    // Small slimes do not split again.
    g.side('player').hand = [{ iid: 2, defId: 'firebolt' }];
    g.playCard(0, { kind: 'unit', uid: pieces[0].uid });
    expect(g.unitsOf('enemy')).toHaveLength(1);
  });

  it('a giant slime splits into two middle slimes; 점액 융합 makes anything split', () => {
    const g2 = game();
    g2.side('player').hand = [{ iid: 3, defId: 'pyroblast' }];
    const big2 = place(g2, 'slime_big', 'enemy', 0, 4);
    g2.playCard(0, { kind: 'unit', uid: big2.uid });
    expect(g2.unitsOf('enemy').map((u) => u.defId)).toEqual(['slime_mid_token', 'slime_mid_token']);
    // Edge lane: the second piece goes to the free side or behind.
    expect(g2.unitsOf('enemy').every((u) => u.lane >= 0)).toBe(true);

    const g3 = game();
    const sk = place(g3, 'sk_minion', 'enemy', 2, 4);
    enemyPlay(g3, 'e_merge', { kind: 'unit', uid: sk.uid });
    expect(sk.keywords.has('split')).toBe(true);
    expect(sk.attack).toBe(2);
    g3.side('player').hand = [{ iid: 4, defId: 'pyroblast' }];
    g3.playCard(0, { kind: 'unit', uid: sk.uid });
    expect(g3.unitsOf('enemy').map((u) => u.defId)).toEqual(['slime_small_token', 'slime_small_token']);
  });

  it('맹독 poisons whatever it hits, and whoever hits it in melee', () => {
    const g = game();
    const mine = place(g, 'squire', 'player', 2, 1);
    mine.health = 9;
    const venom = place(g, 'slime_venom', 'enemy', 2, 2);
    passTurn(g);
    // Our squire hit it on our turn and was poisoned by the counter; then it struck back on its turn.
    expect(mine.poison).toBeGreaterThan(0);
    expect(venom.health).toBeLessThan(3);
  });
});

describe('forest cards', () => {
  it('시듦 lowers attack, never below 0', () => {
    const g = game();
    const mine = place(g, 'berserker', 'player', 2, 1);
    enemyPlay(g, 'e_wither', { kind: 'unit', uid: mine.uid });
    expect(mine.attack).toBe(2);
    enemyPlay(g, 'e_wither', { kind: 'unit', uid: mine.uid });
    enemyPlay(g, 'e_wither', { kind: 'unit', uid: mine.uid });
    expect(mine.attack).toBe(0);
  });

  it('도깨비불 raises a skeleton where its victim fell', () => {
    const g = game();
    const mine = place(g, 'crossbowman', 'player', 3, 2);
    enemyPlay(g, 'e_wisp', { kind: 'unit', uid: mine.uid });
    const risen = at(g, 3, 2);
    expect(risen?.defId).toBe('sk_minion');
    expect(risen?.side).toBe('enemy');
  });

  it('해골 조련사 brings two wolf pups; 질풍 gives 질주 that moves two cells', () => {
    const g = game();
    enemyPlay(g, 'sk_beastmaster', { kind: 'slot', lane: 2 });
    expect(at(g, 1, 5)?.defId).toBe('wolf_pup');
    expect(at(g, 3, 5)?.defId).toBe('wolf_pup');
    const sk = at(g, 2, 5)!;
    enemyPlay(g, 'e_gale', { kind: 'unit', uid: sk.uid });
    expect(sk.keywords.has('dash')).toBe(true);
    expect(sk.speed).toBe(2);
    expect(sk.row).toBe(4);
  });

  it('울부짖음 only strengthens wolves; 사냥 본능 draws and buffs the weakest', () => {
    const g = game();
    const w = place(g, 'wolf', 'enemy', 0, 5);
    const s = place(g, 'sk_warrior', 'enemy', 1, 5);
    enemyPlay(g, 'e_howl');
    expect(w.attack).toBe(3);
    expect(s.attack).toBe(3);
    g.side('enemy').drawPile = [{ iid: 1, defId: 'wolf' }];
    enemyPlay(g, 'e_instinct');
    expect(g.side('enemy').hand.map((c) => c.defId)).toEqual(['wolf']);
    // The wolf (3/3 after the howl) is weaker than the 3/5 warrior, so it gets the +1/+1.
    expect(w.attack + w.health).toBe(3 + 3 + 2);
    expect(s.attack + s.health).toBe(3 + 5);
  });

  it('무덤 이끼 gives 불사; 끈적한 껍질 gives a ward and health', () => {
    const g = game();
    const sk = place(g, 'sk_minion', 'enemy', 2, 5);
    enemyPlay(g, 'e_grave_moss', { kind: 'unit', uid: sk.uid });
    expect(sk.keywords.has('undying')).toBe(true);
    const base = (card('sk_minion') as MinionCard).health;
    expect(sk.maxHealth).toBe(base + 1);
    enemyPlay(g, 'e_slime_coat', { kind: 'unit', uid: sk.uid });
    expect(sk.keywords.has('ward')).toBe(true);
    expect(sk.maxHealth).toBe(base + 4);
  });

  it('the enemy AI plays a whole forest stage without errors', async () => {
    const { playRun } = await import('../src/sim/bot');
    for (let seed = 1; seed <= 20; seed++) playRun(new Game(seed), 600, 'captain');
  });
});
