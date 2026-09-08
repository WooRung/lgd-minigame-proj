import { expect, test } from '@playwright/test';
import { type Leaderboard, readLeaderboard } from '../../src/shared/rankings';
import { clearBomber } from './bomber-controls';

test('일간 실제 완주 결과가 랭킹·내 순위·최근 기록에 표시된다', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill('오늘의 도전자');
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await page.getByRole('button', { name: '기록과 랭킹 보기' }).click();
  await expect(
    page.getByRole('heading', { name: '상위 기록', exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: '이 조건으로 도전' }).click();
  await page.getByRole('button', { name: '3단계 시작' }).click();
  await expect(page.getByTestId('time-left')).not.toHaveText('90초');
  await clearBomber(page);
  await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
  await page.getByRole('button', { name: '기록으로', exact: true }).click();
  await expect(page.getByTestId('my-rank')).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: '오늘의 도전자' }).first(),
  ).toBeVisible();
  await expect(page.locator('.history-list')).toContainText('일간 도전');
  await page.screenshot({ path: '/tmp/arcade-rankings.png', fullPage: true });
  await page.getByLabel('도전 기간').selectOption('weekly');
  await expect(page.getByText('이 도전의 기록이 아직 없어요.')).toBeVisible();
});
test('공동 순위·최고 기록 유지·중복·게임과 기간 분리', async ({ browser }) => {
  const origin = 'http://127.0.0.1:5173',
    contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
  const runs: { id: string; seed: number }[] = [];
  for (const c of contexts) {
    await c.request.post(`${origin}/api/session`, {
      headers: { Origin: origin },
      data: { name: '동점 확인' },
    });
    const response = await c.request.post(`${origin}/api/runs`, {
      headers: { Origin: origin },
      data: { game: 'bomber', mode: 'daily', stage: 5 },
    });
    expect(response.status()).toBe(201);
    const run = await response.json();
    expect(run.stage).toBe(3);
    runs.push(run);
  }
  expect(new Set(runs.map((r) => r.seed)).size).toBe(1);
  // 순위 경계만 확인하는 로컬 API fixture. 실제 키 입력 완주는 별도 시나리오에서 검증한다.
  await new Promise((resolve) => setTimeout(resolve, 5100));
  for (let i = 0; i < contexts.length; i++) {
    const c = contexts[i],
      r = runs[i];
    if (!c || !r) throw Error();
    const result = await c.request.post(`${origin}/api/runs/${r.id}/finish`, {
      headers: { Origin: origin },
      data: { ticks: 100, score: i === 2 ? 2700 : 2750, won: true },
    });
    expect(result.status()).toBe(200);
  }
  const boards: Leaderboard[] = [];
  for (const c of contexts)
    boards.push(
      readLeaderboard(
        await (
          await c.request.get(`${origin}/api/rankings?game=bomber&mode=daily`)
        ).json(),
      ),
    );
  const first = boards[0]?.mine,
    second = boards[1]?.mine,
    third = boards[2]?.mine;
  if (!first || !second || !third) throw Error('내 순위 누락');
  expect(first.rank).toBe(second.rank);
  expect(third.rank).toBeGreaterThanOrEqual(first.rank + 2);
  expect(
    boards[0]?.nearby.some(
      (r: { playerId: string }) => r.playerId === first.playerId,
    ),
  ).toBe(true);
  const a = contexts[0],
    r = runs[0];
  if (!a || !r) throw Error();
  expect(
    (
      await a.request.post(`${origin}/api/runs/${r.id}/finish`, {
        headers: { Origin: origin },
        data: { ticks: 100, score: 2750, won: true },
      })
    ).status(),
  ).toBe(409);
  const lower = await (
    await a.request.post(`${origin}/api/runs`, {
      headers: { Origin: origin },
      data: { game: 'bomber', mode: 'daily' },
    })
  ).json();
  await new Promise((resolve) => setTimeout(resolve, 5100));
  expect(
    (
      await a.request.post(`${origin}/api/runs/${lower.id}/finish`, {
        headers: { Origin: origin },
        data: { ticks: 100, score: 2700, won: true },
      })
    ).status(),
  ).toBe(200);
  const after = await (
    await a.request.get(`${origin}/api/rankings?game=bomber&mode=daily`)
  ).json();
  expect(after.mine.score).toBe(2750);
  expect(
    (
      await (
        await a.request.get(`${origin}/api/rankings?game=bomber&mode=weekly`)
      ).json()
    ).mine,
  ).toBeNull();
  expect(
    (
      await (
        await a.request.get(`${origin}/api/rankings?game=runner&mode=daily`)
      ).json()
    ).mine,
  ).toBeNull();
  expect(
    (await (await a.request.get(`${origin}/api/me`)).json()).progress,
  ).toEqual([]);
  const history = await (
    await a.request.get(`${origin}/api/history?game=bomber`)
  ).json();
  expect(history.filter((h: { id: string }) => h.id === r.id)).toHaveLength(1);
  for (const c of contexts) await c.close();
});
