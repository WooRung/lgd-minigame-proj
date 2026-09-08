import type { BomberInput, BomberState } from '../core/bomber/game';
import { HEIGHT, WIDTH } from '../core/bomber/map';
import type { EndlessState as RunnerState } from '../core/runner/endless';
import { type GameKind, isGame, isObject } from './contracts';
import { isEndlessState } from './runner-state';
export const RECONNECT_MS = 15000;
export const IDLE_MS = 15 * 60 * 1000;
export interface Member {
  id: string;
  name: string;
  slot: number;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  left: boolean;
}
export interface MatchResult {
  playerId: string;
  name: string;
  rank: number;
  score: number;
  distance: number | null;
  outcome: 'win' | 'loss' | 'draw' | 'aborted';
}
export interface RoomView {
  code: string;
  rulesVersion?: string;
  game: GameKind;
  hostId: string;
  members: Member[];
  phase: 'waiting' | 'countdown' | 'playing' | 'ended' | 'closed';
  seed: number;
  matchId: string | null;
  startedAt: number;
  state: BomberState | RunnerState | null;
  results: MatchResult[];
  saved: boolean;
  notice: string;
}
export type RoomCommand =
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'rematch'; sameMap: boolean }
  | { type: 'input'; seq: number; input: BomberInput };
export function parseCommand(value: unknown): RoomCommand {
  if (!isObject(value)) throw Error('메시지 형식 오류');
  if (
    value.type === 'ready' &&
    typeof value.ready === 'boolean' &&
    Object.keys(value).length === 2
  )
    return { type: 'ready', ready: value.ready };
  if (value.type === 'start' && Object.keys(value).length === 1)
    return { type: 'start' };
  if (
    value.type === 'rematch' &&
    typeof value.sameMap === 'boolean' &&
    Object.keys(value).length === 2
  )
    return { type: 'rematch', sameMap: value.sameMap };
  if (
    value.type === 'input' &&
    Number.isSafeInteger(value.seq) &&
    typeof value.seq === 'number' &&
    value.seq > 0 &&
    value.seq < 2147483647 &&
    isObject(value.input) &&
    Object.keys(value).length === 3
  ) {
    const i = value.input;
    if (
      Object.keys(i).length === 3 &&
      typeof i.dx === 'number' &&
      [-1, 0, 1].includes(i.dx) &&
      typeof i.dy === 'number' &&
      [-1, 0, 1].includes(i.dy) &&
      !(i.dx && i.dy) &&
      typeof i.action === 'boolean'
    )
      return {
        type: 'input',
        seq: value.seq,
        input: { dx: i.dx, dy: i.dy, action: i.action },
      };
  }
  throw Error('허용되지 않은 입력입니다.');
}
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number => finite(v) && Number.isInteger(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 4 && v.every((x) => typeof x === 'string');
function cell(v: unknown): boolean {
  return (
    isObject(v) &&
    integer(v.x) &&
    v.x >= 0 &&
    v.x < WIDTH &&
    integer(v.y) &&
    v.y >= 0 &&
    v.y < HEIGHT
  );
}
function cells(v: unknown, max = 200): boolean {
  return Array.isArray(v) && v.length <= max && v.every(cell);
}
function isBomberState(s: unknown): s is BomberState {
  if (
    !isObject(s) ||
    s.kind !== 'bomber' ||
    !isObject(s.map) ||
    !integer(s.tick) ||
    !['playing', 'won', 'lost', 'draw'].includes(String(s.status)) ||
    !['single', 'multi'].includes(String(s.mode)) ||
    !strings(s.winners)
  )
    return false;
  const m = s.map;
  if (
    !integer(m.seed) ||
    !integer(m.stage) ||
    typeof m.generatorVersion !== 'string' ||
    typeof m.rulesVersion !== 'string' ||
    typeof m.fallback !== 'boolean' ||
    !Array.isArray(m.tiles) ||
    m.tiles.length !== WIDTH * HEIGHT ||
    !m.tiles.every((t) => t === 0 || t === 1 || t === 2) ||
    !cells(m.spawns, 4) ||
    !cell(m.exit) ||
    !cells(m.enemies) ||
    !cells(m.hazards) ||
    !cells(m.items)
  )
    return false;
  if (
    !Array.isArray(s.players) ||
    s.players.length > 4 ||
    !s.players.every(
      (p) =>
        isObject(p) &&
        cell(p) &&
        typeof p.id === 'string' &&
        typeof p.alive === 'boolean' &&
        integer(p.cooldown) &&
        integer(p.range) &&
        integer(p.score) &&
        typeof p.placed === 'boolean',
    )
  )
    return false;
  if (
    !Array.isArray(s.bombs) ||
    s.bombs.length > 8 ||
    !s.bombs.every(
      (b) =>
        isObject(b) &&
        cell(b) &&
        typeof b.owner === 'string' &&
        integer(b.fuse) &&
        integer(b.range) &&
        strings(b.pass),
    )
  )
    return false;
  return (
    Array.isArray(s.flames) &&
    s.flames.length <= 200 &&
    s.flames.every((f) => isObject(f) && cell(f) && integer(f.until))
  );
}
export function readRoom(v: unknown): RoomView {
  if (
    !isObject(v) ||
    typeof v.code !== 'string' ||
    !(v.rulesVersion === undefined || typeof v.rulesVersion === 'string') ||
    !isGame(v.game) ||
    typeof v.hostId !== 'string' ||
    !['waiting', 'countdown', 'playing', 'ended', 'closed'].includes(
      String(v.phase),
    ) ||
    !integer(v.seed) ||
    !(v.matchId === null || typeof v.matchId === 'string') ||
    !finite(v.startedAt) ||
    typeof v.saved !== 'boolean' ||
    typeof v.notice !== 'string'
  )
    throw Error('방 정보를 확인할 수 없습니다.');
  const phase = v.phase;
  if (
    phase !== 'waiting' &&
    phase !== 'countdown' &&
    phase !== 'playing' &&
    phase !== 'ended' &&
    phase !== 'closed'
  )
    throw Error('방 상태 오류');
  if (
    !Array.isArray(v.members) ||
    v.members.length > 4 ||
    !Array.isArray(v.results) ||
    v.results.length > 4
  )
    throw Error('참가자 정보 오류');
  const members: Member[] = v.members.map((m: unknown) => {
    if (
      !isObject(m) ||
      typeof m.id !== 'string' ||
      typeof m.name !== 'string' ||
      !integer(m.slot) ||
      typeof m.ready !== 'boolean' ||
      typeof m.connected !== 'boolean' ||
      typeof m.left !== 'boolean' ||
      !(m.disconnectedAt === null || finite(m.disconnectedAt))
    )
      throw Error('참가자 정보 오류');
    return {
      id: m.id,
      name: m.name,
      slot: m.slot,
      ready: m.ready,
      connected: m.connected,
      disconnectedAt: m.disconnectedAt,
      left: m.left,
    };
  });
  const results: MatchResult[] = v.results.map((r: unknown) => {
    if (
      !isObject(r) ||
      typeof r.playerId !== 'string' ||
      typeof r.name !== 'string' ||
      !integer(r.rank) ||
      !integer(r.score) ||
      !(
        r.distance === undefined ||
        r.distance === null ||
        integer(r.distance)
      ) ||
      (r.outcome !== 'win' &&
        r.outcome !== 'loss' &&
        r.outcome !== 'draw' &&
        r.outcome !== 'aborted')
    )
      throw Error('결과 정보 오류');
    return {
      playerId: r.playerId,
      name: r.name,
      rank: r.rank,
      score: r.score,
      distance: r.distance ?? null,
      outcome: r.outcome,
    };
  });
  if (v.state !== null && !isBomberState(v.state) && !isEndlessState(v.state))
    throw Error('경기 상태 오류');
  return {
    code: v.code,
    ...(typeof v.rulesVersion === 'string'
      ? { rulesVersion: v.rulesVersion }
      : {}),
    game: v.game,
    hostId: v.hostId,
    members,
    phase,
    seed: v.seed,
    matchId: v.matchId,
    startedAt: v.startedAt,
    state: v.state,
    results,
    saved: v.saved,
    notice: v.notice,
  };
}
