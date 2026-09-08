import { describe, expect, it } from 'vitest';
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
