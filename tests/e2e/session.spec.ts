import { expect, test } from '@playwright/test';

test('이름 입력, 동일 브라우저 재방문, 동명이인 세션 분리', async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle('틈새 오락실');
  await page.getByLabel('플레이어 이름').fill('동명이인');
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await expect(page.getByText('동명이인 님')).toBeVisible();
  const first = await (await page.request.get('/api/me')).json();
  await page.reload();
  await expect(page.getByText('동명이인 님')).toBeVisible();
  expect((await (await page.request.get('/api/me')).json()).player.id).toBe(
    first.player.id,
  );
  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto('/');
  await other.getByLabel('플레이어 이름').fill('동명이인');
  await other.getByRole('button', { name: '오락실 입장' }).click();
  await expect(other.getByText('동명이인 님')).toBeVisible();
  expect(
    (await (await other.request.get('/api/me')).json()).player.id,
  ).not.toBe(first.player.id);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'arcade_session',
  );
  const denied = await page.request.post('/api/session', {
    headers: { Origin: 'https://evil.example' },
    data: { name: 'bad' },
  });
  expect(denied.status()).toBe(403);
  await page.screenshot({ path: '/tmp/arcade-p1-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: '/tmp/arcade-p1-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  await second.close();
});
