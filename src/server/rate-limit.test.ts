import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { RATE_SQL, sessionSubject } from './rate-limit';

it('제한 상한·갱신 거절·플레이어 분리·만료 시 재시작을 SQLite에서 확인한다', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE rate_limits(subject TEXT PRIMARY KEY,count INTEGER NOT NULL,resets_at INTEGER NOT NULL)',
  );
  const sql = db.prepare(RATE_SQL);
  const hit = (key: string, now: number) =>
    sql.get(key, now + 60000, now, now, now, 2);
  expect(hit('a', 1000)?.count).toBe(1);
  expect(hit('a', 1001)?.count).toBe(2);
  expect(hit('a', 1002)).toBeUndefined();
  expect(hit('b', 1002)?.count).toBe(1);
  expect(hit('a', 61000)?.count).toBe(1);
  db.close();
});
it('세션 제한 키는 원문 IP를 노출하지 않으며 임의 전달 헤더를 믿지 않는다', async () => {
  const a = await sessionSubject(
    new Request('https://arcade.test', {
      headers: { 'CF-Connecting-IP': '192.0.2.1', 'X-Forwarded-For': 'forged' },
    }),
  );
  const b = await sessionSubject(
    new Request('https://arcade.test', {
      headers: { 'CF-Connecting-IP': '192.0.2.1' },
    }),
  );
  expect(a).toBe(b);
  expect(a).toMatch(/^session:[0-9a-f]{64}$/);
  expect(a).not.toContain('192.0.2.1');
});
