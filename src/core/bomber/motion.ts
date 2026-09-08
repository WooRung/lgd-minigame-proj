import { type BomberMap, type Cell, gridCell, tileAt } from './map';
export const BODY_HALF = 0.28;
export const BASE_SPEED = 0.16;
export const MAX_SPEED = 0.26;
export function bodiesOverlap(a: Cell, b: Cell): boolean {
  return (
    Math.abs(a.x - b.x) < BODY_HALF * 2 - 1e-8 &&
    Math.abs(a.y - b.y) < BODY_HALF * 2 - 1e-8
  );
}
export function touchesCell(body: Cell, cell: Cell): boolean {
  return (
    Math.abs(body.x - cell.x) < 0.5 + BODY_HALF - 1e-8 &&
    Math.abs(body.y - cell.y) < 0.5 + BODY_HALF - 1e-8
  );
}
export interface MovementSpace {
  map: BomberMap;
  obstacles: readonly Cell[];
  actors?: readonly Cell[];
}
export function canOccupy(body: Cell, space: MovementSpace): boolean {
  for (
    let y = Math.floor(body.y - BODY_HALF + 0.5 + 1e-8);
    y <= Math.floor(body.y + BODY_HALF + 0.5 - 1e-8);
    y++
  )
    for (
      let x = Math.floor(body.x - BODY_HALF + 0.5 + 1e-8);
      x <= Math.floor(body.x + BODY_HALF + 0.5 - 1e-8);
      x++
    )
      if (tileAt(space.map, x, y) !== 0) return false;
  return (
    !space.obstacles.some((o) => touchesCell(body, o)) &&
    !(space.actors ?? []).some((a) => bodiesOverlap(body, a))
  );
}
export function moveBody(
  body: Cell,
  dx: number,
  dy: number,
  speed: number,
  space: MovementSpace,
): boolean {
  if (!dx && !dy) return false;
  dx = Math.sign(dx);
  dy = dx ? 0 : Math.sign(dy);
  const next = { x: body.x + dx * speed, y: body.y + dy * speed };
  if (canOccupy(next, space)) {
    Object.assign(body, next);
    return true;
  }
  const center = gridCell(body),
    offset = dx ? center.y - body.y : center.x - body.x;
  // 모서리 보정도 실제 충돌을 검사하며 한 틱의 총 이동 거리를 늘리지 않는다.
  if (Math.abs(offset) > 0.001 && Math.abs(offset) <= 0.32) {
    const alignment = Math.min(speed, Math.abs(offset));
    const aligned = {
      x: body.x + (dy ? Math.sign(offset) * alignment : 0),
      y: body.y + (dx ? Math.sign(offset) * alignment : 0),
    };
    if (canOccupy(aligned, space)) {
      Object.assign(body, aligned);
      return true;
    }
  }
  // 벽 앞에서 마지막 틱의 남은 공간까지만 이동해 틱 크기의 빈틈이 남지 않게 한다.
  let low = 0,
    high = speed;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (canOccupy({ x: body.x + dx * mid, y: body.y + dy * mid }, space))
      low = mid;
    else high = mid;
  }
  if (low < 0.0001) return false;
  body.x += dx * low;
  body.y += dy * low;
  return true;
}
