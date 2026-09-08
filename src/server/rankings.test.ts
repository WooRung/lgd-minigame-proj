import { describe, expect, it } from 'vitest';
import { challenge, rankOrder } from './rankings';

describe('공통 도전의 한국 시간 경계', () => {
  it('한국 자정에서 일간 시드와 기간이 바뀐다', () => {
    const before = challenge(
      'bomber',
      'daily',
      Date.parse('2026-09-08T14:59:59Z'),
    );
    const after = challenge(
      'bomber',
      'daily',
      Date.parse('2026-09-08T15:00:00Z'),
    );
    expect(before.period).toBe('2026-09-08');
    expect(after.period).toBe('2026-09-09');
    expect(before.seed).not.toBe(after.seed);
  });
  it('월요일 한국 자정에서 주간 기간이 바뀐다', () => {
    expect(
      challenge('bomber', 'weekly', Date.parse('2026-09-06T14:59:59Z')).period,
    ).toBe('2026-08-31');
    expect(
      challenge('bomber', 'weekly', Date.parse('2026-09-06T15:00:00Z')).period,
    ).toBe('2026-09-07');
  });
  it('같은 기간은 동일 조건이고 게임과 기간 종류는 섞이지 않는다', () => {
    const now = Date.parse('2026-09-08T00:00:00Z');
    expect(challenge('bomber', 'daily', now)).toEqual(
      challenge('bomber', 'daily', now + 1000),
    );
    expect(challenge('bomber', 'daily', now).seed).not.toBe(
      challenge('runner', 'daily', now).seed,
    );
    expect(challenge('bomber', 'daily', now).seed).not.toBe(
      challenge('bomber', 'weekly', now).seed,
    );
    expect(rankOrder('bomber')).toBe('score DESC, ticks ASC');
    expect(rankOrder('runner')).toBe('distance DESC, score DESC');
  });
});
