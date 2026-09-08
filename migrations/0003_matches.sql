CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  seed INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  ended_at INTEGER NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE match_results (
  match_id TEXT NOT NULL REFERENCES matches(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  rank INTEGER NOT NULL,
  score INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  PRIMARY KEY(match_id,player_id)
);
CREATE INDEX match_player ON match_results(player_id, match_id);
