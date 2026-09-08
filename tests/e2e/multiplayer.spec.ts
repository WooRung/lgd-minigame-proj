import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { isObject } from '../../src/shared/contracts';
import { type RoomView, readRoom } from '../../src/shared/room';

interface Guest {
  context: BrowserContext;
  page: Page;
  frames: RoomView[];
}
async function guest(browser: Browser, index: number): Promise<Guest> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames: RoomView[] = [];
  watch(page, frames);
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill(`친구${index}`);
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await page
    .locator('.bomber')
    .getByRole('button', { name: '친구와 대전', exact: true })
    .click();
  return { context, page, frames };
}
function watch(page: Page, frames: RoomView[]) {
  page.on('pageerror', (error) =>
    console.error('BROWSER ERROR:', error.message),
  );
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/api/rooms/')) return;
    ws.on('framereceived', (frame) => {
      const message: unknown = JSON.parse(String(frame.payload));
      if (isObject(message) && message.type === 'room')
        frames.push(readRoom(message.room));
    });
  });
}
async function ready(guests: Guest[]) {
  for (const g of guests)
    await g.page.getByRole('button', { name: '준비하기', exact: true }).click();
  await guests[0]?.page
    .getByRole('button', { name: '경기 시작', exact: true })
    .click();
  for (const g of guests) {
    await expect(g.page.getByTestId('room-phase')).toHaveText('경기 중');
    await expect(g.page.locator('.game-canvas')).toHaveAttribute(
      'data-ready',
      'true',
    );
  }
}
async function reconnect(g: Guest, code: string) {
  await g.page.close();
  const page = await g.context.newPage();
  g.page = page;
  watch(page, g.frames);
  await page.goto(`/?room=${code}`);
  await page.getByRole('button', { name: '참가하기', exact: true }).click();
  await expect(page.getByTestId('connection-status')).toHaveText('연결됨');
  await expect(page.locator('.game-canvas')).toHaveAttribute(
    'data-ready',
    'true',
    { timeout: 15000 },
  );
}
for (const count of [2, 4])
  test(`폭탄 ${count}인 실제 대전·동기화·재접속·재대결`, async ({
    browser,
  }) => {
    test.setTimeout(100000);
    const guests: Guest[] = [];
    for (let i = 0; i < count; i++) guests.push(await guest(browser, i + 1));
    const host = guests[0];
    if (!host) throw Error();
    await host.page.getByRole('button', { name: '새 방 만들기' }).click();
    const code = await host.page.getByTestId('room-code').innerText();
    for (const g of guests.slice(1)) {
      await g.page.getByLabel('초대 코드').fill(code);
      await g.page
        .getByRole('button', { name: '참가하기', exact: true })
        .click();
      await expect(g.page.getByTestId('connection-status')).toHaveText(
        '연결됨',
      );
    }
    if (count === 4) {
      const fifth = await guest(browser, 5);
      await fifth.page.getByLabel('초대 코드').fill(code);
      await fifth.page
        .getByRole('button', { name: '참가하기', exact: true })
        .click();
      await expect(fifth.page.getByRole('alert')).toContainText('방이 가득');
      await fifth.context.close();
    }
    await ready(guests);
    const initial = host.frames.find((r) => r.phase === 'countdown');
    expect(initial?.members).toHaveLength(count);
    for (const g of guests)
      expect(
        g.frames.some(
          (r) => r.startedAt === initial?.startedAt && r.seed === initial.seed,
        ),
      ).toBe(true);
    await host.page.keyboard.down('ArrowDown');
    await host.page.waitForFunction(
      () =>
        document.querySelector('[data-testid=my-position]')?.textContent ===
        '내 위치 2, 3',
    );
    await host.page.keyboard.up('ArrowDown');
    const second = guests[1];
    if (!second) throw Error();
    await reconnect(second, code);
    await expect(second.page.getByTestId('room-phase')).toHaveText('경기 중');
    for (const g of guests.slice(1))
      await g.page.keyboard.press('Space', { delay: 120 });
    for (const g of guests) {
      await expect(
        g.page.getByRole('heading', { name: '경기 결과', exact: true }),
      ).toBeVisible();
      await expect(g.page.getByText(/기록 저장 완료/)).toBeVisible();
    }
    const ended = host.frames.filter((r) => r.phase === 'ended').at(-1);
    expect(ended?.results.filter((r) => r.outcome === 'win')).toHaveLength(1);
    for (const g of guests)
      expect(
        g.frames.filter((r) => r.phase === 'ended').at(-1)?.results,
      ).toEqual(ended?.results);
    expect(
      guests.every((g) =>
        g.frames.some(
          (r) => r.state?.kind === 'bomber' && r.state.flames.length > 0,
        ),
      ),
    ).toBe(true);
    await host.page.screenshot({
      path: `/tmp/arcade-bomber-${count}p.png`,
      fullPage: true,
    });
    const seed = await host.page.getByTestId('room-seed').textContent();
    await host.page.getByRole('button', { name: '같은 맵 재대결' }).click();
    await expect(host.page.getByTestId('room-phase')).toHaveText('대기실');
    await expect(host.page.getByTestId('room-seed')).toHaveText(seed ?? '');
    await ready(guests);
    for (const g of guests.slice(1))
      await g.page.keyboard.press('Space', { delay: 120 });
    await expect(host.page.getByText(/기록 저장 완료/)).toBeVisible();
    await host.page.getByRole('button', { name: '새 맵 재대결' }).click();
    await expect(host.page.getByTestId('room-seed')).not.toHaveText(seed ?? '');
    await host.page.getByRole('button', { name: '로비로 나가기' }).click();
    await expect(
      second.page.getByRole('button', { name: '경기 시작', exact: true }),
    ).toBeVisible();
    for (const g of guests) await g.context.close();
  });
