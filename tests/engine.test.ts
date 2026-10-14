import { describe, expect, it } from 'vitest';
import { card, CARDS, STARTER_DECK, type MinionCard } from '../src/game/cards';
import { Game, HERO_MAX_HEALTH } from '../src/game/engine';
import { STAGES } from '../src/game/stages';
import { LAST_ROW, RANGED_RANGE, type Side, type Unit } from '../src/game/types';
import { playRun } from '../src/sim/bot';

function freshGame(deck: string[]) {
  const g = new Game(42);
  g.startRun(deck);
  g.state.units = [];
  return g;
}

let uidSeq = 5000;
function place(g: Game, defId: string, side: Side, lane: number, row: number, fresh = false): Unit {
  const d = card(defId) as MinionCard;
  const keywords = new Set(d.keywords ?? []);
  const u: Unit = {
    uid: uidSeq++, defId, side, name: d.name, model: d.model, attack: d.attack, health: d.health, maxHealth: d.health,
    keywords, scale: 1, lane, row, speed: d.speed ?? (d.attack > 0 ? 1 : 0), range: keywords.has('ranged') ? RANGED_RANGE : 1,
    frozen: false, fresh,
  };
  g.state.units.push(u);
  return u;
}

/** Ends the player turn with the enemy unable to do anything. */
function passTurn(g: Game) {
  g.side('enemy').hand = [];
  g.side('enemy').drawPile = [];
  g.side('enemy').discard = [];
  g.side('enemy').powerUsed = true;
  g.state.sides.enemy.maxMana = -1;
  g.endTurn();
}

describe('turn structure', () => {
  it('starts with one mana, four cards and both heroes at full health', () => {
    const g = new Game(1);
    g.startRun();
    expect(g.state.phase).toBe('player');
    expect(g.side('player').mana).toBe(1);
    expect(g.side('player').hand).toHaveLength(4);
    expect(g.side('enemy').hero.health).toBe(STAGES[0].hero.health);
    expect(g.side('player').hero.health).toBe(HERO_MAX_HEALTH);
  });

  it('starter deck is mostly spells', () => {
    const minions = STARTER_DECK.filter((id) => card(id).type === 'minion').length;
    expect(minions).toBeLessThan(STARTER_DECK.length / 2);
  });

  it('carries one unspent mana into the next turn', () => {
    const g = freshGame(Array(10).fill('squire'));
    passTurn(g);
    expect(g.side('player').maxMana).toBe(2);
    expect(g.side('player').mana).toBe(3);
  });

  it('the enemy plays cards on its turn', () => {
    const g = new Game(7);
    g.startRun();
    const before = g.side('enemy').hand.length;
    g.endTurn();
    const s = g.state;
    expect(s.units.filter((u) => u.side === 'enemy').length + (before + 1 - g.side('enemy').hand.length)).toBeGreaterThan(0);
  });
});

describe('lane combat', () => {
  it('units advance one cell per turn, but not on the turn they are summoned', () => {
    const g = freshGame(Array(10).fill('squire'));
    g.playCard(0, { kind: 'slot', lane: 2 });
    const u = g.state.units[0];
    expect(u.row).toBe(0);
    passTurn(g);
    expect(u.row).toBe(0); // fresh on its first turn
    passTurn(g);
    expect(u.row).toBe(1);
  });

  it('melee units trade blows with the foe right in front', () => {
    const g = freshGame(Array(10).fill('squire'));
    const mine = place(g, 'berserker', 'player', 1, 3);
    const foe = place(g, 'sk_warrior', 'enemy', 1, 4);
    passTurn(g);
    // berserker hits for 4 (kills the 3/4), takes 3 back; then enemy has nothing left to swing.
    expect(foe.health).toBe(0);
    expect(mine.health).toBe(0);
  });

  it('ranged units shoot the first foe ahead, over allies, without retaliation', () => {
    const g = freshGame(Array(10).fill('squire'));
    const xbow = place(g, 'crossbowman', 'player', 0, 0);
    place(g, 'shieldbearer', 'player', 0, 1);
    const foe = place(g, 'sk_warrior', 'enemy', 0, 3);
    g.side('enemy').hand = [];
    g.endTurn();
    expect(foe.health).toBeLessThanOrEqual(4 - 2);
    expect(xbow.health).toBe(2);
  });

  it('a unit with nobody in front hits the enemy hero from the last row', () => {
    const g = freshGame(Array(10).fill('squire'));
    place(g, 'berserker', 'player', 4, LAST_ROW);
    const hp = g.side('enemy').hero.health;
    passTurn(g);
    expect(g.side('enemy').hero.health).toBe(hp - 4);
  });

  it('ranged units hit the hero once it is in range', () => {
    const g = freshGame(Array(10).fill('squire'));
    place(g, 'crossbowman', 'player', 2, LAST_ROW - 2);
    const hp = g.side('enemy').hero.health;
    passTurn(g);
    expect(g.side('enemy').hero.health).toBe(hp - 2);
  });

  it('enemy units reaching our side damage our hero', () => {
    const g = freshGame(Array(10).fill('squire'));
    place(g, 'sk_warrior', 'enemy', 3, 0);
    g.side('enemy').hand = [];
    g.endTurn();
    expect(g.side('player').hero.health).toBe(HERO_MAX_HEALTH - 3);
  });

  it('ward absorbs the first hit', () => {
    const g = freshGame(Array(10).fill('squire'));
    const shield = place(g, 'shieldbearer', 'player', 1, 0);
    place(g, 'sk_warrior', 'enemy', 1, 1);
    g.side('enemy').hand = [];
    g.endTurn();
    expect(shield.health).toBe(5);
    expect(shield.keywords.has('ward')).toBe(false);
  });
});

describe('spells', () => {
  it('damage spells can target the enemy hero', () => {
    const g = freshGame(['firebolt', 'firebolt', 'firebolt', 'firebolt', 'firebolt']);
    expect(g.cardTargets(0).some((t) => t.kind === 'hero' && t.side === 'enemy')).toBe(true);
    const hp = g.side('enemy').hero.health;
    g.playCard(0, { kind: 'hero', side: 'enemy' });
    expect(g.side('enemy').hero.health).toBe(hp - 3);
  });

  it('killing the enemy hero clears the stage and offers rewards', () => {
    const g = freshGame(Array(10).fill('pyroblast'));
    g.side('player').mana = 10;
    g.side('enemy').hero.health = 5;
    g.playCard(0, { kind: 'hero', side: 'enemy' });
    expect(g.state.phase).toBe('reward');
    expect(g.state.rewards).toHaveLength(3);
    const size = g.state.deckList.length;
    g.chooseReward(0);
    expect(g.state.deckList).toHaveLength(size + 3);
    expect(g.state.stage).toBe(1);
    expect(g.state.phase).toBe('player');
  });

  it('our hero dying ends the run', () => {
    const g = freshGame(Array(10).fill('squire'));
    g.side('player').hero.health = 2;
    place(g, 'sk_warrior', 'enemy', 0, 0);
    g.side('enemy').hand = [];
    g.endTurn();
    expect(g.state.phase).toBe('defeat');
  });

  it('shockwave pushes foes back toward their side', () => {
    const g = freshGame(['shockwave', 'shockwave', 'shockwave', 'shockwave', 'shockwave']);
    g.side('player').mana = 5;
    const a = place(g, 'sk_warrior', 'enemy', 2, 1);
    const b = place(g, 'sk_warrior', 'enemy', 2, 2);
    g.playCard(0, { kind: 'lane', lane: 2 });
    expect([a.row, b.row].sort()).toEqual([3, 4]);
  });
});

describe('new cards', () => {
  const withCard = (id: string, mana = 10) => {
    const g = freshGame(Array(6).fill(id));
    g.side('player').mana = mana;
    return g;
  };

  it('화염 폭탄병 hits every foe in its lane when it dies', () => {
    const g = freshGame(Array(10).fill('squire'));
    const bomber = place(g, 'bomber', 'player', 2, 2);
    bomber.health = 1;
    const a = place(g, 'sk_warrior', 'enemy', 2, 3);
    const b = place(g, 'sk_minion', 'enemy', 2, 5);
    g.side('enemy').hand = [];
    g.endTurn();
    expect(b.health).toBeLessThanOrEqual(0);
    expect(a.health).toBeLessThan(4);
  });

  it('공성 마법사 holds its ground and burns the enemy hero each turn', () => {
    const g = freshGame(Array(10).fill('squire'));
    const siege = place(g, 'siege_mage', 'player', 0, 0);
    siege.speed = 0;
    const hp = g.side('enemy').hero.health;
    passTurn(g);
    expect(siege.row).toBe(0);
    expect(g.side('enemy').hero.health).toBe(hp - 2);
  });

  it('일제 사격 hits each lane front, or the hero for empty lanes', () => {
    const g = withCard('volley');
    const a = place(g, 'sk_warrior', 'enemy', 0, 3);
    const hp = g.side('enemy').hero.health;
    g.playCard(0, { kind: 'none' });
    expect(a.health).toBe(3);
    expect(g.side('enemy').hero.health).toBe(hp - 4);
  });

  it('처형 kills a damaged minion outright', () => {
    const g = withCard('execute');
    const a = place(g, 'sk_brute', 'enemy', 1, 4);
    a.health = 9;
    g.playCard(0, { kind: 'unit', uid: a.uid });
    expect(g.unit(a.uid)?.health ?? 0).toBeLessThanOrEqual(0);
    const b = place(g, 'sk_brute', 'enemy', 2, 4);
    g.playCard(0, { kind: 'unit', uid: b.uid });
    expect(b.health).toBe(8);
  });

  it('진격의 북소리 moves allies forward and adds attack', () => {
    const g = withCard('war_drums');
    const a = place(g, 'squire', 'player', 1, 0);
    const b = place(g, 'squire', 'player', 1, 1);
    g.playCard(0, { kind: 'none' });
    expect([a.row, b.row].sort()).toEqual([1, 2]);
    expect(a.attack).toBe(2);
  });

  it('방벽 수호자 raises barricades on both sides', () => {
    const g = withCard('warden');
    g.playCard(0, { kind: 'slot', lane: 2 });
    const lanes = g.state.units.filter((u) => u.defId === 'barricade_token').map((u) => u.lane).sort();
    expect(lanes).toEqual([1, 3]);
  });

  it('얼음 감옥 freezes and pushes a foe back', () => {
    const g = withCard('ice_prison');
    const a = place(g, 'sk_warrior', 'enemy', 3, 1);
    g.playCard(0, { kind: 'unit', uid: a.uid });
    expect(a.frozen).toBe(true);
    expect(a.row).toBe(3);
  });

  it('전장 신관 heals the hero and allies at end of turn', () => {
    const g = freshGame(Array(10).fill('squire'));
    place(g, 'priest', 'player', 0, 0);
    const hurt = place(g, 'squire', 'player', 4, 0);
    hurt.health = 1;
    g.side('player').hero.health = 20;
    passTurn(g);
    expect(hurt.health).toBe(3);
    expect(g.side('player').hero.health).toBe(22);
  });

  it('마나 물약 gives two extra mana this turn', () => {
    const g = withCard('mana_potion', 1);
    g.playCard(0, { kind: 'none' });
    expect(g.side('player').mana).toBe(3);
  });

  it('수호의 축복 gives every ally a ward', () => {
    const g = withCard('blessing');
    const a = place(g, 'squire', 'player', 0, 1);
    const b = place(g, 'berserker', 'player', 1, 2);
    g.playCard(0, { kind: 'none' });
    expect(a.keywords.has('ward') && b.keywords.has('ward')).toBe(true);
  });

  it('every reward card exists and every player card can be obtained', async () => {
    const { rollRewards } = await import('../src/game/rewards');
    const { Rng } = await import('../src/game/rng');
    const seen = new Set<string>(STARTER_DECK);
    const rng = new Rng(1);
    for (let i = 0; i < 400; i++) for (const b of rollRewards(rng, 1 + (i % 4))) for (const id of b.cards) { expect(CARDS[id]).toBeDefined(); seen.add(id); }
    const obtainable = Object.values(CARDS).filter((c) => !c.enemy && c.id !== 'barricade_token').map((c) => c.id);
    expect(obtainable.filter((id) => !seen.has(id))).toEqual([]);
  });
});

describe('data and simulation', () => {
  it('every referenced card exists', () => {
    for (const s of STAGES) for (const id of s.deck) expect(CARDS[id]).toBeDefined();
    for (const id of STARTER_DECK) expect(CARDS[id]).toBeDefined();
  });

  it('the bot can play whole runs without getting stuck', () => {
    let wins = 0;
    let cleared = 0;
    const N = 40;
    for (let seed = 1; seed <= N; seed++) {
      const r = playRun(new Game(seed));
      if (r.won) wins++;
      cleared += r.stagesCleared;
      expect(r.turns).toBeLessThan(600);
    }
    console.log(`bot: ${wins}/${N} wins, avg stages cleared ${(cleared / N).toFixed(2)}`);
    expect(cleared).toBeGreaterThan(0);
  });
});
