import { hashSeed, random } from '../random';
import {
  type BomberMap,
  type Cell,
  DIRECTIONS,
  generateMap,
  gridCell,
  type ItemKind,
  index,
  sameCell,
  tileAt,
} from './map';
import {
  BASE_SPEED,
  bodiesOverlap,
  canOccupy,
  MAX_SPEED,
  moveBody,
  touchesCell,
} from './motion';
export const BOMBER_LIMIT = 1800;
export interface BomberInput {
  dx: number;
  dy: number;
  action: boolean;
}
export interface BomberPlayer extends Cell {
  id: string;
  alive: boolean;
  range: number;
  capacity: number;
  speed: number;
  score: number;
  placed: boolean;
  pickup: ItemKind | null;
  pickupAt: number;
}
export interface Bomb extends Cell {
  owner: string;
  fuse: number;
  range: number;
  pass: string[];
}
export interface Flame extends Cell {
  until: number;
}
export interface BomberState {
  kind: 'bomber';
  map: BomberMap;
  players: BomberPlayer[];
  bombs: Bomb[];
  flames: Flame[];
  tick: number;
  status: 'playing' | 'won' | 'lost' | 'draw';
  winners: string[];
  mode: 'single' | 'multi';
}
export function createBomber(
  seed: number,
  stage: number,
  ids: string[],
  multi = false,
): BomberState {
  const map = generateMap(seed, stage, multi);
  return {
    kind: 'bomber',
    map,
    players: ids.map((id, i) => ({
      id,
      ...(map.spawns[i] ?? { x: 1, y: 1 }),
      alive: true,
      range: 2,
      capacity: 2,
      speed: BASE_SPEED,
      score: 0,
      placed: false,
      pickup: null,
      pickupAt: 0,
    })),
    bombs: [],
    flames: [],
    tick: 0,
    status: 'playing',
    winners: [],
    mode: multi ? 'multi' : 'single',
  };
}
function detonate(state: BomberState, bomb: Bomb, blockers: readonly number[]) {
  state.bombs = state.bombs.filter((b) => b !== bomb);
  const cells: Cell[] = [{ x: bomb.x, y: bomb.y }];
  for (const d of DIRECTIONS)
    for (let n = 1; n <= bomb.range; n++) {
      const x = bomb.x + d.x * n,
        y = bomb.y + d.y * n,
        tile = blockers[index(x, y)] ?? 1;
      if (tile === 1) break;
      cells.push({ x, y });
      if (tile === 2) {
        if (state.map.tiles[index(x, y)] === 2) {
          state.map.tiles[index(x, y)] = 0;
          const owner = state.players.find((p) => p.id === bomb.owner);
          if (owner) owner.score += 50;
          const hidden = state.map.hiddenItems.find(
            (item) => item.x === x && item.y === y,
          );
          if (hidden)
            state.map.items.push({
              ...hidden,
              bornAt: state.tick,
              availableAt: state.tick + 10,
            });
          state.map.hiddenItems = state.map.hiddenItems.filter(
            (item) => item.x !== x || item.y !== y,
          );
        }
        break;
      }
    }
  for (const cell of cells) {
    const existing = state.flames.find((f) => sameCell(f, cell));
    if (existing) existing.until = state.tick + 10;
    else state.flames.push({ ...cell, until: state.tick + 10 });
    state.map.items = state.map.items.filter(
      (item) => item.bornAt === state.tick || !sameCell(item, cell),
    );
    const chain = state.bombs.find((b) => sameCell(b, cell));
    if (chain) detonate(state, chain, blockers);
  }
}
export function stepEnemies(state: BomberState): void {
  const enemies = state.map.enemies;
  const speed = 0.045 + state.map.stage * 0.006;
  // 매 틱 우선순위를 순환해 좁은 통로에서 특정 적만 먼저 움직이지 않게 한다.
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[(i + state.tick) % enemies.length];
    if (!enemy || enemy.waitUntil > state.tick) continue;
    const space = {
      map: state.map,
      obstacles: state.bombs,
      actors: enemies.filter((e) => e !== enemy),
    };
    if (
      Math.abs(enemy.x - enemy.target.x) + Math.abs(enemy.y - enemy.target.y) <
      0.001
    ) {
      const cell = gridCell(enemy);
      const choices = DIRECTIONS.map((d) => ({
        x: cell.x + d.x,
        y: cell.y + d.y,
      })).filter(
        (p) =>
          canOccupy(p, space) && !state.flames.some((f) => touchesCell(p, f)),
      );
      const rng = random(
        hashSeed(String(state.map.seed) + ':' + state.tick + ':' + enemy.id),
      );
      const target = choices[Math.floor(rng() * choices.length)];
      if (!target) {
        enemy.waitUntil = state.tick + 3;
        continue;
      }
      enemy.target = target;
    }
    const dx = enemy.target.x - enemy.x,
      dy = enemy.target.y - enemy.y;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    const moved = moveBody(enemy, dx, dy, Math.min(speed, distance), space);
    if (!moved) {
      enemy.target = gridCell(enemy);
      enemy.waitUntil = state.tick + 3;
    }
  }
}
export function stepBomber(
  state: BomberState,
  inputs: Readonly<Record<string, BomberInput>>,
): void {
  if (state.status !== 'playing') return;
  state.tick++;
  state.flames = state.flames.filter((f) => f.until > state.tick);
  for (const p of state.players) {
    if (!p.alive) continue;
    const input = inputs[p.id] ?? { dx: 0, dy: 0, action: false };
    moveBody(p, input.dx, input.dy, p.speed, {
      map: state.map,
      obstacles: state.bombs.filter((b) => !b.pass.includes(p.id)),
    });
    for (const bomb of state.bombs)
      if (!touchesCell(p, bomb))
        bomb.pass = bomb.pass.filter((id) => id !== p.id);
    const cell = gridCell(p);
    if (
      input.action &&
      !p.placed &&
      state.bombs.filter((b) => b.owner === p.id).length < p.capacity &&
      !state.bombs.some((b) => sameCell(b, cell)) &&
      tileAt(state.map, cell.x, cell.y) === 0
    ) {
      state.bombs.push({
        ...cell,
        owner: p.id,
        fuse: 36,
        range: p.range,
        pass: state.players
          .filter((q) => touchesCell(q, cell))
          .map((q) => q.id),
      });
    }
    p.placed = input.action;
    for (const item of [...state.map.items]) {
      if (
        Math.abs(item.x - p.x) < 0.45 &&
        Math.abs(item.y - p.y) < 0.45 &&
        item.availableAt <= state.tick &&
        !state.flames.some((f) => sameCell(f, item))
      ) {
        state.map.items = state.map.items.filter((i) => i !== item);
        if (item.kind === 'capacity') p.capacity = Math.min(5, p.capacity + 1);
        if (item.kind === 'range') p.range = Math.min(6, p.range + 1);
        if (item.kind === 'speed')
          p.speed = Math.min(
            MAX_SPEED,
            Math.round((p.speed + 0.025) * 1000) / 1000,
          );
        p.score += 100;
        p.pickup = item.kind;
        p.pickupAt = state.tick;
      }
    }
  }
  const blockers = [...state.map.tiles];
  for (const bomb of [...state.bombs]) {
    bomb.fuse--;
    if (bomb.fuse <= 0 && state.bombs.includes(bomb))
      detonate(state, bomb, blockers);
  }
  state.map.enemies = state.map.enemies.filter(
    (e) => !state.flames.some((f) => touchesCell(e, f)),
  );
  stepEnemies(state);
  state.map.enemies = state.map.enemies.filter(
    (e) => !state.flames.some((f) => touchesCell(e, f)),
  );
  const hazardOn = state.tick % 80 >= 60;
  for (const p of state.players)
    if (
      p.alive &&
      (state.flames.some((f) => touchesCell(p, f)) ||
        state.map.enemies.some((e) => bodiesOverlap(e, p)) ||
        (hazardOn && state.map.hazards.some((h) => touchesCell(p, h))))
    )
      p.alive = false;
  const alive = state.players.filter((p) => p.alive);
  if (state.mode === 'single') {
    const p = alive[0];
    if (!p) state.status = 'lost';
    else if (
      Math.abs(p.x - state.map.exit.x) < 0.35 &&
      Math.abs(p.y - state.map.exit.y) < 0.35 &&
      tileAt(state.map, state.map.exit.x, state.map.exit.y) === 0
    ) {
      state.status = 'won';
      state.winners = [p.id];
      p.score += 1000 + Math.max(0, BOMBER_LIMIT - state.tick);
    } else if (state.tick >= BOMBER_LIMIT) state.status = 'lost';
  } else if (alive.length <= 1) {
    state.status = alive.length === 1 ? 'won' : 'draw';
    state.winners = alive.map((p) => p.id);
  } else if (state.tick >= BOMBER_LIMIT) state.status = 'draw';
}
