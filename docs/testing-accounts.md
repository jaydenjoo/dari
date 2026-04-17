# Testing Accounts & Fixtures Strategy (Playwright E2E 준비)

> **상태**: 계획 단계 (Phase 0 문서화 only). 실 구현은 Epic 0-D (Auth) 완료 이후.
> **연관 ADR**: [ADR-007 테스트 전략](./adr/ADR-007-testing-strategy.md)

## 목적

Playwright E2E 도입 시 사용할 **테스트 사용자 계정 + 데이터 fixture + secret 관리 전략** 을 선행 정의. Auth 구현 이후 "지금 어떻게 만들지?" 재논의 비용 제거.

## 1. 테스트 사용자 분류

| 역할          | 이메일 규칙                  | 용도                                  |
| ------------- | ---------------------------- | ------------------------------------- |
| **Guest**     | — (로그인 없음)              | 랜딩, 공개 봇 embed 검증              |
| **Bot Owner** | `e2e-owner+<slug>@dari.test` | 봇 생성 / 수정 / 삭제, 대시보드, 통계 |
| **Admin**     | `e2e-admin@dari.test`        | Admin API, 운영 기능, 플랜 관리       |

- **도메인 `dari.test`**: IANA 예약 TLD. 실 수신 불가 → 실수 유출 원천 차단.
- **Plus addressing** (`+<slug>`): Bot Owner 를 봇 단위로 격리. 병렬 테스트 충돌 방지.

## 2. 데이터 Fixture 전략

- **위치**: `tests/e2e/fixtures/` (Playwright 도입 시 신설)
- **Seed**: `beforeAll` 훅에서 Supabase **admin client** 로 `bots / conversations / messages / knowledge_chunks` 삽입. 테스트 종료 시 ON CASCADE DELETE.
- **격리**: 각 테스트의 bot `slug` 에 `uuid v4` prefix → 병렬 실행 race 방지.
- **RLS 바이패스 금지**: admin client 는 **fixture seed 에만** 사용. 실 테스트 플로우는 anon / authenticated 클라이언트로 RLS 동작을 **함께 검증**.

## 3. Supabase 프로젝트 분리

| 환경            | 용도             | env 파일                           |
| --------------- | ---------------- | ---------------------------------- |
| **dev**         | Jayden 개인 개발 | `.env.local`                       |
| **test** (신규) | E2E 전용         | `.env.test.local` + GitHub Secrets |
| **prod**        | 운영             | `.env.production`                  |

- `test` 프로젝트는 언제든 `pg_dump` 후 drop / recreate 가능해야 함 (데이터 0 이 default).
- `dev` 프로젝트와 **완전 분리** — E2E 가 dev 데이터를 지우는 사고 방지.

## 4. Secret 관리

- **로컬 실행**: `.env.test.local` — Claude 및 git 접근 0 (`.env*` 는 `.gitignore` 강제, Claude 글로벌 규칙 적용).
- **GitHub Actions E2E job**:
  - `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` 를 **GitHub Secrets** 로 등록.
  - 현재 `ci.yml` 의 build job placeholder 와 **분리** — E2E job 에서만 참조.
- **절대 금지**: GitHub Variables (평문) 에 service_role_key 저장, `.env.test` (`.local` 접미사 없는) 파일 커밋.

## 5. Playwright 도입 체크리스트 (Epic 0-D 이후 실행)

- [ ] `npm i -D @playwright/test` + `npx playwright install chromium firefox webkit`
- [ ] `playwright.config.ts` — `baseURL: http://localhost:4000`, `trace: on-first-retry`, `webServer: npm run dev`
- [ ] `tests/e2e/fixtures/{users,bots,messages}.ts` 작성
- [ ] `tests/e2e/smoke.spec.ts` — `/api/health` 200, 랜딩 로딩, 콘솔 에러 0
- [ ] `tests/e2e/auth.spec.ts` — Google OAuth mock 또는 Supabase test user 직접 로그인
- [ ] `tests/e2e/bot-crud.spec.ts` — 봇 생성 / 수정 / 삭제 + RLS 격리 검증 (다른 owner 의 봇 조회 시 403)
- [ ] `.github/workflows/ci.yml` 에 `e2e` job 추가 — `test` 프로젝트 secret 참조, 별도 job 분리 (단일 job 재평가)
- [ ] `.prettierignore` + `.gitignore` 에 `playwright-report/`, `test-results/` 추가
- [ ] ADR-007 의 결과 섹션에 "Playwright 도입 완료 (YYYY-MM-DD)" append

## 6. 계정 생성 시점

- Epic 0-D 완료 직후 Supabase Dashboard 에서 `e2e-owner@dari.test`, `e2e-admin@dari.test` 를 Supabase Auth 로 생성 (Dashboard UI 또는 `supabase-js` admin API 사용).
- 비밀번호는 **1Password** 에 저장. `.env.test.local` 의 `TEST_USER_PASSWORD` 에만 기록.
- Jayden 이 직접 생성. Claude 는 `.env*` 파일 접근 불가 (글로벌 규칙).

## 관련 문서

- [ADR-007 테스트 전략](./adr/ADR-007-testing-strategy.md)
- [env-template.md](./env-template.md) (프로덕션 / 개발 환경변수)
- `docs/learnings.md` — "gitleaks — env 샘플값은 `<placeholder>` 각괄호 형식으로"
