import { BOMBER_RULES_VERSION } from '../core/bomber/map';
import { RUNNER_RULES_VERSION } from '../core/runner/segments';
import type { GameKind } from './contracts';

export function rulesForGame(game: GameKind): string {
  return game === 'runner' ? RUNNER_RULES_VERSION : BOMBER_RULES_VERSION;
}
