import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { BOMBER_PROGRESS_UPSERT, PROGRESS_QUERY } from './progress';

it('팡팡 새 규칙의 최고는 이전 점수와 분리하고 단계·과거 기록을 보존한다', () => {
  const db = new DatabaseSync(':memory:');
  for (const name of ['0001_players', '0002_runs'])
    db.exec(readFileSync('migrations/' + name + '.sql', 'utf8'));
  db.exec(
    "INSERT INTO players VALUES('a','가',0),('b','나',0); INSERT INTO progress VALUES('a','bomber',3,9000)",
  );
  const add = db.prepare(
    "INSERT INTO runs VALUES(?,'a','bomber','normal',?,1,?,'',0,10000,1,200,?)",
  );
  add.run('old', 3, '1', 9000);
  add.run('new', 4, '2', 2700);
  add.run('lower', 4, '2', 2600);
  db.prepare(BOMBER_PROGRESS_UPSERT).run('new', 'b');
  expect(
    db.prepare('SELECT COUNT(*) AS n FROM progress WHERE player_id=?').get('b')
      ?.n,
  ).toBe(0);
  db.prepare(BOMBER_PROGRESS_UPSERT).run('new', 'a');
  db.prepare(BOMBER_PROGRESS_UPSERT).run('new', 'a');
  expect(db.prepare(PROGRESS_QUERY).all('2', 'a')).toEqual([
    {
      game: 'bomber',
      completed_stage: 4,
      best_score: 9000,
      current_best_score: 2700,
    },
  ]);
  expect(
    db.prepare('SELECT score FROM runs WHERE id=?').get('old')?.score,
  ).toBe(9000);
  db.close();
});
