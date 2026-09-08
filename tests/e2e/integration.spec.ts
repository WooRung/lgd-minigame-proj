import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:5173';

test('동시 API 제출의 40회 상한과 다른 플레이어 분리', async ({ browser }) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  for (const context of [a, b])
    expect(
      (
        await context.request.post(`${origin}/api/session`, {
          headers: { Origin: origin },
          data: { name: '빈도 검사' },
        })
      ).status(),
    ).toBe(201);
  const responses = await Promise.all(
    Array.from({ length: 45 }, () =>
      a.request.post(`${origin}/api/runs`, {
        headers: { Origin: origin },
        data: { game: 'invalid' },
      }),
    ),
  );
  expect(responses.filter((r) => r.status() === 400)).toHaveLength(40);
  expect(responses.filter((r) => r.status() === 429)).toHaveLength(5);
  expect(
    responses.find((r) => r.status() === 429)?.headers()['retry-after'],
  ).toBe('60');
  expect(
    (
      await b.request.post(`${origin}/api/runs`, {
        headers: { Origin: origin },
        data: { game: 'invalid' },
      })
    ).status(),
  ).toBe(400);
  expect((await a.request.get(`${origin}/api/me`)).status()).toBe(200);
  await a.close();
  await b.close();
});

test('저장 응답 유실 복구·두 게임 화면 이탈·작은 화면', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill('통합 확인');
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await page
    .locator('.bomber')
    .getByRole('button', { name: '싱글 플레이', exact: true })
    .click();
  await page.getByRole('button', { name: '1단계 시작' }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  let lost = false;
  await page.route('**/api/runs/*/finish', async (route) => {
    if (!lost) {
      lost = true;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort();
    } else await route.continue();
  });
  await page.waitForTimeout(150);
  await page.keyboard.press('Space', { delay: 100 });
  await expect(page.getByRole('button', { name: '저장 재시도' })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.getByRole('button', { name: '같은 맵 재도전' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '저장 재시도' }).click();
  await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
  await page.getByRole('button', { name: '로비로', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page
    .locator('.runner')
    .getByRole('button', { name: '싱글 플레이', exact: true })
    .click();
  await page.getByRole('button', { name: '무한 달리기 시작' }).click();
  await expect(page.locator('.game-canvas')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: '/tmp/arcade-final-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '로비로', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: '/tmp/arcade-final-desktop.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('퇴장 시 WebSocket 종료와 빈 방 정리', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill('빈 방 확인');
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await page
    .locator('.bomber')
    .getByRole('button', { name: '친구와 대전', exact: true })
    .click();
  const wsPromise = page.waitForEvent('websocket');
  await page.getByRole('button', { name: '새 방 만들기' }).click();
  const ws = await wsPromise;
  const code = await page.getByTestId('room-code').innerText();
  await expect(page.getByTestId('connection-status')).toHaveText('연결됨');
  const closed = ws.waitForEvent('close');
  await page.getByRole('button', { name: '로비로 나가기' }).click();
  await closed;
  await expect
    .poll(
      async () =>
        (
          await context.request.get(`${origin}/api/rooms/${code}/view`)
        ).status(),
      { timeout: 7000 },
    )
    .toBe(404);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('퇴장 API 장애에도 로비로 복귀하고 소켓을 닫는다', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill('장애 복귀');
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await page
    .locator('.runner')
    .getByRole('button', { name: '친구와 대전', exact: true })
    .click();
  const wsPromise = page.waitForEvent('websocket');
  await page.getByRole('button', { name: '새 방 만들기' }).click();
  const ws = await wsPromise;
  await expect(page.getByTestId('connection-status')).toHaveText('연결됨');
  await page.route('**/api/rooms/*/leave', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/html',
      body: 'Temporarily unavailable',
    }),
  );
  const closed = ws.waitForEvent('close');
  await page.getByRole('button', { name: '로비로 나가기' }).click();
  await closed;
  await expect(
    page.getByRole('button', { name: '기록과 랭킹 보기' }),
  ).toBeVisible();
});
