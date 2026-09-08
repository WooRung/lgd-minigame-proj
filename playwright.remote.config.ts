import { defineConfig } from '@playwright/test';
import local from './playwright.config';

if (process.env.ARCADE_REMOTE_VERIFY !== '1') {
  throw new Error(
    '공개 서비스 검증은 ARCADE_REMOTE_VERIFY=1로 명시해 실행하세요. 실제 플레이 기록이 저장됩니다.',
  );
}

// 공개 DB에는 실제 UI 플레이만 수행한다. 합성 점수·부하·경계 fixture는 로컬에 남긴다.
export default defineConfig({
  ...local,
  webServer: undefined,
  testMatch: [
    'session.spec.ts',
    'bomber.spec.ts',
    'multiplayer.spec.ts',
    'runner.spec.ts',
    'deployment-flows.spec.ts',
  ],
  grep: /이름 입력, 동일|폭탄 싱글 실패|칸 중간 정지|폭탄 [24]인 실제|무한 싱글의 테마|무한 러너 [24]인 실제 입력|배포 검증:/,
  use: {
    ...local.use,
    baseURL: 'https://teumsae-arcade.ys-475.workers.dev',
    trace: 'off',
    video: 'off',
  },
});
