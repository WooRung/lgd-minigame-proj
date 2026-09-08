import {
  moveRunner,
  type RunnerBody,
  type RunnerControl,
  type RunnerTerrain,
  runnerBody,
  runnerHeight,
} from './physics';
import {
  generateSegment,
  RUNNER_GENERATOR_VERSION,
  RUNNER_RULES_VERSION,
  type RunnerSegment,
  SEGMENT_LENGTH,
} from './segments';

export const ENDLESS_MULTI_LIMIT = 3600;
export interface EndlessPlayer extends RunnerBody {
  id: string;
  distance: number;
  score: number;
  collected: string[];
}
export interface EndlessCourse {
  seed: number;
  rulesVersion: string;
  generatorVersion: string;
  segments: RunnerSegment[];
}
export interface EndlessState {
  kind: 'runner';
  course: EndlessCourse;
  players: EndlessPlayer[];
  tick: number;
  mode: 'single' | 'multi';
  status: 'playing' | 'won' | 'lost' | 'draw';
  reason: 'collision' | 'manual' | 'last-survivor' | 'timeout' | null;
  winners: string[];
}

export function createEndlessRunner(
  seed: number,
  ids: string[],
  multi = false,
): EndlessState {
  if (ids.length < 1 || ids.length > 4 || new Set(ids).size !== ids.length)
    throw Error('참가자 범위 오류');
  const state: EndlessState = {
    kind: 'runner',
    course: {
      seed,
      rulesVersion: RUNNER_RULES_VERSION,
      generatorVersion: RUNNER_GENERATOR_VERSION,
      segments: [],
    },
    players: ids.map((id) => ({
      ...runnerBody(),
      id,
      distance: 0,
      score: 0,
      collected: [],
    })),
    tick: 0,
    mode: multi ? 'multi' : 'single',
    status: 'playing',
    reason: null,
    winners: [],
  };
  refreshSegments(state);
  return state;
}

export function runnerTerrain(course: EndlessCourse): RunnerTerrain {
  return {
    obstacles: course.segments.flatMap((s) => s.obstacles),
    platforms: course.segments.flatMap((s) => s.platforms),
  };
}

export function refreshSegments(state: EndlessState): void {
  const needed = new Set<number>();
  for (const p of state.players.filter((p) => p.alive)) {
    const index = Math.floor(p.x / SEGMENT_LENGTH);
    for (let i = Math.max(0, index - 1); i <= index + 2; i++) needed.add(i);
  }
  if (needed.size === 0) {
    // 전멸하면 결과 화면을 위해 마지막 유한 구간만 보관한다.
    for (const p of state.players) p.collected = [];
    return;
  }
  const retained = new Map(
    state.course.segments
      .filter((s) => needed.has(s.index))
      .map((s) => [s.index, s]),
  );
  for (const index of needed)
    if (!retained.has(index))
      retained.set(index, generateSegment(state.course.seed, index));
  state.course.segments = [...retained.values()].sort(
    (a, b) => a.index - b.index,
  );
  for (const p of state.players) {
    const oldest = Math.floor(p.x / SEGMENT_LENGTH) - 1;
    p.collected = p.alive
      ? p.collected.filter((id) => Number(id.split(':')[0]) >= oldest)
      : [];
  }
}

export function rankEndlessRunners(
  state: EndlessState,
): { id: string; rank: number }[] {
  const survivorFirst = state.reason === 'last-survivor';
  const sorted = [...state.players].sort(
    (a, b) =>
      (survivorFirst ? Number(b.alive) - Number(a.alive) : 0) ||
      b.distance - a.distance ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
  );
  let rank = 1;
  return sorted.map((p, i) => {
    const previous = sorted[i - 1];
    if (
      previous &&
      ((survivorFirst && p.alive !== previous.alive) ||
        p.distance !== previous.distance ||
        p.score !== previous.score)
    )
      rank = i + 1;
    return { id: p.id, rank };
  });
}

export function stopEndlessRunner(state: EndlessState): void {
  if (state.mode !== 'single' || state.status !== 'playing') return;
  state.reason = 'manual';
  state.status = 'lost';
}

export function stepEndlessRunner(
  state: EndlessState,
  inputs: Readonly<Record<string, RunnerControl>>,
): void {
  if (state.status !== 'playing') return;
  state.tick++;
  refreshSegments(state);
  const terrain = runnerTerrain(state.course);
  for (const p of state.players) {
    if (!p.alive) continue;
    moveRunner(
      p,
      inputs[p.id] ?? { action: false, dy: 0 },
      terrain,
      state.tick,
    );
    p.distance = Math.floor(p.x);
    if (!p.alive) continue;
    for (const s of state.course.segments)
      for (const coin of s.coins) {
        if (
          !p.collected.includes(coin.id) &&
          Math.abs(p.x - coin.x) < 22 &&
          coin.y + 8 > p.y &&
          coin.y - 8 < p.y + runnerHeight(p)
        ) {
          p.collected.push(coin.id);
          p.score += 100;
        }
      }
  }
  const alive = state.players.filter((p) => p.alive);
  if (state.mode === 'single') {
    if (alive.length === 0) {
      state.status = 'lost';
      state.reason = 'collision';
    }
  } else if (alive.length <= 1 || state.tick >= ENDLESS_MULTI_LIMIT) {
    state.reason =
      alive.length === 1
        ? 'last-survivor'
        : state.tick >= ENDLESS_MULTI_LIMIT
          ? 'timeout'
          : 'collision';
    state.winners = rankEndlessRunners(state)
      .filter((p) => p.rank === 1)
      .map((p) => p.id);
    state.status = state.winners.length > 1 ? 'draw' : 'won';
  }
}
