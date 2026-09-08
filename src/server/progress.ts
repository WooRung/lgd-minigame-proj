// 단계 해금은 이어받되 이전 최고 점수는 덮어쓰지 않는다. 새 최고는 규칙별 완료 기록에서 조회한다.
export const BOMBER_PROGRESS_UPSERT =
  'INSERT INTO progress(player_id,game,completed_stage,best_score) SELECT player_id,game,stage,0 FROM runs WHERE id=? AND player_id=? AND won=1 ON CONFLICT(player_id,game) DO UPDATE SET completed_stage=MAX(completed_stage,excluded.completed_stage)';
export const PROGRESS_QUERY = `SELECT p.game,p.completed_stage,p.best_score,(SELECT MAX(r.score) FROM runs r WHERE r.player_id=p.player_id AND r.game=p.game AND r.mode='normal' AND r.won=1 AND r.finished_at IS NOT NULL AND r.rules_version=?) AS current_best_score FROM progress p WHERE p.player_id=?`;
