import type { EndlessState } from '../core/runner/endless';
import {
  RUNNER_GENERATOR_VERSION,
  RUNNER_PATTERNS,
  RUNNER_RULES_VERSION,
  RUNNER_THEMES,
  SEGMENT_LENGTH,
} from '../core/runner/segments';
import { isObject } from './contracts';

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number =>
  finite(v) && Number.isSafeInteger(v) && v >= 0;
const list = (
  v: unknown,
  max: number,
  check: (item: unknown) => boolean,
): boolean => Array.isArray(v) && v.length <= max && v.every(check);
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 80;

export function isEndlessState(s: unknown): s is EndlessState {
  if (
    !isObject(s) ||
    s.kind !== 'runner' ||
    !isObject(s.course) ||
    !integer(s.tick) ||
    !['single', 'multi'].includes(String(s.mode)) ||
    !['playing', 'won', 'lost', 'draw'].includes(String(s.status)) ||
    !(
      s.reason === null ||
      ['collision', 'manual', 'last-survivor', 'timeout'].includes(
        String(s.reason),
      )
    ) ||
    !list(s.winners, 4, text)
  )
    return false;
  const c = s.course;
  if (
    !integer(c.seed) ||
    c.seed > 0xffffffff ||
    c.rulesVersion !== RUNNER_RULES_VERSION ||
    c.generatorVersion !== RUNNER_GENERATOR_VERSION
  )
    return false;
  if (
    !list(c.segments, 16, (segment) => {
      if (
        !isObject(segment) ||
        !integer(segment.index) ||
        !integer(segment.start) ||
        segment.start !== segment.index * SEGMENT_LENGTH ||
        !RUNNER_THEMES.some((theme) => theme === segment.theme) ||
        !RUNNER_PATTERNS.some((pattern) => pattern === segment.pattern) ||
        typeof segment.fallback !== 'boolean'
      )
        return false;
      const start = segment.start;
      return (
        list(
          segment.obstacles,
          3,
          (o) =>
            isObject(o) &&
            finite(o.x) &&
            o.x >= start &&
            o.x < start + SEGMENT_LENGTH &&
            finite(o.width) &&
            o.width > 0 &&
            o.width <= 200 &&
            finite(o.bottom) &&
            o.bottom >= 0 &&
            finite(o.height) &&
            o.height >= 0 &&
            finite(o.phase) &&
            ['hurdle', 'ceiling', 'gap', 'moving'].includes(String(o.kind)),
        ) &&
        list(
          segment.platforms,
          3,
          (p) =>
            isObject(p) &&
            finite(p.x) &&
            p.x >= start &&
            p.x < start + SEGMENT_LENGTH &&
            finite(p.width) &&
            p.width > 0 &&
            p.width <= 200 &&
            finite(p.phase),
        ) &&
        list(
          segment.coins,
          12,
          (coin) =>
            isObject(coin) &&
            text(coin.id) &&
            finite(coin.x) &&
            coin.x >= start &&
            coin.x < start + SEGMENT_LENGTH &&
            finite(coin.y) &&
            coin.y >= 0 &&
            coin.y <= 100,
        )
      );
    })
  )
    return false;
  return (
    Array.isArray(s.players) &&
    s.players.length >= 1 &&
    s.players.length <= 4 &&
    s.players.every(
      (p) =>
        isObject(p) &&
        text(p.id) &&
        finite(p.x) &&
        p.x >= 0 &&
        finite(p.y) &&
        finite(p.vy) &&
        integer(p.distance) &&
        p.distance === Math.floor(p.x) &&
        integer(p.score) &&
        p.score % 100 === 0 &&
        typeof p.alive === 'boolean' &&
        typeof p.grounded === 'boolean' &&
        typeof p.sliding === 'boolean' &&
        typeof p.held === 'boolean' &&
        list(p.collected, 24, text),
    )
  );
}
