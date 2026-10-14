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
      game.campRest();
      continue;
    }
    playTurn(game);
    turns++;
  }
  return { stagesCleared: game.state.stagesCleared, won: game.state.phase === 'victory', turns };
}
