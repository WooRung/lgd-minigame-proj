# 웹 미니게임 모음

이름만 입력하고 바로 시작하는 웹 오락실입니다. 폭탄 게임과 횡스크롤 러닝 게임에 각각 싱글 스테이지, 최대 4인 실시간 대전, 게임별 기록·랭킹을 제공합니다.

현재 P1 로컬 기반과 이름 입력 흐름이 구현되어 있습니다. 게임 구현 진척은 PLAN을 확인하세요.

## 문서

| 문서 | 용도 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 개발·코드·검증·한국어 커밋과 push 규칙 |
| [제품과 기술 결정](docs/PROJECT.md) | 게임 요구사항, 확정 스택, 범위와 한계 |
| [개발 계획](docs/PLAN.md) | 체크포인트와 완료 증거 |
| [Goal 실행 계약과 프롬프트](docs/START.md) | 사용자가 실행할 명령과 구현 승인 범위 |

## 기본 방향

React·Vite·TypeScript·Phaser, Cloudflare Workers·Durable Objects·D1을 한 패키지로 구성합니다. 일반 CSS와 직접 SQL을 사용하고, 회원가입 없이 이름과 브라우저 세션으로 시작합니다. 싱글은 브라우저에서, 멀티는 서버 판정으로 실행합니다.

무료 플랜의 사용량 한도 안에서 시작하는 설계입니다. 무제한 무료 운영을 보장하지 않으며 실제 대전 사용량은 배포 검증 때 측정합니다.

## 개발 시작

Codex에서 이 저장소를 연 뒤 [START.md](docs/START.md)의 `/goal` 명령을 채팅 입력창에 제출하세요. 이 명령은 두 게임을 포함한 첫 버전의 구현·검증·GitHub 반영·배포 준비를 요청합니다. 실제 Cloudflare 배포와 원격 DB 변경은 별도 승인 단계입니다.

GitHub 저장소는 [WooRung/lgd-minigame-proj](https://github.com/WooRung/lgd-minigame-proj), 기본 작업 대상은 `main`입니다. 작은 기능·수정이 검증될 때마다 한국어 커밋과 push를 수행합니다.

## 현재 실행 상태

Node.js 22.12 이상(검증: 24.16), npm을 사용합니다.

```sh
npm ci
npm run db:local
npx playwright install chromium
npm run dev
```

[로컬 오락실](http://127.0.0.1:5173)을 여세요. 최초 이름 입력 후 같은 브라우저에서 재방문하면 세션을 이어갑니다. 이름은 중복 가능하며 다른 브라우저 기록을 복구하는 수단이 아닙니다.

```sh
npm run typecheck
npm run check
npm run test
npm run test:e2e
npm run build
```

`npm run format`은 Biome 자동 수정을 적용합니다. `npm run db:local`은 로컬 D1에만 SQL을 적용하며 `.wrangler/`에 상태를 저장합니다. Wrangler의 영(0) UUID는 로컬 전용 자리표시자입니다. 실제 배포 전에 승인된 원격 D1 ID로 바꿔야 합니다. 비밀값, 로컬 DB, 실행 산출물은 Git에 포함하지 않습니다.
