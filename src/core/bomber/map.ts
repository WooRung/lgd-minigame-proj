import { hashSeed, random } from '../random';
export const BOMBER_RULES_VERSION = '2';
export const BOMBER_GENERATOR_VERSION = '2';
export const WIDTH = 17;
export const HEIGHT = 13;
export interface Cell {
  x: number;
  y: number;
}
export type Tile = 0 | 1 | 2;
export type ItemKind = 'capacity' | 'range' | 'speed';
export interface HiddenItem extends Cell {
  kind: ItemKind;
}
export interface Item extends HiddenItem {
  bornAt: number;
  availableAt: number;
}
export interface Enemy extends Cell {
  id: number;
  target: Cell;
  waitUntil: number;
}
export interface BomberMap {
  seed: number;
  generatorVersion: string;
  rulesVersion: string;
  stage: number;
  tiles: Tile[];
  spawns: Cell[];
  exit: Cell;
  enemies: Enemy[];
  hazards: Cell[];
  items: Item[];
  hiddenItems: HiddenItem[];
  fallback: boolean;
}
export const index = (x: number, y: number) => y * WIDTH + x;
export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
export const gridCell = (point: Cell): Cell => ({
  x: Math.round(point.x),
  y: Math.round(point.y),
});
export const DIRECTIONS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
export function tileAt(map: BomberMap, x: number, y: number): Tile {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    x >= WIDTH ||
    y < 0 ||
    y >= HEIGHT
  )
    return 1;
  return map.tiles[index(x, y)] ?? 1;
}
const SPAWNS: Cell[] = [
  { x: 1, y: 1 },
  { x: 15, y: 11 },
  { x: 15, y: 1 },
  { x: 1, y: 11 },
];
const ENEMIES: Cell[] = [
  { x: 5, y: 3 },
  { x: 9, y: 7 },
  { x: 13, y: 3 },
  { x: 5, y: 9 },
  { x: 13, y: 9 },
  { x: 9, y: 3 },
  { x: 5, y: 7 },
];
const ITEM_KINDS: ItemKind[] = ['capacity', 'range', 'speed'];
function candidate(seed: number, stage: number, multi: boolean): BomberMap {
  const rng = random(hashSeed(`${seed}:${BOMBER_GENERATOR_VERSION}`));
  const tiles: Tile[] = Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
    const x = i % WIDTH,
      y = Math.floor(i / WIDTH);
    if (
      x === 0 ||
      y === 0 ||
      x === WIDTH - 1 ||
      y === HEIGHT - 1 ||
      (x % 2 === 0 && y % 2 === 0)
    )
      return 1;
    return rng() < 0.23 + stage * 0.025 ? 2 : 0;
  });
  // 외곽 회랑과 중앙 교차로를 연결해 파괴 상자 이외의 막힌 지역을 만들지 않는다.
  for (let x = 1; x < WIDTH - 1; x++)
    for (const y of [1, 6, HEIGHT - 2]) tiles[index(x, y)] = 0;
  for (let y = 1; y < HEIGHT - 1; y++)
    for (const x of [1, 8, WIDTH - 2]) tiles[index(x, y)] = 0;
  for (let x = 7; x <= 9; x++)
    for (let y = 5; y <= 7; y++) tiles[index(x, y)] = 0;
  if (multi) {
    for (let y = 1; y <= 6; y++)
      for (let x = 1; x <= 8; x++) {
        const tile = tiles[index(x, y)] ?? 1;
        tiles[index(WIDTH - 1 - x, y)] = tile;
        tiles[index(x, HEIGHT - 1 - y)] = tile;
        tiles[index(WIDTH - 1 - x, HEIGHT - 1 - y)] = tile;
      }
  }
  const starters = multi
    ? [
        { x: 3, y: 1 },
        { x: 13, y: 1 },
        { x: 3, y: 11 },
        { x: 13, y: 11 },
      ]
    : [{ x: 3, y: 1 }];
  for (const crate of starters) tiles[index(crate.x, crate.y)] = 2;
  if (!multi) tiles[index(15, 11)] = 2;
  const enemies: Enemy[] = multi
    ? []
    : ENEMIES.slice(0, stage + 2).map((e, id) => ({
        ...e,
        id,
        target: { ...e },
        waitUntil: 20 + id * 3,
      }));
  for (const enemy of enemies) {
    tiles[index(enemy.x, enemy.y)] = 0;
    for (const d of DIRECTIONS) tiles[index(enemy.x + d.x, enemy.y + d.y)] = 0;
  }
  const hiddenItems: HiddenItem[] = [];
  for (let y = 1; y < HEIGHT - 1; y++)
    for (let x = 1; x < WIDTH - 1; x++) {
      if (tiles[index(x, y)] !== 2) continue;
      const mirrored = multi
        ? `${Math.min(x, WIDTH - 1 - x)}:${Math.min(y, HEIGHT - 1 - y)}`
        : `${x}:${y}`;
      const itemRng = random(
        hashSeed(`${seed}:items:${mirrored}:${BOMBER_RULES_VERSION}`),
      );
      const roll = itemRng();
      if (starters.some((s) => s.x === x && s.y === y) || roll < 0.45) {
        const kind = ITEM_KINDS[Math.floor(itemRng() * 3)];
        if (kind) hiddenItems.push({ x, y, kind });
      }
    }
  return {
    seed,
    generatorVersion: BOMBER_GENERATOR_VERSION,
    rulesVersion: BOMBER_RULES_VERSION,
    stage,
    tiles,
    spawns: (multi ? SPAWNS : SPAWNS.slice(0, 1)).map((s) => ({ ...s })),
    exit: { x: 15, y: 11 },
    enemies,
    items: [],
    hiddenItems,
    hazards:
      !multi && stage >= 4
        ? [
            { x: 8, y: 3 },
            { x: 8, y: 9 },
          ]
        : [],
    fallback: false,
  };
}
export function validateMap(map: BomberMap): boolean {
  if (map.tiles.length !== WIDTH * HEIGHT || map.items.length !== 0)
    return false;
  const start = map.spawns[0];
  if (!start) return false;
  for (const spawn of map.spawns) {
    if (
      tileAt(map, spawn.x, spawn.y) !== 0 ||
      DIRECTIONS.filter((d) => tileAt(map, spawn.x + d.x, spawn.y + d.y) === 0)
        .length < 2
    )
      return false;
  }
  if (
    new Set(map.enemies.map((e) => index(e.x, e.y))).size !==
      map.enemies.length ||
    map.enemies.some(
      (e) =>
        tileAt(map, e.x, e.y) !== 0 ||
        Math.abs(e.x - start.x) + Math.abs(e.y - start.y) < 6,
    )
  )
    return false;
  if (map.hiddenItems.some((item) => tileAt(map, item.x, item.y) !== 2))
    return false;
  const visited = new Set<number>(),
    queue = [start];
  for (let at = 0; at < queue.length; at++) {
    const cell = queue[at];
    if (!cell || visited.has(index(cell.x, cell.y))) continue;
    visited.add(index(cell.x, cell.y));
    for (const d of DIRECTIONS) {
      const next = { x: cell.x + d.x, y: cell.y + d.y };
      if (
        tileAt(map, next.x, next.y) !== 1 &&
        !visited.has(index(next.x, next.y))
      )
        queue.push(next);
    }
  }
  return (
    visited.has(index(map.exit.x, map.exit.y)) &&
    map.tiles.every((tile, i) => tile === 1 || visited.has(i))
  );
}
export function generateMap(
  seed: number,
  stage: number,
  multi = false,
  attempts = 6,
): BomberMap {
  if (!Number.isInteger(stage) || stage < 1 || stage > 5)
    throw Error('단계 범위 오류');
  for (
    let attempt = 0;
    attempt < Math.min(6, Math.max(0, attempts));
    attempt++
  ) {
    const map = candidate((seed + attempt) >>> 0, stage, multi);
    if (validateMap(map)) return { ...map, seed };
  }
  const fallback = candidate(417, stage, multi);
  if (!validateMap(fallback)) throw Error('기본 맵 검증 실패');
  return { ...fallback, seed, fallback: true };
}
