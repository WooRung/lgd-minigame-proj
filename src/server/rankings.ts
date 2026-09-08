import { hashSeed, RULES_VERSION } from '../core/random';
import type { GameKind } from '../shared/contracts';
import type { HistoryRow, Leaderboard, RankedRecord } from '../shared/rankings';
import type { Env } from './env';
export function challenge(
  game: GameKind,
  mode: 'daily' | 'weekly',
  now: number,
) {
  const korean = new Date(now + 9 * 60 * 60 * 1000);
  if (mode === 'weekly')
    korean.setUTCDate(korean.getUTCDate() - ((korean.getUTCDay() + 6) % 7));
  const period = korean.toISOString().slice(0, 10),
    stage = 3;
  return {
    period,
    stage,
    seed: hashSeed(`${game}:${mode}:${RULES_VERSION}:${period}:${stage}`),
    rulesVersion: RULES_VERSION,
  };
}
export function rankOrder(game: GameKind) {
  return game === 'bomber' ? 'score DESC, ticks ASC' : 'ticks ASC, score DESC';
}
export const BEST_UPSERT = `INSERT INTO challenge_bests(player_id,game,mode,rules_version,period,seed,score,ticks,run_id)
 SELECT player_id,game,mode,rules_version,period,seed,score,ticks,id FROM runs WHERE id=? AND player_id=? AND won=1
 ON CONFLICT(player_id,game,mode,rules_version,period,seed) DO UPDATE SET score=excluded.score,ticks=excluded.ticks,run_id=excluded.run_id
 WHERE (excluded.game='bomber' AND (excluded.score>challenge_bests.score OR (excluded.score=challenge_bests.score AND excluded.ticks<challenge_bests.ticks)))
 OR (excluded.game='runner' AND (excluded.ticks<challenge_bests.ticks OR (excluded.ticks=challenge_bests.ticks AND excluded.score>challenge_bests.score)))`;
export async function leaderboard(
  env: Env,
  game: GameKind,
  mode: 'daily' | 'weekly',
  playerId: string | null,
): Promise<Leaderboard> {
  const condition = challenge(game, mode, Date.now());
  const params = [
    game,
    mode,
    condition.rulesVersion,
    condition.period,
    condition.seed,
  ];
  const cte = `WITH ranked AS (SELECT b.player_id AS playerId,p.name,b.score,b.ticks,RANK() OVER(ORDER BY ${rankOrder(game)}) AS rank FROM challenge_bests b JOIN players p ON p.id=b.player_id WHERE game=? AND mode=? AND rules_version=? AND period=? AND seed=?)`;
  const top = (
    await env.DB.prepare(
      `${cte} SELECT * FROM ranked ORDER BY rank,playerId LIMIT 10`,
    )
      .bind(...params)
      .all<RankedRecord>()
  ).results;
  const mine = playerId
    ? await env.DB.prepare(`${cte} SELECT * FROM ranked WHERE playerId=?`)
        .bind(...params, playerId)
        .first<RankedRecord>()
    : null;
  const nearby = mine
    ? (
        await env.DB.prepare(
          `${cte} SELECT * FROM ranked WHERE rank BETWEEN ? AND ? ORDER BY rank,playerId LIMIT 7`,
        )
          .bind(...params, Math.max(1, mine.rank - 2), mine.rank + 2)
          .all<RankedRecord>()
      ).results
    : [];
  const total = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM challenge_bests WHERE game=? AND mode=? AND rules_version=? AND period=? AND seed=?',
  )
    .bind(...params)
    .first<{ count: number }>();
  return {
    game,
    mode,
    ...condition,
    top,
    nearby,
    mine,
    total: total?.count ?? 0,
  };
}
export async function history(
  env: Env,
  game: GameKind,
  playerId: string,
): Promise<HistoryRow[]> {
  return (
    await env.DB.prepare(
      `SELECT id,mode,stage,score,ticks,CASE won WHEN 1 THEN '완료' ELSE '실패' END AS outcome,finished_at AS endedAt,NULL AS rank FROM runs WHERE player_id=? AND game=? AND finished_at IS NOT NULL UNION ALL SELECT m.id,'friendly' AS mode,NULL AS stage,r.score,NULL AS ticks,r.outcome,m.ended_at AS endedAt,r.rank FROM match_results r JOIN matches m ON m.id=r.match_id WHERE r.player_id=? AND m.game=? ORDER BY endedAt DESC LIMIT 20`,
    )
      .bind(playerId, game, playerId, game)
      .all<HistoryRow>()
  ).results;
}
