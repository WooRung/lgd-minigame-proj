import { type GameKind, isGame, isObject } from './contracts';
import { isRunMode, type RunMode } from './runs';
export interface RankedRecord {
  playerId: string;
  name: string;
  score: number;
  ticks: number;
  rank: number;
  distance: number | null;
}
export interface Leaderboard {
  game: GameKind;
  mode: RunMode;
  period: string;
  seed: number;
  rulesVersion: string;
  stage: number;
  top: RankedRecord[];
  nearby: RankedRecord[];
  mine: RankedRecord | null;
  total: number;
}
export function readLeaderboard(v: unknown): Leaderboard {
  if (
    !isObject(v) ||
    !isGame(v.game) ||
    !isRunMode(v.mode) ||
    typeof v.period !== 'string' ||
    typeof v.seed !== 'number' ||
    typeof v.rulesVersion !== 'string' ||
    typeof v.stage !== 'number' ||
    !Array.isArray(v.top) ||
    !Array.isArray(v.nearby) ||
    typeof v.total !== 'number'
  )
    throw Error('랭킹 정보를 확인할 수 없습니다.');
  function row(r: unknown): RankedRecord {
    if (
      !isObject(r) ||
      typeof r.playerId !== 'string' ||
      typeof r.name !== 'string' ||
      typeof r.score !== 'number' ||
      typeof r.ticks !== 'number' ||
      typeof r.rank !== 'number' ||
      !(
        r.distance === null ||
        (typeof r.distance === 'number' && Number.isSafeInteger(r.distance))
      )
    )
      throw Error('기록 형식 오류');
    return {
      playerId: r.playerId,
      name: r.name,
      score: r.score,
      ticks: r.ticks,
      rank: r.rank,
      distance: r.distance,
    };
  }
  return {
    game: v.game,
    mode: v.mode,
    period: v.period,
    seed: v.seed,
    rulesVersion: v.rulesVersion,
    stage: v.stage,
    top: v.top.map(row),
    nearby: v.nearby.map(row),
    mine: v.mine === null ? null : row(v.mine),
    total: v.total,
  };
}
export interface HistoryRow {
  id: string;
  mode: string;
  stage: number | null;
  score: number;
  ticks: number | null;
  outcome: string;
  endedAt: number;
  rank: number | null;
  distance: number | null;
  rulesVersion: string;
}
export function readHistory(value: unknown): HistoryRow[] {
  if (!Array.isArray(value)) throw Error('기록 응답 오류');
  return value.map((v: unknown) => {
    if (
      !isObject(v) ||
      typeof v.id !== 'string' ||
      typeof v.mode !== 'string' ||
      !(v.stage === null || typeof v.stage === 'number') ||
      typeof v.score !== 'number' ||
      !(v.ticks === null || typeof v.ticks === 'number') ||
      typeof v.outcome !== 'string' ||
      typeof v.endedAt !== 'number' ||
      !(v.rank === null || typeof v.rank === 'number') ||
      !(
        v.distance === null ||
        (typeof v.distance === 'number' && Number.isSafeInteger(v.distance))
      ) ||
      typeof v.rulesVersion !== 'string'
    )
      throw Error('기록 응답 오류');
    return {
      id: v.id,
      mode: v.mode,
      stage: v.stage,
      score: v.score,
      ticks: v.ticks,
      outcome: v.outcome,
      endedAt: v.endedAt,
      rank: v.rank,
      distance: v.distance,
      rulesVersion: v.rulesVersion,
    };
  });
}
