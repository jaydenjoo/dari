# PROGRESS.md

> **세션 시작 시 첫 번째로 읽는 파일**

## 현재 위치

- Phase: 1 (MVP 기능) 진행 중
- Epic: **Epic 1-6 위젯 런타임 — 1-6-a Chat API ✅ + 보안 보강 ✅** (옵션 D 일괄, 차단급 M-1 + N-1~N-6 모두 반영)
- 상태: **Task 1-6-a 보안 보강 완료** (vitest 127 → 132, +5) / **이번 세션 변경 미커밋** / **🟡 0007 마이그레이션 Supabase 실 apply 필요 (Jayden 수동)** → 다음 **Task 1-6-b `/widget.js` 번들** (~90분) 또는 **Task 1-6-c RAG** (~60분, Task 1-7 선행 필요)

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
- ✅ **Task 1-5-d (Epic 1-5 완결)**: /bots/[slug]/edit 편집 폼 + 5섹션 UI + RLS UPDATE 첫 실증
  - 신규 13파일 (edit/actions/page/loading/error/form/field + 5 section + knowledge-placeholder + e2e)
  - 3중 방어 + Mass Assignment 차단 (owner_id/slug/botId/knowledge.sources/allowedDomains 전부 폼 미수신)
  - 독립 리뷰 2 에이전트 → 1차 반영 7건 (code H-1 allowedDomains / sec M-1 SSRF / sec M-3 에러 메시지 / sec L-1 fontFamily / sec L-2 timezone / sec L-3 trigger / code M-2 dead code)
  - **재리뷰 CRITICAL 1건** — isSafeExternalWebhook IPv6 사설/mapped 대역 우회 즉시 차단 (ULA fc00::/7, link-local fe80::/10, `::ffff:10.0.0.1`). 회귀 방지 단위 테스트 +8 (SSRF 6 + timezone 2)
  - 검증: **86/86 vitest** (78→86) / build clean / **16/16 E2E** (12→16)
- ✅ **Task 0-D-6 (Epic 0-D 완전 종결)**: proxy redirect 시 refreshed 세션 쿠키 전파
  - `redirectWithRefreshedCookies` helper — `updateSession` response.cookies → redirect response 복제
  - 증상: redirect 시 새 JWT 쿠키 누락 → 다음 요청 세션 불인식 race
- ✅ **types.ts 근본 수정 (`as never` / `.returns<>` 전면 제거)**
  - `__InternalSupabase: { PostgrestVersion: "12" }` 슬롯 + 4 테이블 `Relationships: []`
  - 회피 코드 6곳 제거 (`.returns<T[]>()` 4곳 + `as never` 2곳)
  - postgrest-js GenericTable 요구조건 충족 → Insert/Update payload 정상 추론

## 이번 세션(2026-04-18 심야 Ⅳ) 완료 내역 — Task 1-6-a 보안 보강 (옵션 A → 옵션 D 일괄)

### 흐름 (~125분)

1. **선행 — Task 1-6-a 본체 코드 1 커밋**: 7ffa34b (factory + origin-check + route + anthropic-client + bot-chat-limiter + 테스트, 6 파일 +463/-3, gitleaks pass)
2. **옵션 A — security 재리뷰 1라운드**: 일괄 수정 5건 재검증 + 신규 6건 (CRITICAL/HIGH 0, MEDIUM 3 + LOW 3)
3. **"리뷰" 단독 지시 — code+security 병렬 추가 라운드** (메모리 규칙 적용):
   - 🔴 **차단급 M-1 발견 (둘 다 합의)**: `route.ts:267` 신규 conversation INSERT 가 `visitor_id` 없이 → `conversations_has_identity` check 위반 → **Task 1-6-a 신규 conversation 경로 항상 500** (Anthropic 도달 전)
   - **N-3 폐기 권장**: D-3-a (OPTIONS rate limit) 가 정상 위젯 차단 + 실질 위협 작음 (Access-Control-Max-Age: 600 으로 preflight 이미 최소화). Phase 2 backlog 이동
   - **N-4 변경**: 시그니처 변경 → IP 해시화 (PIPA·GDPR 평문 회피 + 함수 책임 분리)
   - **N-1 보강**: JWT 패턴 + `api[_-]?key` prefix (`primary key constraint` false positive 회피)
   - **N-2 보강**: `public.messages` 한정 + 롤백 SQL 필수 (search_path = '' 함정 회피)
4. **옵션 D 일괄 (Step 3 v2) 적용**:
   - **M-1**: `visitor_id: randomUUID()` 주입 (`node:crypto.randomUUID`)
   - **N-1**: `redactSecretsInMessage` 7 패턴 (URL → JWT → Authorization → sk-ant → Bearer → api_key → token=), `\S+` / `[^\r\n]*` 로 base64 padding · 다중 단어 헤더 대응
   - **N-1 회귀 테스트 +5**: sk-ant / JWT / api_key= / Authorization / false positive 보존 (`primary key constraint`)
   - **N-2 마이그레이션 0007**: `check_message_limit()` BEFORE INSERT, `search_path = ''` + `public.messages` 명시 + 롤백 SQL + comment + TOCTOU race 한계 명시
   - **N-4 IP 해시화**: `hashClientIp()` (SHA-256 prefix 8자) + `resolveConversationId(clientIpHash)` 시그니처 + `sensitiveFields.ts 'ip'` 추가 (raw 로깅 방어선)
   - **N-5 주석**: factory.ts fail-open 분기에 "Phase 2 fail-closed 재검토" + ADR 예정 명시

### 신규 / 수정 파일

- **신규 1**: `supabase/migrations/0007_add_message_limit_trigger.sql` — Supabase 실 apply Jayden 수동 필요 (🟡 등급)
- **수정 5**: `src/app/api/chat/[botId]/route.ts` (M-1 + N-4 호출처/시그니처) / `src/core/ratelimit/factory.ts` (N-1 + N-5) / `src/core/ratelimit/factory.test.ts` (+5 케이스) / `src/core/observability/sensitiveFields.ts` ('ip' 추가) / `PROGRESS.md` (이 항목)

### 검증

- **pnpm check**: tsc clean / lint 4 warning (기존 unused vars, 이번 변경 무관) / prettier clean (1회 자동 fix) / **vitest 127 → 132 (+5)**
- **pnpm build**: Turbopack clean, `/api/chat/[botId]` Dynamic 등록 유지
- E2E 미실행 (코드 변경은 anon API 보안 보강이라 기존 인증 플로우 회귀 없음)

### 주요 결정 / 교훈

- **M-1 차단급은 1차 보안 재리뷰에서 미포착** — 신규 코드 작성 직전이라도 "기존 코드 정합성"을 한 번 더 검증할 가치. 보안 재리뷰 후 "리뷰" 단독 지시로 code+security 병렬 라운드를 한 번 더 돌렸기에 발견. **수정 적용 전 추가 라운드 1회 = 차단급 1건 차단**
- **N-3 보안 권장 코드 폐기** — security-reviewer 의 권장 코드 그대로 적용했으면 정상 위젯 cross-origin 요청 전부 차단되는 회귀. **권장 코드도 두 번째 관점(code-reviewer)으로 비판적 검토 필수** 교훈 재실증
- **PII 해시화 + 이중 redact 패턴 정립** — `sensitiveFields.ts 'ip'` 로 raw IP 로깅 차단 (방어선) + 의도적 사용처는 `hashClientIp()` 로 SHA-256 prefix 변환 (`ipHash` 필드, redact 비대상). 추적 가치 유지 + raw 노출 차단
- **마스킹 정규식 false positive 회피 균형** — 보안 강화 시 정상 디버깅 정보 보존이 운영 가시성에 직결. `api[_-]?key` prefix 강제 (`primary key` 등 정상 메시지 보존), `Authorization` 라인 끝까지 (다중 단어 스킴 + base64 padding)

### learnings.md 추가 (+3, 총 40건)

- 보안 재리뷰 후 추가 code+security 병렬 라운드의 가치 (M-1 차단급 발견 사례)
- 보안 리뷰 권장 코드도 비판적 재검토 (N-3 D-3-a 사례 — 정상 트래픽 회귀 회피)
- PII 해시화 + 이중 redact 방어선 패턴 (raw 필드 redact + hashed 필드 보존)

### Backlog (다음 세션)

- **🟡 0007 마이그레이션 Supabase 실 apply (Jayden 수동)** — `check_message_limit()` 트리거 활성화
- **이번 세션 변경 1 커밋** — 5 수정 + 1 신규
- **Task 1-6-b `/widget.js` 번들 스캐폴딩** (~90분)
- **Task 1-6-c RAG 연결** (~60분, Task 1-7 지식 업로드 경로 선행)
- **N-3 (Phase 2)**: OPTIONS DB DoS + bot enumeration timing oracle 잔존 — 트래픽 증가 시 in-memory LRU 캐시 또는 별도 limiter 재검토
- **N-5 (Phase 2)**: rate limit fail-open ADR 작성 (과금 도입 전 fail-closed 정책 결정)
- **N-6 (Task 1-6-c 전)**: 입력 토큰 상한 (`MAX_INPUT_TOKENS`) 설계 — multi-turn/RAG 도입 시 4000자 × N 메시지 = 입력 토큰 폭발
- **Phase 2 backlog (이월)**: Anthropic 다중 text 블록 병합 / ERROR_MESSAGES i18n / sandboxed iframe 지원 / Prompt Injection 방어 (Task 1-0-c 이관)

---

## 직전 세션(2026-04-18 심야 Ⅲ) 완료 내역 — Task 1-6-a Chat API

### Task 1-6-a — 위젯 Chat API 최소 구현 (Epic 1-6 진입, ~120분)

- **신규 4파일**:
  - `src/app/api/chat/[botId]/route.ts` (~285줄) — POST (anon 허용) + OPTIONS (preflight) + 6중 보안 레이어 (bot lookup → origin → rate limit → conv 소유권 → 응답 최소화 → 에러 일반화)
  - `src/core/ai/anthropic-client.ts` — SDK 싱글턴 (`@anthropic-ai/sdk` 0.90)
  - `src/core/ratelimit/bot-chat-limiter.ts` — 봇당 IP 100 req/h (factory 재사용, 복합키 `${botId}:${ip}`)
  - `src/core/ratelimit/bot-chat-limiter.test.ts` — 3 테스트 (dev skip / prod 호출 / 차단)
- **수정**:
  - `src/core/ratelimit/factory.ts` — `sanitizeLoggableError` export (외부 SDK catch 공통 마스킹)
  - `src/core/security/origin-check.ts` — JSDoc 에 null origin 차단 + sandboxed iframe 경고 명문화
- **설계 결정 8건** (Jayden 승인):
  1. JSON 단일 응답 (스트리밍 Phase 2) / 2. Anthropic 우선 / 3. 복합키 `${botId}:${ip}` /
  2. 100 req/1h 봇당 IP / 5. POST 마다 messages insert / 6. service_role + `status='active'` /
  3. 구조화 JSON 에러 `{ error, code }` (enumeration 방지) / 8. 서버 conversationId UUID 할당
- **독립 리뷰 2 에이전트 병렬**:
  - code Ship (M-1 warn 로깅 / M-2~M-4 Phase 2 backlog)
  - security Ship (MEDIUM 3: T12 Anthropic raw Error / T8 메시지 저장 DoS / T3 비용 공격)
- **일괄 수정 5건 반영**:
  - Sec M-1 (T12): `sanitizeLoggableError` 4 경로 적용 (loadActiveBot / user msg / assistant msg / Anthropic catch)
  - Sec M-2 (T8): `MAX_MESSAGES_PER_CONVERSATION=200` — 상한 초과 시 새 conversation 전환
  - Sec M-3 (T3): `CHAT_MAX_OUTPUT_TOKENS=2048` Chat 레이어 clamp (비용 노출 819K→204K 토큰/h/봇)
  - Code M-1: `resolveConversationId` bot_id 불일치 시 `logger.warn` (운영 가시성)
  - 설계 문서화: null origin / sandboxed iframe JSDoc
- **검증**: pnpm check (tsc + eslint + prettier + **vitest 127/127**) / pnpm build (Turbopack clean, `/api/chat/[botId]` Dynamic 등록)

### 주요 결정 / 발견

- **Epic 1-6 진입** — Phase 1 위젯 런타임의 첫 엔드포인트. 기존 Task 1-0-a (rate limit factory) + 1-0-b (origin-check) 유틸이 **실제 endpoint 에서 첫 실증**. 추상이 실전 커버 확인.
- **Anon API 6중 보안 레이어 체크리스트** — 설계 결정으로 공식화. 향후 위젯 이외 공개 API / 웹훅 수신 등 신규 anon 엔드포인트 추가 시 반드시 통과. learnings 기록.
- **`sanitizeLoggableError` export 원칙** — 외부 SDK(Anthropic/Supabase/Upstash/Stripe/Firecrawl 등) catch 블록의 logger.error 는 반드시 이 함수 경유. Pino 필드 redact + message inline 마스킹 2중 방어선 확립.
- **max_tokens Chat 레이어 clamp** — 소유자 설정(8192)과 무관하게 엔드포인트에서 2048 강제. Phase 2 과금 모델 설계 시 재조정 예정.
- **Anthropic ContentBlock type narrowing** — SDK 의 `ContentBlock` union 에 `ThinkingBlock` 포함되어 `.text` 접근 시 타입 에러. `for` 루프로 `block.type === "text"` 분기 후 첫 text 반환 패턴 채택.

### learnings.md 추가 (+2, 총 37건)

- Anon Chat API 의 "6중 보안 레이어" 체크리스트 (설계 결정, 향후 anon 엔드포인트 템플릿)
- 외부 SDK catch 로깅은 `sanitizeLoggableError` 경유 원칙 (설계 결정, OWASP A09 방어)

### Backlog (다음 세션)

- **Task 1-6-b `/widget.js` 번들 스캐폴딩** (~90분) — 설치 스니펫 + float button + chat panel 최소 UI + Chat API 호출
- **Task 1-6-c RAG 연결** (~60분) — knowledge_chunks 벡터 검색 + top-K system 주입 (단, Task 1-7 지식 업로드 경로가 선행되어야 풀 흐름 검증 가능)
- **Task 1-6-a 보안 재리뷰 (선택)** — "신규 보안 함수 재리뷰 필수" 교훈 적용. 일괄 수정 5건 반영 후 재리뷰로 잔여 bypass 포착 가치
- **코드 미커밋 처리** — Task 1-6-a 1 커밋 (factory export 포함)
- **Phase 2 backlog** (이번 세션 리뷰에서 수용·유보):
  - Anthropic 다중 text 블록 병합 (streaming/tool-use 도입 시)
  - OPTIONS bot 조회 in-memory 캐시 (트래픽 증가 시)
  - ERROR_MESSAGES i18n
  - sandboxed iframe 지원 여부 (위젯 embed 가이드 작성 시 결정)
  - Prompt Injection 방어 (Task 1-0-c 이관, Chat API 내부 흡수 가능성)

---

## 직전 세션(2026-04-18 심야 Ⅱ) 완료 내역

### Task 1-0-a — Rate Limit 인프라 (경로 α, ~100분)

- **신규 5파일**: `factory.ts` (공통 `createMemoizedLimiter` + `checkRatelimit`) / `bot-create-limiter.ts` (하루 20개 per-user) / `factory.test.ts` (5 케이스) / `bot-create-limiter.test.ts` (2 케이스) / `vitest.stubs/server-only.ts`
- **수정**: `login-limiter.ts` factory 사용 리팩터 / `bots/new/actions.ts` rate limit 체크 삽입 (Zod → getUser → **checkBotCreateRatelimit** → DariConfig → INSERT) / `env.ts` `NODE_ENV` default 제거 (fail-fast) / `vitest.config.mts` `server-only` alias / `package.json` pretendard + server-only devDep
- **독립 리뷰 2 에이전트 병렬** (code Ship + security Fix-then-ship) → **일괄 수정 5건**:
  - A (🔴 Sec M-1): `sanitizeLoggableError` + URL/Bearer/`token=` 마스킹 — fail-open 로그 누출 차단
  - B (Code M-1): `LimiterAlgorithm` 주석 정정 (Upstash 팩토리 모두 동일 Algorithm)
  - C (Code M-3 / Sec L-1): bot-create-limiter production 경로 테스트 (key=userId 전달 검증)
  - D (🟡 Sec M-2): `env.ts` NODE_ENV required 전환 (무음 비활성화 방지)
  - E (Code M-2): 차단 시 `logger.debug({ resetIn })` observability
- 검증: pnpm check (vitest 86 → 93) / pnpm build clean / pnpm test:e2e **16/16 PASS** (회귀 0)

### Task 1-0-b — CORS allowedDomains 검증 유틸 (경로 β, ~110분 + 재리뷰)

- **신규 2파일** — `src/core/security/origin-check.ts` (normalizeOrigin / matchAllowedDomain / buildCorsHeaders) / `origin-check.test.ts` (30 케이스)
- 정책 (Plan 승인): 빈 배열 allow-all (MVP) / `*.example.com` 와일드카드 / 서브도메인 명시 필요 / https 필수(localhost/127.0.0.1/[::1] http 예외) / 풀 origin 저장 / Route Handler 헬퍼 레이어
- **독립 리뷰 2 에이전트** (code Fix-then-ship + security Fix-then-ship) → **일괄 수정 6건**:
  - A (🔴 Sec HIGH / OWASP A01): TLD 단독 와일드카드 bypass 차단 — `*.com` / `*.net` 허용되던 것을 base 점 1개 이상 강제
  - B (🟡 Code MH): trailing dot (`example.com.`) 정규화 — normalize + matchWildcard 양측
  - C (Sec M-1): T4 userinfo(@) 공격 테스트 명시
  - D: 7 신규 테스트 (TLD / trailing dot / trailing space / userinfo / idempotency)
  - E (Code M-1): `/i` 플래그 역할 주석
  - F (Sec M-2): Epic 1-6 배선 체크리스트 JSDoc (preflight/RLS/credentials 금지/wrapper/캐시)
- **security 재리뷰** (신규 보안 함수 필수 라운드) → **Ship + LOW 3 추가 반영**:
  - LOW-1: IP 스타일 base 거부 (`*.192.168` 차단, `/^\d+(\.\d+)*\.?$/`)
  - LOW-2: userinfo 테스트 주석에 "의도된 보안 동작" 명시
  - LOW-3: JSDoc 에 `Access-Control-Allow-Credentials: true` 금지 경고
- 검증: vitest 93 → 124 (+31) / build clean

### γ — 짧은 정비 번들 (γ-1 + γ-2, γ-4 생략)

- **γ-1 폰트 시스템 정비**: `pretendard` NPM 1.3.9 설치 → `pretendardvariable-dynamic-subset.css` import / DM Sans + JetBrains Mono `next/font/google` / `layout.tsx` (lang ko + metadata 교체) / `globals.css` `--font-sans` / `--font-mono` / `--font-heading` fallback chain 정확 정의 (기존 `--font-sans: var(--font-sans)` 자기참조 버그 해소)
- **γ-2 CI Node 22 → 24**: `.github/workflows/ci.yml` node-version 승격 (현 24 LTS)
- **γ-4 gitleaks 오탐 정리 생략**: 현재 오탐 0 (ci.yml 에서 placeholder 동적 생성으로 이미 회피). YAGNI 판단
- **γ-3 `NEXT_PUBLIC_SENTRY_ENVIRONMENT` 유보**: 스코프 45분 — 별도 Task 분리 제안
- 검증: pnpm build Turbopack clean (폰트 번들 OK) / vitest 124 유지
- ⚠️ **브라우저 시각 확인은 Jayden 로컬 `pnpm dev` 필요** (Auto 모드 제약)

### 검증 합산

- 이번 세션 vitest: **86 → 124 (+38)** — factory 5, bot-create-limiter 2, origin-check 30 (증감 최종값)
- 신규 8 파일 / 수정 9 파일 / devDep +2 (`pretendard`, `server-only`)
- pnpm check / pnpm build 모두 clean, E2E 16/16 (회귀 0)
- 코드 변경 **미커밋 상태**

### 주요 결정 / 발견

- **경로 α (Upstash 확장) vs B (Supabase SQL)** — PROGRESS.md backlog 에서 SQL 추천됐으나 기존 login-limiter 인프라 재사용 + Chat API 고부하 DB 리스크 + 1.5h 범위 적합성으로 **A (Upstash)** 선택. 1개 limiter 패턴으로 Chat API 등 차기 엔드포인트 확장 용이.
- **"server-only" + pnpm + vitest 3중 함정** — (1) pnpm transitive 라 resolve 실패 (2) 런타임 throw (3) next 번들러만 stub 교체. 해결: devDep 명시 + vitest alias + 빈 stub. 교훈 기록.
- **CORS 와일드카드 `*.com` bypass** — 1차 리뷰에서 포착. base 점 1개 이상 강제 + IP 대역 거부. ccSLD (`*.co.uk`) 는 PSL 필요로 MVP 범위 밖 (주석 한계 명시).
- **재리뷰 교훈 재실증** — "신규 보안 함수는 별도 리뷰 라운드 필수" (SSRF IPv6 때 정립). 1차 HIGH + 재리뷰 LOW 3건 추가 포착. 앞으로도 고수.
- **`NODE_ENV` Zod default 의 skip 분기 무음 비활성화 위험** — 보안 분기 조건 env 는 fail-fast required, UX env 만 default. 설계 원칙 공식화.
- **γ-4 gitleaks 선제 정리 YAGNI 판단** — backlog 가 있어도 실제 오탐 없으면 스킵. 템플릿 파일 생성은 과잉.

### learnings.md 추가 (+3, 총 35건)

- `server-only` vitest alias stub 패턴 (devDep + alias + stub 3중 조건)
- CORS 와일드카드 TLD 단독 bypass — base 점 개수 하한 강제 + IP 대역 거부
- `NODE_ENV` Zod default 금지 — 보안 분기 조건은 fail-fast required

### Backlog (다음 세션)

- **γ-3 `NEXT_PUBLIC_SENTRY_ENVIRONMENT`** (~45분) — 브라우저 Sentry 이벤트 preview/prod 분리. ADR-008 backlog
- **Epic 1-6 위젯 런타임** (2~3 세션) — `/widget.js` + Chat API + RAG + `withAllowedOrigin` wrapper 배선. allowedDomains 허용 → 빈 배열 정책 재평가 시점
- **코드 커밋** — 이번 세션 9 수정 + 8 신규 파일. 1 커밋 (Task 1-0-a/b + γ 묶음) 또는 3 커밋 분할
- **Task 1-0-b 후속**:
  - schema.ts `allowedDomains` 포맷 검증 (`z.string().regex(...)`) — Phase 2 편집 UI 배포 시점
  - Route Handler wrapper `withAllowedOrigin(handler)` — Epic 1-6 배선 시
  - ccSLD 완전 차단 PSL 라이브러리(`tldts`) — Phase 2
- **Task 1-0-a 후속**:
  - rate limit `reset` UX (차단 시 남은 시간 안내) — Phase 2
  - DariConfig/INSERT 실패 후 카운터 복구 (LOW, 현재 허용 트레이드오프)
  - i18n 에러 메시지 분리
- **미소화 리뷰 backlog** (1-5-c/d): generateMetadata 동적 title / error.tsx Sentry digest-only / Optimistic locking / Collapse value reset UX
- **docs/environments.md** — "NODE_ENV 는 플랫폼 주입 필수" 체크리스트 추가 (설계 결정 반영)

---

## 직전 세션(2026-04-18 심야) 완료 내역

### Task 1-5-d — /bots/[slug]/edit 편집 폼 (Epic 1-5 완결)

- **신규 13파일** (src 12 + e2e 1):
  - `actions.ts` — Server Action updateBot (3중 방어 + RLS UPDATE + knowledge.sources/allowedDomains 보존)
  - `page.tsx` / `loading.tsx` / `error.tsx` — 1-5-c 와 동일 패턴 (slug 선검증 + getUser + maybeSingle + 에러 메시지 일반화)
  - `edit-bot-form.tsx` — sticky section nav + 6 SectionCard (controlled state)
  - `field.tsx` — 공통 Field + inputClass/textareaClass/selectClass
  - `identity / ai / behavior / appearance / analytics-section.tsx` — 5섹션 sub-components
  - `knowledge-placeholder.tsx` — Phase 2 자리표시 (sourceCount 표시)
  - `tests/e2e/bot-edit.spec.ts` — 4 spec (비로그인 / 본인 편집 / 타인 RLS / 잘못된 업무시간 입력 유지)

### 리뷰 1차 반영 (7건)

| 등급     | 항목                        | 변경                                                             |
| -------- | --------------------------- | ---------------------------------------------------------------- |
| code H-1 | allowedDomains 묵시 초기화  | actions.ts 에서 `preservedAllowedDomains` 보존                   |
| sec M-1  | webhookUrl SSRF             | schema.ts `.refine(isSafeExternalWebhook)` (https/사설대역 차단) |
| sec M-3  | Sentry 에 DB 에러 원문 누출 | page.tsx `throw new Error("봇 편집 조회 실패")` 일반화           |
| sec L-1  | fontFamily CSS injection    | max(100) + regex `/^[\w\s,'-]+$/`                                |
| sec L-2  | timezone IANA 미검증        | regex `/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/`                |
| sec L-3  | handoff.trigger 길이        | max(200)                                                         |
| code M-2 | SectionHeader dead code     | field.tsx 삭제                                                   |

### 재리뷰 CRITICAL — IPv6 SSRF 우회 즉시 차단

- code + security 두 에이전트 모두 지목
- 1차 `isSafeExternalWebhook` 은 IPv4 점표기만 검사 → IPv6 사설 대역 (`fc00::/7`, `fe80::/10`) + IPv4-mapped IPv6 (`::ffff:10.0.0.1`) 통과 가능
- Node.js `new URL("https://[::1]/").hostname` = `::1` vs `[::1]` 환경별 일관성 X → 브라켓 정규화 추가
- 강화: `isPrivateIPv4` + `isPrivateIPv6` 분리, IPv4-mapped 파싱으로 우회 경로 차단
- **회귀 방지 단위 테스트 +8** (정상 https / http거부 / IPv4 8종 / IPv6 8종 / 정상 공인 IPv6 / undefined / timezone IANA / timezone 비정상)
- DNS rebinding 은 fetch 시점 dns.lookup 재검증 필요 — Phase 2 백로그 명시

### Task 0-D-6 — proxy redirect cookie 전파

- 증상: `NextResponse.redirect(url)` 은 빈 cookies — `updateSession` 이 refresh 한 JWT 쿠키가 클라이언트에 전달되지 않아 다음 요청 race
- 수정: `redirectWithRefreshedCookies(url, response)` helper 추가, response.cookies.getAll() 을 redirect response 에 복제 (옵션/만료일 포함)
- 두 redirect 분기 (로그인/비로그인) 모두 적용

### types.ts 근본 수정

- `__InternalSupabase: { PostgrestVersion: "12" }` 슬롯 + 4 테이블 `Relationships: []`
- PostgrestVersion="12" 선택: postgrest-js feature-flags 의 v13+ 전용 기능 (SpreadOnMany/MaxAffected) 미사용 — 12 가 가장 보수적
- `.returns<T[]>()` 4곳 제거 (bots/page.tsx, [slug]/page.tsx, edit/page.tsx, edit/actions.ts)
- `as never` 2곳 제거 (bots/new/actions.ts, edit/actions.ts)

### 검증 결과

- `pnpm check`: tsc + eslint + prettier + **86/86 vitest** (78 → 86, +8 신규)
- `pnpm build`: Turbopack clean, `/bots/[slug]/edit` Dynamic 등록
- `pnpm test:e2e --workers=1`: **16/16 PASS** (smoke 1 + bots-list 4 + bot-create 3 + bot-detail 4 + **bot-edit 4**)

### learnings.md 추가 (+5, 총 32건)

- Zod 4.x `.default()` 는 undefined 입력에 정상 적용 (허위 양성 H-2 사건)
- Phase 보안 위협을 schema 레이어에 선제 차단 (DariConfig 단일 진실 공급원)
- Node.js URL hostname IPv6 브라켓 일관성 + IPv4-mapped 우회 (SSRF 재리뷰 CRITICAL)
- `__InternalSupabase.PostgrestVersion` 슬롯 = supabase-js 타입 추론 활성화 열쇠
- Next.js 16 proxy 의 `NextResponse.redirect()` 는 빈 cookies — refreshed 세션 쿠키 수동 전파 필수

### Backlog (다음 세션)

- **Task 1-0-a Rate Limit 인프라** (~1.5h) — Supabase SQL 기반 추천 (외부 의존 0, MVP 적합)
- **Task 1-0-b CORS + allowedDomains 검증 미들웨어** (~45분) — Epic 1-6 위젯 직전
- **Task 1-0-c Prompt Injection 방어** → Epic 1-6 (Chat API) 로 이관 확정
- **Epic 1-6 위젯 런타임** (2~3 세션) — `/widget.js` + Chat API + RAG
- **봇 관리 보조** — 삭제 UI / status 토글 / slug 변경 UI
- **리뷰 미소화** (선택):
  - `generateMetadata` 동적 title (1-5-c code M-1)
  - error.tsx Sentry digest-only 전송 (1-5-c sec M-1)
  - 동시 편집 Optimistic locking (1-5-d sec M-2, 다인 운영 진입 시)
  - Collapse 시 값 reset UX (1-5-d code M-4)
- **Phase 2 전 schema 강화**: DNS rebinding fetch 시점 검증 / 비십진 IPv4 정규화
- **인프라**: CI Node 24 / gitleaks 오탐 / Pretendard·DM Sans 전역

---

## 직전 세션(2026-04-18 밤) 완료 내역

### Task 1-5-c — /bots/[slug] 상세 페이지 (Phase 1 사용자 흐름 닫기)

- **신규 파일 6건**:
  - `src/app/bots/[slug]/page.tsx` — Server Component (3중 방어 + DariConfig safeParse + 위젯 스니펫 생성)
  - `src/app/bots/[slug]/copy-snippet.tsx` — Client Component (clipboard + copyState idle/copied/failed + sr-only live region)
  - `src/app/bots/[slug]/not-found.tsx` — 404 (디자인 시스템 v2)
  - `src/app/bots/[slug]/loading.tsx` — Suspense skeleton
  - `src/app/bots/[slug]/error.tsx` — Error boundary + Sentry capture
  - `tests/e2e/bot-detail.spec.ts` — Playwright 4 spec (비로그인 / 본인 봇 / 타인 봇 RLS / 없는 slug)
- **3중 방어 실증**: proxy(Task 0-D-1) + page `getUser()` + RLS `bots_select_owner`. 타인 봇 slug 접근 시 RLS 0-row → `notFound()` → 일반 not-found 렌더 (enumeration 방어)
- **`maybeSingle()` + `.returns<BotDetail[]>()`** 조합: 타인/없는 slug 를 동일 코드 경로로 처리 (`.single()` 의 PGRST116 에러 분기 회피)
- **slug 형식 선검증**: `isValidSlug(slug)` 통과 못하면 DB 왕복 없이 즉시 404 (security L-2)
- **독립 리뷰 2 에이전트 병렬** (code + security):
  - 반영 5건: copy 실패 UX (code H-1) + `aria-live` 별도 region (code M-2) + not-found 문구 (sec M-2) + E2E teardown `Promise.allSettled` (sec M-3) + loading 두 번째 skeleton aria-label (code L-3)
  - **롤백 1건**: `sensitiveFields.ts` userId redact 추가 (sec H-1) — logger/beforeSend 테스트 2건 충돌 + UUID 는 OWASP Logging 권장 식별자. 근거 주석 명시
- 검증: `pnpm check` (tsc + eslint + prettier + **78/78 vitest**) / `pnpm build` (Turbopack, `/bots/[slug]` Dynamic 등록) / `pnpm test:e2e --workers=1` **12/12 PASS** (smoke 1 + bots-list 4 + bot-create 3 + bot-detail 4)

### Backlog 1건 — PageBackground 컴포넌트 추출 (도트 패턴 10→1 DRY)

- **신규**: `src/components/ui/page-background.tsx` (`intensity`: "subtle"/"medium" 2 변형)
- **수정 10 파일**: 홈 + 로그인 + `/bots` + `/bots/new` + `/bots/[slug]` 하위 5 → 각 파일 도트 블록 8줄 → `<PageBackground />` 1줄 + import
- `grep "radial-gradient(circle, #dde0e4"` 로 **10곳 → 1곳** (`page-background.tsx` 만) 확인
- 블롭(큰 원형 그라디언트)은 페이지별 위치·개수·opacity 가 달라 일반화 부적합 — 각 페이지 inline 유지
- code-reviewer M-3 "별도 리팩토링 Task 권장" 을 같은 세션에서 즉시 소화. 순 라인 -33 + 향후 새 페이지 배경 복제 0

### 주요 결정 / 발견

- **notFound() Turbopack dev 모드 200 응답** — Playwright 의 `response.status()` 체크가 dev 에서 404 예상이었으나 200 수신. 프로덕션 빌드는 404 정상. E2E 는 콘텐츠(heading "봇을 찾을 수 없어요") 로 판정으로 교체
- **리뷰 제안 ≠ 기계적 반영** — security H-1 (userId redact) 수정 시 기존 테스트 2건 실패. UUID 는 요청 상관분석 키이자 OWASP Logging 권장 필드. 롤백 + 근거 주석이 올바른 판정
- **Next.js 16.2 `params: Promise<{ slug }>`** 패턴 — async params, `await params` 필수
- **`maybeSingle() + .returns<T[]>()`** — `single()` 의 PGRST116 에러 분기 없이 단일 null-check 로 분기 단순화

### learnings.md 추가 (+2, 총 27건)

- Next.js App Router notFound() Turbopack dev 모드 200 응답 (기술 이슈)
- sensitiveFields redact 대상은 직접 PII 만 — UUID 식별자 예외 (설계 결정)

### Backlog (다음 세션 또는 별도 Task)

- **Task 1-5-d**: 봇 편집 폼 — DariConfig 6섹션 UI (Identity/AI/Knowledge/Behavior/Appearance/Analytics). Phase 1 Epic 1-5 마지막
- **Task 0-D-6**: proxy cookie 전파 (여전히 open)
- **types.ts 근본**: `__InternalSupabase.PostgrestVersion` 슬롯 추가 → `as never` / `.returns<T[]>()` 제거
- **리뷰 Backlog 미소화**:
  - `generateMetadata` 동적 title (code M-1)
  - `error.tsx` Sentry digest-only 전송 (sec M-1)
  - `WIDGET_URL` → `env.NEXT_PUBLIC_WIDGET_URL` (Phase 2 위젯 런타임 배포 시점)
  - E2E `waitForURL` 타임아웃 10→7초 (flaky 마진 재검토)

---

## 지난 세션(2026-04-18 저녁) 완료 내역

### Task 1-5-b — /bots/new 봇 생성 폼 (RLS INSERT 정책 첫 실증)

- **신규 파일 6건** (src 5 + tests/e2e 1):
  - `src/app/bots/new/slug-util.ts` — slugify + isValidSlug + SLUG_PATTERN/MIN/MAX 단일 진실 공급원 (bots 테이블 CHECK + DariConfig.botId 와 동일 정규식)
  - `src/app/bots/new/slug-util.test.ts` — Vitest 11 케이스 (영문/특수문자/한글 빈문자열/64자 경계/패턴 검증)
  - `src/app/bots/new/actions.ts` — `createBot` Server Action (Zod → `getUser()` → DariConfig.parse → `bots.insert` → redirect)
  - `src/app/bots/new/create-bot-form.tsx` — Client Component (`useActionState` + `useFormStatus` + controlled 4필드)
  - `src/app/bots/new/page.tsx` — Server Component (`getUser` 2중 방어 + 디자인 시스템 v2)
  - `tests/e2e/bot-create.spec.ts` — Playwright 3 spec (비로그인 / 성공 플로우 / slug 중복 충돌)
- **3중 방어**: proxy + page `getUser()` + Action `getUser()` + RLS INSERT `WITH CHECK owner_id = auth.uid()`
- **owner_id 서버 주입**: FormData 에서 읽지 않음 → 클라이언트 조작 불가. 앱 레이어가 뚫려도 RLS 가 2차 차단
- **DariConfig 구성**: 최소 4필드 (name/slug/welcomeMessage/systemPrompt) 만 사용자 입력, 나머지 60+ 필드는 Zod default 자동 채움
- **독립 리뷰 2 에이전트 병렬** (code + security):
  - code: Fix then ship → MEDIUM 3건 + LOW 1건 반영
    - welcomeMessage/systemPrompt `defaultValue` → controlled `useState` 전환 (에러 복구 시 입력 손실 방지)
    - `bots.slug` ↔ `config.botId` 이중 저장 유지보수 주석
    - `SLUG_MIN_LENGTH` ↔ `SLUG_PATTERN` 동기화 주석
    - `let config: DariConfig` 타입 annotation
  - security: Ship as-is → CRITICAL/HIGH 0. MEDIUM 4건은 명시적 backlog
- 검증: `pnpm check` (tsc + eslint + prettier + **78/78 vitest**) / `pnpm build` (Turbopack, `/bots/new` Dynamic 등록) / `pnpm test:e2e --workers=1` **8/8 PASS** (smoke 1 + bots-list 4 + bot-create 3)

### 주요 결정 / 발견

- **Phase 1 진입** — Phase 0 완결 후 봇 CRUD 첫 기능. RLS 정책 (Task 0-D-2) 이 실제 INSERT 를 허용함을 E2E 로 실증
- **supabase-js INSERT 도 `as never` 회피 필요** — SELECT `.returns<T[]>()` 와 동일 근본 원인 (Database 타입 `__InternalSupabase.PostgrestVersion` 슬롯 부재). `BotInsert` 타입 annotation 으로 의도 보존 후 assertion
- **React 19 `react-hooks/set-state-in-effect`** — useEffect 내 setState 금지. 파생 상태 (name → slug) 는 이벤트 핸들러에서 동기화 (`handleNameChange` 패턴)
- **폼 UX 패턴** — 모든 input controlled (useState 4개) → 서버 에러 반환 시 사용자 입력 유지. `defaultValue` 는 uncontrolled 되어 재렌더 시 리셋 위험

### learnings.md 추가 (+2, 총 25건)

- supabase-js INSERT 도 타입 추론 한계로 `as never` 회피 (기술 이슈)
- React 19 — 파생 상태는 이벤트 핸들러에서 동기화, useEffect 금지 (기술 이슈)

### Backlog (다음 세션 또는 별도 Task)

- **Task 1-5-c**: `/bots/:slug` 상세 페이지 — 봇 정보 표시 + 편집 진입점 + 위젯 설치 코드 (Phase 1 후반)
- **Task 1-5-d**: 봇 편집 폼 — DariConfig 6섹션 UI (Identity/AI/Knowledge/Behavior/Appearance/Analytics)
- **Task 0-D-6**: proxy redirect 시 `updateSession` 쿠키 전파 + E2E worker 격리 (병렬 E2E flaky 해소)
- **types.ts 근본 수정**: Database 타입에 `__InternalSupabase.PostgrestVersion` 슬롯 추가 → `as never` 제거 (자동 생성 파이프라인 논의 병행)
- **Task 1-0 재평가**: `systemPrompt` prompt injection 완화 (Phase 1 위젯 구현 시점)
- **인증 사용자 봇 생성 상한**: per-user 50개 or rate limit (DoS 방어)
- **slug 변경 UI 시점**: `config.botId` 동기화 로직 + 위젯 설치 ID 마이그레이션
- **폰트 Pretendard/DM Sans 전역 교체** / CI Node 24 전환 / NEXT_PUBLIC_SENTRY_ENVIRONMENT 도입 / gitleaks 오탐 선제 정리

---

## 이전 세션(2026-04-18 오후) 완료 내역

### 커밋 3건

- `93df558` feat(auth): 로그인 폼 rate limit — IP 기반 10회/15분 (Task 0-D-4)
- `939b56a` feat(auth): 비밀번호 최소 길이 6→8자 상향 (Task 0-D-5)
- `94c5e62` chore(security): gitleaks pre-commit hook (Husky v9)

### Task 0-D-4 — 로그인 폼 rate limit (IP 기반 10회/15분)

- `src/core/ratelimit/{redis-client,login-limiter}.ts` 신규 — Upstash slidingWindow 팩토리
- `signInWithPassword` 흐름: Zod 파싱 → rate limit → Supabase 인증 (잘못된 입력은 카운터 소모 안 함)
- `NODE_ENV !== "production"` 이면 skip — 로컬/E2E 에서 `"unknown"` IP 버킷 공유로 인한 자가 차단 방지
- fail-open catch 에 `logger.error` → Sentry bridge 로 장애 자동 캡처
- 에러 코드 `too_many_attempts` 신규 (`invalid_credentials` 와 분리, UX 우선)
- 독립 리뷰 병렬 (code + security) → 양쪽 Fix then ship. 3건 반영 (pre-check 순서 / union 단순화 / catch 로깅)

### Task 0-D-5 — 비밀번호 최소 길이 6→8자 (OWASP 2025 + 🟡 PII 기준)

- Zod `min(6)` → `min(8)` + 주석 (Supabase Dashboard 동기화 필요 명시)
- UI 3곳 동기화: `minLength={8}` / placeholder "8자 이상" / error message "8자 이상"
- E2E fixtures 주석 갱신 (실 계정 비번 18자라 영향 없음)
- 리뷰 생략 (변경 규모 작음 + positive security change)
- **Jayden 수동 작업 미완**: Supabase Dashboard → Auth → Password Settings → Minimum Length 8

### gitleaks pre-commit hook (Husky v9)

- `pnpm add -D husky@9.1.7` + `husky init` → `.husky/` 세팅, `package.json.scripts.prepare="husky"` 자동 추가
- `.husky/pre-commit`: gitleaks graceful 스크립트 (`--staged --redact`, 미설치 시 exit 0)
- 3중 안전망 완성: 글로벌 hook + CI gitleaks-action + 프로젝트 로컬 hook
- 타인 clone 시 `pnpm install` 만으로 자동 활성화
- 실동작 검증: 이 변경 커밋 자체가 `1.15 KB scanned in 24ms → no leaks found`

### 검증

- `pnpm check` (typecheck + lint + format + vitest) **67/67 PASS** (3회 반복)
- `pnpm build` (Turbopack) **PASS**
- `pnpm test:e2e --workers=1` **5/5 PASS** (3회 반복)
- 병렬 E2E 는 **사전 버그로 flaky** (Task 0-D-6 로 분리)

### 주요 결정 / 발견

- **rate limit 로컬/E2E 자가 차단 회피 패턴** — `NODE_ENV !== "production"` skip. Plan 승인 이후 E2E 실패로 발견, 실행 직전 재평가로 반영. Plan 의 fail-open 철학 확장
- **pre-check 순서** — Zod 파싱이 rate limit 보다 먼저. 정상 사용자가 오타로 반복 제출해도 카운터가 깎이지 않게
- **fail-open + Sentry 알림** — Redis 장애 무음 실패 방지. `logger.error` 1줄이 운영 가시성 핵심
- **Husky v9 graceful 전략** — gitleaks 미설치 환경 (온보딩) 은 exit 0. CI 가 백업 레이어
- **proxy redirect cookie 유실 (사전 버그)** — `NextResponse.redirect(url)` 반환 시 `updateSession` 가 세팅한 response.cookies 복사 누락. 병렬 E2E flaky 원인. Task 0-D-6 로 분리

### learnings.md 추가 (+2, 총 23건)

- 외부 의존 보안 레이어의 로컬/E2E fallback 은 설계 단계에서 정의 (설계 결정)
- proxy redirect 시 updateSession 세션 쿠키 유실 (기술 이슈)

### Backlog (다음 세션 또는 별도 Task)

- **Task 1-5-b**: 봇 생성 폼 (/bots 빈 상태 CTA 연결) — Server Action + Zod + slug 생성 정책
- **Task 0-D-6**: proxy redirect 시 `updateSession` 쿠키 전파 + E2E worker 격리 (MAIN_TEST_USER 병렬 race 해소)
- Security MED-2 (unknown 버킷 DoS) — Vercel 아닌 플랫폼 이동 시 재평가
- IP 로그 정책 문서화 (개인정보 처리방침)
- `email_confirm: true` 셀프서비스 전환 시 제거 TODO

---

## 이번 세션(2026-04-18 낮) 완료 내역

### Task INFRA-1 — Playwright 로컬 인프라

- `@playwright/test` 1.59 + `dotenv` 17.4 devDep + Chromium 바이너리
- `playwright.config.ts`: baseURL 4000 / globalSetup·Teardown / webServer reuseExistingServer / trace·video retain-on-failure
- `tests/e2e/package.json` `{"type": "module"}` — 서브스코프 ESM 격리 (루트 tsconfig 무관, Playwright ESM/CJS 판정 해소)
- `tests/e2e/support/test-accounts.ts` — Supabase admin client (`Authorization: Bearer <service_role>` 명시) + `createTestUser` / `deleteTestUser` / `deleteTestUserByEmail`
- `tests/e2e/global-setup.ts` / `global-teardown.ts` — 테스트 계정 `e2e-main@dari.test` lifecycle + state 파일 + self-heal
- `tests/e2e/support/auth-helpers.ts` — `loginWithPassword` / `logout` 헬퍼
- `tests/e2e/smoke.spec.ts` — 인프라 검증 1건
- `pnpm test:e2e` / `pnpm test:e2e:ui` scripts

### Task 0-D-3 — id/pw 로그인 폼 (관리자 초대 모델)

- `src/app/login/actions.ts`: `signInWithPassword` Server Action (Zod `email()`+`min(6)` + `isSafeNextPath` 재사용)
- `src/app/login/page.tsx`: 폼 + "또는" 구분선 + 기존 Google 버튼 병행, `data-testid` 5종
- 에러 메시지 enumeration 방지 — `invalid_credentials` 단일 코드로 일반화
- `email` PII 는 기존 0-E-5 redact 정책에 이미 포함 → 로거에서 자동 `*REDACTED*`

### Task 1-5-a-E2E — /bots 빈 상태 E2E 스펙

- `tests/e2e/bots-list.spec.ts`: 4 spec
  1. 비로그인 접근 → `/login?next=%2Fbots` 리디렉트
  2. 로그인 후 /bots → 빈 상태 + 새 봇 만들기 CTA
  3. 로그아웃 → /login 복귀
  4. 로그인 상태 /login 재접근 → 홈 리디렉트 (재로그인 화면 숨김)
- 전체 E2E: **5/5 PASS** (smoke 1 + bots-list 4)

### Task 1-5-a 본체 — /bots 목록 페이지 (구현)

- `src/app/bots/page.tsx` — Server Component, RLS 자동 적용 `.returns<BotListItem[]>()` 타입 annotation
- `src/app/bots/loading.tsx` — Skeleton 3건
- `src/app/bots/error.tsx` — Sentry.captureException + 재시도 버튼
- 디자인 시스템 v2 9/10 충족 (2레이어 그림자 / 도트 / 자간 / 순차 등장 / 호버 / 상태 배지 / CTA 화살표 / sm·lg 반응형)

### 검증

- pnpm check (typecheck + lint + format + vitest 67/67) PASS
- pnpm build (7/7 static + /bots Dynamic 등록) PASS
- Playwright 5/5 PASS
- 독립 리뷰 2 에이전트 병렬 → 양쪽 **Fix then ship**; CRITICAL "email 로그 노출 우려" 는 redact 정책에 이미 포함되어 실제로는 해소, 주석 보강만 적용

### 주요 결정 / 발견

- **관리자 초대 모델 확정** — 회원가입 없음. Phase 3 까지 유지. 셀프가입은 별도 Task 로 분리.
- **Google OAuth 유지 + id/pw 병행** — OAuth 기투자 보존 + E2E 자동화 표준 폼 확보. 경로 B 선택.
- **SUPABASE_SERVICE_ROLE_KEY 가 실은 anon 이었음** — JWT role claim 디코드로 즉시 발견. Jayden 이 Dashboard 에서 실 service_role 로 교체.
- **`.returns<T[]>()` 패턴 채택** — supabase-js select literal 복잡도 한계 우회. 2개 이상 컬럼 + 체인 쿼리에서 기본 패턴.

### learnings.md 추가 (+3, 총 21건)

- supabase-js select 문자열 literal 파싱 실패 — `.returns<T[]>()` 회피 (기술 이슈)
- Playwright ESM 스코프 격리 — `tests/e2e/package.json` (기술 이슈)
- Supabase admin API Authorization 헤더 명시 필요 (기술 이슈)

### Backlog (다음 세션 또는 별도 Task)

- **Task 0-D-4**: `signInWithPassword` 에 Upstash ratelimit IP 기반 (10회/15분) 적용 — 이미 `@upstash/ratelimit` 설치됨
- **Task 0-D-5**: 비밀번호 최소 길이 6 → 8자 (OWASP 2025 권장). Zod + `page.tsx` + Supabase 정책 3곳 동기화
- **gitleaks pre-commit hook 설치** — sec-reviewer 재지적
- **`email_confirm: true` 셀프서비스 전환 시 제거 TODO** — ADR 또는 주석 권장

## 이전 세션(2026-04-18 오전) 완료 내역

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

**경로 α (권장): Task 1-6-b — `/widget.js` 번들 스캐پ딩**

- 설치 스니펫 `<script src="https://dari.example.com/widget.js" data-bot-id="slug"></script>`
- float button + chat panel 최소 UI + conversationId localStorage
- Task 1-6-a Chat API 첫 호출 실증 → CORS 종단간 검증
- 번들러 결정 포인트: Next.js Route `/widget.js` vs 별도 esbuild 빌드
- 소요: Plan 20m + 구현 90m

**경로 β: Task 1-6-c — RAG 연결**

- knowledge_chunks 벡터 검색 + top-K 임베딩 유사도 (pgvector)
- Chat API `messages.create({ system: systemPrompt + context, ... })`
- 선제 요건: **Task 1-7 지식 업로드 경로가 있어야 실데이터 검증 가능** → 지식 업로드 먼저 고려 가능
- 소요: 60m (단독) / 150m (지식 업로드 포함)

**경로 γ: Task 1-6-a 보안 재리뷰 + 미커밋 커밋**

- 신규 보안 함수 재리뷰 교훈 적용 (SSRF IPv6 / CORS TLD 선례)
- 일괄 수정 5건 후 잔여 bypass 포착
- 커밋 1건 분할 (Task 1-6-a)
- 소요: 30~45m

### 그 외 대기

- **docs/environments.md** — "NODE_ENV 플랫폼 주입 필수" 체크리스트 (이번 세션 설계 결정 반영)
- **Task 1-0 재평가**: systemPrompt prompt injection 완화 (Epic 1-6 위젯 구현 시점)
- **slug 변경 UI 시점**: `config.botId` 동기화 + 위젯 설치 ID 마이그레이션
- **conversations/messages 로그인 방문자 정책 확장**: Phase 1 위젯 로그인 지원 시
- **`proxy-client.ts` ESLint no-restricted-imports**: proxy 외 import 강제 차단 (~15m)
- **Task 1-0-b 후속** (Epic 1-6 시점): Route Handler wrapper `withAllowedOrigin` + schema allowedDomains 포맷 검증 + ccSLD PSL 차단
- **Task 1-0-a 후속**: rate limit reset UX 노출 / DariConfig 실패 카운터 복구 / i18n

## 차단 요소

**없음** — Task 1-0-a/b + γ(1-2) 완결, 이번 세션 변경 미커밋. 경로 α/β/γ 자유 선택.

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
- [x] **Task 1-5-b: /bots/new 봇 생성 폼 (Phase 1 첫 기능) — Server Action + DariConfig default 활용 + 3중 방어 + 독립 리뷰 2 에이전트 (MEDIUM 3+LOW 1 반영) + E2E 3 spec (RLS INSERT 실증)**
- [x] **Task 1-0-a: Rate Limit 인프라 — Upstash factory 공통화 + 봇 생성 per-user 20/day + 독립 리뷰 2 (Fix-then-ship, 일괄 5건) + sanitizeLoggableError + env.NODE_ENV fail-fast**
- [x] **Task 1-0-b: CORS allowedDomains 검증 유틸 — normalize/match/cors 3함수 + 재리뷰 HIGH+MH+LOW 9건 일괄 반영 + 30 테스트 (TLD/IP/userinfo/trailing dot/IDN)**
- [x] **γ 정비(1·2): Pretendard variable + DM Sans + JetBrains Mono + CI Node 24 승격**
- [x] **Task 1-6-a: 위젯 Chat API 최소 구현 (Epic 1-6 진입) — anon `/api/chat/[botId]` POST + OPTIONS + Anthropic SDK 싱글턴 + bot-chat-limiter 봇당 IP 100/h + 6중 보안 레이어 + 독립 리뷰 2 + 일괄 5건 반영 (sanitize / 메시지 상한 200 / max_tokens clamp 2048 / warn 로깅 / null origin 문서화)**

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
- **2026-04-18 (낮): Task INFRA-1 + 0-D-3 + 1-5-a — Playwright 로컬 인프라 + id/pw 로그인 폼 + /bots 목록 페이지 + 교훈 3건**
- **2026-04-18 (오후): Task 0-D-4 + 0-D-5 + gitleaks hook — 로그인 rate limit + 비번 8자 + Husky v9 pre-commit + 교훈 2건**
- **2026-04-18 (저녁): Task 1-5-b — /bots/new 봇 생성 폼 + RLS INSERT 정책 첫 실증 + 독립 리뷰 2 (code Fix then ship + security Ship as-is) + 교훈 2건 (supabase-js insert as never / React 19 useEffect 금지) — Phase 1 진입**
- **2026-04-18 (심야 Ⅱ): Task 1-0-a Rate Limit + Task 1-0-b CORS 유틸 + γ 정비(폰트/CI24) — vitest +38 (93 → 124) / 독립 리뷰 3회 + 재리뷰 1회 / 교훈 3건 (server-only vitest alias / CORS TLD bypass / NODE_ENV Zod default) — 3 커밋 완료**
- **2026-04-18 (심야 Ⅲ): Task 1-6-a 위젯 Chat API 최소 (Epic 1-6 진입) — anon `/api/chat/[botId]` + 6중 보안 레이어 + Anthropic SDK + bot-chat-limiter / vitest 124 → 127 (+3) / 독립 리뷰 2 + 일괄 5건 반영 / 교훈 2건 (anon 6중 레이어 / 외부 SDK sanitize 원칙) — 코드 미커밋**

## 마지막 업데이트

- 날짜: 2026-04-18 심야 Ⅲ (Task 1-6-a 완료, Epic 1-6 위젯 런타임 1/4)
- 작성자: Jayden + Claude (Opus 4.7, effort=max)
