import { GENERATOR_VERSION, RULES_VERSION, random } from '../random';
export const JUMP_SPEED = 12;
export const GRAVITY = 0.8;
export const BOOST_SPEED = 1.2;
export interface Obstacle {
  x: number;
  width: number;
  height: number;
  lane: 0 | 1;
  kind: 'hurdle' | 'gap';
}
export interface Platform {
  x: number;
  width: number;
  lane: 0 | 1;
  phase: number;
}
export interface Coin {
  id: number;
  x: number;
  y: number;
  lane: 0 | 1;
}
export interface Course {
  seed: number;
  stage: number;
  generatorVersion: string;
  rulesVersion: string;
  length: number;
  speed: number;
  obstacles: Obstacle[];
  platforms: Platform[];
  coins: Coin[];
  forks: { start: number; end: number }[];
  fallback: boolean;
}
export function platformHeight(platform: Platform, tick: number) {
  return 22 + Math.sin((tick + platform.phase) / 14) * 10;
}
export function canClear(obstacle: Obstacle, speed: number): boolean {
  // 실제 고정 틱의 점프 궤적으로 충돌 구간과 착지 위치를 검사한다.
  let x = obstacle.x - 80,
    y = 0,
    vy = JUMP_SPEED;
  for (let tick = 0; tick < 40; tick++) {
    x += speed;
    vy -= GRAVITY;
    y += vy;
    if (
      obstacle.kind === 'hurdle' &&
      x + 12 > obstacle.x &&
      x - 12 < obstacle.x + obstacle.width &&
      y < obstacle.height
    )
      return false;
    if (y <= 0) return x > obstacle.x + obstacle.width + 12;
  }
  return false;
}
function candidate(seed: number, stage: number): Course {
  const rng = random(seed),
    length = 6600 + stage * 600,
    speed = 6 + stage * 0.5;
  const obstacles: Obstacle[] = [],
    platforms: Platform[] = [],
    coins: Coin[] = [],
    forks: { start: number; end: number }[] = [];
  for (let start = 600, i = 0; start < length - 500; start += 600, i++) {
    const kind = stage === 1 ? 'hurdle' : rng() < 0.5 ? 'hurdle' : 'gap';
    const x = start + Math.floor(rng() * 40);
    for (const lane of [0, 1] as const) {
      const fork = stage >= 3 && i % 3 === 1;
      const type =
        fork && lane === 1 ? (kind === 'gap' ? 'hurdle' : 'gap') : kind;
      obstacles.push({
        x,
        width: type === 'gap' ? 70 + stage * 8 : 32 + stage * 2,
        height: type === 'gap' ? 0 : 26 + stage * 3,
        lane,
        kind: type,
      });
      coins.push({ id: i * 2 + lane, x: x + 20, y: 65, lane });
      if (stage >= 4 && type === 'gap' && i % 2 === 0)
        platforms.push({
          x: x + 20,
          width: 64,
          lane,
          phase: Math.floor(rng() * 60),
        });
    }
    if (stage >= 3 && i % 3 === 1) forks.push({ start: x - 250, end: x + 250 });
  }
  return {
    seed,
    stage,
    generatorVersion: GENERATOR_VERSION,
    rulesVersion: RULES_VERSION,
    length,
    speed,
    obstacles,
    platforms,
    coins,
    forks,
    fallback: false,
  };
}
export function validateCourse(course: Course): boolean {
  if (
    course.length < 1000 ||
    course.speed <= 0 ||
    course.obstacles.length === 0
  )
    return false;
  for (const lane of [0, 1] as const) {
    let previousEnd = 0;
    for (const o of course.obstacles.filter((o) => o.lane === lane)) {
      if (
        o.x - previousEnd < 300 ||
        o.x + o.width > course.length - 200 ||
        o.height < 0 ||
        o.width <= 0 ||
        !canClear(o, course.speed) ||
        !canClear(o, course.speed + BOOST_SPEED)
      )
        return false;
      previousEnd = o.x + o.width;
    }
  }
  return true;
}
export function generateCourse(
  seed: number,
  stage: number,
  attempts = 6,
): Course {
  if (!Number.isInteger(stage) || stage < 1 || stage > 5)
    throw Error('단계 범위 오류');
  for (let i = 0; i < Math.min(6, attempts); i++) {
    const course = candidate((seed + i) >>> 0, stage);
    if (validateCourse(course)) return { ...course, seed };
  }
  return { ...candidate(417, stage), seed, fallback: true };
}
