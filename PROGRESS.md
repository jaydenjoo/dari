# PROGRESS.md

> **세션 시작 시 첫 번째로 읽는 파일**

## 현재 위치

- Phase: 0 (기반 공사)
- Epic: 0-D 인증 — Task 0-D-1 (OAuth) + 0-D-2 (RLS) 완료
- 상태: **owner 기반 RLS 활성화 완결** → 다음 경로 선택 (0-E-6 관찰성 탐지 / Phase 1 진입 / 짧은 정비)

## 완료된 Epic

- ✅ Phase 0-A (개발 환경): deps + shadcn + prettier + eslint
- ✅ Phase 0-C (Config 스키마): DariConfig v1.0 + migrations.ts + 샘플 3종
- ✅ Phase 0-B (DB 스키마, 4/4 테이블): bots / conversations / messages / knowledge_chunks + pgvector ivfflat + RPC
- ✅ **Phase 0-E (안정성 기반, 4/4 Task)**
  - 0-E-1: Vitest 인프라 + schema 테스트 6개
  - 0-E-2: Pino 구조화 로거 + redact + request 컨텍스트 (독립 리뷰 8건 반영)
  - 0-E-3: Sentry (Next.js 16.2 instrumentation) + sensitiveFields 공유 모듈 (독립 리뷰 8건 반영)
  - 0-E-4: /api/health 엔드포인트 + DB ping (실 HTTP 200 검증)
  - 누적 **29 테스트 통과**, 모든 빌드 clean, Turbopack + Sentry 10.49.0 호환 증명
- ✅ **Phase 0-F (유지보수 기반, 4/4 Task) — 완결**
  - 0-F-1: ADR 5종 (001/002/003/006/007) + `docs/testing-accounts.md`
  - 0-F-2: GitHub Actions CI + eslint/prettier baseline 정리 (CI 녹색 2회 연속)
  - 0-F-3: 환경 분리 전략 (`docs/environments.md` + ADR-008) + `SENTRY_ENVIRONMENT` end-to-end
  - 0-F-4: 모듈 README 골격 (`src/core/{config,db,logging,observability}`)
- ✅ **Task 0-E-5 (ε-1, 관찰성 보강)**: logger ↔ Sentry bridge + redact 단일 출처 일관화
  - `pino.multistream` 으로 primary + Sentry bridge 2-stream 구조
  - `redactDeep` 공유 유틸 (`core/observability/redact.ts`) — bridge ↔ beforeSend 동일 로직
  - 2-depth 이상 중첩 민감 필드 차단 (이중 방어선 3단계)
  - email/phone PII 필드 승격 (🟡 프로젝트 개인정보 보호)
  - Date/RegExp/Map/Set/Error 가드
  - 독립 리뷰 2라운드 (MEDIUM 5 + 2 + LOW 2 반영)
- ✅ **Task 0-D-1 (Epic 0-D Auth 시작)**: Google OAuth + Next 16 proxy 세션 게이트
  - Next 16 `proxy.ts` (구 middleware) + `@supabase/ssr` 0.10 PKCE
  - `/login` 페이지 (디자인 시스템 v2) + `/auth/callback` + `/auth/logout`
  - `updateSession` 매 요청 + 보호 라우트 리디렉트 + `?next=` 쿼리스트링 보존
  - `isSafeNextPath` 단일 출처 (open redirect / path traversal 방어)
  - 독립 리뷰 2라운드 (옵션 X 5건 반영) + Playwright E2E 9/9 통과
- ✅ **Task 0-D-2 (Epic 0-D 완결)**: owner 기반 RLS 정책 활성화 (경로 A 최소 단단)
  - 마이그레이션 0006 (14 정책): bots 4 + conversations 4 + messages 2 + knowledge_chunks 4
  - `bots.owner_id` NOT NULL 전환 (데이터 0건, 안전) + `to authenticated` 명시 (anon 배제)
  - `(select auth.uid())` InitPlan 래핑 (per-row 재평가 방지) + USING/WITH CHECK 구분
  - messages immutable 설계 유지 (UPDATE/DELETE 정책 부재 = 자동 거부)
  - 소프트 삭제 봇(`status='deleted'`) 접근 허용 명시 (휴지통/복구 UI 여지)
  - 독립 리뷰 2 에이전트 병렬 → Ship as-is (CRITICAL/HIGH 0)
  - **SQL 기반 RLS 시뮬레이션으로 10/10 시나리오 PASS** (owner 격리, owner 이전 공격 차단, 2단 EXISTS, anon 자동 배제)

## 이번 세션(2026-04-18 오전) 완료 내역

### Task 0-D-2 (Epic 0-D 완결) — owner 기반 RLS

- 마이그레이션 **`0006_add_rls_policies.sql`** — 14 정책 일괄 신규
  - bots 4 (SELECT/INSERT/UPDATE/DELETE) — `owner_id = (select auth.uid())`
  - conversations 4 — `exists (bots where id = bot_id and owner_id = ...)`
  - messages 2 (SELECT/INSERT) — 2단 EXISTS (conversations JOIN bots)
  - knowledge_chunks 4 — bots EXISTS 동일 패턴
- `bots.owner_id` NOT NULL 전환 (데이터 0건, 안전)
- **경로 A (owner 전용, 최소 단단)** 선택 — 익명 방문자/로그인 방문자 흐름은 Phase 1 service_role 경유
- Supabase `advisors(security)` — `rls_enabled_no_policy` WARN 0건 해소
- **독립 리뷰 2 에이전트 병렬** (code-reviewer + security-reviewer) → 양쪽 Ship as-is
  - GOOD 공통: `(select auth.uid())` InitPlan 래핑 / `to authenticated` 명시 / USING↔WITH CHECK 구분 / 2단 EXISTS / messages immutable 정책 부재 = 자동 거부
  - MEDIUM 1 (공통): 소프트 삭제 봇 접근 정책 — 옵션 A (의도 유지 + 주석 보강) 결정
- **SQL 기반 RLS 시뮬레이션 10/10 PASS** (`SET LOCAL "request.jwt.claims"` 로 두 계정 시뮬레이션)
  - G1-2: A/B 컨텍스트 대칭 SELECT (자기 것만 반환)
  - G3: 익명 전원 차단 (4 테이블 0 rows)
  - G4-5: INSERT impersonation (owner_id/bot_id 타인) → `42501 RLS violation`
  - G6/G8: UPDATE/DELETE 타인 리소스 → 0 rows affected
  - G7: owner 이전 공격 (자기 봇 owner_id → B) → WITH CHECK 차단
  - G9/G10: messages UPDATE/DELETE → 정책 부재 = 0 rows (immutable 보장)

### 주요 결정 / 발견

- **소프트 삭제 봇 접근 정책 = 의도적으로 owner 접근 허용** — 휴지통/복구 UI 여지, 소프트 삭제 개념 정합. 대시보드 숨김은 앱 레벨 `where status != 'deleted'` 필터 책임.
- **SQL 기반 RLS 시뮬레이션 = UI E2E 대체 가능** — `SET LOCAL ROLE authenticated` + `SET LOCAL "request.jwt.claims"` 로 Google OAuth 2계정 로그인 없이 10 시나리오를 3-4분 안에 검증. Supabase 가 실제 로그인 시 설정하는 값과 동일.
- **독립 리뷰의 성능 모범사례 확인** — `(select auth.uid())` InitPlan 래핑이 이미 반영된 것을 리뷰어가 적극 GOOD 으로 평가. Supabase 공식 모범사례 정확히 준수.

### learnings.md 추가 (+1, 총 18건)

- SQL 기반 RLS 시뮬레이션을 UI E2E 대체 수단으로 활용 — `SET LOCAL "request.jwt.claims"` 패턴

## 이전 세션(2026-04-17 야간) 완료 내역

### 커밋 2건

- `dc4659b` feat(logging): Sentry bridge + redact 단일 출처 일관화 (Task 0-E-5)
- `74a87e1` feat(auth): Google OAuth + Next 16 proxy 세션 게이트 (Task 0-D-1)

### Task 0-E-5 (logger ↔ Sentry bridge)

- `pino.multistream` 2-stream 구조 (primary + Sentry bridge, error/fatal 자동 캡처)
- `redactDeep` 공유 유틸 신규 — bridge 에서도 2-depth 이상 중첩 차단, beforeSend 리팩토 공유
- `SENSITIVE_FIELD_NAMES` 에 `email/phone/phoneNumber/phone_number` 승격 (🟡 PII)
- `redactDeep` 에 Date/RegExp/Map/Set/Error 가드 (내장 객체 데이터 손실 방지)
- `msg/err` 문자열 내 민감값 코딩 규칙 README 명시
- **독립 리뷰 2라운드** (옵션 B + 옵션 X) → MEDIUM 5+2, LOW 2 반영
- 테스트: 29 → 35 (+6 bridge 시나리오)

### Task 0-D-1 (Google OAuth + 로그인 흐름)

- `src/proxy.ts` (Next 16 파일 컨벤션) — 매 요청 `getUser()` refresh + 보호 라우트 리디렉트
- `src/core/db/proxy-client.ts` — `updateSession` 헬퍼 (let response closure + setAll 패턴)
- `src/core/auth/route-policy.ts` — `isPublicPath` + `isSafeNextPath` 단일 출처
- `/login` 페이지 디자인 시스템 v2 (Card + Google SVG + 2레이어 그림자 + 자간 + 블롭 배경)
- `/auth/callback` PKCE 코드 교환 + logger.error → Sentry 자동 캡처 (0-E-5 bridge 활용)
- `/auth/logout` Server Action
- 홈 `/` 로그인 상태 표시 + 로그아웃 버튼
- `?next=` 쿼리스트링 보존 (`/bots?tab=active` → 로그인 후 탭 복원) + 백슬래시/userinfo/길이 제한 방어
- **독립 리뷰 2라운드** (1차 Ship + 2차 옵션 X 5건 반영) + **Playwright E2E 9/9 통과**
- 테스트: 35 → 67 (+18 `isSafeNextPath` + 14 `isPublicPath`)

### 주요 결정 / 발견

- **Next.js 16 `middleware` → `proxy` 리네임 + `src/` 레이아웃은 `src/proxy.ts` 필수** — AGENTS.md 경고 적중. 구현 중 발견, Plan 수정안 즉시 보고·승인 루틴.
- **`proxy.ts` 및 그 의존에서 `import "server-only"` 금지** — `adapterFn is not a function` 크래시. `server-only` 가드의 적용 범위는 Server Component / Action / Route Handler 만.
- **ultrareview 는 스냅샷 타이밍 false positive 가능** — 트리거 시점 중간 상태를 기준으로 분석. 로컬 build/test/Playwright 결과가 진실.
- **MCP Playwright 를 수동 검증 대체로 활용 가능** — 세션 유지된 브라우저 이용해 로그인/비로그인 양측 E2E 자동화. Google OAuth UI 만 수동이 현실적이나 기존 세션 유지 시 자동 통과.

### learnings.md 추가 (+2, 총 17건)

- Next.js 16 middleware → proxy 리네임 + src/ 레이아웃 필수 (AI 이탈 방지 + 설계 결정)
- proxy 런타임에서 `import "server-only"` 금지 (기술 이슈)

## 이전 세션(2026-04-17 마감) 완료 내역

### 커밋 2건 (이 세션 추가)

- `38df2fe` feat(env): 환경 분리 문서 + SENTRY_ENVIRONMENT end-to-end (Task 0-F-3)
- `4c28793` docs(core): 각 모듈 README 골격 (Task 0-F-4, Epic 0-F 완결)

### Task 0-F-3 (환경 분리 + Sentry env 태그)

- `docs/environments.md` 신규 ~240줄: 11개 섹션 (요약 / 로드맵 / 변수 매트릭스 / 시크릿 저장처 / 배포 플로우 / Migration 순서 / Sentry 태그 / Preview DB 격리 / 운영 안전 / stg 재평가 기준)
- `docs/adr/ADR-008-environment-separation.md` 신규: 2환경 Lean (local + prod) + Vercel Preview = stg 역할. 재평가 트리거 5개 객관화
- `docs/env-template.md` +40줄: SENTRY_ENVIRONMENT + 환경별 값 매트릭스 + DATABASE_URL migration CLI 전용 명시
- `docs/adr/README.md`: ADR-008 인덱스
- `src/shared/config/env.ts`: `SENTRY_ENVIRONMENT` enum optional + `DATABASE_URL` optional 전환 (ADR-002 Drizzle 미사용, 런타임 불참조)
- `sentry.{server,edge}.config.ts`: `environment` fallback chain (`SENTRY_ENVIRONMENT ?? NODE_ENV ?? "development"`)
- `instrumentation-client.ts`: 브라우저 `NEXT_PUBLIC_*` 제약 주석 (preview/prod 구분 불가)

**독립 리뷰 2 에이전트 병렬**: code-reviewer (Fix then ship) + security-reviewer (Ship as-is). MEDIUM 4건 발견 → 옵션 B 전체 반영:

- M1 ADR-008:29 `§9` 참조 미동기화 → `§10` 으로 수정
- M2 `DATABASE_URL` Zod required 와 문서 "(미사용)" 불일치 → optional 전환 + 문서 3곳 정합화
- M3 RLS 미활성화 Preview URL 경고 누락 → §9 🟡 주의에 1줄 추가
- M4 브라우저 Sentry 구분 불가 → §7 에 Stage 2 대비 옵션 A/B 서브섹션

### Task 0-F-4 (모듈 README 골격)

- `src/core/db/README.md` 신규: Supabase client 3종 (browser / server async / admin), 타입 생성 규칙, RLS 경고, `createClient` 동명 alias 권장
- `src/core/logging/README.md` 신규: Pino + AsyncLocalStorage, `LOG_LEVEL` env 실동작 (허용 7종, prod=info / dev=debug), Edge 런타임 import 금지 (pino-pretty worker_threads 크래시)
- `src/core/observability/README.md` 신규: `beforeSend` / `sensitiveFields` / `runHealthChecks`. 순수 함수 설계, 현재 DB ping 1종, 2s 타임아웃, /api/health 인증 불요
- `src/core/config/README.md` 보완: 기존 4섹션 보존 + 공개 API / 의존성 / 관련 ADR / 제약 4섹션 추가

**독립 리뷰 3건 정확성 수정 반영**: `createClient` alias 권장 / `LOG_LEVEL` 실 동작 (env.ts 미등록이나 `logger.ts` 직접 조회) / health check 순수 함수 + DB 1종 + 의존성 정정

### 주요 결정 / 발견

- **"리뷰" 키워드 = code + security 병렬 호출 규칙화** — MEMORY.md 에 `feedback_review_dual_agents.md` 영속. 단일 지시로 두 에이전트 병렬 호출. 수식어 있을 때만 단일.
- **브라우저 Sentry environment 구분 포기** — `NEXT_PUBLIC_*` 제약. Stage 2 진입 전 `NEXT_PUBLIC_SENTRY_ENVIRONMENT` 도입 검토 (backlog). 현재는 Alert 필터 `!platform.browser` 로 노이즈 제외 가능.
- **Zod 스키마 ↔ 문서 정합성 독립 리뷰가 포착** — 자체 리뷰로 놓친 `DATABASE_URL` 충돌·§9 참조 누락 등 4건. 단일 개발자도 2 에이전트 리뷰 루틴화 가치 확인.
- **2환경 Lean 선택 근거 영속화** — 1인 운영 규모에서 3환경 Full 은 과잉. Vercel Preview 가 stg 역할 90% 대체. 재평가 트리거 5개로 stg 도입 지연 리스크 관리.

### learnings.md 추가 (+2, 총 15건)

- 독립 리뷰 (code-reviewer + security-reviewer) 가 단일 개발자 시점에서 놓친 4건 포착 → "리뷰" 병렬 호출 규칙 + 섹션 재배치 시 전체 참조 grep 루틴 (Task 0-F-3 / 0-F-4 회고)
- Next.js env 주입 경계 — `NEXT_PUBLIC_*` 접두사 없는 env 는 브라우저 번들에서 `undefined`. fallback chain 설계 시 런타임별 값 존재 검증 필수 (Task 0-F-3 설계 결정)

### memory 추가 (+1)

- `feedback_review_dual_agents.md` — "리뷰" 단독 지시 시 code-reviewer + security-reviewer 두 에이전트 동시 호출

## 다음 세션 할 일

### 🎯 경로 선택

**경로 α (권장): Phase 1 진입 — 봇 CRUD + DariConfig UI**

- `/bots` 목록 → `/bots/new` 생성 폼 → `/bots/:id` 상세
- `owner_id = auth.uid()` 자동 주입 (RLS 통과 필수)
- DariConfig 입력 UI (Phase 0-C 스키마 활용)
- 소요: 여러 세션 (Task 분해 필요)

**경로 β: Task 0-E-6 (관찰성 탐지 지표, 0-E-5 backlog 묶음)**

- `redactDeep` depth-exceeded sentinel (운영 모니터링 트리거)
- bridge JSON.parse 실패 탐지 (stderr 또는 별도 metric)
- `redact.ts` 자체 단위 테스트 (경계값 direct 검증)
- 소요: 45~60m

**경로 γ (Phase 1 전 짧은 정비, 선택)**

- **디자인 폰트 전역 교체**: Geist → Pretendard + DM Sans (디자인 시스템 v2 완전 준수, ~20m)
- **CI Node 24 전환**: `actions/*@v4` → `@v5` (2026-06-02 전, 10~15m)
- **NEXT_PUBLIC_SENTRY_ENVIRONMENT 도입**: 브라우저 preview/prod 구분 (Stage 2 진입 전, 30~45m)
- **`proxy-client.ts` ESLint no-restricted-imports 규칙**: proxy 외 import 강제 차단 (~15m)

### 그 외 대기 중

- **테스트 유저 cleanup**: Supabase Dashboard 에서 `rls-test-b@example.com` 삭제 (30초, 또는 재검증용 보존)
- **gitleaks 오탐 선제 정리**: `env-template.md` 의 `sk-ant-xxxxx` 등을 `<placeholder>` 각괄호로 통일 (보안 리뷰 부가 제안, CI 통과 중이라 우선순위 낮음)
- **gitleaks pre-commit hook 설치**: 팀 확장 전 (sec-reviewer M3, 여전히 backlog)
- **conversations/messages 로그인 방문자(user_id) 정책 확장**: Phase 1 위젯 로그인 지원 시점에 추가
- **위젯 anon 라우트 service_role 경유 설계**: Phase 1 위젯 구현 시 `bot_id` 소유권 검증 + rate limiting 필수

## 차단 요소

**없음** — Phase 1 진입 가능 (RLS 완결). 경로 α 직행 또는 γ 정비 후 경로 α 선택지.

## 완료한 Task (누적)

- [x] PRD v2.0 학습
- [x] 마스터 플랜 v3.0 수립 (3대 우선순위 + Soft Launch 통합)
- [x] Epic 0-A-1: 의존성 설치
- [x] Epic 0-A-2: shadcn/ui 초기화 + 9종 컴포넌트
- [x] Epic 0-A-3: env.ts + env-template.md
- [x] Epic 0-A-4: Prettier + ESLint 정합
- [x] Epic 0-C: Config 스키마 + 샘플 3종
- [x] ADR 시스템 폴더 + 인덱스
- [x] 포트 4000 통일 (메모리 저장)
- [x] design-references 경로 C 적용
- [x] Supabase MCP 연결 + pgvector 활성화
- [x] bots 테이블 (0001) + Supabase 클라이언트 3종
- [x] bots.bot_id → slug 리네임 (0002)
- [x] conversations + messages 테이블 (0003)
- [x] 2단계 cascade DELETE 검증
- [x] 에러 최소 경로 추천 규칙 메모리 저장
- [x] 함수 search_path 보안 강화 (0004)
- [x] knowledge_chunks 테이블 + RPC (0005)
- [x] KnowledgeChunk 타입 추가 + 자동 생성 보류 결정
- [x] RAG 라운드트립 검증 (cosine similarity 서수 통과)
- [x] Task 마다 Plan→Approve→Build 규칙 메모리 저장
- [x] Task 0-E-1: Vitest 인프라 + schema 테스트 6개
- [x] Task 0-E-2: Pino 구조화 로거 + 독립 리뷰 8건 반영 (redact 40 paths)
- [x] Task 0-E-3: Sentry 배선 + sensitiveFields 공유 모듈 + 독립 리뷰 8건 반영
- [x] Task 0-E-4: /api/health + DB ping + 실 HTTP 200 검증
- [x] Task 0-F-2: GitHub Actions CI + eslint/prettier baseline 정리 (CI 2회 녹색)
- [x] Task 0-F-1: ADR 5종 (001/002/003/006/007) + `docs/testing-accounts.md`
- [x] **Task 0-F-3: 환경 분리 문서 (environments.md + ADR-008) + SENTRY_ENVIRONMENT end-to-end + DATABASE_URL optional 전환 (독립 리뷰 MEDIUM 4건 반영)**
- [x] **Task 0-F-4: 모듈 README 골격 (core/config 보완 + db/logging/observability 신규, 독립 리뷰 3건 반영)**
- [x] "리뷰" = code+security 병렬 규칙 메모리 저장 (`feedback_review_dual_agents.md`)
- [x] **Task 0-E-5: logger ↔ Sentry bridge + redact 단일 출처 (독립 리뷰 2라운드, MEDIUM 7 + LOW 2 반영)**
- [x] **Task 0-D-1: Google OAuth + Next 16 proxy 세션 게이트 + isSafeNextPath 단일 출처 (독립 리뷰 2라운드, 옵션 X 5건 반영, Playwright E2E 9/9)**
- [x] **Task 0-D-2: owner 기반 RLS 정책 14 활성화 + `bots.owner_id` NOT NULL + 독립 리뷰 2 에이전트 Ship as-is + SQL 시뮬레이션 10/10 PASS (Epic 0-D 완결)**

## 세션 이력

- 2026-04-17 (오전): 프로젝트 초기화
- 2026-04-17 (오후): PRD v2.0 재작성 + 마스터 플랜 v3.0 수립 + Phase 0-A/0-C 완료
- 2026-04-17 (저녁): Epic 0-B 3/4 테이블 + Supabase 클라이언트 + 메모리 규칙 2개
- 2026-04-17 (밤): Epic 0-B 완결 (0004 함수 search_path + 0005 knowledge_chunks) + 타입 + 라운드트립 + 교훈 3건
- 2026-04-17 (심야): Epic 0-E 완결 (4/4 Task) + 독립 리뷰 2회 + 커밋 4건 + 교훈 3건
- 2026-04-17 (후속): Epic 0-F 50% (2/4 Task) — 0-F-2 CI + 0-F-1 ADR 5종 + 교훈 1건
- **2026-04-17 (마감): Epic 0-F 100% 완결 — 0-F-3 환경 분리 + 0-F-4 모듈 README + 독립 리뷰 4회 (MEDIUM 7건 반영) + 커밋 2건 + 교훈 2건 + 메모리 1건**
- **2026-04-17 (야간): Task 0-E-5 + Task 0-D-1 — logger↔Sentry bridge 완결 + Google OAuth 첫 로그인 흐름 + Playwright E2E 자동화 도입 + 교훈 2건 (Next16 proxy 리네임 / server-only 금지)**
- **2026-04-18 (오전): Task 0-D-2 — owner 기반 RLS 14 정책 활성화 + Epic 0-D 완결 + 독립 리뷰 2 Ship as-is + SQL 시뮬레이션 10/10 PASS + 교훈 1건 (SQL 기반 RLS 시뮬레이션)**

## 마지막 업데이트

- 날짜: 2026-04-18 오전 (Task 0-D-2 완료, Epic 0-D 완결, Phase 1 진입 준비)
- 작성자: Jayden + Claude (Opus 4.7, effort=max)
