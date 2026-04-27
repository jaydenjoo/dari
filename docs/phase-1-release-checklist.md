# Phase 1 출시 준비 체크리스트 (Stage 1 진입용)

> **역할**: Phase 1 MVP 완결 시점에 Stage 1(실사용자 첫 오픈) 진입 전 반드시 확인할 항목 통합 체크리스트.
> **작성**: 2026-04-20 (Task 1-8-e 직후)
> **대상 버전**: v0.1.0
> **관련 문서**: [environments.md](./environments.md), [env-template.md](./env-template.md), [PRD.md](./PRD.md), [adr/](./adr/)

---

## 1. 현재 상태 스냅샷

| 영역               | 상태                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Epic 진행**      | Phase 1 완결 + Phase 2 Epic A Task A-1~A-5a 완결 + A-5b-① 데모 모드 검증 완결 ✅ (2026-04-25 Ⅱ)                                                                |
| **테스트 통과**    | vitest **491/491** + Playwright prod chat smoke 2/2 (dairect + dari)                                                                                           |
| **타입/린트/포맷** | typecheck 0 errors / lint 3 baseline warnings / prettier clean                                                                                                 |
| **빌드**           | 14 routes 녹색 (Turbopack + Sentry 10.49 호환, Vercel prod 재배포 확인)                                                                                        |
| **마이그레이션**   | 0001~0015 (15개) — prod `dari` 반영 완료 (`enable_pgvector` 마이그 prod 자동 생성 1건 포함)                                                                    |
| **CI**             | GitHub Actions `verify` + `secret-scan` + `e2e` + **`external-api-smoke` (주 1회 cron)** — CI 녹색 유지                                                        |
| **호스팅**         | ✅ **Vercel prod 운영 중** — `dari-theta.vercel.app` (ADR-009 γ 경로 기본 호스트)                                                                              |
| **도메인**         | `dairect.kr` — **별개 프로젝트** (`jaydenjoo/dairect` 리포). Dari 는 `dari-theta.vercel.app` 유지                                                              |
| **Supabase prod**  | ✅ **`dari` 운영 중** (pxdopzlaffjcxqfrqidq, ap-northeast-2). 활성 봇 2개 (dairect + dari, 데모 모드)                                                          |
| **Google OAuth**   | ✅ **prod 실 로그인 성공** — Supabase Authentication URL Configuration 등록 후 (2026-04-21 Ⅲ)                                                                  |
| **Vercel env**     | ✅ `NEXT_PUBLIC_WIDGET_CDN_URL` Production + Preview 명시 등록 (2026-04-21 Ⅲ, ADR-009 §9-1 γ)                                                                  |
| **dev/prod 분리**  | ⚠️ **보류 결정 (2026-04-25 Ⅱ)** — 봇 2개 데모 단계라 시간/비용 trade-off. 계약 진입 시 재진행 (트리거 조건 4종은 [environments.md §2](./environments.md) 참조) |
| **외부 API smoke** | ✅ **주 1회 cron 작동** — `external-api-smoke.yml` (Anthropic + Gemini + RAG silent failure 조기 감지)                                                         |

---

## 2. 테스트 커버리지 현황 분석

`pnpm test:coverage` 결과 (2026-04-20 기준):

| 메트릭     | 수치   | 비고                      |
| ---------- | ------ | ------------------------- |
| Statements | 52.01% | 글로벌 규칙 권장 80% 미달 |
| Branches   | 51.79% |                           |
| Functions  | 58.7%  |                           |
| Lines      | 50.17% |                           |

### 2-1. 영역별 커버리지 해석

**✅ 핵심 로직 우수**:

- `core/knowledge/` — **98.75%** (RAG 파이프라인 — embedding/ingest/retrieval/file/url)
- `core/observability/` — 93.84% (redactDeep + health check)
- `core/security/` — 93.84% (origin-check)
- `core/logging/logger.ts` — 94.11% Lines (branches 59.45% — 에러 분기 일부 미커버)

**🟡 수용 범위 (외부 의존/Phase 2 대기)**:

- `src/widget/*` — 42.59% (widget.ts 4.39%) — **Phase 2 배포 예정 런타임**. MVP 에서는 Jayden 수동 QA 로 대응. Stage 1 출시 이후 테스트 우선순위 상승.
- `src/lib/clients/firecrawl.ts` — 0% — 실 네트워크 호출 래퍼. 단위 테스트 보다 integration 영역.
- `src/core/ratelimit/login-limiter.ts` — 0% — Upstash Redis 실호출 의존. rate limit 효력은 프로덕션 수동 검증으로 커버.
- `src/shared/config/env.ts` — 42.1% — 부팅 시 Zod 검증 전용. 성공 경로는 앱 구동 자체가 증명, 실패 경로는 의도적으로 throw.

**⚠️ 개선 우선순위** (Stage 1 이후 Phase 2 초반):

1. `core/logging/logger.ts` branches 59.45% — redact 엣지 케이스 (Date/RegExp/Map/Set 가드) 일부 미커버. 보안 영향.
2. `core/ratelimit/login-limiter.ts` — mock Redis 어댑터로 단위 테스트 추가.
3. `src/widget/widget.ts` — Phase 2 위젯 배포 전 필수 테스트 (현재 4.39%).

> **Stage 1 진입 판정**: 핵심 RAG·보안·로깅 모듈은 90%+ 커버 — 출시 블로커 아님. 전체 52% 는 widget(Phase 2) + 외부 의존 클라이언트 때문에 pulling 된 결과.

### 2-2. 커버리지 명령

```bash
pnpm test:coverage              # HTML + 콘솔 요약
open coverage/index.html        # 브라우저로 상세 보기 (macOS)
```

---

## 3. CI 파이프라인 점검 결과

### 3-1. 현재 구성 (`.github/workflows/ci.yml`)

```
jobs:
  verify (15분)
    ├─ Checkout
    ├─ Setup Node 24 LTS (cache: npm)
    ├─ Install: npm ci
    ├─ Typecheck → Lint → Format check → Test
    ├─ Dynamic placeholder env 생성 (secret scan 오탐 차단)
    └─ Build

  secret-scan (5분)
    ├─ Full history checkout
    └─ Gitleaks (gitleaks-action@v2)
```

### 3-2. 잘 설계된 부분 ✅

- **secret scan 2-job 분리** — verify 와 병렬 실행 가능
- **동적 placeholder env 생성** (`openssl rand -hex 24`) — 실 secret 이 YAML 에 하드코딩되지 않음
- **Sentry 선택적 skip** — `SENTRY_AUTH_TOKEN` 미주입 시 `withSentryConfig` 자동 skip
- **timeout 명시** (verify 15m / secret-scan 5m) — 무한 대기 차단

### 3-3. 개선 후보 (Backlog)

| 우선순위 | 이슈                                                                                                      | 권장 조치                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 🟡       | CI 는 `npm ci` 사용 (cache: `npm`) 하나 프로젝트 실제 패키지 매니저는 **pnpm** (`pnpm-lock.yaml` 이 진실) | `pnpm/action-setup@v4` 도입 + `pnpm i --frozen-lockfile` + store cache. `package-lock.json` 삭제.         |
| 🟡       | Playwright E2E 는 CI 에서 실행 안 됨 (로컬 수동)                                                          | Stage 1 이후 `test:e2e` job 추가. E2E 용 테스트 계정은 [testing-accounts.md](./testing-accounts.md) 참조. |
| 🟢       | 커버리지 임계값 게이트 부재 — regression 방어 무용                                                        | `vitest --coverage.thresholds.lines=50` 등 현재 수준 baseline 고정 (점진 상승).                           |
| 🟢       | `tsconfig.json.backup.1776399098` 가 git 추적 중 + `.gitignore` 에 `tsconfig.json.backup.*` 없음          | 해당 파일 삭제 + gitignore 에 `tsconfig.json.backup.*` 추가                                               |

> 이 4건은 별도 "CI 현대화" Task 로 분리. 이번 Stage 1 진입 블로커 아님.

---

## 4. Vercel 환경 구성 체크리스트 (Jayden 수동)

> 전체 전략: [`docs/environments.md`](./environments.md) §4-1 + §5-1.
> 이 섹션은 **출시 직전 수행할 순서** 를 요약.

### 4-1. 프로젝트 생성 (1회)

- [ ] [Vercel Dashboard](https://vercel.com/new) → GitHub 리포 `jaydenjoo/dari` import
- [ ] Framework Preset: **Next.js** (자동 감지)
- [ ] Build Command: `pnpm build` (widget + next 순차)
- [ ] Output Directory: `.next` (기본)
- [ ] Install Command: `pnpm install --frozen-lockfile`
- [ ] Root Directory: (비움 — 저장소 루트)

### 4-2. 환경변수 등록 (Production 전용 집합)

Vercel → Project → Settings → Environment Variables → 각 변수마다 **`Production` 만 체크** (Preview 노출 금지). 값 출처는 [env-template.md](./env-template.md) "🌍 환경별 값 차이" 표.

- [ ] `NEXT_PUBLIC_APP_URL` = `https://dairect.kr`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` = **dari-prod** URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = **dari-prod** anon
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = **dari-prod** service_role (🚨 노출 시 DB 전체 장악)
- [ ] `ANTHROPIC_API_KEY` = **프로덕션** 키 (비용 분리)
- [ ] `GOOGLE_GENERATIVE_AI_API_KEY` = **프로덕션** 키
- [ ] `UPSTASH_REDIS_REST_URL` = **dari-prod** Redis URL
- [ ] `UPSTASH_REDIS_REST_TOKEN` = **dari-prod** Redis token
- [ ] `FIRECRAWL_API_KEY` = **프로덕션** 키 (`fc-` prefix)
- [ ] `SENTRY_ENVIRONMENT` = `production`
- [ ] `NEXT_PUBLIC_SENTRY_ENVIRONMENT` = `production`

> `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` 은 Vercel Native Integration 이 자동 주입 (env 표시는 안 보이나 빌드/런타임 양쪽 작동). [environments.md §7](./environments.md) 참조.

### 4-3. Preview 환경변수 (기존 dari-dev 공유)

- [ ] 위 11개 변수 중 `*_PROD` 마킹 된 것을 제외한 나머지를 **`Preview + Development`** 체크로 재등록 (값은 dari-dev)
- [ ] `SENTRY_ENVIRONMENT` = `preview` (Preview 체크박스만)
- [ ] `NEXT_PUBLIC_SENTRY_ENVIRONMENT` = `preview`

### 4-4. 도메인 연결

- [ ] Vercel → Project → Settings → Domains → `dairect.kr` 추가
- [ ] DNS 레코드 (A / CNAME) Vercel 지시대로 등록
- [ ] HTTPS 자동 발급 확인 (Let's Encrypt)
- [ ] `www.dairect.kr` → `dairect.kr` 리디렉션 (선택)

### 4-5. Supabase prod 생성

- [x] Supabase Dashboard → New Project → `dari-prod` (리전: `ap-northeast-2`) — 완료 2026-04-17
- [x] 루트 패스워드 안전 저장
- [x] API 키 3종 (`anon` / `service_role` / URL) 복사 → Vercel 환경변수에 반영
- [x] 로컬에서 `supabase link --project-ref <dari-prod-ref>`
- [x] `supabase db push` — 12개 마이그레이션 순차 반영 ⚠️ **되돌리기 어려움**
- [x] Auth 섹션 → Google Provider 설정 (client id/secret) + redirect URL 등록
- [ ] Storage 버킷 확인 (0010 마이그레이션의 `knowledge-files` 버킷 생성 여부)
- [x] Supabase advisor 실행 → Stage 1 차단 0 확인 (2026-04-27, security 0 + performance INFO 4건 의도적 보존 — 상세 §6)

### 4-5-1. 🔴 Authentication URL Configuration (교훈 2026-04-21 Ⅲ 반영)

> **배경**: Supabase 프로젝트 생성 시 `Site URL` 기본값이 `http://localhost:3000`. Next.js 기본 포트 3000 가정. **Dari 는 로컬 4000 + prod `dari-theta.vercel.app`** 이라 기본값 그대로면 OAuth redirect 가 엉뚱한 URL 로 가고 prod 로그인 완전 블로킹 발생 (실제로 2026-04-21 Ⅲ 에서 발생).
>
> **규칙**: Phase 0-D Auth 완결 판정 = 로컬 Playwright E2E 통과 + **prod 실 Google OAuth end-to-end 로그인 성공** 양축. 외부 Dashboard 설정이라 코드로 검증 불가 — 운영 체크리스트 + 수동 확인만 유일한 검증.

- [x] Supabase Dashboard → `dari-prod` → **Authentication → URL Configuration** 접속
- [x] **Site URL** = `https://dari-theta.vercel.app` (prod 우선, 로컬만 쓰려면 `http://localhost:4000`)
- [x] **Redirect URLs** 2줄 등록:
  - `https://dari-theta.vercel.app/auth/callback`
  - `http://localhost:4000/auth/callback`
- [x] Save → prod 브라우저에서 "Google 로 계속하기" → `/auth/callback?code=...` redirect 정상 확인
- [x] Jayden 계정(`hidream72@gmail.com`) 세션 획득 확인

### 4-6. Stage 1 smoke test

- [x] Jayden 본인 계정으로 Google OAuth 로그인 (2026-04-21 Ⅲ)
- [x] 봇 2개 운영 중 (dairect + dari, 데모 모드 — 2026-04-25 Ⅱ)
- [x] text 지식 저장 → 임베딩 파이프라인 동작 (Gemini SDK 마이그 + prod 실증 완료)
- [x] 챗봇에 질문 → RAG 응답 반환 (`pnpm test:prod-smoke` 2/2 통과 — dairect 7s + dari 12s)
- [ ] 대화 로그 목록 + CSV export 동작 (Stage 1 smoke 잔여)
- [x] Sentry Issues 에 의도적 에러 1건 도달 확인 → 검증 후 즉시 삭제 ✅ (2026-04-25 Ⅲ — 임시 라우트 `/api/sentry-trigger` token-gated + curl 200 + eventId 발급 + Vercel function 486ms 내 송신 완료. Sentry 통합 자체는 5d ago `[Sentry Test] 정상 도달` 이슈로 production env 라벨링 검증됨)

### 4-7. dev/prod 분리 검증 (보류 결정 명시)

> **현 상태**: `.env.local` 이 prod (`pxdopzlaffjcxqfrqidq`) 를 직접 참조 — dev/prod **미분리**.
>
> **결정 (2026-04-25 Ⅱ)**: 봇 2개 데모 모드 단계라 분리 보류. 계약 진입 시 재진행 (트리거 4종은 [environments.md §2](./environments.md) 참조).
>
> **분리 재진행 시점에 본 §4-7 다시 활성화**.

- [ ] (보류) `dari-dev` Free org + 신규 프로젝트 생성 (비용 0)
- [ ] (보류) 마이그 0001~0015 + `enable_pgvector` 적용
- [ ] (보류) Auth URL Configuration + Google Provider 등록 (로컬 4000)
- [ ] (보류) `.env.local` 의 SUPABASE 3 키 교체 + `# dari-dev (NOT prod)` 주석
- [ ] (보류) prod 잔재 정리 (e2e-main@dari.test + rls-test-b@example.com)
- [ ] (보류) 검증: `pnpm dev` + E2E → dari-dev 만 데이터 생성, prod 영향 0

---

## 5. 보안 최종 점검

- [ ] `.env.local` 이 `.gitignore` 에 의해 차단되는지 확인 (`git check-ignore .env.local`)
- [ ] gitleaks pre-commit 훅 동작 확인 (`.husky/pre-commit` 존재)
- [ ] RLS 정책 전수 적용 확인 — `SELECT * FROM pg_policies WHERE schemaname = 'public';` 로 4 테이블 14 정책
- [ ] Sentry 경로에서 민감 필드 redact 검증 (로그인 세션 + PII 가 Sentry 이벤트에 누출되지 않음)
- [ ] CSP 헤더 설정 고려 (Phase 2 위젯 embed 시 필수)

---

## 6. Stage 1 진입 Go/No-Go 기준

### ✅ Go 조건 (전부 충족)

- [x] **Vercel prod 첫 빌드 녹색 확인** (@sentry/core transitive import 교훈 2026-04-21 Ⅱ 반영 — 로컬 `pnpm build` 성공 ≠ Vercel 빌드 성공. `DEPLOYMENT_NOT_FOUND` = 빌드 실패 결과 응답일 수 있음)
- [x] **prod Google OAuth 실 로그인 성공** (교훈 2026-04-21 Ⅲ — Supabase URL Configuration 설정 후 end-to-end 검증)
- [x] Vercel prod 배포 녹색 + `dari-theta.vercel.app` HTTPS 응답 (dairect.kr 은 별개 프로젝트)
- [x] `dari-prod` Supabase 12 마이그레이션 반영
- [x] Supabase advisor Stage 1 차단 0 (2026-04-27, security 0 + performance INFO 4건 의도적 보존: `unused_index` ×3 = RAG 데이터 양 적어 sequence scan 정상 / `auth_db_connections_absolute` = 인스턴스 업그레이드 시 재평가)
- [ ] smoke test 6항목 (§4-6) 전부 통과 — 5/6 통과 (CSV export 잔여)
- [x] Sentry production environment 이벤트 수집 확인 (2026-04-25 Ⅲ §4-6 마지막 항목 종결)
- [ ] 환경변수 유출 점검 (`git grep` + Vercel 로그 확인)

### 🛑 No-Go 신호

- Sentry 에 즉시 error 도달 (runtime env 미설정 시 첫 요청에서 폭발)
- RLS 시뮬레이션에서 타 owner 데이터 접근 가능
- 도메인 DNS propagation 미완 (24h 대기)
- Jayden 이 smoke test 중 UX 이상 감지

---

## 7. Stage 1 이후 Backlog (Phase 2 이전)

- CI 현대화 (pnpm action + E2E job + coverage threshold)
- `tsconfig.json.backup.*` 정리 + gitignore
- `package-lock.json` 삭제 (pnpm 단일화)
- widget 런타임 실제 배포 (Phase 2 Epic)
- audit log / soft delete / 원가 환산 / 일별 차트
- `bots/[slug]/edit/page.tsx` 등 Epic 1-8 규약(구조화 로깅) sweep

---

## 8. 변경 이력

- **2026-04-20** — 최초 작성 (Task 1-8-e 직후, Epic 1-8 완결 시점)
- **2026-04-25 Ⅲ** — Task A-5b-③ Sentry Issues smoke 종결. §4-6 마지막 항목 + §6 Go 조건 "Sentry production environment 이벤트 수집 확인" `[x]`. 임시 라우트 `/api/sentry-trigger` (token-gated, 신규 1파일 → 검증 후 삭제 2 커밋 cycle). Vercel function 486ms 내 200 응답 + eventId 발급 + 5d ago 통합 검증 누적 증거로 §4-6 의도 충족.
- **2026-04-27** — Task B (advisor Stage 1 검증 완료). §4-5 + §6 advisor 항목 `[x]`. security WARN 1건 (`auth_leaked_password_protection`) Dashboard 활성화 ("Prevent use of leaked passwords" toggle ON) → MCP 재호출로 security `lints: []` 확인. performance INFO 4건 (`unused_index` ×3 + `auth_db_connections_absolute`) 모두 의도적 보존 — RAG 데이터 양 적음 (dairect 7 + dari 2 chunks) + Stage 2 진입 시 재평가.
