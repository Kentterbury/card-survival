import { describe, expect, it } from 'vitest';
import { card, CARDS, STARTER_DECK, type MinionCard } from '../src/game/cards';
import { Game, unitSpeed } from '../src/game/engine';
import { heroDef } from '../src/game/heroes';
import { CARD_PRICE, HEAL_AMOUNT, HEAL_PRICE, REMOVE_PRICE, stageGold } from '../src/game/shop';
import { STAGES } from '../src/game/stages';
import { LAST_ROW, RANGED_RANGE, type Side, type Unit } from '../src/game/types';
import { playRun } from '../src/sim/bot';

const START_HP = heroDef('captain').health;

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
    keywords, scale: 1, lane, row, speed: unitSpeed(d.attack, keywords), range: keywords.has('ranged') ? RANGED_RANGE : 1,
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
    expect(g.side('player').hero.health).toBe(START_HP);
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

  it('돌파: a melee kill moves the attacker into the cleared cell', () => {
    const g = freshGame(Array(10).fill('squire'));
    const b = place(g, 'berserker', 'player', 2, 3);
    place(g, 'sk_minion', 'enemy', 2, 4).frozen = true;
    passTurn(g);
    expect(b.row).toBe(4);
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
    expect(g.side('player').hero.health).toBe(START_HP - 3);
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
    expect(g.state.phase).toBe('camp');
    g.campRest();
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

  it('화염 폭탄병 blasts every character around it when it dies', () => {
    const g = freshGame(Array(10).fill('squire'));
    const bomber = place(g, 'bomber', 'player', 2, 2);
    bomber.health = 1;
    const front = place(g, 'sk_warrior', 'enemy', 2, 3);
    const diag = place(g, 'sk_minion', 'enemy', 3, 3);
    const ally = place(g, 'shieldbearer', 'player', 1, 2);
    const far = place(g, 'sk_minion', 'enemy', 2, 5);
    const hp = g.side('enemy').hero.health;
    g.side('enemy').hand = [];
    g.endTurn();
    expect(diag.health).toBeLessThanOrEqual(0);
    expect(front.health).toBeLessThan(4);
    expect(ally.keywords.has('ward')).toBe(false); // ally caught in the blast (ward soaked it)
    expect(far.health).toBe(2);
    expect(g.side('enemy').hero.health).toBe(hp);
  });

  it('화염 폭탄병 on the last row also hits the enemy hero', () => {
    const g = freshGame(Array(10).fill('squire'));
    const bomber = place(g, 'bomber', 'player', 1, LAST_ROW);
    bomber.health = 1;
    const hp = g.side('enemy').hero.health;
    // The enemy kills it with a curse on its own turn.
    g.state.phase = 'enemy';
    g.side('enemy').hand = [{ iid: 1, defId: 'e_curse' }];
    g.side('enemy').mana = 1;
    expect(g.playCardAs('enemy', 0, { kind: 'unit', uid: bomber.uid })).toBe(true);
    expect(g.unit(bomber.uid)).toBeUndefined();
    expect(g.side('enemy').hero.health).toBe(hp - 2);
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

describe('keywords', () => {
  const enemyIdle = (g: Game) => { g.side('enemy').hand = []; g.side('enemy').drawPile = []; g.side('enemy').powerUsed = true; };

  it('넉백 pushes a surviving target back one cell', () => {
    const g = freshGame(Array(10).fill('squire'));
    place(g, 'mace_knight', 'player', 2, 2);
    const foe = place(g, 'sk_guard', 'enemy', 2, 3);
    foe.keywords.delete('ward');
    enemyIdle(g);
    g.endTurn();
    // pushed to row 4 on our turn; on its own turn it walks back to row 3
    expect(foe.row).toBe(3);
    expect(foe.health).toBe(6 - 3);
  });

  it('관통 also hits the unit behind the target', () => {
    const g = freshGame(Array(10).fill('squire'));
    place(g, 'longbow', 'player', 1, 0);
    const a = place(g, 'sk_warrior', 'enemy', 1, 2);
    const b = place(g, 'sk_warrior', 'enemy', 1, 3);
    passTurn(g);
    expect(a.health).toBe(2);
    expect(b.health).toBe(2);
  });

  it('관통 from the last row reaches the enemy hero behind', () => {
    const g = freshGame(Array(10).fill('squire'));
    place(g, 'longbow', 'player', 1, LAST_ROW - 2);
    place(g, 'sk_warrior', 'enemy', 1, LAST_ROW);
    const hp = g.side('enemy').hero.health;
    passTurn(g);
    expect(g.side('enemy').hero.health).toBe(hp - 2);
  });

  it('비행 flies over blockers and cannot be hit by melee', () => {
    const g = freshGame(Array(10).fill('squire'));
    const flyer = place(g, 'glider', 'player', 3, 1);
    const wall = place(g, 'sk_warrior', 'enemy', 3, 2);
    passTurn(g);
    expect(flyer.row).toBe(3); // jumped over the warrior
    expect(flyer.health).toBe(1);
    expect(wall.health).toBe(4);
    expect(g.targetAhead(wall)).toBeNull();
  });

  it('대열 adds attack with an ally beside it', () => {
    const g = freshGame(Array(10).fill('squire'));
    const p = place(g, 'phalanx', 'player', 2, 1);
    expect(g.attackOf(p)).toBe(1);
    place(g, 'squire', 'player', 3, 1);
    expect(g.attackOf(p)).toBe(3);
  });

  it('흡혈 heals our hero by the damage dealt', () => {
    const g = freshGame(Array(10).fill('squire'));
    g.side('player').hero.health = 20;
    place(g, 'blood_blade', 'player', 0, 2);
    place(g, 'sk_brute', 'enemy', 0, 3);
    passTurn(g);
    expect(g.side('player').hero.health).toBe(23);
  });

  it('불사 brings a unit back once with 1 health', () => {
    const g = freshGame(Array(10).fill('squire'));
    const s = place(g, 'stalwart', 'player', 4, 2);
    // The brute's counter kills it; frozen, the brute cannot finish it off on its own turn.
    place(g, 'sk_brute', 'enemy', 4, 3).frozen = true;
    passTurn(g);
    expect(g.unit(s.uid)?.health).toBe(1);
    expect(s.keywords.has('undying')).toBe(false);
  });

  it('질주 moves two cells and 고정 holds still', () => {
    const g = freshGame(Array(10).fill('squire'));
    const fast = place(g, 'shadowblade', 'player', 0, 0);
    const still = place(g, 'warden', 'player', 1, 0);
    passTurn(g);
    expect(fast.row).toBe(2);
    expect(still.row).toBe(0);
  });
});

describe('keywords (2nd batch)', () => {
  it('휩쓸기 also hits foes beside the target', () => {
    const g = freshGame(Array(10).fill('squire'));
    place(g, 'greatsword', 'player', 2, 2);
    const a = place(g, 'sk_warrior', 'enemy', 2, 3);
    const b = place(g, 'sk_warrior', 'enemy', 1, 3);
    const c = place(g, 'sk_warrior', 'enemy', 3, 4);
    a.frozen = b.frozen = c.frozen = true;
    passTurn(g);
    expect(a.health).toBe(1);
    expect(b.health).toBe(1);
    expect(c.health).toBe(4); // different row
  });

  it('가시 hurts melee attackers but not ranged ones', () => {
    const g = freshGame(Array(10).fill('squire'));
    const melee = place(g, 'berserker', 'player', 0, 2);
    const thorn = place(g, 'sk_thorn', 'enemy', 0, 3);
    thorn.frozen = true;
    const xbow = place(g, 'crossbowman', 'player', 4, 0);
    const thorn2 = place(g, 'sk_thorn', 'enemy', 4, 2);
    thorn2.frozen = true;
    passTurn(g);
    expect(melee.health).toBe(3 - 1 - 2); // counter 1 + thorns 2
    expect(xbow.health).toBe(2);
  });

  it('엄호 takes ranged shots and blocks targeted spells for its lane', () => {
    const g = freshGame(Array(6).fill('firebolt'));
    const mage = place(g, 'sk_mage', 'enemy', 1, 3);
    const wall = place(g, 'sk_shieldwall', 'enemy', 1, 4);
    expect(g.cardTargets(0).some((t) => t.kind === 'unit' && t.uid === mage.uid)).toBe(false);
    expect(g.cardTargets(0).some((t) => t.kind === 'unit' && t.uid === wall.uid)).toBe(true);
    place(g, 'crossbowman', 'player', 1, 1);
    mage.frozen = wall.frozen = true;
    passTurn(g);
    expect(mage.health).toBe(3);
    expect(wall.health).toBe(7 - 2);
  });

  it('재생 heals fully at the start of its side\'s turn', () => {
    const g = freshGame(Array(10).fill('squire'));
    const m = place(g, 'monk', 'player', 0, 0);
    m.health = 1;
    passTurn(g);
    expect(m.health).toBe(4);
  });

  it('분노 gains attack each time it survives damage', () => {
    const g = freshGame(Array(10).fill('squire'));
    const b = place(g, 'brawler', 'player', 2, 2);
    place(g, 'sk_minion', 'enemy', 2, 3).frozen = true;
    passTurn(g);
    expect(b.attack).toBe(2);
  });

  it('선봉 gets +2 attack only while it is the front-most ally', () => {
    const g = freshGame(Array(10).fill('squire'));
    const v = place(g, 'vanguard_captain', 'player', 0, 2);
    place(g, 'squire', 'player', 3, 1);
    expect(g.attackOf(v)).toBe(4);
    place(g, 'squire', 'player', 4, 3);
    expect(g.attackOf(v)).toBe(2);
  });

  it('가시 갑옷 and 재생의 축복 grant their keywords', () => {
    const g = freshGame(['thorn_armor', 'renewal', 'thorn_armor', 'renewal']);
    g.side('player').mana = 10;
    const u = place(g, 'squire', 'player', 0, 1);
    u.health = 1;
    const thornIdx = g.side('player').hand.findIndex((c) => c.defId === 'thorn_armor');
    g.playCard(thornIdx, { kind: 'unit', uid: u.uid });
    expect(u.keywords.has('thorns')).toBe(true);
    const renewIdx = g.side('player').hand.findIndex((c) => c.defId === 'renewal');
    g.playCard(renewIdx, { kind: 'unit', uid: u.uid });
    expect(u.keywords.has('regenerate')).toBe(true);
    expect(u.health).toBe(u.maxHealth);
  });
});

describe('utility cards', () => {
  const setup = (id: string, extra: string[] = []) => {
    const g = freshGame([id, ...extra, 'squire', 'squire', 'squire', 'squire', 'squire']);
    const me = g.side('player');
    me.hand = [{ iid: 1, defId: id }, ...extra.map((d, i) => ({ iid: 10 + i, defId: d }))];
    me.mana = 10;
    return g;
  };

  it('피의 계약 costs 3 health and draws 2', () => {
    const g = setup('blood_pact');
    g.playCard(0, { kind: 'none' });
    expect(g.side('player').hero.health).toBe(START_HP - 3);
    expect(g.side('player').hand).toHaveLength(2);
  });

  it('탐색 waits for a pick, blocks other actions, then adds the card (with discount)', () => {
    const g = setup('reinforce', ['squire']);
    g.playCard(0, { kind: 'none' });
    const c = g.state.choice!;
    expect(c.options).toHaveLength(3);
    expect(c.options.every((id) => card(id).type === 'minion' && !card(id).enemy)).toBe(true);
    expect(g.canPlay(0)).toBe(false);
    expect(g.endTurn()).toEqual([]);
    g.chooseOption(1);
    expect(g.state.choice).toBeNull();
    const got = g.side('player').hand.at(-1)!;
    expect(got.defId).toBe(c.options[1]);
    expect(g.costOf(got)).toBe(Math.max(0, card(got.defId).cost - 1));
  });

  it('작전 변경 discards the hand and draws the same number', () => {
    const g = setup('change_plans', ['firebolt', 'firebolt', 'firebolt']);
    g.playCard(0, { kind: 'none' });
    const me = g.side('player');
    expect(me.hand).toHaveLength(3);
    expect(me.discard.filter((c) => c.defId === 'firebolt')).toHaveLength(3);
  });

  it('재활용 returns cards from the discard pile, not itself', () => {
    const g = setup('salvage');
    g.side('player').discard = [{ iid: 50, defId: 'thunderbolt' }, { iid: 51, defId: 'meteor' }];
    g.playCard(0, { kind: 'none' });
    expect(g.side('player').hand.map((c) => c.defId).sort()).toEqual(['meteor', 'thunderbolt']);
  });

  it('봉인의 사슬 locks enemy cards for their next turn only', () => {
    const g = setup('chains');
    const en = g.side('enemy');
    en.hand = [{ iid: 60, defId: 'e_curse' }, { iid: 61, defId: 'e_curse' }];
    g.playCard(0, { kind: 'none' });
    expect(en.hand.every((c) => c.locked)).toBe(true);
    // During the enemy turn the AI cannot play them, and they unlock at its end.
    g.endTurn();
    expect(en.hand.filter((c) => c.defId === 'e_curse')).toHaveLength(2);
    expect(en.hand.some((c) => c.locked)).toBe(false);
  });

  it('소매치기 takes a card from the enemy hand', () => {
    const g = setup('pickpocket');
    g.side('enemy').hand = [{ iid: 70, defId: 'e_soulfire' }];
    g.playCard(0, { kind: 'none' });
    expect(g.side('enemy').hand).toHaveLength(0);
    expect(g.side('player').hand.map((c) => c.defId)).toEqual(['e_soulfire']);
  });

  it('stolen enemy spells work for the player', () => {
    const g = setup('e_soulfire');
    const hp = g.side('enemy').hero.health;
    expect(g.playCard(0, { kind: 'hero', side: 'enemy' }).length).toBeGreaterThan(0);
    expect(g.side('enemy').hero.health).toBe(hp - 6);
  });

  it('도굴 takes the top of the enemy deck', () => {
    const g = setup('grave_rob');
    const top = g.side('enemy').drawPile.at(-1)!;
    g.playCard(0, { kind: 'none' });
    expect(g.side('player').hand.at(-1)!.defId).toBe(top.defId);
  });

  it('망각의 저주 makes the enemy skip its next draw', () => {
    const g = setup('oblivion');
    g.side('enemy').hand = [];
    g.playCard(0, { kind: 'none' });
    const pile = g.side('enemy').drawPile.length;
    g.endTurn();
    expect(g.side('enemy').drawPile.length).toBe(pile);
  });

  it('거울상 copies an ally card into the hand at -1 cost', () => {
    const g = setup('mirror_image');
    const u = place(g, 'warlord', 'player', 1, 1);
    g.playCard(0, { kind: 'unit', uid: u.uid });
    const copy = g.side('player').hand.find((c) => c.defId === 'warlord')!;
    expect(g.costOf(copy)).toBe(5);
  });

  it('보급 마차 makes the rest of the hand cheaper', () => {
    const g = setup('supply_wagon', ['meteor', 'firebolt']);
    g.playCard(0, { kind: 'none' });
    const hand = g.side('player').hand;
    expect(g.costOf(hand.find((c) => c.defId === 'meteor')!)).toBe(5);
    expect(g.costOf(hand.find((c) => c.defId === 'firebolt')!)).toBe(0);
  });

  it('the enemy resolves its own 탐색-free utility (e_hex locks one of our cards)', () => {
    const g = freshGame(Array(10).fill('squire'));
    g.state.phase = 'enemy';
    g.side('enemy').hand = [{ iid: 80, defId: 'e_hex' }];
    g.side('enemy').mana = 2;
    g.playCardAs('enemy', 0, { kind: 'none' });
    expect(g.side('player').hand.filter((c) => c.locked)).toHaveLength(1);
  });
});

describe('heroes, camp and saves', () => {
  it('each hero starts with its own deck, health and 지휘술', async () => {
    const { HEROES } = await import('../src/game/heroes');
    for (const h of HEROES) {
      const g = new Game(3);
      g.startRun(undefined, h.id);
      expect(g.side('player').hero.health).toBe(h.health);
      expect([...g.state.deckList].sort()).toEqual([...h.deck].sort());
      expect(g.powerOf('player').id).toBe(h.power);
    }
  });

  it('비전 통찰 draws a card and 돌격 명령 gives an ally +1/+1 and pushes it forward', () => {
    const a = new Game(4);
    a.startRun(undefined, 'arcanist');
    a.side('player').mana = 2;
    const before = a.side('player').hand.length;
    a.heroPower({ kind: 'none' });
    expect(a.side('player').hand.length).toBe(before + 1);

    const w = new Game(4);
    w.startRun(undefined, 'warchief');
    w.state.units = [];
    w.side('player').mana = 2;
    const u = place(w, 'squire', 'player', 2, 1);
    w.heroPower({ kind: 'unit', uid: u.uid });
    expect(u.attack).toBe(2);
    expect(u.health).toBe(4);
    expect(u.row).toBe(2);
  });

  it('the camp can trim a card instead of resting', () => {
    const g = freshGame(Array(10).fill('pyroblast'));
    g.side('player').mana = 10;
    g.side('enemy').hero.health = 1;
    g.playCard(0, { kind: 'hero', side: 'enemy' });
    g.chooseReward(0);
    const n = g.state.deckList.length;
    const hp = g.side('player').hero.health;
    g.campRemove(0);
    expect(g.state.deckList).toHaveLength(n - 1);
    expect(g.side('player').hero.health).toBe(hp);
    expect(g.state.stage).toBe(1);
  });

  it('a save made at the camp resumes at the next stage with the same deck and health', () => {
    const g = freshGame(Array(10).fill('pyroblast'));
    g.side('player').mana = 10;
    g.side('player').hero.health = 17;
    g.side('enemy').hero.health = 1;
    g.playCard(0, { kind: 'hero', side: 'enemy' });
    g.chooseReward(0);
    const save = JSON.parse(JSON.stringify(g.saveData()));
    const r = new Game(9);
    r.startRun(undefined, 'captain', save);
    expect(r.state.stage).toBe(1);
    expect(r.side('player').hero.health).toBe(17);
    expect(r.state.deckList).toEqual(g.state.deckList);
    expect(r.side('enemy').hero.name).toBe(STAGES[1].hero.name);
    expect(r.state.gold).toBe(g.state.gold);
  });
});

describe('gold and the merchant', () => {
  const atCamp = () => {
    const g = freshGame(Array(10).fill('pyroblast'));
    g.side('player').mana = 10;
    g.side('enemy').hero.health = 1;
    g.playCard(0, { kind: 'hero', side: 'enemy' });
    g.chooseReward(0);
    return g;
  };

  it('clearing a stage pays gold, more for a quick win', () => {
    const g = freshGame(Array(10).fill('pyroblast'));
    g.side('player').mana = 10;
    g.side('enemy').hero.health = 1;
    const events = g.playCard(0, { kind: 'hero', side: 'enemy' });
    const clear = events.find((e) => e.type === 'stageClear');
    expect(clear && clear.type === 'stageClear' && clear.gold).toBe(stageGold(0, 1));
    expect(g.state.gold).toBe(stageGold(0, 1));
    expect(stageGold(0, 1)).toBeGreaterThan(stageGold(0, 15));
  });

  it('the merchant offers five different cards at rarity prices', () => {
    const g = atCamp();
    const offers = g.state.shop!.offers;
    expect(offers).toHaveLength(5);
    expect(new Set(offers.map((o) => o.defId)).size).toBe(5);
    for (const o of offers) {
      const c = card(o.defId);
      expect(c.enemy).toBeFalsy();
      expect(o.price).toBe(CARD_PRICE[c.rarity]);
    }
  });

  it('buying a card spends gold and adds it to the deck, once', () => {
    const g = atCamp();
    g.state.gold = 100;
    const size = g.state.deckList.length;
    const o = g.state.shop!.offers[0];
    expect(g.shopBuy(0)).toBe(true);
    expect(g.state.gold).toBe(100 - o.price);
    expect(g.state.deckList).toHaveLength(size + 1);
    expect(g.state.deckList.at(-1)).toBe(o.defId);
    expect(g.shopBuy(0)).toBe(false);
    g.state.gold = 0;
    expect(g.shopBuy(1)).toBe(false);
  });

  it('removal and healing can each be bought once per visit', () => {
    const g = atCamp();
    g.state.gold = 200;
    const hero = g.side('player').hero;
    hero.health = 10;
    expect(g.shopHeal()).toBe(true);
    expect(hero.health).toBe(10 + HEAL_AMOUNT);
    expect(g.shopHeal()).toBe(false);
    const size = g.state.deckList.length;
    expect(g.shopRemove(0)).toBe(true);
    expect(g.state.deckList).toHaveLength(size - 1);
    expect(g.shopRemove(0)).toBe(false);
    expect(g.state.gold).toBe(200 - HEAL_PRICE - REMOVE_PRICE);
    // Leaving the camp closes the shop; the next camp restocks it.
    g.campRest();
    expect(g.state.shop).toBeNull();
    expect(g.shopBuy(0)).toBe(false);
  });
});

describe('data and simulation', () => {
  it('every referenced card exists', () => {
    for (const s of STAGES) for (const id of s.deck) expect(CARDS[id]).toBeDefined();
    for (const id of STARTER_DECK) expect(CARDS[id]).toBeDefined();
    // every hero deck card exists too
    void import('../src/game/heroes').then(({ HEROES }) => { for (const h of HEROES) for (const id of h.deck) expect(CARDS[id]).toBeDefined(); });
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
