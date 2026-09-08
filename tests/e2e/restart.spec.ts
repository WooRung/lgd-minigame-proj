import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// 별도 로컬 DB와 프로세스로 실행하여 개발 서버의 방·기록을 건드리지 않는다.
test('로컬 Worker 재시작은 진행 경기를 중단으로 저장하고 중복 결과를 만들지 않는다', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const stateDir = await mkdtemp(join(tmpdir(), 'arcade-restart-'));
  const wrangler = 'node_modules/wrangler/bin/wrangler.js';
  const origin = 'http://127.0.0.1:5174';
  let server: ChildProcess | undefined;
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const request = contexts[0]?.request;
  if (!request) throw Error('브라우저 준비 실패');
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  async function start() {
    server = spawn(
      process.execPath,
      [
        wrangler,
        'dev',
        '--port',
        '5174',
        '--ip',
        '127.0.0.1',
        '--persist-to',
        stateDir,
      ],
      { stdio: 'ignore' },
    );
    await expect
      .poll(
        async () => {
          try {
            return (
              await request?.get(`${origin}/api/me`, { timeout: 1000 })
            )?.status();
          } catch {
            return 0;
          }
        },
        { timeout: 25000 },
      )
      .toBe(200);
  }
  try {
    const build = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', 'build'],
      { stdio: 'ignore' },
    );
    const [buildExit] = await once(build, 'exit');
    expect(buildExit).toBe(0);
    const migrate = spawn(
      process.execPath,
      [
        wrangler,
        'd1',
        'migrations',
        'apply',
        'arcade',
        '--local',
        '--persist-to',
        stateDir,
      ],
      { stdio: 'ignore' },
    );
    const [exitCode] = await once(migrate, 'exit');
    expect(exitCode).toBe(0);
    await start();
    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i],
        page = pages[i];
      if (!context || !page) throw Error();
      expect(
        (
          await context.request.post(`${origin}/api/session`, {
            headers: { Origin: origin },
            data: { name: `복구${i}` },
          })
        ).status(),
      ).toBe(201);
      await page.goto(origin);
      await page
        .locator('.bomber')
        .getByRole('button', { name: '친구와 대전', exact: true })
        .click();
    }
    const host = pages[0],
      guest = pages[1];
    if (!host || !guest) throw Error();
    await host.getByRole('button', { name: '새 방 만들기' }).click();
    const code = await host.getByTestId('room-code').innerText();
    await guest.getByLabel('초대 코드').fill(code);
    await guest.getByRole('button', { name: '참가하기', exact: true }).click();
    for (const p of pages)
      await p.getByRole('button', { name: '준비하기', exact: true }).click();
    await host.getByRole('button', { name: '경기 시작', exact: true }).click();
    await expect(host.getByTestId('room-phase')).toHaveText('경기 중');
    const before = await (
      await request.get(`${origin}/api/rooms/${code}/view`)
    ).json();
    await stop();
    await start();
    // 자동 재접속 또는 명시 재접속 모두 동일한 중단 경기로 돌아와야 한다.
    for (const p of pages) {
      if (
        await p.getByRole('button', { name: '재접속', exact: true }).isVisible()
      )
        await p.getByRole('button', { name: '재접속', exact: true }).click();
      await expect(
        p.getByText(/서버 실행이 중단되어 승패 없이 종료/),
      ).toBeVisible({ timeout: 15000 });
      await expect(p.getByText(/기록 저장 완료/)).toBeVisible();
    }
    const after = await (
      await request.get(`${origin}/api/rooms/${code}/view`)
    ).json();
    expect(after.matchId).toBe(before.matchId);
    expect(after.results).toHaveLength(2);
    expect(
      after.results.every((r: { outcome: string }) => r.outcome === 'aborted'),
    ).toBe(true);
    for (const context of contexts) {
      const rows = await (
        await context.request.get(`${origin}/api/history?game=bomber`)
      ).json();
      expect(
        rows.filter((r: { id: string }) => r.id === before.matchId),
      ).toHaveLength(1);
    }
    await host.getByRole('button', { name: '같은 맵 재대결' }).click();
    await expect(host.getByTestId('room-phase')).toHaveText('대기실');
  } finally {
    for (const c of contexts) await c.close();
    await stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});
