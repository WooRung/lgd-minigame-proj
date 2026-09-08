import { expect, test } from '@playwright/test';

test('방 세션 권한과 메시지 크기·빈도 제한', async ({ browser }) => {
  const origin = 'http://127.0.0.1:5173';
  const context = await browser.newContext();
  expect(
    (
      await context.request.post(`${origin}/api/rooms`, {
        headers: { Origin: origin, 'X-Player-Id': 'forged' },
        data: { game: 'bomber' },
      })
    ).status(),
  ).toBe(401);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('플레이어 이름').fill('경계 검사');
  await page.getByRole('button', { name: '오락실 입장' }).click();
  await expect(page.getByText('경계 검사 님')).toBeVisible();
  const response = await context.request.post(`${origin}/api/rooms`, {
    headers: { Origin: origin },
    data: { game: 'bomber' },
  });
  expect(response.status()).toBe(201);
  const { code } = await response.json();
  const invalid = await page.evaluate(
    async (code) =>
      new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.host}/api/rooms/${code}/ws`);
        ws.onopen = () =>
          ws.send(JSON.stringify({ type: 'start', playerId: 'forged' }));
        ws.onerror = () => reject(Error('연결 실패'));
        ws.onmessage = (e) => {
          const data = JSON.parse(e.data);
          if (data.type === 'error') {
            ws.close();
            resolve(data.error);
          }
        };
      }),
    code,
  );
  expect(invalid).toContain('허용되지 않은');
  for (const [mode, expected] of [
    ['size', 1009],
    ['rate', 1008],
  ] as const) {
    const closeCode = await page.evaluate(
      async ({ code, mode }) =>
        new Promise<number>((resolve, reject) => {
          const ws = new WebSocket(
            `ws://${location.host}/api/rooms/${code}/ws`,
          );
          ws.onerror = () => reject(Error('연결 실패'));
          ws.onclose = (e) => resolve(e.code);
          ws.onopen = () => {
            if (mode === 'size') ws.send('x'.repeat(513));
            else
              for (let i = 0; i < 45; i++)
                ws.send(
                  JSON.stringify({
                    type: 'input',
                    seq: i + 1,
                    input: { dx: 0, dy: 0, action: false },
                  }),
                );
          };
        }),
      { code, mode },
    );
    expect(closeCode).toBe(expected);
  }
  await context.close();
});
test('15초 재접속 유예 만료와 종료 후 서버 틱 정지', async ({ browser }) => {
  test.setTimeout(45000);
  const origin = 'http://127.0.0.1:5173';
  const a = await browser.newContext(),
    b = await browser.newContext();
  const host = await a.newPage(),
    guest = await b.newPage();
  for (const [p, name] of [
    [host, '유예 방장'],
    [guest, '유예 참가자'],
  ] as const) {
    await p.goto('/');
    await p.getByLabel('플레이어 이름').fill(name);
    await p.getByRole('button', { name: '오락실 입장' }).click();
    await p
      .locator('.bomber')
      .getByRole('button', { name: '친구와 대전', exact: true })
      .click();
  }
  await host.getByRole('button', { name: '새 방 만들기' }).click();
  const code = await host.getByTestId('room-code').innerText();
  await guest.getByLabel('초대 코드').fill(code);
  await guest.getByRole('button', { name: '참가하기', exact: true }).click();
  for (const p of [host, guest])
    await p.getByRole('button', { name: '준비하기', exact: true }).click();
  await host.getByRole('button', { name: '경기 시작', exact: true }).click();
  await expect(host.getByTestId('room-phase')).toHaveText('경기 중');
  await guest.close();
  await expect(
    host.getByText('재접속 대기 (15초)', { exact: false }),
  ).toBeVisible();
  await expect(host.getByRole('heading', { name: '경기 결과' })).toBeVisible({
    timeout: 20000,
  });
  await expect(host.getByText(/기록 저장 완료/)).toBeVisible();
  const ended = await (
    await a.request.get(`${origin}/api/rooms/${code}/view`)
  ).json();
  await host.waitForTimeout(350);
  const after = await (
    await a.request.get(`${origin}/api/rooms/${code}/view`)
  ).json();
  expect(after.state.tick).toBe(ended.state.tick);
  expect(
    (
      await b.request.post(`${origin}/api/rooms/${code}/join`, {
        headers: { Origin: origin },
        data: {},
      })
    ).status(),
  ).toBe(409);
  expect(
    after.results.filter((r: { outcome: string }) => r.outcome === 'win'),
  ).toHaveLength(1);
  await a.close();
  await b.close();
});
