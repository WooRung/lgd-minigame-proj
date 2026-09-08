CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 16),
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE progress (
  player_id TEXT NOT NULL REFERENCES players(id),
  game TEXT NOT NULL CHECK(game IN ('bomber', 'runner')),
  completed_stage INTEGER NOT NULL DEFAULT 0 CHECK(completed_stage BETWEEN 0 AND 5),
  best_score INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(player_id, game)
);
