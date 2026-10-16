import { describe, expect, it } from 'vitest';
import { card, CARDS, type MinionCard } from '../src/game/cards';
import { Game, unitSpeed } from '../src/game/engine';
import { ALL_BUNDLES } from '../src/game/rewards';
import { rollShop } from '../src/game/shop';
import { Rng } from '../src/game/rng';
import { RANGED_RANGE, type Side, type Target, type Unit } from '../src/game/types';

let uidSeq = 20000;
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

function game(hero: string) {
  const g = new Game(7);
  g.startRun(Array(10).fill('squire'), hero);
  g.state.units = [];
  g.side('player').hand = [];
  return g;
}

function play(g: Game, id: string, target: Target = { kind: 'none' }) {
  g.side('player').hand = [{ iid: uidSeq++, defId: id }];
  g.side('player').mana = 20;
  const ok = g.cardTargets(0).some((t) => JSON.stringify(t) === JSON.stringify(target));
  g.playCard(0, target);
  return ok;
}

function passTurn(g: Game) {
  const e = g.side('enemy');
  e.hand = []; e.drawPile = []; e.discard = []; e.powerUsed = true; e.maxMana = -1;
  g.endTurn();
}

describe('수비대장 추가 카드', () => {
  it('돌진 runs to the nearest foe in the lane, hits for its health and takes half back', () => {
    const g = game('captain');
    const me = place(g, 'veteran', 'player', 2, 0);
    const foe = place(g, 'sk_brute', 'enemy', 2, 4);
    const behind = place(g, 'sk_minion', 'enemy', 2, 5);
    expect(play(g, 'c_charge', { kind: 'unit', uid: me.uid })).toBe(true);
    expect(me.row).toBe(3);
    expect(foe.health).toBe(foe.maxHealth - 6);
    expect(me.health).toBe(6 - 3);
    expect(behind.health).toBe(behind.maxHealth);
    // No foe ahead: not a target.
    const alone = place(g, 'squire', 'player', 0, 0);
    g.side('player').hand = [{ iid: 1, defId: 'c_charge' }];
    expect(g.cardTargets(0).some((t) => t.kind === 'unit' && t.uid === alone.uid)).toBe(false);
  });

  it('방어 진지 takes 2 off each hit on allies inside, for three rounds', () => {
    const g = game('captain');
    const me = place(g, 'veteran', 'player', 1, 1);
    const foe = place(g, 'sk_warrior', 'enemy', 1, 2);
    play(g, 'c_bastion', { kind: 'cell', lane: 0, row: 0 });
    expect(g.zoneAt('fort', 1, 1, 'player')).toBeDefined();
    expect(g.zoneAt('fort', 1, 1, 'enemy')).toBeUndefined();
    passTurn(g);
    // The warrior (3 attack) hit back twice: once on our swing, once on its own turn; 1 each.
    expect(me.health).toBe(6 - 2);
    expect(foe.health).toBeLessThan(foe.maxHealth);
    passTurn(g);
    passTurn(g);
    expect(g.state.zones).toHaveLength(0);
  });

  it('최후의 보루 gives 가호 4 plus one per warded ally; 반격 태세 gives thorns', () => {
    const g = game('captain');
    place(g, 'shieldbearer', 'player', 0, 0);
    place(g, 'fortress', 'player', 1, 0);
    place(g, 'squire', 'player', 2, 0);
    play(g, 'c_last_stand');
    expect(g.side('player').hero.armor).toBe(6);
    play(g, 'c_counter');
    expect(g.unitsOf('player').every((u) => u.keywords.has('thorns'))).toBe(true);
  });

  it('공성 전차 loads on one turn and fires on the next, hitting friend and foe in the cross', () => {
    const g = game('captain');
    const siege = place(g, 'c_siege', 'player', 4, 0);
    // Both stand still with nothing in front, so only the stone hurts them.
    const foe = place(g, 'sk_guard', 'enemy', 2, 3);
    foe.keywords.delete('ward');
    foe.speed = 0;
    const ally = place(g, 'warden', 'player', 1, 3);
    passTurn(g);
    expect(siege.loaded).toBe(true);
    expect(foe.health).toBe(foe.maxHealth);
    const before = ally.health;
    passTurn(g);
    expect(siege.loaded).toBeFalsy();
    expect(foe.health).toBeLessThanOrEqual(foe.maxHealth - 3);
    expect(ally.health).toBeLessThanOrEqual(before - 3);
  });

  it('공성 전차 with no foe minions hits the enemy hero', () => {
    const g = game('captain');
    const siege = place(g, 'c_siege', 'player', 4, 0);
    siege.loaded = true;
    const hp = g.side('enemy').hero.health;
    passTurn(g);
    expect(g.side('enemy').hero.health).toBe(hp - 3);
  });
});

describe('전쟁 족장 추가 카드', () => {
  it('피의 함성 adds 3 attack and wakes 분노; 도끼 회전 hits both sides', () => {
    const g = game('warchief');
    const b = place(g, 'brawler', 'player', 2, 2);
    play(g, 'w_bloodcry', { kind: 'unit', uid: b.uid });
    expect(b.attack).toBe(1 + 3 + 1);
    const l = place(g, 'sk_minion', 'enemy', 1, 2);
    const r = place(g, 'sk_minion', 'enemy', 3, 2);
    play(g, 'w_whirl', { kind: 'unit', uid: b.uid });
    expect(g.unit(l.uid)).toBeUndefined();
    expect(g.unit(r.uid)).toBeUndefined();
  });

  it('승리의 함성 heals 1 per ally; 총돌격 gives everyone 질주 and a step', () => {
    const g = game('warchief');
    for (let l = 0; l < 3; l++) place(g, 'squire', 'player', l, 0);
    g.side('player').hero.health = 10;
    play(g, 'w_victory');
    expect(g.side('player').hero.health).toBe(13);
    play(g, 'w_allout');
    for (const u of g.unitsOf('player')) {
      expect(u.speed).toBe(2);
      expect(u.row).toBe(1);
    }
  });
});

describe('척후대장 추가 카드', () => {
  it('덫 사냥꾼 sets a trap two cells ahead; 사냥꾼의 덫 only works in our three front rows', () => {
    const g = game('hunter');
    g.side('player').hand = [{ iid: 1, defId: 'h_snarer' }];
    g.side('player').mana = 20;
    g.playCard(0, { kind: 'slot', lane: 2 });
    expect(g.trapAt(2, 2)).toBeDefined();
    g.side('player').hand = [{ iid: 2, defId: 'h_trap' }];
    const rows = new Set(g.cardTargets(0).map((t) => (t.kind === 'cell' ? t.row : -1)));
    expect([...rows].sort()).toEqual([0, 1, 2]);
  });

  it('매 조련사 brings a flying hawk beside it', () => {
    const g = game('hunter');
    g.side('player').hand = [{ iid: 1, defId: 'h_falconer' }];
    g.side('player').mana = 20;
    g.playCard(0, { kind: 'slot', lane: 2 });
    const hawk = g.unitsOf('player').find((u) => u.defId === 'h_hawk_token');
    expect(hawk?.keywords.has('flying')).toBe(true);
    expect(Math.abs(hawk!.lane - 2)).toBe(1);
  });

  it('올가미 roots; 교란 사격 shoves into a free neighbouring cell', () => {
    const g = game('hunter');
    const a = place(g, 'sk_warrior', 'enemy', 2, 3);
    play(g, 'h_snare', { kind: 'unit', uid: a.uid });
    expect(a.rootedTurns).toBe(2);
    const before = { lane: a.lane, row: a.row };
    play(g, 'h_disrupt', { kind: 'unit', uid: a.uid });
    expect(Math.abs(a.lane - before.lane) + Math.abs(a.row - before.row)).toBe(1);
  });

  it('약점 포착 marks a foe and those around it: +1 from every hit', () => {
    const g = game('hunter');
    const a = place(g, 'sk_warrior', 'enemy', 2, 3);
    const b = place(g, 'sk_warrior', 'enemy', 3, 4);
    play(g, 'h_weakspot');
    expect(a.marked).toBe(2);
    expect(b.marked).toBe(2);
    play(g, 'firebolt', { kind: 'unit', uid: a.uid });
    expect(a.health).toBe(a.maxHealth - 4);
  });

  it('전술적 후퇴 pulls every ally back a cell and draws', () => {
    const g = game('hunter');
    const front = place(g, 'squire', 'player', 1, 2);
    const back = place(g, 'squire', 'player', 1, 1);
    const home = place(g, 'squire', 'player', 3, 0);
    g.side('player').drawPile = [{ iid: 9, defId: 'squire' }];
    play(g, 'h_retreat');
    expect([back.row, front.row, home.row]).toEqual([0, 1, 0]);
    expect(g.side('player').hand.map((c) => c.defId)).toEqual(['squire']);
  });

  it('연막 hides units from targeted spells and shots, but not from random hits', () => {
    const g = game('hunter');
    const mine = place(g, 'squire', 'player', 1, 1);
    const foe = place(g, 'sk_warrior', 'enemy', 0, 1);
    play(g, 'h_smoke', { kind: 'cell', lane: 0, row: 0 });
    expect(g.inSmoke(mine)).toBe(true);
    // Our firebolt cannot pick the foe in the smoke either.
    g.side('player').hand = [{ iid: 3, defId: 'firebolt' }];
    expect(g.cardTargets(0).some((t) => t.kind === 'unit' && t.uid === foe.uid)).toBe(false);
    // An enemy archer shoots past our hidden squire.
    const archer = place(g, 'sk_hunter', 'enemy', 1, 3);
    expect(g.targetAhead(archer)?.hit).not.toBe(mine);
  });

  it('일제 매복 sets a trap in front of up to three foes', () => {
    const g = game('hunter');
    place(g, 'sk_warrior', 'enemy', 0, 3);
    place(g, 'sk_warrior', 'enemy', 2, 4);
    place(g, 'sk_warrior', 'enemy', 4, 5);
    play(g, 'h_volley_trap');
    expect(g.state.traps).toHaveLength(3);
  });
});

describe('hero card pools', () => {
  it('captain, warchief and hunter each have new bundles, and tokens never reach the shop', () => {
    for (const hero of ['captain', 'warchief', 'hunter']) {
      const own = Object.values(CARDS).filter((c) => c.hero === hero && !c.id.endsWith('_token'));
      for (const c of own) expect(ALL_BUNDLES.some((b) => b.cards.includes(c.id)), c.id).toBe(true);
    }
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) for (const o of rollShop(rng, 'hunter').offers) expect(o.defId.endsWith('_token')).toBe(false);
  });
});
