import { expect, test } from '@playwright/test';
import { clearBomber, moveBomber } from './bomber-controls';

test('폭탄 싱글 실패, 같은 맵 재도전, 일시정지, 5단계 완료와 재방문', async ({
  page,
}) => {
  test.setTimeout(400000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill('폭탄 탐험가');
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await page
    .locator('.bomber')
    .getByRole('button', { name: '싱글 플레이', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '2단계', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '1단계 시작' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('time-left')).not.toHaveText('90초');
  const firstMap = await page.locator('aside > .muted').textContent();
  await page.keyboard.press('Space', { delay: 80 });
  await expect(
    page.getByRole('heading', { name: '다시 한번 도전해요' }),
  ).toBeVisible();
  await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
  await page.getByRole('button', { name: '같은 맵 재도전' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('aside > .muted')).toHaveText(firstMap ?? '');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const time = await page.getByTestId('time-left').textContent();
  await page.waitForTimeout(350);
  await expect(page.getByTestId('time-left')).toHaveText(time ?? '');
  await page.getByRole('button', { name: '계속하기' }).click();
  for (let stage = 1; stage <= 5; stage++) {
    await expect(
      page.getByRole('heading', { name: `${stage}단계 / 5` }),
    ).toBeVisible();
    await expect(page.getByTestId('time-left')).not.toHaveText('90초');
    await clearBomber(page);
    await expect(
      page.getByRole('heading', { name: '스테이지 완료!' }),
    ).toBeVisible();
    await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
    if (stage < 5)
      await page.getByRole('button', { name: '다음 단계' }).click();
  }
  await expect(page.getByText('5단계 정복!', { exact: false })).toBeVisible();
  await page.screenshot({
    path: '/tmp/arcade-bomber-complete.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '로비로', exact: true }).click();
  await page.reload();
  await expect(page.getByText('팡팡 아레나 5/5단계 완료')).toBeVisible();
  expect(errors).toEqual([]);
});
test('도전 소유권, 단계 건너뛰기, 시간 위조와 중복 제출 거절', async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const origin = 'http://127.0.0.1:5173';
  for (const c of [a, b])
    await c.request.post(`${origin}/api/session`, {
      headers: { Origin: origin },
      data: { name: '동명이인' },
    });
  const post = (context: typeof a, path: string, data: unknown) =>
    context.request.post(`${origin}/api${path}`, {
      headers: { Origin: origin },
      data,
    });
  expect((await post(a, '/runs', { game: 'bomber', stage: 5 })).status()).toBe(
    403,
  );
  const run = await (
    await post(a, '/runs', { game: 'bomber', stage: 1 })
  ).json();
  expect(
    (
      await post(b, `/runs/${run.id}/finish`, {
        ticks: 1,
        score: 0,
        won: false,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await post(b, '/runs', { game: 'bomber', stage: 1, retryOf: run.id })
    ).status(),
  ).toBe(403);
  expect(
    (
      await post(a, `/runs/${run.id}/finish`, {
        ticks: 1000,
        score: 2500,
        won: true,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await post(a, `/runs/${run.id}/finish`, {
        ticks: 1,
        score: 0,
        won: false,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await post(a, `/runs/${run.id}/finish`, {
        ticks: 1,
        score: 0,
        won: false,
      })
    ).status(),
  ).toBe(409);
  await a.close();
  await b.close();
});

test('칸 중간 정지, 상자 아이템 등장·획득과 적의 자유 이동을 화면에서 확인한다', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill('아이템 탐험');
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await page
    .locator('.bomber')
    .getByRole('button', { name: '싱글 플레이', exact: true })
    .click();
  await page.getByRole('button', { name: '1단계 시작' }).click();
  await expect(page.getByTestId('time-left')).not.toHaveText('90초');
  const hud = page.getByTestId('bomber-status');
  expect(JSON.parse((await hud.getAttribute('data-items')) ?? '[]')).toEqual(
    [],
  );
  const enemies = await hud.getAttribute('data-enemies');
  expect(JSON.parse(enemies ?? '[]')).toHaveLength(3);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(170);
  await page.keyboard.up('ArrowDown');
  const y = Number(await hud.getAttribute('data-y'));
  expect(y).toBeGreaterThan(1);
  expect(Number.isInteger(y)).toBe(false);
  await page.waitForTimeout(160);
  expect(Number(await hud.getAttribute('data-y'))).toBeCloseTo(y, 4);
  await moveBomber(page, 'y', 1);
  await page.keyboard.press('Space', { delay: 70 });
  await moveBomber(page, 'y', 4);
  await expect
    .poll(
      async () =>
        JSON.parse((await hud.getAttribute('data-items')) ?? '[]').length,
    )
    .toBeGreaterThan(0);
  await expect(hud).not.toHaveAttribute('data-enemies', enemies ?? '');
  await page.waitForTimeout(600);
  await moveBomber(page, 'y', 1);
  await moveBomber(page, 'x', 3);
  await expect
    .poll(
      async () =>
        Number(await hud.getAttribute('data-capacity')) > 2 ||
        Number(await hud.getAttribute('data-range')) > 2 ||
        Number(await hud.getAttribute('data-speed')) > 0.16,
    )
    .toBe(true);
  await page.screenshot({
    path: '/tmp/arcade-bomber-items.png',
    fullPage: true,
  });
});
