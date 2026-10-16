import { describe, expect, it } from 'vitest';
import { card, type MinionCard } from '../src/game/cards';
import { Game, unitSpeed, WET_BONUS } from '../src/game/engine';
import { RANGED_RANGE, type Side, type Unit } from '../src/game/types';
import { STAGES } from '../src/game/stages';

let uidSeq = 9000;
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

function game(hand: string[], hero = 'arcanist') {
  const g = new Game(7);
  g.startRun(undefined, hero);
  g.state.units = [];
  g.side('player').hand = hand.map((defId, i) => ({ iid: 800 + i, defId }));
  g.side('player').mana = 20;
  return g;
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

const idx = (g: Game, id: string) => g.side('player').hand.findIndex((c) => c.defId === id);

describe('얼음', () => {
  it('빙결 makes a unit immune to damage, and 동결 lasts two of its turns', () => {
    const g = game(['deep_freeze', 'firebolt']);
    const foe = place(g, 'sk_warrior', 'enemy', 2, 4);
    g.playCard(idx(g, 'deep_freeze'), { kind: 'unit', uid: foe.uid });
    expect(foe.frozen).toBe(true);
    g.playCard(idx(g, 'firebolt'), { kind: 'unit', uid: foe.uid });
    expect(foe.health).toBe(foe.maxHealth);
    passTurn(g);
    expect(foe.frozen).toBe(true);
    expect(foe.row).toBe(4);
    passTurn(g);
    expect(foe.frozen).toBe(false);
  });

  it('동결 can protect an ally', () => {
    const g = game(['deep_freeze']);
    const mine = place(g, 'squire', 'player', 0, 0);
    expect(g.cardTargets(0).some((t) => t.kind === 'unit' && t.uid === mine.uid)).toBe(true);
  });

  it('빙벽 raises two walls side by side that block, melt after three turns and leave wet cells', () => {
    const g = game(['ice_wall', 'firebolt']);
    const targets = g.cardTargets(0);
    expect(targets.every((t) => t.kind === 'cell' && t.lane < 4)).toBe(true);
    g.playCard(idx(g, 'ice_wall'), { kind: 'cell', lane: 1, row: 2 });
    const walls = g.state.units.filter((u) => u.defId === 'ice_wall_token');
    expect(walls.map((w) => [w.lane, w.row])).toEqual([[1, 2], [2, 2]]);
    // A unit behind the wall cannot get past it.
    const runner = place(g, 'squire', 'player', 1, 1);
    passTurn(g);
    expect(runner.row).toBe(1);
    passTurn(g);
    expect(g.state.units.filter((u) => u.defId === 'ice_wall_token')).toHaveLength(2);
    passTurn(g);
    expect(g.state.units.filter((u) => u.defId === 'ice_wall_token')).toHaveLength(0);
    expect(g.state.wet.map((w) => [w.lane, w.row]).sort()).toEqual([[1, 2], [2, 2]]);
  });

  it('a broken 빙벽 soaks its cell, and units on wet cells take +1 per hit', () => {
    const g = game(['ice_wall', 'blizzard', 'firebolt']);
    g.playCard(idx(g, 'ice_wall'), { kind: 'cell', lane: 0, row: 3 });
    const wall = g.state.units.find((u) => u.defId === 'ice_wall_token' && u.lane === 0)!;
    wall.health = 2;
    g.playCard(idx(g, 'blizzard'), { kind: 'none' });
    expect(g.state.wet).toEqual([{ lane: 0, row: 3, turns: 3 }]);
    const foe = place(g, 'sk_brute', 'enemy', 0, 3);
    g.playCard(idx(g, 'firebolt'), { kind: 'unit', uid: foe.uid });
    expect(foe.health).toBe(foe.maxHealth - 3 - WET_BONUS);
  });

  it('눈보라 hits every unit and both heroes for 2', () => {
    const g = game(['blizzard']);
    const mine = place(g, 'veteran', 'player', 0, 1);
    const foe = place(g, 'sk_warrior', 'enemy', 3, 3);
    const hp = { p: g.side('player').hero.health, e: g.side('enemy').hero.health };
    g.playCard(0, { kind: 'none' });
    expect(mine.health).toBe(mine.maxHealth - 2);
    expect(foe.health).toBe(foe.maxHealth - 2);
    expect(g.side('player').hero.health).toBe(hp.p - 2);
    expect(g.side('enemy').hero.health).toBe(hp.e - 2);
  });

  it('얼음 방패 gives the hero 2 armor that soaks damage first', () => {
    const g = game(['ice_shield', 'blizzard']);
    const hp = g.side('player').hero.health;
    g.playCard(idx(g, 'ice_shield'), { kind: 'none' });
    expect(g.side('player').hero.armor).toBe(2);
    g.playCard(idx(g, 'blizzard'), { kind: 'none' });
    expect(g.side('player').hero.armor).toBe(0);
    expect(g.side('player').hero.health).toBe(hp);
  });
});

describe('비전술사: 주문 마법', () => {
  it('주문 강화 adds 2 to every hit of the next spell, then is spent', () => {
    const g = game(['a_empower', 'firebolt', 'firebolt']);
    const a = place(g, 'sk_brute', 'enemy', 0, 4);
    g.playCard(idx(g, 'a_empower'), { kind: 'none' });
    expect(g.side('player').empower).toBe(2);
    g.playCard(idx(g, 'firebolt'), { kind: 'unit', uid: a.uid });
    expect(a.health).toBe(a.maxHealth - 5);
    expect(g.side('player').empower).toBe(0);
    g.playCard(idx(g, 'firebolt'), { kind: 'unit', uid: a.uid });
    expect(a.health).toBe(a.maxHealth - 8);
  });

  it('주문 강화 fades if no spell follows this turn', () => {
    const g = game(['a_empower']);
    g.playCard(0, { kind: 'none' });
    passTurn(g);
    expect(g.side('player').empower).toBe(0);
  });

  it('에너지 미사일 deals 2 three times among foes and the foe hero', () => {
    const g = game(['a_energy']);
    const foe = place(g, 'sk_brute', 'enemy', 2, 4);
    const hp = g.side('enemy').hero.health;
    g.playCard(0, { kind: 'none' });
    const dealt = (foe.maxHealth - foe.health) + (hp - g.side('enemy').hero.health);
    expect(dealt).toBe(6);
  });

  it('환영 copies an ally; it hits for nothing and vanishes when hit', () => {
    const g = game(['a_illusion', 'blizzard']);
    const orig = place(g, 'berserker', 'player', 0, 2);
    const targets = g.cardTargets(0);
    expect(targets.every((t) => t.kind === 'unitTo' && t.uid === orig.uid && t.row === 0)).toBe(true);
    g.playCard(0, { kind: 'unitTo', uid: orig.uid, lane: 3, row: 0 });
    const copy = g.state.units.find((u) => u.keywords.has('illusion'))!;
    expect([copy.attack, copy.health, copy.defId, copy.lane]).toEqual([orig.attack, orig.health, orig.defId, 3]);
    // It walks up and swings at a foe without hurting it.
    const foe = place(g, 'sk_brute', 'enemy', 3, 1);
    (g as unknown as { finishTurn(side: Side): void }).finishTurn('player');
    expect(foe.health).toBe(foe.maxHealth);
    expect(g.unit(copy.uid)).toBeUndefined();
  });

  it('염력 costs the target\'s health, moves it aside, and 충돌 splits damage', () => {
    const g = game(['a_telekinesis', 'a_telekinesis']);
    const foe = place(g, 'sk_warrior', 'enemy', 2, 3);
    const t = g.cardTargets(0).filter((x) => x.kind === 'unitTo' && x.uid === foe.uid);
    // Back (toward its own side) or sideways.
    expect(t.map((x) => (x.kind === 'unitTo' ? [x.lane, x.row] : [])).sort()).toEqual([[1, 3], [2, 4], [3, 3]]);
    const mana = g.side('player').mana;
    g.playCard(0, { kind: 'unitTo', uid: foe.uid, lane: 1, row: 3 });
    expect([foe.lane, foe.row]).toEqual([1, 3]);
    expect(g.side('player').mana).toBe(mana - foe.maxHealth);
    const other = place(g, 'sk_brute', 'enemy', 0, 3);
    const hp = foe.health;
    g.playCard(0, { kind: 'unitTo', uid: foe.uid, lane: 0, row: 3 });
    expect([foe.lane, foe.row]).toEqual([1, 3]);
    expect(foe.health).toBe(hp - Math.ceil(hp / 2));
    expect(other.health).toBe(other.maxHealth - Math.ceil(hp / 2));
  });

  it('염력 cannot target what it cannot pay for', () => {
    const g = game(['a_telekinesis']);
    place(g, 'sk_brute', 'enemy', 2, 3);
    g.side('player').mana = 3;
    expect(g.canPlay(0)).toBe(false);
  });
});

describe('부패', () => {
  it('sacrifices an ally and hits the four cells beside it for its health', () => {
    const g = game(['decay'], 'captain');
    const victim = place(g, 'veteran', 'player', 2, 2);
    const n = place(g, 'sk_brute', 'enemy', 2, 3);
    const s = place(g, 'squire', 'player', 2, 1);
    const diag = place(g, 'sk_brute', 'enemy', 3, 3);
    g.playCard(0, { kind: 'unit', uid: victim.uid });
    expect(g.unit(victim.uid)).toBeUndefined();
    expect(n.health).toBe(n.maxHealth - victim.maxHealth);
    expect(g.unit(s.uid)).toBeUndefined();
    expect(diag.health).toBe(diag.maxHealth);
  });
});

describe('적 새 카드', () => {
  const enemyGame = (stage: number, hand: string[]) => {
    const g = new Game(11);
    g.startRun(Array(10).fill('squire'), 'captain', { hero: 'captain', deck: Array(10).fill('squire'), stage, stagesCleared: stage, health: 30 });
    g.state.units = [];
    g.state.phase = 'enemy';
    g.side('enemy').hand = hand.map((defId, i) => ({ iid: 700 + i, defId }));
    g.side('enemy').mana = 20;
    return g;
  };

  it('every new enemy card is in a commander deck', () => {
    const decks = new Set(STAGES.flatMap((s) => s.deck));
    for (const id of ['e_poison_arrow', 'e_soul_mirror', 'e_dark_power', 'e_bone_shield', 'e_grave_frost', 'sk_plague', 'e_corpse_blast']) {
      expect(decks.has(id), id).toBe(true);
    }
  });

  it('the AI plays them sensibly', async () => {
    const { aiTakeTurn } = await import('../src/game/ai');
    // 뼈 방패 with a hurt hero; 독 묻은 화살 at our unit.
    let g = enemyGame(1, ['e_bone_shield', 'e_poison_arrow']);
    const mine = place(g, 'veteran', 'player', 2, 2);
    g.side('enemy').hero.health -= 5;
    aiTakeTurn(g, 'enemy');
    expect(g.side('enemy').hero.armor).toBe(2);
    expect(mine.poison).toBe(3);
    // 금지된 주문 goes right before a damage spell.
    g = enemyGame(2, ['e_dark_power', 'e_frostbolt']);
    const target = place(g, 'veteran', 'player', 1, 2);
    aiTakeTurn(g, 'enemy');
    expect(target.health).toBe(target.maxHealth - 4);
    // 망령의 분신 copies a skeleton onto the enemy home row.
    g = enemyGame(1, ['e_soul_mirror']);
    place(g, 'sk_brute', 'enemy', 2, 4);
    aiTakeTurn(g, 'enemy');
    expect(g.state.units.some((u) => u.keywords.has('illusion') && u.side === 'enemy' && u.row === 5)).toBe(true);
  });

  it('역병 해골 poisons the foes beside it when it dies', () => {
    const g = game(['blizzard'], 'captain');
    const plague = place(g, 'sk_plague', 'enemy', 2, 3);
    plague.health = 2;
    const a = place(g, 'veteran', 'player', 2, 2);
    const b = place(g, 'veteran', 'player', 3, 3);
    g.playCard(0, { kind: 'none' });
    expect(g.unit(plague.uid)).toBeUndefined();
    expect([a.poison, b.poison]).toEqual([2, 2]);
  });
});
