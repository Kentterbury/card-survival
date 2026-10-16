import { aiTakeTurn } from '../game/ai';
import type { Game } from '../game/engine';

/** Plays the player's side with the same greedy AI the enemy uses. */
export function playTurn(game: Game) {
  aiTakeTurn(game, 'player');
  if (game.state.phase === 'player') game.endTurn();
}

export function playRun(game: Game, maxTurns = 600, hero = 'captain'): { stagesCleared: number; won: boolean; turns: number } {
  game.startRun(undefined, hero);
  let turns = 0;
  while (turns < maxTurns) {
    const s = game.state;
    if (s.phase === 'victory' || s.phase === 'defeat') break;
    if (s.phase === 'reward') {
      game.chooseReward(0);
      continue;
    }
    if (s.phase === 'camp') {
      // Rest, then buy the priciest card we can afford and set out.
      game.campRest();
      const offers = s.shop?.offers.map((o, i) => ({ ...o, i })).filter((o) => !o.sold && o.price <= s.gold) ?? [];
      offers.sort((a, b) => b.price - a.price);
      if (offers[0]) game.shopBuy(offers[0].i);
      game.departCamp();
      continue;
    }
    playTurn(game);
    turns++;
  }
  return { stagesCleared: game.state.stagesCleared, won: game.state.phase === 'victory', turns };
}
