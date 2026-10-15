import { card, type CardDef } from './cards';
import type { Game } from './engine';
import { homeRow, LANES, other, type Side, type Target, type Unit } from './types';

/**
 * Greedy card AI used for the enemy hero (and by tests to play the player's side).
 * Each step it scores every legal play and makes the best one until nothing is worth it.
 */
export function aiTakeTurn(g: Game, side: Side) {
  for (let guard = 0; guard < 20 && !g.over; guard++) {
    resolvePendingChoice(g, side);
    const best = bestPlay(g, side);
    if (!best) break;
    if (!g.playCardAs(side, best.index, best.target)) break;
  }
  resolvePendingChoice(g, side);
  if (g.over) return;
  const powerTarget = pickPowerTarget(g, side);
  if (powerTarget) g.heroPowerAs(side, powerTarget);
}

/** How dangerous a foe unit is to `side`: stronger and closer to our home is worse. */
function threat(u: Unit, side: Side): number {
  const dist = Math.abs(u.row - homeRow(side));
  return u.attack * 2 + u.health * 0.5 + (7 - dist) * 1.5;
}

function laneThreat(g: Game, side: Side, lane: number): number {
  return g.unitsOf(other(side)).filter((u) => u.lane === lane).reduce((t, u) => t + threat(u, side), 0);
}

function pickLane(g: Game, side: Side, lanes: number[]): number {
  // Block the most dangerous lane; otherwise spread out across quiet lanes.
  const mine = (l: number) => g.unitsOf(side).filter((u) => u.lane === l).length;
  return [...lanes].sort((a, b) =>
    laneThreat(g, side, b) - laneThreat(g, side, a) || mine(a) - mine(b) || g.rng.next() - 0.5)[0];
}

function bestPlay(g: Game, side: Side): { index: number; target: Target } | null {
  const hand = g.side(side).hand;
  let best: { index: number; target: Target; score: number } | null = null;
  hand.forEach((inst, index) => {
    if (!g.canPlayAs(side, index)) return;
    const def = card(inst.defId);
    const choice = evaluate(g, side, def, g.targetsFor(side, index));
    if (choice && choice.score > 0 && (!best || choice.score > best.score)) best = { index, ...choice };
  });
  return best;
}

function evaluate(g: Game, side: Side, def: CardDef, targets: Target[]): { target: Target; score: number } | null {
  // Costs run on a 20-mana scale; half a point per mana keeps the bonuses below in proportion.
  const base = def.cost * 5;
  const foeHero = g.side(other(side)).hero;
  const myHero = g.side(side).hero;
  const foes = g.unitsOf(other(side));

  if (def.type === 'minion') {
    const lanes = targets.flatMap((t) => (t.kind === 'slot' ? [t.lane] : []));
    if (lanes.length === 0) return null;
    return { target: { kind: 'slot', lane: pickLane(g, side, lanes) }, score: base + 6 };
  }

  const ai = def.ai;
  switch (ai.kind) {
    case 'damage': {
      if (targets.some((t) => t.kind === 'hero') && foeHero.health <= ai.amount) {
        return { target: { kind: 'hero', side: other(side) }, score: 10000 };
      }
      let pick: { target: Target; score: number } | null = null;
      for (const t of targets) {
        if (t.kind !== 'unit') continue;
        const u = g.unit(t.uid)!;
        if (u.keywords.has('ward')) continue;
        const kills = u.health <= ai.amount;
        const value = threat(u, side) + (kills ? 10 : -6);
        if (!pick || value > pick.score) pick = { target: t, score: value };
      }
      const heroTarget = targets.find((t) => t.kind === 'hero');
      if (heroTarget && (!pick || pick.score < 8)) return { target: heroTarget, score: base + ai.amount };
      return pick ? { target: pick.target, score: base + pick.score } : null;
    }
    case 'aoe': {
      if (foes.length < 2) return null;
      return { target: { kind: 'none' }, score: base + foes.length * 6 - 8 };
    }
    case 'buff': {
      const allies = targets.flatMap((t) => (t.kind === 'unit' ? [g.unit(t.uid)!] : []));
      if (allies.length === 0) return null;
      const front = allies.sort((a, b) => b.attack - a.attack || b.health - a.health)[0];
      return { target: { kind: 'unit', uid: front.uid }, score: base + 4 };
    }
    case 'buffAll': {
      const n = g.unitsOf(side).length;
      return n >= 2 ? { target: { kind: 'none' }, score: base + n * 4 } : null;
    }
    case 'lane': {
      let lane = -1;
      let worst = 0;
      for (let l = 0; l < LANES; l++) {
        const t = laneThreat(g, side, l);
        if (t > worst) { worst = t; lane = l; }
      }
      return lane >= 0 && worst > 8 ? { target: { kind: 'lane', lane }, score: base + worst / 2 } : null;
    }
    case 'summon': {
      const slot = targets.find((t) => t.kind === 'slot');
      if (slot) {
        const lanes = targets.flatMap((t) => (t.kind === 'slot' ? [t.lane] : []));
        return { target: { kind: 'slot', lane: pickLane(g, side, lanes) }, score: base + 3 };
      }
      return g.freeHomeLanes(side).length > 0 ? { target: { kind: 'none' }, score: base + 3 } : null;
    }
    case 'draw': {
      if (ai.selfDamage && myHero.health <= ai.selfDamage + 8) return null;
      return { target: { kind: 'none' }, score: base - (g.side(side).hand.length > 4 ? 8 : 1) + 2 };
    }
    case 'discover':
      return g.side(side).hand.length < 8 ? { target: { kind: 'none' }, score: base + 3 } : null;
    case 'disrupt':
      return g.side(other(side)).hand.length > 0 ? { target: { kind: 'none' }, score: base + 4 } : null;
    case 'recycle':
      return g.side(side).discard.length >= 2 ? { target: { kind: 'none' }, score: base + 2 } : null;
    case 'cycle': {
      const me = g.side(side);
      const stuck = me.hand.filter((c) => g.costOf(c) > me.maxMana + 2).length;
      return stuck >= 2 ? { target: { kind: 'none' }, score: base + stuck } : null;
    }
    case 'discount':
      return g.side(side).hand.length >= 4 ? { target: { kind: 'none' }, score: base + 3 } : null;
    case 'copy': {
      const allies = targets.flatMap((t) => (t.kind === 'unit' ? [g.unit(t.uid)!] : []));
      if (allies.length === 0) return null;
      const best = allies.sort((a, b) => card(b.defId).cost - card(a.defId).cost)[0];
      return { target: { kind: 'unit', uid: best.uid }, score: base + 2 };
    }
    case 'heal':
      return myHero.maxHealth - myHero.health >= 6 ? { target: { kind: 'none' }, score: base } : null;
    case 'control': {
      const units = targets.flatMap((t) => (t.kind === 'unit' ? [g.unit(t.uid)!] : []));
      if (units.length === 0) return null;
      const worst = units.sort((a, b) => threat(b, side) - threat(a, side))[0];
      return threat(worst, side) > 10 ? { target: { kind: 'unit', uid: worst.uid }, score: base + 6 } : null;
    }
    case 'ramp': {
      // Worth it only when it unlocks a card we could not afford otherwise.
      const me = g.side(side);
      const unlocks = me.hand.some((c) => card(c.defId).cost > me.mana && card(c.defId).cost <= me.mana + 4);
      return unlocks ? { target: { kind: 'none' }, score: 5 } : null;
    }
  }
}

/** 탐색: take the priciest option we could afford within a turn or two. */
function resolvePendingChoice(g: Game, side: Side) {
  const c = g.state.choice;
  if (!c || c.side !== side) return;
  const max = g.side(side).maxMana + 2;
  const scored = c.options.map((id, i) => ({ i, cost: card(id).cost }));
  const best = scored.filter((o) => o.cost <= max).sort((a, b) => b.cost - a.cost)[0] ?? scored[0];
  g.resolveChoice(best.i);
}

function pickPowerTarget(g: Game, side: Side): Target | null {
  const targets = g.heroPowerTargets(side);
  if (targets.length === 0) return null;
  const kind = g.powerOf(side).target;
  if (kind === 'none') return g.side(side).hand.length < 7 ? targets[0] : null;
  if (kind === 'ally' && g.powerOf(side).id === 'guard') {
    // 방패 명령: shield the unshielded ally closest to the enemy (it takes the next hit).
    const allies = targets.flatMap((t) => (t.kind === 'unit' ? [g.unit(t.uid)!] : [])).filter((u) => !u.keywords.has('ward'));
    const dist = (u: Unit) => Math.abs(homeRow(other(side)) - u.row);
    const best = allies.sort((a, b) => dist(a) - dist(b) || b.health - a.health)[0];
    return best ? { kind: 'unit', uid: best.uid } : null;
  }
  if (kind === 'ally') {
    const allies = targets.flatMap((t) => (t.kind === 'unit' ? [g.unit(t.uid)!] : [])).filter((u) => u.attack > 0);
    const best = allies.sort((a, b) => b.attack - a.attack)[0];
    return best ? { kind: 'unit', uid: best.uid } : null;
  }
  if (kind === 'lane') {
    // 조준 사격: kill a front unit if possible (strongest first), else hit the strongest one, else the hero.
    const fronts = targets.flatMap((t) => {
      if (t.kind !== 'lane') return [];
      const u = g.state.units.filter((x) => x.side !== side && x.lane === t.lane)
        .sort((a, b) => (side === 'player' ? a.row - b.row : b.row - a.row))[0];
      return [{ lane: t.lane, u }];
    });
    const hittable = fronts.filter((f) => f.u && !f.u.keywords.has('ward'));
    const kill = hittable.filter((f) => f.u!.health <= 2).sort((a, b) => b.u!.attack - a.u!.attack)[0];
    const strongest = hittable.sort((a, b) => b.u!.attack - a.u!.attack)[0];
    const empty = fronts.find((f) => !f.u);
    const pick = kill ?? strongest ?? empty;
    return pick ? { kind: 'lane', lane: pick.lane } : null;
  }
  if (targets[0].kind === 'slot') {
    const lanes = targets.flatMap((t) => (t.kind === 'slot' ? [t.lane] : []));
    return { kind: 'slot', lane: pickLane(g, side, lanes) };
  }
  // 1 damage: finish off a 1-health unit if possible, otherwise chip the hero.
  const weak = targets.find((t) => t.kind === 'unit' && g.unit(t.uid)!.health === 1 && !g.unit(t.uid)!.keywords.has('ward'));
  return weak ?? targets.find((t) => t.kind === 'hero') ?? null;
}
