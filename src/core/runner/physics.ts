export const RUNNER_START_SPEED = 9.375;
export const RUNNER_MAX_SPEED = 12;
export const RUNNER_JUMP_SPEED = 12;
export const RUNNER_GRAVITY = 0.8;
export const RUNNER_HALF_WIDTH = 12;
export const RUNNER_STANDING_HEIGHT = 40;
export const RUNNER_SLIDING_HEIGHT = 18;

export interface RunnerControl {
  action: boolean;
  dy: number;
}
export interface RunnerBody {
  x: number;
  y: number;
  vy: number;
  alive: boolean;
  grounded: boolean;
  held: boolean;
  sliding: boolean;
}
export interface RunnerObstacle {
  kind: 'hurdle' | 'ceiling' | 'gap' | 'moving';
  x: number;
  width: number;
  bottom: number;
  height: number;
  phase: number;
}
export interface RunnerPlatform {
  x: number;
  width: number;
  phase: number;
}
export interface RunnerTerrain {
  obstacles: RunnerObstacle[];
  platforms: RunnerPlatform[];
}

export function runnerSpeed(distance: number): number {
  return Math.min(
    RUNNER_MAX_SPEED,
    RUNNER_START_SPEED + Math.floor(Math.max(0, distance) / 4800) * 0.375,
  );
}
export function runnerBody(x = 0): RunnerBody {
  return {
    x,
    y: 0,
    vy: 0,
    alive: true,
    grounded: true,
    held: false,
    sliding: false,
  };
}
export function runnerHeight(body: RunnerBody): number {
  return body.sliding ? RUNNER_SLIDING_HEIGHT : RUNNER_STANDING_HEIGHT;
}
export function obstacleBottom(o: RunnerObstacle, tick: number): number {
  return (
    o.bottom + (o.kind === 'moving' ? Math.sin((tick + o.phase) / 14) * 8 : 0)
  );
}
export function runnerPlatformHeight(p: RunnerPlatform, tick: number): number {
  return 22 + Math.sin((tick + p.phase) / 14) * 8;
}

// 생성기 검증과 실제 게임이 같은 이동·충돌 함수를 사용한다.
export function moveRunner(
  body: RunnerBody,
  control: RunnerControl,
  terrain: RunnerTerrain,
  tick: number,
  speed = runnerSpeed(body.x),
): void {
  if (!body.alive) return;
  body.sliding = control.dy > 0;
  const jumping = control.action || control.dy < 0;
  if (jumping && !body.held && !body.sliding && body.grounded) {
    body.vy = RUNNER_JUMP_SPEED;
    body.grounded = false;
  }
  body.held = jumping;
  const previousY = body.y;
  body.x += speed;
  body.vy -= RUNNER_GRAVITY;
  body.y += body.vy;
  body.grounded = false;
  for (const platform of terrain.platforms) {
    const height = runnerPlatformHeight(platform, tick);
    if (
      body.x >= platform.x &&
      body.x <= platform.x + platform.width &&
      body.vy <= 0 &&
      previousY >= height - 2 &&
      body.y <= height
    ) {
      body.y = height;
      body.vy = 0;
      body.grounded = true;
    }
  }
  const gap = terrain.obstacles.some(
    (o) => o.kind === 'gap' && body.x > o.x && body.x < o.x + o.width,
  );
  if (body.y <= 0 && !gap) {
    // 틈 아래로 떨어진 뒤 반대편 지면으로 순간 복귀하지 않는다.
    if (previousY < -8) body.alive = false;
    else {
      body.y = 0;
      body.vy = 0;
      body.grounded = true;
    }
  }
  if (body.y < -35) body.alive = false;
  for (const obstacle of terrain.obstacles) {
    if (obstacle.kind === 'gap') continue;
    const bottom = obstacleBottom(obstacle, tick);
    if (
      body.x + RUNNER_HALF_WIDTH > obstacle.x &&
      body.x - RUNNER_HALF_WIDTH < obstacle.x + obstacle.width &&
      body.y < bottom + obstacle.height &&
      body.y + runnerHeight(body) > bottom
    )
      body.alive = false;
  }
}
