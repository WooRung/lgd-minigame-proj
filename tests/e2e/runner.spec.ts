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
async function drive(
  pages: Page[],
  untilX: number,
  timeout = 90000,
  stopOnEnd = false,
) {
  const deadline = Date.now() + timeout;
  const jumping = new Set<Page>(),
    sliding = new Set<Page>();
  const themes = new Set<string>(),
    patterns = new Set<string>();
  let didSlide = false,
    didJump = false;
  while (Date.now() < deadline) {
    let done = 0;
    await Promise.all(
      pages.map(async (page) => {
        const status = await page
          .getByTestId('runner-status')
          .evaluate((el) => ({
            distance: Number(el.getAttribute('data-distance')),
            x: Number(el.getAttribute('data-x')),
            kind: el.getAttribute('data-obstacle'),
            grounded: el.getAttribute('data-grounded') === 'true',
            alive: el.getAttribute('data-alive') === 'true',
            sliding: el.getAttribute('data-sliding') === 'true',
            theme: el.getAttribute('data-theme') ?? '',
            pattern: el.getAttribute('data-pattern') ?? '',
            ended:
              document.querySelector('[data-testid=room-phase]')
                ?.textContent === '경기 종료',
          }));
        themes.add(status.theme);
        patterns.add(status.pattern);
        if (status.sliding) didSlide = true;
        if (!status.grounded) didJump = true;
        if (!status.alive)
          throw Error(
            `실제 키 입력 주행 실패: x=${status.x}, kind=${status.kind}, next=${status.distance}`,
          );
        if (status.x >= untilX || (stopOnEnd && status.ended)) {
          done++;
          return;
        }
        const duck = status.kind === 'ceiling' && status.distance < 190;
        if (duck && !sliding.has(page)) {
          await page.keyboard.down('ArrowDown');
          sliding.add(page);
        }
        if (!duck && sliding.has(page)) {
          await page.keyboard.up('ArrowDown');
          sliding.delete(page);
        }
        if (
          !duck &&
          status.grounded &&
          status.distance <= 135 &&
          status.distance > 40 &&
          !jumping.has(page)
        ) {
          await page.keyboard.down('Space');
          jumping.add(page);
        } else if (jumping.has(page) && !status.grounded) {
          await page.keyboard.up('Space');
          jumping.delete(page);
        }
      }),
    );
    if (done === pages.length) {
      for (const page of pages) {
        await page.keyboard.up('Space');
        await page.keyboard.up('ArrowDown');
      }
      return { themes, patterns, didSlide, didJump };
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error('실제 러너 주행 시간 초과');
}

test('무한 싱글의 테마·패턴·점프·슬라이드·일시정지·종료 저장·일반 랭킹', async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, '무한 탐험가');
  await page
    .locator('.runner')
    .getByRole('button', { name: '싱글 플레이', exact: true })
    .click();
  await expect(page.getByLabel('단계 선택')).toHaveCount(0);
  await page.getByRole('button', { name: '무한 달리기 시작' }).click();
  await expect(page.locator('.game-canvas')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const x = await page.getByTestId('runner-status').getAttribute('data-x');
  await page.waitForTimeout(200);
  await expect(page.getByTestId('runner-status')).toHaveAttribute(
    'data-x',
    x ?? '',
  );
  const seed = await page.locator('aside .muted').last().textContent();
  await page.getByRole('button', { name: '계속하기' }).click();
  const proof = await drive([page], 14500);
  expect(proof.themes.size).toBe(3);
  expect(proof.patterns.size).toBeGreaterThanOrEqual(6);
  expect(proof.didSlide).toBe(true);
  expect(proof.didJump).toBe(true);
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.screenshot({
    path: '/tmp/arcade-endless-single.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '종료하고 저장' }).click();
  await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
  const rows = await (
    await page.request.get('/api/history?game=runner')
  ).json();
  expect(rows[0]).toMatchObject({ outcome: '종료', rulesVersion: '2' });
  expect(rows[0].distance).toBeGreaterThanOrEqual(14500);
  const board = await (
    await page.request.get('/api/rankings?game=runner&mode=normal')
  ).json();
  expect(board.mine.distance).toBe(rows[0].distance);
  await page.getByRole('button', { name: '같은 맵 재도전' }).click();
  await expect(page.locator('aside .muted').last()).toHaveText(seed ?? '');
  await expect(
    page.getByRole('heading', { name: '이번 달리기 기록' }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
  const after = await (
    await page.request.get('/api/rankings?game=runner&mode=normal')
  ).json();
  expect(after.mine.distance).toBe(board.mine.distance);
  await page.getByRole('button', { name: '로비로', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: '기록과 랭킹 보기' }).click();
  await expect(page.getByTestId('my-rank')).toBeVisible();
  await expect(page.locator('thead').first()).toContainText('거리');
  expect(errors).toEqual([]);
});

interface Racer {
  context: BrowserContext;
  page: Page;
}
async function racer(browser: Browser, n: number): Promise<Racer> {
  const context = await browser.newContext(),
    page = await context.newPage();
  await enter(page, `무한 친구${n}`);
  await page
    .locator('.runner')
    .getByRole('button', { name: '친구와 대전', exact: true })
    .click();
  return { context, page };
}
for (const count of [2, 4])
  test(`무한 러너 ${count}인 실제 입력·서버 동기화·재접속·종료·재대결`, async ({
    browser,
  }) => {
    test.setTimeout(110000);
    const racers: Racer[] = [];
    try {
      for (let i = 0; i < count; i++) racers.push(await racer(browser, i));
      const host = racers[0],
        guest = racers[1];
      if (!host || !guest) throw Error();
      await host.page.getByRole('button', { name: '새 방 만들기' }).click();
      const code = await host.page.getByTestId('room-code').innerText();
      const view = async () =>
        (await host.context.request.get(`/api/rooms/${code}/view`)).json();
      for (const r of racers.slice(1)) {
        await r.page.getByLabel('초대 코드').fill(code);
        await r.page
          .getByRole('button', { name: '참가하기', exact: true })
          .click();
      }
      const start = async () => {
        for (const r of racers)
          await r.page
            .getByRole('button', { name: '준비하기', exact: true })
            .click();
        await host.page
          .getByRole('button', { name: '경기 시작', exact: true })
          .click();
      };
      await start();
      const original = await view();
      await guest.page.close();
      guest.page = await guest.context.newPage();
      await guest.page.goto(`/?room=${code}`);
      await guest.page
        .getByRole('button', { name: '참가하기', exact: true })
        .click();
      await expect(guest.page.getByTestId('connection-status')).toHaveText(
        '연결됨',
      );
      const reconnected = await view();
      expect(reconnected.matchId).toBe(original.matchId);
      expect(reconnected.members).toHaveLength(count);
      for (const r of racers)
        await expect(r.page.getByText(/기록 저장 완료/)).toBeVisible({
          timeout: 15000,
        });
      await expect(guest.page.getByTestId('runner-status')).toHaveAttribute(
        'data-alive',
        'false',
      );
      await host.page.getByRole('button', { name: '같은 맵 재대결' }).click();
      expect((await view()).seed).toBe(original.seed);
      await start();
      for (const r of racers)
        await expect(r.page.getByTestId('room-phase')).toHaveText('경기 중');
      const driving = drive(
        racers.map((r) => r.page),
        7300,
        60000,
      );
      const snapshots = await Promise.all(
        racers.map(async (r) =>
          (await r.context.request.get(`/api/rooms/${code}/view`)).json(),
        ),
      );
      expect(new Set(snapshots.map((v) => v.startedAt)).size).toBe(1);
      expect(new Set(snapshots.map((v) => v.seed)).size).toBe(1);
      expect(snapshots.every((v) => v.state.course.rulesVersion === '2')).toBe(
        true,
      );
      const proof = await driving;
      expect(proof.themes.size).toBe(3);
      expect(proof.didSlide).toBe(true);
      await drive([host.page], Infinity, 10000, true);
      for (const r of racers)
        await expect(r.page.getByText(/기록 저장 완료/)).toBeVisible({
          timeout: 15000,
        });
      const final = await view();
      expect(final.state.reason).toBe('last-survivor');
      const results = await host.page
        .locator('.result-list li')
        .allTextContents();
      for (const r of racers)
        await expect(r.page.locator('.result-list li')).toHaveText(results);
      await host.page.screenshot({
        path: `/tmp/arcade-endless-${count}p.png`,
        fullPage: true,
      });
      const history = await (
        await host.context.request.get('/api/history?game=runner')
      ).json();
      expect(
        history.filter((h: { id: string }) => h.id === final.matchId),
      ).toHaveLength(1);
      expect(
        (
          await (
            await host.context.request.get('/api/history?game=bomber')
          ).json()
        ).length,
      ).toBe(0);
      await host.page.getByRole('button', { name: '새 맵 재대결' }).click();
      expect((await view()).seed).not.toBe(final.seed);
      await start();
      const fresh = await view();
      expect(fresh.matchId).not.toBe(final.matchId);
      expect(
        fresh.state.players.every(
          (p: { alive: boolean; distance: number; score: number }) =>
            p.alive && p.distance === 0 && p.score === 0,
        ),
      ).toBe(true);
    } finally {
      for (const r of racers) await r.context.close();
    }
  });

test('러너 일간·주간 공통 조건, 실패 저장과 소유권·중복·거리 검증', async ({
  browser,
}) => {
  const a = await browser.newContext({
      extraHTTPHeaders: { Origin: 'http://127.0.0.1:5173' },
    }),
    b = await browser.newContext({
      extraHTTPHeaders: { Origin: 'http://127.0.0.1:5173' },
    });
  try {
    const page = await a.newPage();
    await enter(page, '공통 달리기');
    await b.request.post('http://127.0.0.1:5173/api/session', {
      data: { name: '다른 친구' },
    });
    for (const mode of ['daily', 'weekly']) {
      const response = await a.request.post('http://127.0.0.1:5173/api/runs', {
        data: { game: 'runner', mode },
      });
      const run = await response.json();
      const same = await (
        await b.request.post('http://127.0.0.1:5173/api/runs', {
          data: { game: 'runner', mode },
        })
      ).json();
      expect(run.seed).toBe(same.seed);
      expect(run.rulesVersion).toBe('2');
      const data = {
        ticks: 1,
        distance: 9,
        score: 0,
        won: false,
        reason: 'manual',
      };
      expect(
        (
          await b.request.post(
            `http://127.0.0.1:5173/api/runs/${run.id}/finish`,
            { data },
          )
        ).status(),
      ).toBe(404);
      expect(
        (
          await a.request.post(
            `http://127.0.0.1:5173/api/runs/${run.id}/finish`,
            { data: { ...data, distance: 999 } },
          )
        ).status(),
      ).toBe(400);
      expect(
        (
          await a.request.post(
            `http://127.0.0.1:5173/api/runs/${run.id}/finish`,
            { data },
          )
        ).status(),
      ).toBe(200);
      expect(
        (
          await a.request.post(
            `http://127.0.0.1:5173/api/runs/${run.id}/finish`,
            { data },
          )
        ).status(),
      ).toBe(409);
      const board = await (
        await a.request.get(
          `http://127.0.0.1:5173/api/rankings?game=runner&mode=${mode}`,
        )
      ).json();
      expect(board.mine.distance).toBe(9);
    }
    await page.getByRole('button', { name: '기록과 랭킹 보기' }).click();
    await page
      .getByRole('combobox', { name: '게임', exact: true })
      .selectOption('runner');
    await page
      .getByRole('combobox', { name: '도전 기간' })
      .selectOption('daily');
    await page.getByRole('button', { name: '이 조건으로 도전' }).click();
    await page.getByRole('button', { name: '무한 달리기 시작' }).click();
    await expect(page.getByText(/기록 저장 완료/)).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: '기록으로', exact: true }).click();
    await page
      .getByRole('combobox', { name: '도전 기간' })
      .selectOption('daily');
    await expect(page.getByTestId('my-rank')).toBeVisible();
    const board = await (
      await a.request.get(
        'http://127.0.0.1:5173/api/rankings?game=runner&mode=daily',
      )
    ).json();
    expect(board.mine.distance).toBeGreaterThan(9);
  } finally {
    await a.close();
    await b.close();
  }
});

test('러너 종료 저장 응답 유실 시 본인 거리·종료 사유를 대조해 복구한다', async ({
  page,
}) => {
  await enter(page, '응답 복구 러너');
  await page
    .locator('.runner')
    .getByRole('button', { name: '싱글 플레이', exact: true })
    .click();
  await page.getByRole('button', { name: '무한 달리기 시작' }).click();
  await expect(page.getByTestId('runner-status')).not.toHaveAttribute(
    'data-x',
    '0',
  );
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  let lost = false;
  await page.route('**/api/runs/*/finish', async (route) => {
    if (!lost) {
      lost = true;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: '종료하고 저장' }).click();
  await expect(page.getByRole('button', { name: '저장 재시도' })).toBeVisible();
  await page.getByRole('button', { name: '저장 재시도' }).click();
  await expect(page.getByText(/기록 저장 완료/)).toBeVisible();
  const history = await (
    await page.request.get('/api/history?game=runner')
  ).json();
  expect(history).toHaveLength(1);
  expect(history[0].outcome).toBe('종료');
});

for (const count of [2, 4])
  test(`러너 ${count}인 진행 중 연결 교체가 경기·좌표·탈락 상태를 보존한다`, async ({
    browser,
  }) => {
    const racers: Racer[] = [];
    try {
      for (let i = 0; i < count; i++) racers.push(await racer(browser, i));
      const host = racers[0],
        guest = racers[1];
      if (!host || !guest) throw Error();
      await host.page.getByRole('button', { name: '새 방 만들기' }).click();
      const code = await host.page.getByTestId('room-code').innerText();
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
      await host.page
        .getByRole('button', { name: '경기 시작', exact: true })
        .click();
      await expect(host.page.getByTestId('room-phase')).toHaveText('경기 중');
      const view = async () =>
        (await host.context.request.get(`/api/rooms/${code}/view`)).json();
      const before = await view();
      expect(before.phase).toBe('playing');
      await guest.page.close();
      guest.page = await guest.context.newPage();
      await guest.page.goto(`/?room=${code}`);
      await guest.page
        .getByRole('button', { name: '참가하기', exact: true })
        .click();
      await expect(guest.page.getByTestId('connection-status')).toHaveText(
        '연결됨',
      );
      const after = await view();
      expect(after.matchId).toBe(before.matchId);
      expect(after.state.tick).toBeGreaterThan(before.state.tick);
      expect(after.members).toHaveLength(count);
      await expect(host.page.getByText(/기록 저장 완료/)).toBeVisible({
        timeout: 10000,
      });
      await guest.page.reload();
      await guest.page
        .getByRole('button', { name: '참가하기', exact: true })
        .click();
      await expect(guest.page.getByTestId('runner-status')).toHaveAttribute(
        'data-alive',
        'false',
      );
      expect((await view()).matchId).toBe(before.matchId);
    } finally {
      for (const r of racers) await r.context.close();
    }
  });
