import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/game/cards';
import { Game, HERO_MAX_HEALTH } from '../src/game/engine';
import { MONSTERS } from '../src/game/monsters';
import { STAGES } from '../src/game/stages';
import { LANES, SPAWN_ROW, type Monster } from '../src/game/types';
import { playRun } from '../src/sim/bot';

function freshGame(deck: string[]) {
  const g = new Game(42);
  g.startRun(deck);
  return g;
}

function placeMonster(g: Game, id: string, lane: number, row: number): Monster {
  const def = MONSTERS[id];
  const m: Monster = {
    side: 'monster', uid: 9000 + g.state.monsters.length, defId: id, name: def.name, model: def.model,
    attack: def.attack, health: def.health, maxHealth: def.health, keywords: new Set(def.keywords ?? []),
    scale: 1, lane, row, speed: def.speed, range: def.range, frozen: false, boss: false,
  };
  g.state.monsters.push(m);
  return m;
}

describe('turn structure', () => {
  it('starts stage 1 with one mana, four cards and the first wave', () => {
    const g = freshGame(Array(10).fill('squire'));
    expect(g.state.phase).toBe('player');
    expect(g.state.turn).toBe(1);
    expect(g.state.mana).toBe(1);
    expect(g.state.hand).toHaveLength(4);
    expect(g.state.monsters).toHaveLength(STAGES[0].waves[0].length);
    expect(g.state.monsters[0].row).toBe(SPAWN_ROW);
  });

  it('grows mana by one per turn and carries one unspent mana over', () => {
    const g = freshGame(Array(10).fill('squire'));
    g.endTurn();
    expect(g.state.maxMana).toBe(2);
    expect(g.state.mana).toBe(3); // 2 + 1 reserve from the unspent turn-1 mana
    g.state.mana = 0;
    g.endTurn();
    expect(g.state.mana).toBe(3);
  });

  it('reshuffles the discard pile when the draw pile runs out', () => {
    const g = freshGame(['firebolt', 'firebolt', 'firebolt', 'firebolt', 'firebolt']);
    // 4 in hand, 1 in pile; play two so the discard has cards
    g.state.mana = 10;
    g.state.monsters.forEach((m) => (m.health = 99));
    g.playCard(0, { kind: 'monster', uid: g.state.monsters[0].uid });
    g.playCard(0, { kind: 'monster', uid: g.state.monsters[0].uid });
    g.endTurn(); // draws the last card
    g.endTurn(); // must reshuffle
    expect(g.state.hand.length).toBe(4);
  });
});

describe('cards and combat', () => {
  it('summons a minion into an empty slot only', () => {
    const g = freshGame(Array(10).fill('squire'));
    expect(g.cardTargets(0)).toHaveLength(LANES);
    g.playCard(0, { kind: 'slot', lane: 2 });
    expect(g.state.slots[2]?.defId).toBe('squire');
    expect(g.state.mana).toBe(0);
    g.state.mana = 5;
    expect(g.cardTargets(0).some((t) => t.kind === 'slot' && t.lane === 2)).toBe(false);
  });

  it('melee minions trade blows with a monster in the front row', () => {
    const g = freshGame(Array(10).fill('berserker'));
    g.state.monsters = [];
    g.state.mana = 3;
    g.playCard(0, { kind: 'slot', lane: 1 });
    const m = placeMonster(g, 'warrior', 2, 1); // adjacent lane, front row
    const minion = g.state.slots[1]!;
    expect(g.attackTargets(minion.uid)).toEqual([m.uid]);
    g.minionAttack(minion.uid, m.uid);
    expect(m.health).toBe(MONSTERS.warrior.health - 4);
    expect(g.state.slots[1]).toBeNull(); // 3 health vs 3 attack
  });

  it('ranged minions hit anywhere in their lane without retaliation', () => {
    const g = freshGame(Array(10).fill('crossbowman'));
    g.state.monsters = [];
    g.state.mana = 2;
    g.playCard(0, { kind: 'slot', lane: 0 });
    g.endTurn();
    g.state.monsters = [];
    const m = placeMonster(g, 'warrior', 0, 5);
    placeMonster(g, 'warrior', 1, 1);
    const xbow = g.state.slots[0]!;
    expect(g.attackTargets(xbow.uid)).toEqual([m.uid]);
    g.minionAttack(xbow.uid, m.uid);
    expect(m.health).toBe(MONSTERS.warrior.health - 2);
    expect(xbow.health).toBe(1);
  });

  it('ward absorbs the first hit', () => {
    const g = freshGame(Array(10).fill('shieldbearer'));
    g.state.monsters = [];
    g.state.mana = 2;
    g.playCard(0, { kind: 'slot', lane: 3 });
    placeMonster(g, 'warrior', 3, 1);
    g.endTurn();
    const shield = g.state.slots[3]!;
    expect(shield.health).toBe(5);
    expect(shield.keywords.has('ward')).toBe(false);
  });

  it('shockwave pushes a lane back and frost skips a monster turn', () => {
    const g = freshGame(['shockwave', 'frostring', 'squire', 'squire', 'squire', 'squire']);
    g.state.monsters = [];
    g.state.mana = 10;
    const a = placeMonster(g, 'warrior', 2, 1);
    const b = placeMonster(g, 'warrior', 2, 2);
    const shock = g.state.hand.findIndex((c) => c.defId === 'shockwave');
    if (shock >= 0) {
      g.playCard(shock, { kind: 'lane', lane: 2 });
      expect([a.row, b.row].sort()).toEqual([3, 4]);
    }
    const frost = g.state.hand.findIndex((c) => c.defId === 'frostring');
    if (frost >= 0) {
      const before = a.row;
      g.playCard(frost, { kind: 'lane', lane: 2 });
      g.endTurn();
      expect(a.row).toBe(before);
    }
  });

  it('unblocked monsters in range hit the hero', () => {
    const g = freshGame(Array(10).fill('squire'));
    g.state.monsters = [];
    placeMonster(g, 'mage', 4, 3);
    g.endTurn();
    expect(g.state.hero.health).toBe(HERO_MAX_HEALTH - 2);
  });

  it('on-death summons refill the slot', () => {
    const g = freshGame(Array(10).fill('veteran'));
    g.state.monsters = [];
    g.state.mana = 4;
    g.playCard(0, { kind: 'slot', lane: 0 });
    g.state.slots[0]!.health = 1;
    placeMonster(g, 'warrior', 0, 1);
    g.endTurn();
    expect(g.state.slots[0]?.defId).toBe('squire');
  });
});

describe('stage flow', () => {
  it('offers three reward bundles after clearing a stage and adds the pick to the deck', () => {
    const g = freshGame(Array(10).fill('thunderbolt'));
    // Fast-forward: clear every wave instantly.
    for (let i = 0; i < 40 && g.state.phase === 'player'; i++) {
      g.state.monsters.forEach((m) => (m.health = 0));
      g.state.mana = 0;
      g.state.monsters = [];
      g.endTurn();
    }
    expect(g.state.phase).toBe('reward');
    expect(g.state.rewards).toHaveLength(3);
    const size = g.state.deckList.length;
    g.chooseReward(1);
    expect(g.state.deckList).toHaveLength(size + 3);
    expect(g.state.stage).toBe(1);
    expect(g.state.phase).toBe('player');
  });

  it('every card and monster referenced by data exists', () => {
    for (const s of STAGES) for (const w of s.waves) for (const e of w) expect(MONSTERS[e.split('@')[0]]).toBeDefined();
    for (const c of Object.values(CARDS)) expect(c.cost).toBeGreaterThanOrEqual(0);
  });

  it('a greedy bot can play whole runs without getting stuck', () => {
    let wins = 0;
    let cleared = 0;
    const N = 60;
    for (let seed = 1; seed <= N; seed++) {
      const r = playRun(new Game(seed));
      if (r.won) wins++;
      cleared += r.stagesCleared;
      expect(r.turns).toBeLessThan(400);
    }
    console.log(`bot: ${wins}/${N} wins, avg stages cleared ${(cleared / N).toFixed(2)}`);
    expect(cleared).toBeGreaterThan(0);
  });
});
