import {
  BOOST_SPEED,
  type Course,
  GRAVITY,
  generateCourse,
  JUMP_SPEED,
  platformHeight,
} from './course';
export const RUNNER_LIMIT = 1800;
export interface RunnerInput {
  action: boolean;
  dy: number;
}
export interface RunnerPlayer {
  id: string;
  x: number;
  y: number;
  vy: number;
  lane: 0 | 1;
  alive: boolean;
  score: number;
  collected: number[];
  boost: number;
  finishedAt: number | null;
  held: boolean;
  grounded: boolean;
}
export interface RunnerState {
  kind: 'runner';
  course: Course;
  players: RunnerPlayer[];
  tick: number;
  status: 'playing' | 'won' | 'lost' | 'draw';
  winners: string[];
  mode: 'single' | 'multi';
}
export function createRunner(
  seed: number,
  stage: number,
  ids: string[],
  multi = false,
): RunnerState {
  return {
    kind: 'runner',
    course: generateCourse(seed, stage),
    players: ids.map((id) => ({
      id,
      x: 0,
      y: 0,
      vy: 0,
      lane: 0,
      alive: true,
      score: 0,
      collected: [],
      boost: 0,
      finishedAt: null,
      held: false,
      grounded: true,
    })),
    tick: 0,
    status: 'playing',
    winners: [],
    mode: multi ? 'multi' : 'single',
  };
}
export function rankRunners(
  players: RunnerPlayer[],
): { id: string; rank: number }[] {
  const sorted = [...players].sort((a, b) =>
    a.finishedAt !== null && b.finishedAt !== null
      ? a.finishedAt - b.finishedAt
      : a.finishedAt !== null
        ? -1
        : b.finishedAt !== null
          ? 1
          : b.x - a.x,
  );
  let rank = 1;
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    if (
      prev &&
      !(
        (p.finishedAt !== null && p.finishedAt === prev.finishedAt) ||
        (p.finishedAt === null && prev.finishedAt === null && p.x === prev.x)
      )
    )
      rank = i + 1;
    return { id: p.id, rank };
  });
}
export function stepRunner(
  state: RunnerState,
  inputs: Readonly<Record<string, RunnerInput>>,
): void {
  if (state.status !== 'playing') return;
  state.tick++;
  for (const p of state.players) {
    if (!p.alive || p.finishedAt !== null) continue;
    const input = inputs[p.id] ?? { action: false, dy: 0 };
    if (
      state.course.forks.some((f) => p.x >= f.start && p.x <= f.end) &&
      input.dy !== 0
    )
      p.lane = input.dy < 0 ? 0 : 1;
    if (input.action && !p.held && p.grounded) {
      p.vy = JUMP_SPEED;
      p.grounded = false;
    }
    p.held = input.action;
    const previousY = p.y;
    p.x = Math.min(
      state.course.length,
      p.x + state.course.speed + (p.boost > 0 ? BOOST_SPEED : 0),
    );
    if (p.boost > 0) p.boost--;
    p.vy -= GRAVITY;
    p.y += p.vy;
    p.grounded = false;
    const gap = state.course.obstacles.some(
      (o) =>
        o.lane === p.lane &&
        o.kind === 'gap' &&
        p.x > o.x &&
        p.x < o.x + o.width,
    );
    for (const platform of state.course.platforms) {
      const height = platformHeight(platform, state.tick);
      if (
        platform.lane === p.lane &&
        p.x >= platform.x &&
        p.x <= platform.x + platform.width &&
        p.vy <= 0 &&
        previousY >= height - 2 &&
        p.y <= height
      ) {
        p.y = height;
        p.vy = 0;
        p.grounded = true;
      }
    }
    if (p.y <= 0 && !gap) {
      p.y = 0;
      p.vy = 0;
      p.grounded = true;
    }
    if (
      p.y < -35 ||
      state.course.obstacles.some(
        (o) =>
          o.kind === 'hurdle' &&
          o.lane === p.lane &&
          p.x + 12 > o.x &&
          p.x - 12 < o.x + o.width &&
          p.y < o.height,
      )
    )
      p.alive = false;
    for (const c of state.course.coins)
      if (
        c.lane === p.lane &&
        !p.collected.includes(c.id) &&
        Math.abs(p.x - c.x) < 22 &&
        Math.abs(p.y - c.y) < 30
      ) {
        p.collected.push(c.id);
        p.boost = 40;
      }
    p.score = Math.floor(p.x / 10) + p.collected.length * 100;
    if (p.alive && p.x >= state.course.length) {
      p.finishedAt = state.tick;
      p.score += 1000 + Math.max(0, RUNNER_LIMIT - state.tick);
    }
  }
  if (state.mode === 'single') {
    const p = state.players[0];
    if (p?.finishedAt !== null && p?.finishedAt !== undefined) {
      state.status = 'won';
      state.winners = [p.id];
    } else if (!p?.alive || state.tick >= RUNNER_LIMIT) state.status = 'lost';
  } else if (
    state.players.every((p) => !p.alive || p.finishedAt !== null) ||
    state.tick >= RUNNER_LIMIT
  ) {
    const ranks = rankRunners(state.players);
    state.winners = ranks.filter((r) => r.rank === 1).map((r) => r.id);
    state.status = state.winners.length > 1 ? 'draw' : 'won';
  }
}
