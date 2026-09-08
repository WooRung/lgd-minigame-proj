import { describe, expect, it } from 'vitest';
import { createBomber, stepBomber, stepEnemies } from './game';
import { generateMap, type ItemKind, index } from './map';
import { bodiesOverlap, canOccupy, moveBody } from './motion';

describe('팡팡 연속 이동과 상자 아이템', () => {
  it('칸 중간에 멈추고 벽에 몸이 닿으면 멈춘다', () => {
    const s = createBomber(1, 1, ['a']);
    const p = s.players[0]!;
    stepBomber(s, { a: { dx: 1, dy: 0, action: false } });
    expect(p.x).toBeCloseTo(1.16);
    stepBomber(s, {});
    expect(p.x).toBeCloseTo(1.16);
    for (let n = 0; n < 20; n++)
      stepBomber(s, { a: { dx: -1, dy: 0, action: false } });
    expect(p.x).toBeCloseTo(0.78, 3);
  });
  it('모서리를 보정해 방향을 바꾸되 벽을 관통하지 않는다', () => {
    const map = generateMap(1, 1);
    map.tiles[index(2, 2)] = 1;
    const body = { x: 1.3, y: 1 };
    for (let n = 0; n < 15; n++) {
      moveBody(body, 0, 1, 0.16, { map, obstacles: [] });
      expect(canOccupy(body, { map, obstacles: [] })).toBe(true);
    }
    expect(body.x).toBeLessThanOrEqual(1.22);
    expect(body.y).toBeGreaterThan(2);
  });
  it('자기 폭탄에서 벗어난 뒤 다시 들어가지 못한다', () => {
    const s = createBomber(1, 1, ['a']);
    const p = s.players[0]!;
    stepBomber(s, { a: { dx: 0, dy: 0, action: true } });
    for (let n = 0; n < 8; n++)
      stepBomber(s, { a: { dx: 0, dy: 1, action: false } });
    expect(s.bombs[0]?.pass).toEqual([]);
    for (let n = 0; n < 8; n++)
      stepBomber(s, { a: { dx: 0, dy: -1, action: false } });
    expect(p.y).toBeCloseTo(1.78, 3);
  });
  it.each<ItemKind>(['capacity', 'range', 'speed'])(
    '%s 아이템이 파괴 뒤 나오고 불꽃 종료 뒤 획득되며 상한을 지킨다',
    (kind) => {
      const s = createBomber(1, 1, ['a']);
      const p = s.players[0]!;
      p.y = 4;
      s.map.hiddenItems = [{ x: 3, y: 1, kind }];
      expect(s.map.items).toEqual([]);
      s.bombs = [{ x: 1, y: 1, owner: 'a', fuse: 1, range: 2, pass: [] }];
      stepBomber(s, {});
      expect(s.map.items).toEqual([
        { x: 3, y: 1, kind, bornAt: 1, availableAt: 11 },
      ]);
      for (let n = 0; n < 10; n++) stepBomber(s, {});
      p.x = 3;
      p.y = 1;
      stepBomber(s, {});
      expect(p.pickup).toBe(kind);
      expect(p.score).toBe(150);
      expect(s.map.items).toEqual([]);
      for (let n = 0; n < 10; n++) {
        s.map.items.push({ x: 3, y: 1, kind, bornAt: 0, availableAt: 0 });
        stepBomber(s, {});
      }
      expect(p.capacity).toBeLessThanOrEqual(5);
      expect(p.range).toBeLessThanOrEqual(6);
      expect(p.speed).toBeLessThanOrEqual(0.26);
      expect(p[kind === 'speed' ? 'speed' : kind]).toBe(
        kind === 'capacity' ? 5 : kind === 'range' ? 6 : 0.26,
      );
    },
  );
  it('같은 틱의 연쇄 불꽃은 새 아이템을 보존하고 다음 폭발은 없앤다', () => {
    const s = createBomber(1, 1, ['a']);
    s.players[0]!.y = 5;
    s.bombs = [
      { x: 1, y: 1, owner: 'a', fuse: 1, range: 3, pass: [] },
      { x: 2, y: 1, owner: 'a', fuse: 30, range: 2, pass: [] },
    ];
    stepBomber(s, {});
    expect(s.map.items).toHaveLength(1);
    s.bombs = [{ x: 3, y: 1, owner: 'a', fuse: 1, range: 1, pass: [] }];
    stepBomber(s, {});
    expect(s.map.items).toHaveLength(0);
  });
});

describe('다수 적 이동', () => {
  it('5단계의 3~7마리는 재현 가능하고 벽·폭탄·서로를 관통하지 않는다', () => {
    for (let stage = 1; stage <= 5; stage++)
      for (let seed = 0; seed < 10; seed++) {
        const s = createBomber(seed, stage, ['a']);
        const copy = structuredClone(s);
        expect(s.map.enemies).toHaveLength(stage + 2);
        s.bombs = [{ x: 8, y: 6, owner: 'a', fuse: 9999, range: 1, pass: [] }];
        copy.bombs = structuredClone(s.bombs);
        const starts = structuredClone(s.map.enemies);
        for (let t = 1; t <= 600; t++) {
          s.tick = copy.tick = t;
          stepEnemies(s);
          stepEnemies(copy);
          for (const e of s.map.enemies) {
            expect(canOccupy(e, { map: s.map, obstacles: s.bombs })).toBe(true);
            for (const other of s.map.enemies)
              if (e !== other) expect(bodiesOverlap(e, other)).toBe(false);
          }
        }
        expect(s).toEqual(copy);
        expect(s.map.enemies.some((e, i) => e.x !== starts[i]?.x)).toBe(true);
        expect(s.map.enemies.some((e, i) => e.y !== starts[i]?.y)).toBe(true);
      }
  });
});

it('5단계 × 20개 시드에서 적의 이동 시점에 맞춰 출구에 도달하는 실제 입력 경로가 있다', () => {
  for (let stage = 1; stage <= 5; stage++)
    for (let seed = 0; seed < 20; seed++) {
      let cleared = false;
      // 서로 다른 출발 시점은 실제 플레이 가능한 대기/재도전이며 상태를 변경하지 않는다.
      for (let attempt = 0; attempt < 80 && !cleared; attempt++) {
        const s = createBomber(seed, stage, ['a']);
        const p = s.players[0]!;
        for (let n = 0; n < Math.floor(attempt / 4) * 10; n++)
          stepBomber(s, {});
        function travel(axis: 'x' | 'y', target: number) {
          for (
            let n = 0;
            n < 200 &&
            Math.abs(p[axis] - target) > 0.12 &&
            s.status === 'playing';
            n++
          ) {
            const dir = Math.sign(target - p[axis]);
            stepBomber(s, {
              a: {
                dx: axis === 'x' ? dir : 0,
                dy: axis === 'y' ? dir : 0,
                action: false,
              },
            });
          }
        }
        if (attempt % 4 === 0) {
          travel('y', 11);
          travel('x', 13);
          stepBomber(s, { a: { dx: 0, dy: 0, action: true } });
          travel('x', 10);
          for (let n = 0; n < 46; n++) stepBomber(s, {});
          travel('x', 15);
        } else if (attempt % 4 === 1) {
          stepBomber(s, { a: { dx: 0, dy: 0, action: true } });
          travel('y', 4);
          for (let n = 0; n < 46; n++) stepBomber(s, {});
          travel('y', 1);
          travel('x', 15);
          travel('y', 9);
          stepBomber(s, { a: { dx: 0, dy: 0, action: true } });
          travel('y', 5);
          for (let n = 0; n < 46; n++) stepBomber(s, {});
          travel('y', 11);
        } else if (attempt % 4 === 2) {
          travel('y', 6);
          travel('x', 15);
          travel('y', 9);
          stepBomber(s, { a: { dx: 0, dy: 0, action: true } });
          travel('y', 6);
          for (let n = 0; n < 46; n++) stepBomber(s, {});
          travel('y', 11);
        } else {
          travel('y', 11);
          travel('x', 3);
          stepBomber(s, { a: { dx: 0, dy: 0, action: true } });
          travel('x', 1);
          travel('y', 8);
          for (let n = 0; n < 46; n++) stepBomber(s, {});
          travel('y', 11);
          travel('x', 13);
          stepBomber(s, { a: { dx: 0, dy: 0, action: true } });
          travel('x', 10);
          for (let n = 0; n < 46; n++) stepBomber(s, {});
          travel('x', 15);
        }
        cleared = s.status === 'won';
      }
      expect(cleared, 'stage ' + stage + ' seed ' + seed).toBe(true);
    }
});
