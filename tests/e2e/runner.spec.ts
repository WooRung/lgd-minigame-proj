import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';

async function enter(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill(name);
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await expect(page.getByText(`${name} 님`)).toBeVisible();
}
async function autoRun(pages: Page[], timeout = 85000) {
  const until = Date.now() + timeout;
  const released = new Set<Page>();
  while (Date.now() < until) {
    let done = 0;
    await Promise.all(
      pages.map(async (page) => {
        const status = await page
          .getByTestId('runner-status')
          .evaluate((el) => ({
            distance: Number(el.getAttribute('data-distance')),
            grounded: el.getAttribute('data-grounded') === 'true',
            alive: el.getAttribute('data-alive') === 'true',
            finished: el.getAttribute('data-finished') === 'true',
          }));
        if (status.finished || !status.alive) {
          done++;
          return;
        }
        if (
          status.grounded &&
          status.distance <= 105 &&
          status.distance >= 35 &&
          !released.has(page)
        ) {
          await page.keyboard.down('Space');
          released.add(page);
        } else if (released.has(page) && !status.grounded) {
          await page.keyboard.up('Space');
          released.delete(page);
        }
      }),
    );
    if (done === pages.length) {
      for (const page of released) await page.keyboard.up('Space');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw Error('러닝 종료 시간 초과');
}
test('러닝 싱글 실패·재도전·일시정지·5단계 완주와 이어하기', async ({
  page,
}) => {
  test.setTimeout(420000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, '러닝 탐험가');
  await page
    .locator('.runner')
    .getByRole('button', { name: '싱글 플레이', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '바람 러너', exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: '1단계 시작' }).click();
  await expect(
    page.getByRole('heading', { name: '다시 한번 도전해요' }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
  const seed = await page.locator('aside .muted').last().textContent();
  await page.getByRole('button', { name: '같은 맵 재도전' }).click();
  await expect(page.locator('aside .muted').last()).toHaveText(seed ?? '');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const paused = await page.getByTestId('runner-status').getAttribute('data-x');
  await page.waitForTimeout(350);
  await expect(page.getByTestId('runner-status')).toHaveAttribute(
    'data-x',
    paused ?? '',
  );
  await page.getByRole('button', { name: '계속하기' }).click();
  for (let stage = 1; stage <= 5; stage++) {
    await expect(
      page.getByRole('heading', { name: `${stage}단계 / 5` }),
    ).toBeVisible();
    await autoRun([page]);
    await expect(
      page.getByRole('heading', { name: '스테이지 완료!' }),
    ).toBeVisible();
    await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
    console.log(`러닝 싱글 ${stage}/5 실제 완주·저장 통과`);
    if (stage < 5)
      await page.getByRole('button', { name: '다음 단계' }).click();
  }
  await page.screenshot({
    path: '/tmp/arcade-runner-complete.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '로비로', exact: true }).click();
  await page.reload();
  await expect(page.getByText('바람 러너 5/5단계 완료')).toBeVisible();
  expect(errors).toEqual([]);
});
interface Racer {
  context: BrowserContext;
  page: Page;
}
async function racer(browser: Browser, n: number): Promise<Racer> {
  const context = await browser.newContext(),
    page = await context.newPage();
  await enter(page, `러너${n}`);
  await page
    .locator('.runner')
    .getByRole('button', { name: '친구와 대전', exact: true })
    .click();
  return { context, page };
}
for (const count of [2, 4])
  test(`러닝 ${count}인 공통 코스 실제 경주와 결과·기록 분리`, async ({
    browser,
  }) => {
    test.setTimeout(160000);
    const racers: Racer[] = [];
    for (let i = 0; i < count; i++) racers.push(await racer(browser, i));
    const first = racers[0];
    if (!first) throw Error();
    await first.page.getByRole('button', { name: '새 방 만들기' }).click();
    const code = await first.page.getByTestId('room-code').innerText();
    for (const r of racers.slice(1)) {
      await r.page.getByLabel('초대 코드').fill(code);
      await r.page
        .getByRole('button', { name: '참가하기', exact: true })
        .click();
    }
    for (const r of racers)
      await r.page
        .getByRole('button', { name: '준비하기', exact: true })
        .click();
    await first.page
      .getByRole('button', { name: '경기 시작', exact: true })
      .click();
    for (const r of racers) {
      await expect(r.page.getByTestId('room-phase')).toHaveText('경기 중');
      await expect(r.page.locator('.game-canvas')).toHaveAttribute(
        'data-ready',
        'true',
        { timeout: 15000 },
      );
    }
    const running = autoRun(racers.map((r) => r.page));
    const views = await Promise.all(
      racers.map(async (r) =>
        (
          await r.context.request.get(
            `http://127.0.0.1:5173/api/rooms/${code}/view`,
          )
        ).json(),
      ),
    );
    console.log(
      '경주 입력 시작 틱',
      views.map((v) => v.state.tick),
    );
    expect(new Set(views.map((v) => v.startedAt)).size).toBe(1);
    expect(new Set(views.map((v) => v.seed)).size).toBe(1);
    await running;
    for (const r of racers)
      await expect(r.page.getByText(/기록 저장 완료/)).toBeVisible();
    const final = await (
      await first.context.request.get(
        `http://127.0.0.1:5173/api/rooms/${code}/view`,
      )
    ).json();
    expect(final.state.kind).toBe('runner');
    expect(
      final.state.players.filter(
        (p: { finishedAt: number | null }) => p.finishedAt !== null,
      ).length,
    ).toBeGreaterThan(0);
    const results = await first.page
      .locator('.result-list li')
      .allTextContents();
    for (const r of racers)
      await expect(r.page.locator('.result-list li')).toHaveText(results);
    await first.page.screenshot({
      path: `/tmp/arcade-runner-${count}p.png`,
      fullPage: true,
    });
    const history = await (
      await first.context.request.get(
        'http://127.0.0.1:5173/api/history?game=runner',
      )
    ).json();
    expect(
      history.filter((h: { id: string }) => h.id === final.matchId),
    ).toHaveLength(1);
    expect(
      (
        await (
          await first.context.request.get(
            'http://127.0.0.1:5173/api/history?game=bomber',
          )
        ).json()
      ).length,
    ).toBe(0);
    await first.page.getByRole('button', { name: '같은 맵 재대결' }).click();
    await expect(first.page.getByTestId('room-phase')).toHaveText('대기실');
    expect(
      (
        await (
          await first.context.request.get(
            `http://127.0.0.1:5173/api/rooms/${code}/view`,
          )
        ).json()
      ).seed,
    ).toBe(final.seed);
    for (const r of racers) await r.context.close();
  });
test('러닝 일간 완주가 러닝 랭킹에 저장된다', async ({ page }) => {
  test.setTimeout(100000);
  await enter(page, '러닝 기록 도전');
  await page.getByRole('button', { name: '기록과 랭킹 보기' }).click();
  await page
    .getByRole('combobox', { name: '게임', exact: true })
    .selectOption('runner');
  await page.getByRole('button', { name: '이 조건으로 도전' }).click();
  await page.getByRole('button', { name: '3단계 시작' }).click();
  await expect(page.locator('.game-canvas')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await autoRun([page]);
  await expect(
    page.getByRole('heading', { name: '스테이지 완료!' }),
  ).toBeVisible();
  await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
  await page.getByRole('button', { name: '기록으로', exact: true }).click();
  await page
    .getByRole('combobox', { name: '게임', exact: true })
    .selectOption('runner');
  await expect(page.getByTestId('my-rank')).toBeVisible();
  await page
    .getByRole('combobox', { name: '게임', exact: true })
    .selectOption('bomber');
  await expect(
    page.getByText('이 도전의 완료 기록이 아직 없어요.'),
  ).toBeVisible();
});

test('러닝 재접속·탈락 유지·재대결 초기화', async ({ browser }) => {
  test.setTimeout(45000);
  const host = await racer(browser, 1),
    guest = await racer(browser, 2);
  await host.page.getByRole('button', { name: '새 방 만들기' }).click();
  const code = await host.page.getByTestId('room-code').innerText();
  await guest.page.getByLabel('초대 코드').fill(code);
  await guest.page
    .getByRole('button', { name: '참가하기', exact: true })
    .click();
  async function start() {
    for (const r of [host, guest])
      await r.page
        .getByRole('button', { name: '준비하기', exact: true })
        .click();
    await host.page
      .getByRole('button', { name: '경기 시작', exact: true })
      .click();
    await expect(host.page.getByTestId('room-phase')).toHaveText('경기 중');
  }
  async function reconnect() {
    await guest.page.close();
    guest.page = await guest.context.newPage();
    await guest.page.goto(`/?room=${code}`);
    await guest.page
      .getByRole('button', { name: '참가하기', exact: true })
      .click();
    await expect(guest.page.getByTestId('connection-status')).toHaveText(
      '연결됨',
    );
  }
  await start();
  const original = await (
    await guest.context.request.get(
      `http://127.0.0.1:5173/api/rooms/${code}/view`,
    )
  ).json();
  await reconnect();
  const connected = await (
    await guest.context.request.get(
      `http://127.0.0.1:5173/api/rooms/${code}/view`,
    )
  ).json();
  expect(connected.matchId).toBe(original.matchId);
  expect(connected.state.tick).toBeGreaterThan(original.state.tick);
  expect(connected.members.length).toBe(2);
  await expect(host.page.getByText(/기록 저장 완료/)).toBeVisible({
    timeout: 15000,
  });
  await reconnect();
  await expect(guest.page.getByTestId('runner-status')).toHaveAttribute(
    'data-alive',
    'false',
  );
  const seed = await host.page.getByTestId('room-seed').textContent();
  await host.page.getByRole('button', { name: '같은 맵 재대결' }).click();
  await start();
  const rematch = await (
    await host.context.request.get(
      `http://127.0.0.1:5173/api/rooms/${code}/view`,
    )
  ).json();
  expect(rematch.matchId).not.toBe(original.matchId);
  expect(rematch.state.tick).toBeLessThan(20);
  expect(rematch.state.players.every((p: { alive: boolean }) => p.alive)).toBe(
    true,
  );
  await expect(host.page.getByText(/기록 저장 완료/)).toBeVisible({
    timeout: 15000,
  });
  await host.page.getByRole('button', { name: '새 맵 재대결' }).click();
  await expect(host.page.getByTestId('room-seed')).not.toHaveText(seed ?? '');
  await host.context.close();
  await guest.context.close();
});
