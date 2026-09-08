import { BOMBER_LIMIT } from '../core/bomber/game';
import { generateMap } from '../core/bomber/map';
import { TICK_MS } from '../core/random';
import { runnerDistanceAtTick } from '../core/runner/physics';
import { generateSegment, SEGMENT_LENGTH } from '../core/runner/segments';
import { isGame, type Player } from '../shared/contracts';
import { rulesForGame } from '../shared/game-rules';
import { isRunMode, type Run } from '../shared/runs';
import type { Env } from './env';
import { body, HttpError, json } from './http';
import { BEST_UPSERT, challenge, RUNNER_BEST_UPSERT } from './rankings';
export interface StoredRun {
  id: string;
  player_id: string;
  game: 'bomber' | 'runner';
  mode: 'normal' | 'daily' | 'weekly';
  stage: number;
  seed: number;
  rules_version: string;
  period: string;
  issued_at: number;
  finished_at: number | null;
  won: number | null;
  ticks: number | null;
  score: number | null;
}
export function publicRun(r: StoredRun): Run {
  return {
    id: r.id,
    game: r.game,
    mode: r.mode,
    stage: r.stage,
    seed: r.seed,
    rulesVersion: r.rules_version,
    period: r.period,
  };
}
export function validateResult(
  run: StoredRun,
  data: Record<string, unknown>,
  now: number,
) {
  const { ticks, score, won } = data;
  if (run.finished_at !== null)
    throw new HttpError(409, '이미 저장된 도전입니다.');
  if (run.rules_version !== rulesForGame(run.game))
    throw new HttpError(410, '규칙이 변경되었습니다. 새 도전을 시작해 주세요.');
  if (run.game === 'runner') {
    const { distance, reason } = data;
    if (
      typeof ticks !== 'number' ||
      !Number.isSafeInteger(ticks) ||
      ticks < 1 ||
      typeof distance !== 'number' ||
      !Number.isSafeInteger(distance) ||
      distance < 0 ||
      typeof score !== 'number' ||
      !Number.isSafeInteger(score) ||
      score < 0 ||
      score % 100 !== 0 ||
      won !== false ||
      (reason !== 'manual' && reason !== 'collision')
    )
      throw new HttpError(400, '러닝 결과 범위를 확인해 주세요.');
    if (
      ticks * TICK_MS > now - run.issued_at + 1200 ||
      distance !== runnerDistanceAtTick(ticks)
    )
      throw new HttpError(400, '플레이 시간과 이동 거리가 일치하지 않습니다.');
    const index = Math.floor(distance / SEGMENT_LENGTH);
    const current = generateSegment(run.seed, index);
    const reachable = current.coins.filter((c) => c.x < distance + 22).length;
    if (score > (index * 12 + reachable) * 100)
      throw new HttpError(400, '이 거리에서 가능한 수집 점수가 아닙니다.');
    return { ticks, score, won, distance, reason };
  }
  if (
    typeof ticks !== 'number' ||
    !Number.isInteger(ticks) ||
    ticks < 1 ||
    ticks > BOMBER_LIMIT ||
    typeof score !== 'number' ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 10000 ||
    typeof won !== 'boolean'
  )
    throw new HttpError(400, '게임 결과 범위를 확인해 주세요.');
  if (run.finished_at !== null)
    throw new HttpError(409, '이미 저장된 도전입니다.');
  if (now - run.issued_at > 2 * 60 * 60 * 1000)
    throw new HttpError(410, '도전이 만료되었습니다. 새 도전을 시작해 주세요.');
  if (ticks * TICK_MS > now - run.issued_at + 1200 || (won && ticks < 60))
    throw new HttpError(400, '플레이 시간과 결과가 일치하지 않습니다.');
  if (won && run.game === 'bomber' && score < 1000)
    throw new HttpError(400, '완료 점수가 올바르지 않습니다.');
  if (run.game === 'bomber') {
    const map = generateMap(run.seed, run.stage);
    const base = won ? 1000 + BOMBER_LIMIT - ticks : 0;
    const bonus = score - base;
    if (
      bonus < 0 ||
      bonus % 50 !== 0 ||
      bonus >
        map.tiles.filter((t) => t === 2).length * 50 + map.items.length * 100
    )
      throw new HttpError(400, '이 맵에서 가능한 점수가 아닙니다.');
  }
  return { ticks, score, won, distance: null, reason: null };
}
export async function issueRun(request: Request, env: Env, player: Player) {
  const data = await body(request);
  if (!isGame(data.game))
    throw new HttpError(400, '지원하는 게임을 선택해 주세요.');
  const mode = data.mode ?? 'normal';
  if (!isRunMode(mode)) throw new HttpError(400, '도전 모드를 확인해 주세요.');
  const condition =
    mode === 'normal' ? null : challenge(data.game, mode, Date.now());
  const stage = data.game === 'runner' ? 1 : (condition?.stage ?? data.stage);
  if (
    typeof stage !== 'number' ||
    !Number.isInteger(stage) ||
    stage < 1 ||
    stage > 5
  )
    throw new HttpError(400, '단계를 확인해 주세요.');
  const progress = await env.DB.prepare(
    'SELECT completed_stage FROM progress WHERE player_id=? AND game=?',
  )
    .bind(player.id, data.game)
    .first<{ completed_stage: number }>();
  if (
    data.game === 'bomber' &&
    mode === 'normal' &&
    stage > (progress?.completed_stage ?? 0) + 1
  )
    throw new HttpError(403, '앞 단계를 먼저 완료해 주세요.');
  let seed =
    condition?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  if (data.retryOf !== undefined) {
    if (typeof data.retryOf !== 'string')
      throw new HttpError(400, '재도전 정보를 확인해 주세요.');
    const previous = await env.DB.prepare(
      'SELECT * FROM runs WHERE id=? AND player_id=?',
    )
      .bind(data.retryOf, player.id)
      .first<StoredRun>();
    if (
      !previous ||
      previous.game !== data.game ||
      previous.stage !== stage ||
      previous.mode !== mode ||
      previous.rules_version !== rulesForGame(data.game) ||
      previous.period !== (condition?.period ?? '')
    )
      throw new HttpError(403, '본인의 같은 단계만 재도전할 수 있습니다.');
    seed = previous.seed;
  }
  const r: StoredRun = {
    id: crypto.randomUUID(),
    player_id: player.id,
    game: data.game,
    mode,
    stage,
    seed,
    rules_version: rulesForGame(data.game),
    period: condition?.period ?? '',
    issued_at: Date.now(),
    finished_at: null,
    won: null,
    ticks: null,
    score: null,
  };
  await env.DB.prepare(
    'INSERT INTO runs(id,player_id,game,mode,stage,seed,rules_version,period,issued_at) VALUES(?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      r.id,
      r.player_id,
      r.game,
      r.mode,
      r.stage,
      r.seed,
      r.rules_version,
      r.period,
      r.issued_at,
    )
    .run();
  return json(publicRun(r), 201);
}
export async function finishRun(
  request: Request,
  env: Env,
  player: Player,
  id: string,
) {
  const data = await body(request);
  const run = await env.DB.prepare(
    'SELECT * FROM runs WHERE id=? AND player_id=?',
  )
    .bind(id, player.id)
    .first<StoredRun>();
  if (!run) throw new HttpError(404, '내 도전을 찾을 수 없습니다.');
  const result = validateResult(run, data, Date.now());
  const statements = [
    env.DB.prepare(
      'UPDATE runs SET finished_at=?, won=?, ticks=?, score=?, distance=?, ended_reason=? WHERE id=? AND player_id=? AND finished_at IS NULL',
    ).bind(
      Date.now(),
      Number(result.won),
      result.ticks,
      result.score,
      result.distance,
      result.reason,
      id,
      player.id,
    ),
  ];
  if (result.won && run.mode === 'normal')
    statements.push(
      env.DB.prepare(
        'INSERT INTO progress(player_id,game,completed_stage,best_score) SELECT player_id,game,stage,score FROM runs WHERE id=? AND player_id=? AND won=1 ON CONFLICT(player_id,game) DO UPDATE SET completed_stage=MAX(completed_stage,excluded.completed_stage), best_score=MAX(best_score,excluded.best_score)',
      ).bind(id, player.id),
    );
  if (run.game === 'runner')
    statements.push(env.DB.prepare(RUNNER_BEST_UPSERT).bind(id, player.id));
  if (result.won && run.mode !== 'normal')
    statements.push(env.DB.prepare(BEST_UPSERT).bind(id, player.id));
  const response = await env.DB.batch(statements);
  if (response[0]?.meta.changes !== 1)
    throw new HttpError(409, '이미 저장된 도전입니다.');
  return json({ saved: true });
}
