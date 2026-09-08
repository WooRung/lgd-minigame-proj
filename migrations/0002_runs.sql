CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  game TEXT NOT NULL CHECK(game IN ('bomber','runner')),
  mode TEXT NOT NULL CHECK(mode IN ('normal','daily','weekly')),
  stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 5),
  seed INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  period TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  finished_at INTEGER,
  won INTEGER,
  ticks INTEGER,
  score INTEGER
);
CREATE INDEX runs_player_time ON runs(player_id, issued_at DESC);
CREATE INDEX runs_ranking ON runs(game, mode, rules_version, period, seed, won, score DESC);
