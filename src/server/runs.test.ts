import { describe, expect, it } from 'vitest';
import { runnerDistanceAtTick } from '../core/runner/physics';
import { type StoredRun, validateResult } from './runs';

const run: StoredRun = {
  id: 'run',
  player_id: 'a',
  game: 'bomber',
  mode: 'normal',
  stage: 1,
  seed: 1,
  rules_version: '1',
  period: '',
  issued_at: 0,
  finished_at: null,
  won: null,
  ticks: null,
  score: null,
};
describe('싱글 결과 검증', () => {
  it('실제 진행 시간 범위의 완료 결과를 허용한다', () => {
    expect(
      validateResult(run, { ticks: 200, score: 2650, won: true }, 10000).won,
    ).toBe(true);
  });
  it.each([
    { ticks: -1, score: 0, won: false },
    { ticks: 20, score: 90000, won: true },
    { ticks: 1000, score: 2000, won: true },
    { ticks: 1, score: 1000, won: true },
    { ticks: 100, score: 12, won: true },
  ])('범위를 벗어난 결과를 거절한다', (data) => {
    expect(() => validateResult(run, data, 5000)).toThrow();
  });
  it('만료 및 완료된 도전은 새 결과로 덮어쓰지 않는다', () => {
    expect(() =>
      validateResult(run, { ticks: 100, score: 2000, won: true }, 7200001),
    ).toThrow();
    expect(() =>
      validateResult(
        { ...run, finished_at: 5000 },
        { ticks: 100, score: 2000, won: true },
        6000,
      ),
    ).toThrow();
  });
});

it('러닝의 불가능한 완주 시간과 수집 점수를 거절한다', () => {
  const runner = { ...run, game: 'runner' as const };
  expect(() =>
    validateResult(runner, { ticks: 60, score: 2790, won: true }, 100000),
  ).toThrow();
  expect(() =>
    validateResult(runner, { ticks: 1500, score: 9999, won: true }, 100000),
  ).toThrow();
});

describe('무한 러너 결과 경계', () => {
  const runner: StoredRun = { ...run, game: 'runner', rules_version: '2' };
  const data = {
    ticks: 150000,
    score: 10000,
    won: false,
    distance: runnerDistanceAtTick(150000),
    reason: 'manual',
  };
  it('2시간 이후의 실패/사용자 종료 기록을 보존하고 거리 계산량은 틱 수에 비례하지 않는다', () => {
    expect(validateResult(runner, data, 8_000_000)).toMatchObject(data);
    expect(
      validateResult(runner, { ...data, reason: 'collision' }, 8_000_000)
        .reason,
    ).toBe('collision');
    expect(runnerDistanceAtTick(1_000_000_000)).toBeGreaterThan(10_000_000_000);
  });
  it.each([
    { distance: data.distance + 1 },
    { ticks: data.ticks - 1 },
    { score: 10001 },
    { score: Number.MAX_SAFE_INTEGER },
    { distance: Infinity },
    { ticks: 1.5 },
    { reason: 'timeout' },
    { won: true },
  ])('잘못된 거리·정수·수집량·완주/종료 사유를 거절한다: %j', (change) => {
    expect(() =>
      validateResult(runner, { ...data, ...change }, 8_000_000),
    ).toThrow();
  });
  it('미래 틱, 구버전 제출, 중복 완료와 첫 수집물 이전의 점수를 거절한다', () => {
    expect(() => validateResult(runner, data, 1000)).toThrow();
    expect(() =>
      validateResult({ ...runner, rules_version: '1' }, data, 8_000_000),
    ).toThrow();
    expect(() =>
      validateResult({ ...runner, finished_at: 7_600_000 }, data, 8_000_000),
    ).toThrow();
    expect(() =>
      validateResult(
        runner,
        { ...data, ticks: 1, distance: runnerDistanceAtTick(1), score: 100 },
        1000,
      ),
    ).toThrow();
  });
});
