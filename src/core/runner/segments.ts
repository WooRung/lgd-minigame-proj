import { hashSeed, random } from '../random';
import {
  moveRunner,
  RUNNER_MAX_SPEED,
  RUNNER_START_SPEED,
  type RunnerBody,
  type RunnerControl,
  type RunnerObstacle,
  type RunnerPlatform,
  type RunnerTerrain,
  runnerBody,
} from './physics';

export const RUNNER_RULES_VERSION = '2';
export const RUNNER_GENERATOR_VERSION = '2';
export const SEGMENT_LENGTH = 2400;
export const RUNNER_THEMES = ['meadow', 'cavern', 'skyway'] as const;
export type RunnerTheme = (typeof RUNNER_THEMES)[number];
export const RUNNER_PATTERNS = [
  'meadow-logs',
  'meadow-double-jump',
  'meadow-jump-slide',
  'meadow-coin-arc',
  'cavern-ceiling',
  'cavern-double-ceiling',
  'cavern-slide-rock',
  'cavern-cart',
  'skyway-gap',
  'skyway-double-gap',
  'skyway-platform',
  'skyway-gap-ceiling',
] as const;
export type RunnerPattern = (typeof RUNNER_PATTERNS)[number];
export interface RunnerCoin {
  id: string;
  x: number;
  y: number;
}
export interface RunnerSegment extends RunnerTerrain {
  index: number;
  start: number;
  theme: RunnerTheme;
  pattern: RunnerPattern;
  coins: RunnerCoin[];
  fallback: boolean;
}

// 조작 조합과 지형이 다른 12개 구간을 정의한다.
const PATTERN_OBSTACLES: readonly (readonly RunnerObstacle['kind'][])[] = [
  ['hurdle', 'hurdle'],
  ['hurdle', 'hurdle', 'hurdle'],
  ['hurdle', 'ceiling', 'hurdle'],
  ['hurdle', 'gap'],
  ['ceiling', 'ceiling'],
  ['ceiling', 'ceiling', 'ceiling'],
  ['ceiling', 'hurdle', 'ceiling'],
  ['moving', 'ceiling', 'moving'],
  ['gap', 'hurdle'],
  ['gap', 'gap', 'hurdle'],
  ['gap', 'gap', 'gap'],
  ['gap', 'ceiling', 'gap'],
];

function candidate(
  seed: number,
  index: number,
  attempt: number,
  safe: boolean,
): RunnerSegment {
  const rng = random(
    hashSeed(
      `${seed}:${RUNNER_RULES_VERSION}:${RUNNER_GENERATOR_VERSION}:${index}:${attempt}`,
    ),
  );
  const themeIndex = safe ? 0 : index % 3;
  // 12구간마다 전체 패턴을 순환한다. 도입은 가장 쉬운 초원으로 시작한다.
  const variant =
    safe || index === 0
      ? 0
      : (Math.floor(index / 3) + (hashSeed(String(seed)) % 4)) % 4;
  const patternIndex = themeIndex * 4 + variant;
  const pattern = RUNNER_PATTERNS[patternIndex];
  const theme = RUNNER_THEMES[themeIndex];
  const kinds = PATTERN_OBSTACLES[patternIndex];
  if (!pattern || !theme || !kinds) throw Error('구간 설정 오류');
  const start = index * SEGMENT_LENGTH;
  const obstacles: RunnerObstacle[] = [];
  const platforms: RunnerPlatform[] = [];
  const coins: RunnerCoin[] = [];
  const difficulty = Math.min(4, Math.floor(index / 6));
  kinds.forEach((kind, i) => {
    const x = start + 500 + i * 600 + (safe ? 0 : Math.floor(rng() * 40));
    obstacles.push({
      kind,
      x,
      width:
        kind === 'gap' ? 100 + difficulty * 5 : kind === 'ceiling' ? 140 : 38,
      bottom: kind === 'ceiling' ? 26 : kind === 'moving' ? 22 : 0,
      height:
        kind === 'gap'
          ? 0
          : kind === 'ceiling'
            ? 86
            : kind === 'moving'
              ? 20
              : 28 + difficulty * 2,
      phase: Math.floor(rng() * 88),
    });
    if (pattern === 'skyway-platform' && kind === 'gap') {
      platforms.push({ x: x + 20, width: 70, phase: Math.floor(rng() * 88) });
    }
    // 천장 아래는 낮은 수집열, 점프 구간은 포물선 모양의 수집열이다.
    for (let c = 0; c < 3; c++) {
      coins.push({
        id: `${index}:${i * 3 + c}`,
        x: x - 35 + c * 45,
        y: kind === 'ceiling' ? 12 : c === 1 ? 78 : 62,
      });
    }
  });
  for (let c = 0; c < 3; c++)
    coins.push({ id: `${index}:rest${c}`, x: start + 2100 + c * 45, y: 20 });
  return {
    index,
    start,
    theme,
    pattern,
    obstacles,
    platforms,
    coins,
    fallback: safe,
  };
}

// 생성 검증용 해법이다. 실제 UI 입력이나 플레이어 상태를 대신 조작하지 않는다.
export function clearanceControl(
  body: RunnerBody,
  terrain: RunnerTerrain,
): RunnerControl {
  const next = terrain.obstacles.find((o) => o.x + o.width + 14 > body.x);
  if (!next) return { action: false, dy: 0 };
  const distance = next.x - body.x;
  return {
    action:
      next.kind !== 'ceiling' &&
      distance <= 110 &&
      distance > 0 &&
      body.grounded,
    dy: next.kind === 'ceiling' && distance <= 150 ? 1 : 0,
  };
}

export function validateSegment(segment: RunnerSegment): boolean {
  if (
    !Number.isSafeInteger(segment.index) ||
    segment.index < 0 ||
    segment.start !== segment.index * SEGMENT_LENGTH ||
    segment.obstacles.length < 1 ||
    segment.obstacles.length > 3 ||
    segment.platforms.length > 3 ||
    segment.coins.length > 12
  )
    return false;
  let previousEnd = segment.start;
  for (const o of segment.obstacles) {
    if (
      ![o.x, o.width, o.bottom, o.height, o.phase].every(Number.isFinite) ||
      o.width <= 0 ||
      o.height < 0 ||
      o.bottom < 0 ||
      o.x - previousEnd < 320 ||
      o.x + o.width > segment.start + SEGMENT_LENGTH - 400 ||
      (o.kind === 'ceiling' && o.bottom < 22)
    )
      return false;
    previousEnd = o.x + o.width;
  }
  if (
    segment.platforms.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.width) ||
        !Number.isFinite(p.phase) ||
        p.width <= 0 ||
        !segment.obstacles.some(
          (o) =>
            o.kind === 'gap' && p.x >= o.x && p.x + p.width <= o.x + o.width,
        ),
    )
  )
    return false;
  if (
    new Set(segment.coins.map((c) => c.id)).size !== segment.coins.length ||
    segment.coins.some(
      (c) =>
        !Number.isFinite(c.x) ||
        !Number.isFinite(c.y) ||
        c.x < segment.start ||
        c.x >= segment.start + SEGMENT_LENGTH ||
        c.y < 0 ||
        c.y > 100,
    )
  )
    return false;

  // 이동 장애물의 전체 수직 범위를 덮는 장애물로도 점프가 가능해야 한다.
  // 몇 개 위상만 통과한 결과로 전체 시간대의 안전을 추정하지 않는다.
  const envelope: RunnerTerrain = {
    obstacles: segment.obstacles.map((o) =>
      o.kind === 'moving'
        ? { ...o, kind: 'hurdle', bottom: 0, height: o.bottom + o.height + 8 }
        : o,
    ),
    platforms: [],
  };
  // 모든 실제 속도 단계와 대표 발판 위상을 확인한다. 고정된 짧은 반복만 사용한다.
  for (
    let speed = RUNNER_START_SPEED;
    speed <= RUNNER_MAX_SPEED;
    speed += 0.375
  ) {
    for (const phase of [-1, 0, 22, 44, 66]) {
      const body = runnerBody(segment.start);
      const terrain = phase === -1 ? envelope : segment;
      for (
        let tick = 0;
        tick < 260 && body.x < segment.start + SEGMENT_LENGTH;
        tick++
      ) {
        moveRunner(
          body,
          clearanceControl(body, terrain),
          terrain,
          tick + phase,
          speed,
        );
        if (!body.alive) return false;
      }
      if (body.x < segment.start + SEGMENT_LENGTH || !body.grounded)
        return false;
    }
  }
  return true;
}

export function generateSegment(
  seed: number,
  index: number,
  attempts = 6,
): RunnerSegment {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    !Number.isSafeInteger(index * SEGMENT_LENGTH + SEGMENT_LENGTH)
  )
    throw Error('구간 번호 범위 오류');
  for (
    let attempt = 0;
    attempt < Math.min(6, Math.max(0, attempts));
    attempt++
  ) {
    const segment = candidate(seed, index, attempt, false);
    if (validateSegment(segment)) return segment;
  }
  const fallback = candidate(417, index, 0, true);
  if (!validateSegment(fallback)) throw Error('기본 구간 검증 실패');
  return fallback;
}
