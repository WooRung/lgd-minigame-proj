CREATE TABLE challenge_bests (
  player_id TEXT NOT NULL REFERENCES players(id),
  game TEXT NOT NULL,
  mode TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  period TEXT NOT NULL,
  seed INTEGER NOT NULL,
  score INTEGER NOT NULL,
  ticks INTEGER NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(id),
  PRIMARY KEY(player_id,game,mode,rules_version,period,seed)
);
CREATE INDEX challenge_scores ON challenge_bests(game,mode,rules_version,period,seed,score DESC,ticks ASC);
CREATE INDEX challenge_times ON challenge_bests(game,mode,rules_version,period,seed,ticks ASC,score DESC);
