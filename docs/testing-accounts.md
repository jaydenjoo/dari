# Testing Accounts & Fixtures Strategy (Playwright E2E)

> **상태**: **구현 완료** (Phase 0 계획 + Phase 2 Task B-6 CI 반영, 2026-04-24).
> **연관 ADR**: [ADR-007 테스트 전략](./adr/ADR-007-testing-strategy.md)
>
> **Task B-6 반영 (CI 전략 확정)**:
>
> - **경로 C — 로컬 Supabase Docker on CI** 채택 (원 "test 프로젝트 분리" 계획의 간소화 변형). 외부 프로젝트 추가 비용 0, CI runner 내부에서 `supabase start` 로 전체 스택 기동.
> - 외부 API (Anthropic/Gemini/Firecrawl) placeholder — **rate limit 은 `checkRatelimit` 이 `NODE_ENV !== "production"` 자동 통과**. Gemini 의존 spec (`bot-knowledge-sources`, `bot-knowledge-file`) 은 상단 `test.skip(E2E_SKIP_EXTERNAL_API === 'true', ...)` 으로 파일 전체 skip.
> - artifact 보존 1일 (private repo + 로컬 fixture 키라 노출 시 실 피해 0).
> - **로컬 E2E 는 여전히 prod Supabase 사용** (기존 그대로). Phase 3 후속 Task B-6b 에서 로컬 Supabase 전환 예정.

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

- [x] `npm i -D @playwright/test` + `npx playwright install chromium firefox webkit`
- [x] `playwright.config.ts` — `baseURL: http://localhost:4000`, `trace: retain-on-failure`, `webServer` 2종 (dev + static 4001)
- [x] `tests/e2e/fixtures.ts` + `tests/e2e/support/` (test-accounts / auth-helpers / MAIN_TEST_USER)
- [x] `tests/e2e/smoke.spec.ts` — `/api/health` 200, 홈 로딩, 콘솔 에러 0
- [x] `tests/e2e/bots-list.spec.ts` / `bot-create.spec.ts` / `bot-detail.spec.ts` / `bot-edit.spec.ts` / `bot-stats.spec.ts` 등 13 spec
- [x] **`.github/workflows/ci.yml` 에 `e2e` job 추가 (Task B-6, 2026-04-24)** — 경로 C 로컬 Supabase Docker 전략
- [x] `.gitignore` 에 `playwright-report/`, `test-results/` 추가
- [x] ADR-007 의 결과 섹션에 "Playwright 도입 완료 (2026-04-24)" append
- [ ] 로컬 E2E 도 테스트 프로젝트 분리 (Task B-6b 이월)
- [ ] Gemini embedding mock 도입 → `E2E_SKIP_EXTERNAL_API` 제거 (Phase 3)

## 7. CI E2E 운영 가이드 (Task B-6)

### CI 실행 흐름

1. `verify` job (typecheck / lint / format / vitest / build) 녹색 확인 대기
2. `e2e` job 시작 — `supabase/setup-cli@v1` + `supabase start` (90~120s, 첫 실행 이후 캐시)
3. `supabase status -o json` → `.env.local` 동적 생성 (로컬 Supabase 키 + 외부 API placeholder)
4. `pnpm playwright install --with-deps chromium`
5. `pnpm test:e2e --project=chromium` (`E2E_SKIP_EXTERNAL_API=true` 지정)
6. 실패 시 artifact (trace/video/screenshot) 1일 보존 업로드

### 외부 API 처리 (`E2E_SKIP_EXTERNAL_API=true`)

| Spec | 상태 | 이유 |
|------|-----|-----|
| `bot-knowledge-sources.spec.ts` | **CI 에서 skip** | text 저장이 실 Gemini embedding 호출 |
| `bot-knowledge-file.spec.ts` | **CI 에서 skip** | TXT 업로드가 실 Gemini embedding 호출 |
| 그 외 11 spec | CI 실행 | Supabase Auth/DB/Storage 만 사용 |

Phase 3 에서 Gemini embedding 을 `MSW` 또는 `vi.mock` 스타일로 intercept → skip 제거 가능.

### 로컬 실행 (변동 없음)

```bash
pnpm test:e2e                    # 전체 (prod Supabase, 13 spec)
pnpm test:e2e --project=chromium # chromium 만
pnpm test:e2e --ui               # 디버깅
```

로컬 실행은 `.env.local` (prod Supabase) 사용. `E2E_SKIP_EXTERNAL_API` 미설정 → knowledge spec 도 실행 (실 Gemini 호출, 비용 발생).

## 6. 계정 생성 시점

- Epic 0-D 완료 직후 Supabase Dashboard 에서 `e2e-owner@dari.test`, `e2e-admin@dari.test` 를 Supabase Auth 로 생성 (Dashboard UI 또는 `supabase-js` admin API 사용).
- 비밀번호는 **1Password** 에 저장. `.env.test.local` 의 `TEST_USER_PASSWORD` 에만 기록.
- Jayden 이 직접 생성. Claude 는 `.env*` 파일 접근 불가 (글로벌 규칙).

## 관련 문서

- [ADR-007 테스트 전략](./adr/ADR-007-testing-strategy.md)
- [env-template.md](./env-template.md) (프로덕션 / 개발 환경변수)
- `docs/learnings.md` — "gitleaks — env 샘플값은 `<placeholder>` 각괄호 형식으로"
