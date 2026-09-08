import { expect, it } from 'vitest';
import { createEndlessRunner } from '../core/runner/endless';
import { isEndlessState } from './runner-state';

it('러너 상태 응답의 유한 수치·버전·배열 상한을 검사한다', () => {
  const state = createEndlessRunner(42, ['a', 'b'], true);
  expect(isEndlessState(state)).toBe(true);
  expect(isEndlessState({ ...state, tick: Infinity })).toBe(false);
  expect(
    isEndlessState({
      ...state,
      course: { ...state.course, rulesVersion: '1' },
    }),
  ).toBe(false);
  expect(
    isEndlessState({
      ...state,
      course: {
        ...state.course,
        segments: Array(17).fill(state.course.segments[0]),
      },
    }),
  ).toBe(false);
  const p = state.players[0];
  if (!p) throw Error();
  expect(
    isEndlessState({
      ...state,
      players: [{ ...p, collected: Array(25).fill('0:x') }],
    }),
  ).toBe(false);
  expect(
    isEndlessState({ ...state, players: [{ ...p, x: 5, distance: 0 }] }),
  ).toBe(false);
});
