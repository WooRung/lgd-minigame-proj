import { RULES_VERSION } from '../core/random';
import { RUNNER_RULES_VERSION } from '../core/runner/segments';
import type { GameKind } from './contracts';

export function rulesForGame(game: GameKind): string {
  return game === 'runner' ? RUNNER_RULES_VERSION : RULES_VERSION;
}
