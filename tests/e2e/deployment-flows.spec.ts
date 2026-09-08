import { expect, test } from '@playwright/test';
import { clearBomber } from './bomber-controls';

test.use({ actionTimeout: 15000 });

test('배포 검증: 두 게임 일간·주간 실제 플레이와 랭킹 저장', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill('배포 검증 도전자');
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await page.getByRole('button', { name: '기록과 랭킹 보기' }).click();
  for (const game of ['bomber', 'runner']) {
    for (const mode of ['daily', 'weekly']) {
      await page.getByLabel('게임').selectOption(game);
      await page.getByLabel('도전 기간').selectOption(mode);
      await page.getByRole('button', { name: '이 조건으로 도전' }).click();
      await page
        .getByRole('button', {
          name: game === 'runner' ? '무한 달리기 시작' : /단계 시작$/,
        })
        .click();
      if (game === 'bomber') {
        await expect(page.locator('canvas')).toBeVisible();
        await expect(page.getByTestId('time-left')).not.toHaveText('90초');
        await clearBomber(page);
      } else {
        await expect(page.locator('.game-canvas')).toHaveAttribute(
          'data-ready',
          'true',
        );
      }
      // 러너는 장애물에 실제 충돌한 거리도 정상 랭킹 대상이다.
      await expect(page.getByText(/기록 저장 완료/)).toBeVisible({
        timeout: 15000,
      });
      await page.getByRole('button', { name: '기록으로', exact: true }).click();
      await expect(page.getByLabel('게임')).toHaveValue(game);
      await expect(page.getByLabel('도전 기간')).toHaveValue(mode);
      await expect(page.getByTestId('my-rank')).toBeVisible();
      const board = await (
        await page.request.get('/api/rankings?game=' + game + '&mode=' + mode)
      ).json();
      expect(board.mine?.rank).toBeGreaterThan(0);
      await expect(page.locator('.history-list')).toContainText(
        mode === 'daily' ? '일간 도전' : '주간 도전',
      );
    }
  }
  expect(errors).toEqual([]);
});

test('배포 검증: 재접속 유예 만료·종료 틱 정지·전원 퇴장 후 정리', async ({
  browser,
}) => {
  test.setTimeout(60000);
  const a = await browser.newContext(),
    b = await browser.newContext();
  try {
    const host = await a.newPage(),
      guest = await b.newPage();
    for (const [page, name] of [
      [host, '배포 검증 방장'],
      [guest, '배포 검증 참가자'],
    ] as const) {
      await page.goto('/');
      await page.getByLabel('플레이어 이름').fill(name);
      await page.getByRole('button', { name: '오락실 입장' }).click();
      await page
        .locator('.bomber')
        .getByRole('button', { name: '친구와 대전', exact: true })
        .click();
    }
    await host.getByRole('button', { name: '새 방 만들기' }).click();
    const code = await host.getByTestId('room-code').innerText();
    await guest.getByLabel('초대 코드').fill(code);
    await guest.getByRole('button', { name: '참가하기', exact: true }).click();
    for (const page of [host, guest])
      await page.getByRole('button', { name: '준비하기', exact: true }).click();
    await host.getByRole('button', { name: '경기 시작', exact: true }).click();
    await expect(host.getByTestId('room-phase')).toHaveText('경기 중');
    await guest.close();
    await expect(
      host.getByText('재접속 대기 (15초)', { exact: false }),
    ).toBeVisible();
    await expect(host.getByText(/기록 저장 완료/)).toBeVisible({
      timeout: 22000,
    });
    const path = '/api/rooms/' + code;
    const ended = await (await a.request.get(path + '/view')).json();
    await host.waitForTimeout(400);
    const after = await (await a.request.get(path + '/view')).json();
    expect(after.state.tick).toBe(ended.state.tick);
    expect(
      ended.results.filter((r: { outcome: string }) => r.outcome === 'win'),
    ).toHaveLength(1);
    const join = await b.request.post(path + '/join', {
      headers: { Origin: new URL(host.url()).origin },
      data: {},
    });
    expect(join.status()).toBe(409);
    await host.getByRole('button', { name: '로비로 나가기' }).click();
    await expect
      .poll(async () => (await a.request.get(path + '/view')).status(), {
        timeout: 20000,
      })
      .toBe(404);
  } finally {
    await a.close();
    await b.close();
  }
});
