import { card } from '../game/cards';
import type { Game } from '../game/engine';
import { LANES, type Target } from '../game/types';

/** Greedy autoplayer used by tests and balance checks. Not meant to play well. */
export function playTurn(game: Game) {
  const s = game.state;
  const threat = (lane: number) =>
    s.monsters.filter((m) => m.lane === lane).reduce((t, m) => t + m.attack * (7 - m.row), 0);

  for (let guard = 0; guard < 40 && s.phase === 'player'; guard++) {
    let acted = false;
    // Attack first with anything that can.
    for (const m of game.minions()) {
      const targets = game.attackTargets(m.uid);
      if (targets.length) {
        const weakest = targets
          .map((uid) => s.monsters.find((x) => x.uid === uid)!)
          .sort((a, b) => a.health - b.health)[0];
        game.minionAttack(m.uid, weakest.uid);
        acted = true;
      }
    }
    // Play the most expensive affordable card.
    const playable = s.hand
      .map((c, i) => ({ i, def: card(c.defId) }))
      .filter(({ i }) => game.canPlay(i))
      .sort((a, b) => b.def.cost - a.def.cost);
    if (playable.length) {
      const { i, def } = playable[0];
      const targets = game.cardTargets(i);
      let target: Target = targets[0];
      if (def.type === 'minion' || targets[0].kind === 'slot' || targets[0].kind === 'lane') {
        target = [...targets].sort((a, b) =>
          threat('lane' in b ? b.lane : 0) - threat('lane' in a ? a.lane : 0))[0];
      } else if (targets[0].kind === 'monster') {
        target = [...targets].sort((a, b) => {
          const ma = s.monsters.find((m) => m.uid === (a as { uid: number }).uid)!;
          const mb = s.monsters.find((m) => m.uid === (b as { uid: number }).uid)!;
          return ma.row - mb.row;
        })[0];
      }
      if (game.playCard(i, target).length) acted = true;
    }
    if (!acted) break;
  }
  if (s.phase === 'player' && game.canUseHeroPower()) {
    const front = [...s.monsters].sort((a, b) => a.row - b.row)[0];
    game.heroPower(front.uid);
  }
  if (s.phase === 'player') game.endTurn();
}

export function playRun(game: Game, maxTurns = 400): { stagesCleared: number; won: boolean; turns: number } {
  game.startRun();
  let turns = 0;
  while (turns < maxTurns) {
    const s = game.state;
    if (s.phase === 'victory' || s.phase === 'defeat') break;
    if (s.phase === 'reward') {
      game.chooseReward(0);
      continue;
    }
    playTurn(game);
    turns++;
  }
  void LANES;
  return { stagesCleared: game.state.stagesCleared, won: game.state.phase === 'victory', turns };
}
