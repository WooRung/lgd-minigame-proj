import { describe, expect, it } from 'vitest';
import {
  createEndlessRunner,
  ENDLESS_MULTI_LIMIT,
  rankEndlessRunners,
  refreshSegments,
  runnerTerrain,
  stepEndlessRunner,
  stopEndlessRunner,
} from './endless';
import {
  moveRunner,
  RUNNER_MAX_SPEED,
  RUNNER_START_SPEED,
  type RunnerTerrain,
  runnerBody,
  runnerHeight,
  runnerSpeed,
} from './physics';
import {
  clearanceControl,
  generateSegment,
  RUNNER_PATTERNS,
  RUNNER_THEMES,
  SEGMENT_LENGTH,
  validateSegment,
} from './segments';

describe('무한 구간 생성', () => {
  it('시드·번호로 재현하고 3테마/12패턴을 서로 다른 지형으로 생성한다', () => {
    const patterns = new Map<string, string>();
    const themes = new Set<string>();
    for (let seed = 0; seed < 12; seed++) {
      for (let index = 0; index < 25; index++) {
        const segment = generateSegment(seed, index);
        expect(segment.fallback, `seed=${seed}, index=${index}`).toBe(false);
        expect(segment).toEqual(generateSegment(seed, index));
        themes.add(segment.theme);
        patterns.set(
          segment.pattern,
          segment.obstacles.map((o) => o.kind).join(','),
        );
      }
    }
    expect([...patterns.keys()].sort()).toEqual([...RUNNER_PATTERNS].sort());
    expect(themes.size).toBe(RUNNER_THEMES.length);
    expect(new Set(patterns.values()).size).toBe(12);
  });
  it('최대 시도를 넘지 않고 검증된 기본 구간으로 복귀하며 불가능한 배치를 거절한다', () => {
    const fallback = generateSegment(42, 30, 0);
    expect(fallback.fallback).toBe(true);
    expect(validateSegment(fallback)).toBe(true);
    expect(generateSegment(42, 30, -10)).toEqual(fallback);
    const bad = generateSegment(42, 5);
    const obstacle = bad.obstacles[0];
    if (!obstacle) throw Error();
    obstacle.width = 500;
    expect(validateSegment(bad)).toBe(false);
    obstacle.width = 40;
    obstacle.kind = 'ceiling';
    obstacle.bottom = 15;
    expect(validateSegment(bad)).toBe(false);
    expect(() => generateSegment(1, -1)).toThrow();
    expect(() => generateSegment(1, Number.MAX_SAFE_INTEGER)).toThrow();
  });
  it('모든 속도에서 구간 경계의 착지와 슬라이드 전환을 실제 물리로 통과한다', () => {
    for (
      let speed = RUNNER_START_SPEED;
      speed <= RUNNER_MAX_SPEED;
      speed += 0.375
    ) {
      for (const phase of [0, 11, 33, 55, 77]) {
        const segments = Array.from({ length: 13 }, (_, i) =>
          generateSegment(73, i),
        );
        const terrain = {
          obstacles: segments.flatMap((s) => s.obstacles),
          platforms: segments.flatMap((s) => s.platforms),
        };
        const body = runnerBody();
        let tick = phase;
        while (body.alive && body.x < 13 * SEGMENT_LENGTH) {
          moveRunner(
            body,
            clearanceControl(body, terrain),
            terrain,
            tick++,
            speed,
          );
        }
        expect(body.alive, `speed=${speed}, phase=${phase}, x=${body.x}`).toBe(
          true,
        );
        expect(body.grounded).toBe(true);
      }
    }
  });
});

describe('점프·슬라이드와 실제 충돌', () => {
  const ceiling: RunnerTerrain = {
    obstacles: [
      { kind: 'ceiling', x: 80, width: 140, bottom: 26, height: 86, phase: 0 },
    ],
    platforms: [],
  };
  it('서 있으면 천장에 충돌하고, 누르는 동안 실제 몸 높이를 낮춰 통과한다', () => {
    const standing = runnerBody();
    for (let tick = 0; tick < 40; tick++)
      moveRunner(standing, { action: false, dy: 0 }, ceiling, tick);
    expect(standing.alive).toBe(false);
    const sliding = runnerBody();
    for (let tick = 0; tick < 40; tick++)
      moveRunner(sliding, { action: true, dy: 1 }, ceiling, tick);
    expect(sliding.alive).toBe(true);
    expect(sliding.y).toBe(0);
    expect(runnerHeight(sliding)).toBe(18);
    moveRunner(sliding, { action: false, dy: 0 }, ceiling, 41);
    expect(runnerHeight(sliding)).toBe(40);
  });
  it('천장 아래에서 키를 놓으면 서기 판정으로 실패한다', () => {
    const body = runnerBody(100);
    moveRunner(body, { action: false, dy: 1 }, ceiling, 0);
    expect(body.alive).toBe(true);
    moveRunner(body, { action: false, dy: 0 }, ceiling, 1);
    expect(body.alive).toBe(false);
  });
  it('↑로도 점프하며 누르고 있어도 재점프하지 않고 공중 슬라이드는 순간 착지하지 않는다', () => {
    const body = runnerBody();
    const empty = { obstacles: [], platforms: [] };
    moveRunner(body, { action: false, dy: -1 }, empty, 0);
    expect(body.y).toBeGreaterThan(0);
    moveRunner(body, { action: true, dy: 1 }, empty, 1);
    expect(body.y).toBeGreaterThan(0);
    expect(body.sliding).toBe(true);
    for (let tick = 2; tick < 60; tick++)
      moveRunner(body, { action: true, dy: 0 }, empty, tick);
    expect(body.y).toBe(0);
    moveRunner(body, { action: false, dy: 0 }, empty, 60);
    moveRunner(body, { action: true, dy: 0 }, empty, 61);
    expect(body.y).toBeGreaterThan(0);
  });
  it('틈 아래로 떨어졌다가 반대편 지면으로 순간 복귀할 수 없다', () => {
    const body = runnerBody(90);
    const terrain: RunnerTerrain = {
      obstacles: [
        { kind: 'gap', x: 100, width: 100, height: 0, bottom: 0, phase: 0 },
      ],
      platforms: [],
    };
    for (let tick = 0; tick < 30; tick++)
      moveRunner(body, { action: false, dy: 0 }, terrain, tick);
    expect(body.alive).toBe(false);
  });
  it('움직이는 발판의 높이로 착지하고 공중 장애물은 움직임의 현재 위치로 판정한다', () => {
    const body = runnerBody(120);
    body.y = 23;
    body.vy = -1;
    const terrain: RunnerTerrain = {
      obstacles: [
        { kind: 'gap', x: 100, width: 120, height: 0, bottom: 0, phase: 0 },
      ],
      platforms: [{ x: 115, width: 80, phase: 0 }],
    };
    moveRunner(body, { action: false, dy: 0 }, terrain, 0);
    expect(body.grounded).toBe(true);
    expect(body.y).toBe(22);
    expect(body.alive).toBe(true);
    const moving: RunnerTerrain = {
      obstacles: [
        { kind: 'moving', x: 0, width: 100, bottom: 22, height: 20, phase: 0 },
      ],
      platforms: [],
    };
    const raised = runnerBody();
    const lowered = runnerBody();
    moveRunner(raised, { action: false, dy: 1 }, moving, 22);
    moveRunner(lowered, { action: false, dy: 1 }, moving, 66);
    expect(raised.alive).toBe(true);
    expect(lowered.alive).toBe(false);
  });
});

describe('무한 싱글·서버 공용 멀티 판정과 자원 상한', () => {
  it('수집물은 한 번만 가산하고 과거 ID 정리 뒤에도 누적 점수를 보존한다', () => {
    const state = createEndlessRunner(9, ['a']);
    const player = state.players[0];
    const segment = state.course.segments[0];
    if (!player || !segment) throw Error();
    segment.coins = [{ id: '0:test', x: 20, y: 20 }];
    stepEndlessRunner(state, {});
    stepEndlessRunner(state, {});
    expect(player.score).toBe(100);
    expect(player.collected).toEqual(['0:test']);
    player.x = SEGMENT_LENGTH * 3;
    refreshSegments(state);
    expect(player.collected).toEqual([]);
    expect(player.score).toBe(100);
  });
  it('약 25% 빠른 출발과 거리 증가에 따른 속도 상한이 있다', () => {
    expect(runnerSpeed(0)).toBe(7.5 * 1.25);
    expect(runnerSpeed(4800)).toBeGreaterThan(runnerSpeed(0));
    expect(runnerSpeed(1e12)).toBe(12);
  });
  it('2시간을 넘겨 실제 코어로 달려도 종료하지 않고 구간·수집 ID·JSON 크기를 제한한다', () => {
    const state = createEndlessRunner(42, ['a']);
    const player = state.players[0];
    if (!player) throw Error();
    let maxSegments = 0,
      maxIds = 0,
      maxBytes = 0;
    for (let tick = 0; tick < 150000; tick++) {
      stepEndlessRunner(state, {
        a: clearanceControl(player, runnerTerrain(state.course)),
      });
      if (!player.alive)
        throw Error(`장시간 주행 실패 tick=${tick} x=${player.x}`);
      if (tick % 1000 === 0) {
        maxSegments = Math.max(maxSegments, state.course.segments.length);
        maxIds = Math.max(maxIds, player.collected.length);
        maxBytes = Math.max(maxBytes, JSON.stringify(state).length);
      }
    }
    expect(state.status).toBe('playing');
    expect(state.tick).toBe(150000);
    expect(player.distance).toBeGreaterThan(1_000_000);
    expect(player.score).toBeGreaterThan(10000);
    expect(maxSegments).toBeLessThanOrEqual(4);
    expect(maxIds).toBeLessThanOrEqual(24);
    expect(maxBytes).toBeLessThan(16000);
    const score = player.score;
    stopEndlessRunner(state);
    stepEndlessRunner(state, {});
    expect(state.reason).toBe('manual');
    expect(state.tick).toBe(150000);
    expect(player.score).toBe(score);
  }, 30000);
  it('멀리 떨어진 4명도 최대 16구간이며 탈락자의 과거 구간을 유지하지 않는다', () => {
    const state = createEndlessRunner(5, ['a', 'b', 'c', 'd'], true);
    state.players.forEach((p, i) => {
      p.x = (i + 1) * 30 * SEGMENT_LENGTH;
    });
    refreshSegments(state);
    expect(state.course.segments).toHaveLength(16);
    const player = state.players[0];
    if (!player) throw Error();
    player.alive = false;
    refreshSegments(state);
    expect(state.course.segments).toHaveLength(12);
    expect(state.course.segments.some((s) => s.index === 30)).toBe(false);
  });
  it('같은 입력과 시드는 긴 경기에서도 같은 결과를 만든다', () => {
    const a = createEndlessRunner(72, ['a', 'b'], true);
    const b = createEndlessRunner(72, ['a', 'b'], true);
    for (let tick = 0; tick < ENDLESS_MULTI_LIMIT; tick++) {
      const input = Object.fromEntries(
        a.players.map((p) => [
          p.id,
          clearanceControl(p, runnerTerrain(a.course)),
        ]),
      );
      stepEndlessRunner(a, input);
      stepEndlessRunner(b, input);
    }
    expect(a).toEqual(b);
    expect(a.reason).toBe('timeout');
    expect(a.status).toBe('draw');
    expect(a.winners).toEqual(['a', 'b']);
  });
  it('마지막 생존자를 우선하고 시간 초과는 거리·수집 점수·공동 순위를 적용한다', () => {
    const state = createEndlessRunner(4, ['a', 'b', 'c', 'd'], true);
    const [a, b, c, d] = state.players;
    if (!a || !b || !c || !d) throw Error();
    a.distance = 300;
    b.distance = 300;
    c.distance = 300;
    d.distance = 200;
    a.score = 100;
    b.score = 200;
    c.score = 200;
    d.score = 900;
    state.reason = 'timeout';
    expect(rankEndlessRunners(state)).toEqual([
      { id: 'b', rank: 1 },
      { id: 'c', rank: 1 },
      { id: 'a', rank: 3 },
      { id: 'd', rank: 4 },
    ]);
    a.alive = false;
    b.alive = false;
    c.alive = false;
    state.reason = 'last-survivor';
    expect(rankEndlessRunners(state)[0]).toEqual({ id: 'd', rank: 1 });
    stepEndlessRunner(state, {});
    expect(state.status).toBe('won');
    expect(state.winners).toEqual(['d']);
  });
  it('실패하면 종료하고 같은 틱 전멸의 동점은 무승부다', () => {
    const single = createEndlessRunner(1, ['a']);
    for (let tick = 0; tick < 100; tick++) stepEndlessRunner(single, {});
    expect(single.reason).toBe('collision');
    expect(single.status).toBe('lost');
    const multi = createEndlessRunner(1, ['a', 'b'], true);
    for (let tick = 0; tick < 100; tick++) stepEndlessRunner(multi, {});
    expect(multi.reason).toBe('collision');
    expect(multi.status).toBe('draw');
  });
});
