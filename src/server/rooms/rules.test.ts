import { describe, expect, it } from 'vitest';
import { BOMBER_LIMIT, createBomber, stepBomber } from '../../core/bomber/game';
import { parseCommand, type RoomView, readRoom } from '../../shared/room';
import { checkJoin, checkStart } from './rules';

function room(count = 2): RoomView {
  return {
    code: 'ABCDEFGH',
    game: 'bomber',
    hostId: '0',
    members: Array.from({ length: count }, (_, i) => ({
      id: String(i),
      name: '동명이인',
      slot: i,
      ready: true,
      connected: true,
      disconnectedAt: null,
      left: false,
    })),
    phase: 'waiting',
    seed: 1,
    matchId: null,
    startedAt: 0,
    state: null,
    results: [],
    saved: false,
    notice: '',
  };
}
describe('대전 경계', () => {
  it('2~4명 전원 준비와 방장 권한을 요구한다', () => {
    expect(() => checkStart(room(), '0')).not.toThrow();
    expect(() => checkStart(room(4), '0')).not.toThrow();
    expect(() => checkStart(room(1), '0')).toThrow();
    expect(() => checkStart(room(), '1')).toThrow();
    const r = room();
    if (r.members[1]) r.members[1].ready = false;
    expect(() => checkStart(r, '0')).toThrow();
  });
  it('5번째 참가 및 시작 후 새 참가를 거절한다', () => {
    expect(() => checkJoin(room(4), 'new', 0)).toThrow();
    expect(() =>
      checkJoin({ ...room(), phase: 'playing' }, 'new', 0),
    ).toThrow();
    expect(() =>
      checkJoin({ ...room(), phase: 'playing' }, '0', 0),
    ).not.toThrow();
  });
  it('재접속 15초 경계를 검사한다', () => {
    const r = room();
    if (r.members[0]) {
      r.members[0].connected = false;
      r.members[0].disconnectedAt = 100;
    }
    expect(() => checkJoin(r, '0', 15099)).not.toThrow();
    expect(() => checkJoin(r, '0', 15100)).toThrow();
  });
  it.each([
    { type: 'input', seq: 1, input: { dx: 9, dy: 0, action: false } },
    { type: 'input', seq: 1, input: { dx: 1, dy: 1, action: false } },
    {
      type: 'input',
      seq: 1,
      input: { dx: 0, dy: 0, action: false, score: 999 },
    },
    { type: 'input', seq: 0, input: { dx: 0, dy: 0, action: false } },
    { type: 'start', playerId: 'host' },
    { type: 'result', winner: 'me' },
  ])('클라이언트가 권한·위치·점수를 주장할 수 없다', (value) => {
    expect(() => parseCommand(value)).toThrow();
  });
  it('시간 제한은 생존자가 여럿이어도 무승부다', () => {
    const s = createBomber(42, 1, ['a', 'b'], true);
    s.tick = BOMBER_LIMIT - 1;
    stepBomber(s, {});
    expect(s.status).toBe('draw');
    expect(s.winners).toEqual([]);
  });
  it('서버 상태를 런타임에 검증한다', () => {
    const r = { ...room(), state: createBomber(42, 1, ['0', '1'], true) };
    expect(readRoom(r)).toEqual(r);
    expect(() =>
      readRoom({ ...r, state: { ...r.state, players: [{ id: '0', x: 999 }] } }),
    ).toThrow();
  });
});
