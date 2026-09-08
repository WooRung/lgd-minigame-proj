import { type GameKind, isGame, isObject } from './contracts';
export type RunMode = 'normal' | 'daily' | 'weekly';
export interface Run {
  id: string;
  game: GameKind;
  mode: RunMode;
  stage: number;
  seed: number;
  rulesVersion: string;
  period: string;
}
export function isRunMode(value: unknown): value is RunMode {
  return value === 'normal' || value === 'daily' || value === 'weekly';
}
export function readRun(value: unknown): Run {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    !isGame(value.game) ||
    !isRunMode(value.mode) ||
    typeof value.stage !== 'number' ||
    typeof value.seed !== 'number' ||
    typeof value.rulesVersion !== 'string' ||
    typeof value.period !== 'string'
  )
    throw Error('도전 정보를 읽을 수 없습니다.');
  return {
    id: value.id,
    game: value.game,
    mode: value.mode,
    stage: value.stage,
    seed: value.seed,
    rulesVersion: value.rulesVersion,
    period: value.period,
  };
}
