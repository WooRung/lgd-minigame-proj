import { GENERATOR_VERSION, RULES_VERSION, random } from '../random';
export const WIDTH = 11;
export const HEIGHT = 9;
export interface Cell {
  x: number;
  y: number;
}
export type Tile = 0 | 1 | 2;
export interface BomberMap {
  seed: number;
  generatorVersion: string;
  rulesVersion: string;
  stage: number;
  tiles: Tile[];
  spawns: Cell[];
  exit: Cell;
  enemies: Cell[];
  hazards: Cell[];
  items: Cell[];
  fallback: boolean;
}
export const index = (x: number, y: number) => y * WIDTH + x;
export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
export function tileAt(map: BomberMap, x: number, y: number): Tile {
  return map.tiles[index(x, y)] ?? 1;
}
const SPAWNS: Cell[] = [
  { x: 1, y: 1 },
  { x: 9, y: 7 },
  { x: 9, y: 1 },
  { x: 1, y: 7 },
];
function candidate(seed: number, stage: number, multi: boolean): BomberMap {
  const rng = random(seed);
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
  // 가장자리 회랑은 항상 연결되어 출구까지 파괴 가능한 경로를 보장한다.
  for (let x = 1; x < WIDTH - 1; x++) {
    tiles[index(x, 1)] = 0;
    tiles[index(x, 7)] = 0;
  }
  for (let y = 1; y < HEIGHT - 1; y++) {
    tiles[index(1, y)] = 0;
    tiles[index(9, y)] = 0;
  }
  if (multi) {
    for (let y = 1; y < HEIGHT - 1; y++)
      for (let x = 1; x < WIDTH - 1; x++) {
        const tile = tiles[index(x, y)] ?? 1;
        tiles[index(WIDTH - 1 - x, y)] = tile;
        tiles[index(x, HEIGHT - 1 - y)] = tile;
        tiles[index(WIDTH - 1 - x, HEIGHT - 1 - y)] = tile;
      }
  } else tiles[index(9, 7)] = 2;
  const enemies: Cell[] = multi
    ? []
    : Array.from({ length: Math.min(stage, 4) }, (_, i) => ({
        x: 3 + (i % 3) * 2,
        y: i < 3 ? 3 : 5,
      }));
  for (const e of enemies) {
    tiles[index(e.x, e.y)] = 0;
    tiles[index(e.x - 1, e.y)] = 0;
    tiles[index(e.x + 1, e.y)] = 0;
  }
  return {
    seed,
    generatorVersion: GENERATOR_VERSION,
    rulesVersion: RULES_VERSION,
    stage,
    tiles,
    spawns: SPAWNS.map((s) => ({ ...s })),
    exit: { x: 9, y: 7 },
    enemies,
    hazards:
      !multi && stage >= 4
        ? [
            { x: 5, y: 1 },
            { x: 9, y: 4 },
          ]
        : [],
    items: !multi && stage >= 2 ? [{ x: 3, y: 1 }] : [],
    fallback: false,
  };
}
export function validateMap(map: BomberMap): boolean {
  if (map.tiles.length !== WIDTH * HEIGHT) return false;
  const start = map.spawns[0];
  if (!start || tileAt(map, start.x, start.y) !== 0) return false;
  for (const s of map.spawns) {
    const free = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].filter(([dx, dy]) => tileAt(map, s.x + (dx ?? 0), s.y + (dy ?? 0)) === 0);
    if (free.length < 2) return false;
  }
  const visited = new Set<number>(),
    queue = [start];
  while (queue.length) {
    const cell = queue.shift();
    if (!cell) break;
    const key = index(cell.x, cell.y);
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = cell.x + (dx ?? 0),
        y = cell.y + (dy ?? 0);
      if (
        x >= 0 &&
        y >= 0 &&
        x < WIDTH &&
        y < HEIGHT &&
        tileAt(map, x, y) !== 1 &&
        !visited.has(index(x, y))
      )
        queue.push({ x, y });
    }
  }
  return (
    visited.has(index(map.exit.x, map.exit.y)) &&
    map.spawns.every((s) => visited.has(index(s.x, s.y)))
  );
}
export function generateMap(
  seed: number,
  stage: number,
  multi = false,
  attempts = 6,
): BomberMap {
  if (!Number.isInteger(stage) || stage < 1 || stage > 5)
    throw new Error('단계 범위 오류');
  for (let i = 0; i < Math.min(6, attempts); i++) {
    const map = candidate((seed + i) >>> 0, stage, multi);
    if (validateMap(map)) return { ...map, seed };
  }
  const fallback = candidate(417, stage, multi);
  return { ...fallback, seed, fallback: true };
}
