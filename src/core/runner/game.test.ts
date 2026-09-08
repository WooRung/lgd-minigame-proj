import { describe, expect, it } from 'vitest';
import { canClear, generateCourse, validateCourse } from './course';
import { createRunner, rankRunners, stepRunner } from './game';

function auto(state: ReturnType<typeof createRunner>) {
  const p = state.players[0];
  if (!p) throw Error();
  const obstacle = state.course.obstacles.find(
    (o) => o.lane === p.lane && o.x + o.width > p.x,
  );
  return {
    action:
      !!obstacle &&
      obstacle.x - p.x <= 80 &&
      obstacle.x - p.x > 60 &&
      p.grounded,
    dy: 0,
  };
}
describe('러닝 생성과 실제 궤적', () => {
  it('5단계×50개 시드의 코스가 유효하고 실제 코어로 완주된다', () => {
    for (let stage = 1; stage <= 5; stage++)
      for (let seed = 0; seed < 50; seed++) {
        const state = createRunner(seed, stage, ['a']);
        expect(validateCourse(state.course)).toBe(true);
        while (state.status === 'playing')
          stepRunner(state, { a: auto(state) });
        expect(state.status, `stage=${stage} seed=${seed}`).toBe('won');
      }
  });
  it('재현 가능하며 불가능한 구간을 배제하고 기본 코스로 복귀한다', () => {
    expect(generateCourse(42, 4)).toEqual(generateCourse(42, 4));
    const fallback = generateCourse(42, 4, 0);
    expect(fallback.fallback).toBe(true);
    expect(validateCourse(fallback)).toBe(true);
    expect(
      canClear({ x: 400, width: 400, height: 80, lane: 0, kind: 'gap' }, 8),
    ).toBe(false);
    const bad = generateCourse(2, 3);
    if (bad.obstacles[0]) bad.obstacles[0].width = 800;
    expect(validateCourse(bad)).toBe(false);
  });
  it('점프하지 않으면 장애물에서 실패한다', () => {
    const s = createRunner(1, 1, ['a']);
    while (s.status === 'playing') stepRunner(s, {});
    expect(s.status).toBe('lost');
  });
  it('공중에서 연속 점프하지 못하고 수집물은 한 번만 반영한다', () => {
    const s = createRunner(1, 3, ['a']);
    for (let i = 0; i < 10; i++) stepRunner(s, { a: { action: true, dy: 0 } });
    const p = s.players[0];
    expect(p?.y).toBeLessThan(120);
    if (!p) throw Error();
    s.course.coins = [{ id: 1, x: p.x + 8, y: p.y, lane: 0 }];
    stepRunner(s, {});
    stepRunner(s, {});
    expect(p.collected).toEqual([1]);
  });
  it('완주자를 우선하고 미완주는 거리, 같은 조건은 공동 순위다', () => {
    const s = createRunner(1, 1, ['a', 'b', 'c', 'd'], true);
    const [a, b, c, d] = s.players;
    if (!a || !b || !c || !d) throw Error();
    a.finishedAt = 100;
    b.finishedAt = 100;
    c.x = 400;
    d.x = 300;
    expect(rankRunners(s.players)).toEqual([
      { id: 'a', rank: 1 },
      { id: 'b', rank: 1 },
      { id: 'c', rank: 3 },
      { id: 'd', rank: 4 },
    ]);
  });
});

describe('러닝 기믹과 종료 경계', () => {
  it('갈림길 밖에서는 차선을 바꾸지 않고 갈림길에서는 선택을 반영한다', () => {
    const s = createRunner(42, 3, ['a']);
    const p = s.players[0];
    if (!p) throw Error();
    stepRunner(s, { a: { action: false, dy: 1 } });
    expect(p.lane).toBe(0);
    const fork = s.course.forks[0];
    if (!fork) throw Error();
    p.x = fork.start;
    stepRunner(s, { a: { action: false, dy: 1 } });
    expect(p.lane).toBe(1);
  });
  it('움직이는 발판 위에 착지할 수 있다', () => {
    const s = createRunner(42, 4, ['a']);
    const p = s.players[0];
    if (!p) throw Error();
    s.course.obstacles = [
      { x: 290, width: 120, height: 0, lane: 0, kind: 'gap' },
    ];
    s.course.platforms = [{ x: 290, width: 80, lane: 0, phase: 0 }];
    p.x = 300;
    p.y = 23;
    p.vy = -1;
    stepRunner(s, {});
    expect(p.grounded).toBe(true);
    expect(p.y).toBeGreaterThan(20);
    expect(p.alive).toBe(true);
  });
  it('멀티 시간 제한은 미완주 거리로 순위를 확정한다', () => {
    const s = createRunner(42, 3, ['a', 'b'], true);
    const [a, b] = s.players;
    if (!a || !b) throw Error();
    a.x = 400;
    b.x = 300;
    s.tick = 1799;
    stepRunner(s, {});
    expect(s.status).toBe('won');
    expect(s.winners).toEqual(['a']);
    const tick = s.tick;
    stepRunner(s, {});
    expect(s.tick).toBe(tick);
  });
});
