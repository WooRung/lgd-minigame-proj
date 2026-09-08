-- 기존 완료 기록과 진행도는 유지하고 새 러너의 거리/종료 사유를 별도 저장한다.
ALTER TABLE runs ADD COLUMN distance INTEGER;
ALTER TABLE runs ADD COLUMN ended_reason TEXT;
ALTER TABLE match_results ADD COLUMN distance INTEGER;

CREATE TABLE runner_bests (
  player_id TEXT NOT NULL REFERENCES players(id),
  mode TEXT NOT NULL CHECK(mode IN ('normal','daily','weekly')),
  rules_version TEXT NOT NULL,
  period TEXT NOT NULL,
  seed INTEGER NOT NULL,
  distance INTEGER NOT NULL CHECK(distance >= 0),
  score INTEGER NOT NULL CHECK(score >= 0),
  ticks INTEGER NOT NULL CHECK(ticks >= 1),
  run_id TEXT NOT NULL REFERENCES runs(id),
  PRIMARY KEY(player_id,mode,rules_version,period)
);
CREATE INDEX runner_ranking ON runner_bests(mode,rules_version,period,distance DESC,score DESC);
