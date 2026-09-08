import { random } from '../random';
import {
  type BomberMap,
  type Cell,
  generateMap,
  index,
  sameCell,
  tileAt,
} from './map';
export const BOMBER_LIMIT = 1800;
export interface BomberInput {
  dx: number;
  dy: number;
  action: boolean;
}
export interface BomberPlayer extends Cell {
  id: string;
  alive: boolean;
  cooldown: number;
  range: number;
  score: number;
  placed: boolean;
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
      cooldown: 0,
      range: 2,
      score: 0,
      placed: false,
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
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    for (let n = 1; n <= bomb.range; n++) {
      const x = bomb.x + (dx ?? 0) * n,
        y = bomb.y + (dy ?? 0) * n,
        tile = blockers[index(x, y)] ?? 1;
      if (tile === 1) break;
      cells.push({ x, y });
      if (tile === 2) {
        state.map.tiles[index(x, y)] = 0;
        const owner = state.players.find((p) => p.id === bomb.owner);
        if (owner) owner.score += 50;
        break;
      }
    }
  for (const cell of cells) {
    state.flames.push({ ...cell, until: state.tick + 10 });
    const chain = state.bombs.find((b) => sameCell(b, cell));
    if (chain) detonate(state, chain, blockers);
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
    if (p.cooldown > 0) p.cooldown--;
    if (p.cooldown === 0 && (input.dx !== 0 || input.dy !== 0)) {
      const dx = Math.sign(input.dx),
        dy = dx ? 0 : Math.sign(input.dy),
        x = p.x + dx,
        y = p.y + dy;
      if (
        tileAt(state.map, x, y) === 0 &&
        !state.bombs.some(
          (b) => b.x === x && b.y === y && !b.pass.includes(p.id),
        )
      ) {
        p.x = x;
        p.y = y;
        p.cooldown = 3;
      }
    }
    for (const b of state.bombs)
      if (!sameCell(p, b)) b.pass = b.pass.filter((id) => id !== p.id);
    if (
      input.action &&
      !p.placed &&
      state.bombs.filter((b) => b.owner === p.id).length < 2 &&
      !state.bombs.some((b) => sameCell(b, p))
    )
      state.bombs.push({
        x: p.x,
        y: p.y,
        owner: p.id,
        fuse: 36,
        range: p.range,
        pass: state.players.filter((q) => sameCell(q, p)).map((q) => q.id),
      });
    p.placed = input.action;
    if (state.map.items.some((item) => sameCell(item, p))) {
      state.map.items = state.map.items.filter((item) => !sameCell(item, p));
      p.range = 3;
      p.score += 100;
    }
  }
  const blockers = [...state.map.tiles];
  for (const bomb of [...state.bombs]) {
    bomb.fuse--;
    if (bomb.fuse <= 0 && state.bombs.includes(bomb))
      detonate(state, bomb, blockers);
  }
  // 적의 순찰은 시드와 틱으로만 결정되며 화면 프레임률과 분리된다.
  if (state.tick % Math.max(5, 14 - state.map.stage * 2) === 0) {
    const rng = random(state.map.seed + state.tick);
    for (const enemy of state.map.enemies) {
      const choices = [
        { x: enemy.x - 1, y: enemy.y },
        { x: enemy.x + 1, y: enemy.y },
      ].filter((c) => tileAt(state.map, c.x, c.y) === 0);
      const next = choices[Math.floor(rng() * choices.length)];
      if (next) Object.assign(enemy, next);
    }
  }
  state.map.enemies = state.map.enemies.filter(
    (e) => !state.flames.some((f) => sameCell(f, e)),
  );
  const hazardOn = state.tick % 80 >= 60;
  for (const p of state.players)
    if (
      p.alive &&
      (state.flames.some((f) => sameCell(f, p)) ||
        state.map.enemies.some((e) => sameCell(e, p)) ||
        (hazardOn && state.map.hazards.some((h) => sameCell(h, p))))
    )
      p.alive = false;
  const alive = state.players.filter((p) => p.alive);
  if (state.mode === 'single') {
    const p = alive[0];
    if (!p) state.status = 'lost';
    else if (sameCell(p, state.map.exit)) {
      state.status = 'won';
      state.winners = [p.id];
      p.score += 1000 + Math.max(0, BOMBER_LIMIT - state.tick);
    } else if (state.tick >= BOMBER_LIMIT) state.status = 'lost';
  } else if (alive.length <= 1) {
    state.status = alive.length === 1 ? 'won' : 'draw';
    state.winners = alive.map((p) => p.id);
  } else if (state.tick >= BOMBER_LIMIT) state.status = 'draw';
}
