import { expect, type Page } from '@playwright/test';

export async function moveBomber(page: Page, axis: 'x' | 'y', target: number) {
  const start = Number(
    await page.getByTestId('bomber-status').getAttribute('data-' + axis),
  );
  const direction = target > start ? 1 : -1;
  const key =
    axis === 'x'
      ? direction > 0
        ? 'ArrowRight'
        : 'ArrowLeft'
      : direction > 0
        ? 'ArrowDown'
        : 'ArrowUp';
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(
      ({ axis, target, direction }) => {
        const el = document.querySelector<HTMLElement>(
          '[data-testid=bomber-status]',
        );
        return (
          el?.dataset.alive === 'false' ||
          [...document.querySelectorAll('h2')].some(
            (h) => h.textContent === '스테이지 완료!',
          ) ||
          (el && direction * (Number(el.dataset[axis]) - target) >= -0.1)
        );
      },
      { axis, target, direction },
      { timeout: 7000 },
    );
  } finally {
    await page.keyboard.up(key);
  }
  if (
    (await page.getByTestId('bomber-status').getAttribute('data-alive')) ===
    'false'
  )
    throw Error('플레이 도중 적/폭발에 패배');
}
export async function clearBomber(page: Page) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 16; attempt++) {
    if (attempt > 0) {
      await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
      await page.getByRole('button', { name: '같은 맵 재도전' }).click();
    }
    await expect(page.locator('.result')).toHaveCount(0);
    await expect(page.getByTestId('bomber-status')).toHaveAttribute(
      'data-alive',
      'true',
    );
    await expect(page.getByTestId('time-left')).not.toHaveText('90초');
    if (attempt > 3) await page.waitForTimeout(Math.floor(attempt / 4) * 250);
    try {
      if (attempt % 4 === 0) {
        await moveBomber(page, 'y', 11);
        await moveBomber(page, 'x', 13);
        await page.keyboard.press('Space', { delay: 70 });
        await moveBomber(page, 'x', 10);
        await page.waitForTimeout(2200);
        await moveBomber(page, 'x', 15);
      } else if (attempt % 4 === 1) {
        await moveBomber(page, 'y', 6);
        await moveBomber(page, 'x', 15);
        await moveBomber(page, 'y', 9);
        await page.keyboard.press('Space', { delay: 70 });
        await moveBomber(page, 'y', 6);
        await page.waitForTimeout(2200);
        await moveBomber(page, 'y', 11);
      } else if (attempt % 4 === 2) {
        await page.keyboard.press('Space', { delay: 70 });
        await moveBomber(page, 'y', 4);
        await page.waitForTimeout(2200);
        await moveBomber(page, 'y', 1);
        await moveBomber(page, 'x', 15);
        await moveBomber(page, 'y', 9);
        await page.keyboard.press('Space', { delay: 70 });
        await moveBomber(page, 'y', 5);
        await page.waitForTimeout(2200);
        await moveBomber(page, 'y', 11);
      } else {
        await moveBomber(page, 'y', 11);
        await moveBomber(page, 'x', 3);
        await page.keyboard.press('Space', { delay: 70 });
        await moveBomber(page, 'x', 1);
        await moveBomber(page, 'y', 8);
        await page.waitForTimeout(2200);
        await moveBomber(page, 'y', 11);
        await moveBomber(page, 'x', 13);
        await page.keyboard.press('Space', { delay: 70 });
        await moveBomber(page, 'x', 10);
        await page.waitForTimeout(2200);
        await moveBomber(page, 'x', 15);
      }
      await expect(
        page.getByRole('heading', { name: '스테이지 완료!', exact: true }),
      ).toBeVisible();
      return;
    } catch (error) {
      lastError = error;
      // 적을 만난 시도는 실제 실패 기록을 남기고 같은 맵에서 다른 회랑으로 재도전한다.
      if (
        (await page.getByTestId('bomber-status').getAttribute('data-alive')) !==
        'false'
      )
        throw error;
    }
  }
  throw lastError;
}
