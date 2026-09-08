import type { BomberInput, BomberState } from '../core/bomber/game';
import {
  BOMBER_GENERATOR_VERSION,
  BOMBER_RULES_VERSION,
  HEIGHT,
  WIDTH,
} from '../core/bomber/map';
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
function actor(v: unknown): boolean {
  return (
    isObject(v) &&
    finite(v.x) &&
    finite(v.y) &&
    v.x >= 0.77 &&
    v.x <= WIDTH - 1.77 &&
    v.y >= 0.77 &&
    v.y <= HEIGHT - 1.77
  );
}
function item(v: unknown): boolean {
  return (
    isObject(v) &&
    cell(v) &&
    ['capacity', 'range', 'speed'].includes(String(v.kind))
  );
}
function cells(v: unknown, max = WIDTH * HEIGHT): boolean {
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
    m.generatorVersion !== BOMBER_GENERATOR_VERSION ||
    m.rulesVersion !== BOMBER_RULES_VERSION ||
    typeof m.fallback !== 'boolean' ||
    !Array.isArray(m.tiles) ||
    m.tiles.length !== WIDTH * HEIGHT ||
    !m.tiles.every((t) => t === 0 || t === 1 || t === 2) ||
    !cells(m.spawns, 4) ||
    !cell(m.exit) ||
    !Array.isArray(m.enemies) ||
    m.enemies.length > 7 ||
    !m.enemies.every(
      (e) =>
        isObject(e) &&
        actor(e) &&
        integer(e.id) &&
        cell(e.target) &&
        integer(e.waitUntil),
    ) ||
    !cells(m.hazards) ||
    !Array.isArray(m.hiddenItems) ||
    m.hiddenItems.length > WIDTH * HEIGHT ||
    !m.hiddenItems.every(item) ||
    !Array.isArray(m.items) ||
    m.items.length > WIDTH * HEIGHT ||
    !m.items.every(
      (i) =>
        isObject(i) && item(i) && integer(i.bornAt) && integer(i.availableAt),
    )
  )
    return false;
  if (
    !Array.isArray(s.players) ||
    s.players.length > 4 ||
    !s.players.every(
      (p) =>
        isObject(p) &&
        actor(p) &&
        typeof p.id === 'string' &&
        typeof p.alive === 'boolean' &&
        integer(p.range) &&
        p.range >= 1 &&
        p.range <= 6 &&
        p.range >= 1 &&
        p.range <= 6 &&
        integer(p.capacity) &&
        p.capacity >= 1 &&
        p.capacity <= 5 &&
        finite(p.speed) &&
        p.speed > 0 &&
        p.speed <= 0.26 &&
        (p.pickup === null ||
          ['capacity', 'range', 'speed'].includes(String(p.pickup))) &&
        integer(p.pickupAt) &&
        integer(p.score) &&
        typeof p.placed === 'boolean',
    )
  )
    return false;
  if (
    !Array.isArray(s.bombs) ||
    s.bombs.length > 20 ||
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
    s.flames.length <= WIDTH * HEIGHT &&
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
