import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { RUNNER_BEST_UPSERT, rankOrder } from './rankings';

it('추가 마이그레이션은 이전 진행·결과·도전 최고를 그대로 보존한다', () => {
  const db = new DatabaseSync(':memory:');
  for (const name of [
    '0001_players',
    '0002_runs',
    '0003_matches',
    '0004_rankings',
  ])
    db.exec(readFileSync(`migrations/${name}.sql`, 'utf8'));
  db.exec(`INSERT INTO players VALUES('a','이전 플레이어',0);
    INSERT INTO progress VALUES('a','runner',5,3000);
    INSERT INTO runs VALUES('old','a','runner','daily',3,42,'1','2026-09-08',0,100000,1,1200,3000);
    INSERT INTO challenge_bests VALUES('a','runner','daily','1','2026-09-08',42,3000,1200,'old');
    INSERT INTO matches VALUES('match','runner',42,'1',100000,'finished');
    INSERT INTO match_results VALUES('match','a',1,3000,'win');`);
  const before = db.prepare('SELECT * FROM progress').all();
  db.exec(readFileSync('migrations/0006_endless_records.sql', 'utf8'));
  expect(db.prepare('SELECT * FROM progress').all()).toEqual(before);
  expect(
    db.prepare('SELECT score,rules_version,distance FROM runs').get(),
  ).toEqual({ score: 3000, rules_version: '1', distance: null });
  expect(db.prepare('SELECT COUNT(*) AS n FROM challenge_bests').get()?.n).toBe(
    1,
  );
  expect(db.prepare('SELECT score,distance FROM match_results').get()).toEqual({
    score: 3000,
    distance: null,
  });
  expect(db.prepare('SELECT COUNT(*) AS n FROM runner_bests').get()?.n).toBe(0);
  db.close();
});

it('러너 최고는 거리 우선·수집 점수 다음, 일반/일간/주간·규칙별 분리와 공동 순위를 지킨다', () => {
  const db = new DatabaseSync(':memory:');
  for (const name of [
    '0001_players',
    '0002_runs',
    '0003_matches',
    '0006_endless_records',
  ])
    db.exec(readFileSync(`migrations/${name}.sql`, 'utf8'));
  db.exec("INSERT INTO players VALUES('a','가',0),('b','나',0),('c','다',0)");
  let id = 0;
  const insert = db.prepare(
    "INSERT INTO runs(id,player_id,game,mode,stage,seed,rules_version,period,issued_at,finished_at,won,ticks,score,distance) VALUES(?,?,'runner',?,1,42,?,'',0,5000,0,100,?,?)",
  );
  function save(
    player: string,
    distance: number,
    score: number,
    mode = 'normal',
    version = '2',
  ) {
    const runId = String(id++);
    insert.run(runId, player, mode, version, score, distance);
    db.prepare(RUNNER_BEST_UPSERT).run(runId, player);
    db.prepare(RUNNER_BEST_UPSERT).run(runId, player);
  }
  save('a', 100, 500);
  save('a', 90, 900);
  save('a', 100, 400);
  save('b', 100, 500);
  save('c', 100, 400);
  save('a', 800, 900, 'daily');
  save('a', 900, 900, 'weekly');
  save('a', 700, 900, 'normal', '3');
  const ranked = () =>
    db
      .prepare(
        `SELECT player_id,distance,score,RANK() OVER(ORDER BY ${rankOrder('runner')}) AS rank FROM runner_bests WHERE mode='normal' AND rules_version='2' ORDER BY rank,player_id`,
      )
      .all();
  expect(ranked()).toEqual([
    { player_id: 'a', distance: 100, score: 500, rank: 1 },
    { player_id: 'b', distance: 100, score: 500, rank: 1 },
    { player_id: 'c', distance: 100, score: 400, rank: 3 },
  ]);
  save('a', 100, 600);
  expect(ranked()[0]?.score).toBe(600);
  expect(db.prepare('SELECT COUNT(*) AS n FROM runner_bests').get()?.n).toBe(6);
  db.close();
});
