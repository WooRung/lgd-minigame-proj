export type GameKind = 'bomber' | 'runner';
export interface Player {
  id: string;
  name: string;
}
export interface Progress {
  game: GameKind;
  completed_stage: number;
  best_score: number;
  current_best_score?: number | null;
}
export interface Profile {
  player: Player | null;
  progress: Progress[];
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isGame(value: unknown): value is GameKind {
  return value === 'bomber' || value === 'runner';
}
export function readProfile(value: unknown): Profile {
  if (!isObject(value) || !Array.isArray(value.progress))
    throw new Error('응답 형식이 올바르지 않습니다.');
  const p = value.player;
  if (
    p !== null &&
    (!isObject(p) || typeof p.id !== 'string' || typeof p.name !== 'string')
  )
    throw new Error('플레이어 응답을 확인할 수 없습니다.');
  const progress: Progress[] = value.progress.map((r: unknown) => {
    if (
      !isObject(r) ||
      !isGame(r.game) ||
      typeof r.completed_stage !== 'number' ||
      typeof r.best_score !== 'number' ||
      !(
        r.current_best_score === undefined ||
        r.current_best_score === null ||
        (typeof r.current_best_score === 'number' &&
          Number.isFinite(r.current_best_score))
      )
    )
      throw new Error('진행도 응답을 확인할 수 없습니다.');
    return {
      game: r.game,
      completed_stage: r.completed_stage,
      best_score: r.best_score,
      current_best_score: r.current_best_score ?? null,
    };
  });
  if (p === null) return { player: null, progress };
  if (typeof p.id !== 'string' || typeof p.name !== 'string')
    throw new Error('플레이어 응답이 올바르지 않습니다.');
  return { player: { id: p.id, name: p.name }, progress };
}
