import { describe, expect, it } from 'vitest';
import { createBomber, stepBomber } from './game';
import { generateMap, index, validateMap } from './map';

describe('폭탄 맵과 규칙', () => {
  it('5단계 × 100개 시드의 경로와 시작 공간을 보장한다', () => {
    for (let stage = 1; stage <= 5; stage++)
      for (let seed = 0; seed < 100; seed++) {
        expect(validateMap(generateMap(seed, stage))).toBe(true);
        expect(validateMap(generateMap(seed, stage, true))).toBe(true);
      }
  });
  it('동일 시드 재현과 제한된 생성 실패의 기본 맵 복귀', () => {
    expect(generateMap(17, 3)).toEqual(generateMap(17, 3));
    const map = generateMap(17, 3, false, 0);
    expect(map.fallback).toBe(true);
    expect(validateMap(map)).toBe(true);
    const bad = generateMap(17, 3);
    bad.tiles.fill(1);
    expect(validateMap(bad)).toBe(false);
  });
  it('벽과 폭탄을 통과하지 않고 설치한 폭탄에서는 나갈 수 있다', () => {
    const s = createBomber(1, 1, ['a']);
    stepBomber(s, { a: { dx: -1, dy: 0, action: true } });
    expect(s.players[0]?.x).toBe(1);
    stepBomber(s, { a: { dx: 1, dy: 0, action: false } });
    expect(s.players[0]?.x).toBe(2);
    for (let i = 0; i < 4; i++)
      stepBomber(s, { a: { dx: -1, dy: 0, action: false } });
    expect(s.players[0]?.x).toBe(2);
  });
  it('파괴벽에서 폭발이 멈추고 폭탄이 연쇄 폭발한다', () => {
    const s = createBomber(1, 1, ['a']);
    s.map.tiles[index(3, 1)] = 2;
    s.bombs = [
      { x: 1, y: 1, owner: 'a', fuse: 1, range: 3, pass: [] },
      { x: 2, y: 1, owner: 'a', fuse: 30, range: 2, pass: [] },
    ];
    stepBomber(s, {});
    expect(s.bombs).toHaveLength(0);
    expect(s.players[0]?.score).toBe(50);
    expect(s.map.tiles[index(3, 1)]).toBe(0);
    expect(s.flames.some((f) => f.x === 4 && f.y === 1)).toBe(false);
    expect(s.status).toBe('lost');
  });
  it('같은 입력은 같은 판정이며 동시 전멸은 무승부다', () => {
    const s = createBomber(1, 1, ['a', 'b'], true);
    for (const p of s.players) s.flames.push({ x: p.x, y: p.y, until: 10 });
    stepBomber(s, {});
    expect(s.status).toBe('draw');
    expect(s.winners).toEqual([]);
  });
  it('출구 도달을 완료 처리하고 끝난 경기는 더 진행하지 않는다', () => {
    const s = createBomber(1, 1, ['a']);
    const p = s.players[0];
    if (!p) throw Error();
    s.map.tiles[index(9, 7)] = 0;
    p.x = 9;
    p.y = 7;
    stepBomber(s, {});
    expect(s.status).toBe('won');
    const tick = s.tick;
    stepBomber(s, {});
    expect(s.tick).toBe(tick);
  });
});
