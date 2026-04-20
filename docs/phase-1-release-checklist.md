# Phase 1 출시 준비 체크리스트 (Stage 1 진입용)

> **역할**: Phase 1 MVP 완결 시점에 Stage 1(실사용자 첫 오픈) 진입 전 반드시 확인할 항목 통합 체크리스트.
> **작성**: 2026-04-20 (Task 1-8-e 직후)
> **대상 버전**: v0.1.0
> **관련 문서**: [environments.md](./environments.md), [env-template.md](./env-template.md), [PRD.md](./PRD.md), [adr/](./adr/)

---

## 1. 현재 상태 스냅샷

| 영역               | 상태                                                           |
| ------------------ | -------------------------------------------------------------- |
| **Epic 진행**      | Phase 1 Epic 1-8 완결 + 후속 리팩 1-8-e ✅                     |
| **테스트 통과**    | vitest **468/468** (442 → +26 in Task 1-8-e)                   |
| **타입/린트/포맷** | typecheck 0 errors / lint 3 baseline warnings / prettier clean |
| **빌드**           | 14 routes 녹색 (Turbopack + Sentry 10.49 호환)                 |
| **마이그레이션**   | 0001~0012 (12개) — 로컬 `dari-dev` 적용 완료                   |
| **CI**             | GitHub Actions `verify` + `secret-scan` 2-job — CI 녹색 유지   |
| **호스팅**         | **아직 미구성** — Stage 1 진입 시 Vercel 프로젝트 생성 예정    |
| **도메인**         | `dairect.kr` — DNS 연결 대기                                   |
| **Supabase prod**  | **미생성** — Stage 1 진입 시 `dari-prod` 프로젝트 신규 생성    |

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

- [ ] Supabase Dashboard → New Project → `dari-prod` (리전: `ap-northeast-2` 권장 한국 사용자)
- [ ] 루트 패스워드 안전 저장
- [ ] API 키 3종 (`anon` / `service_role` / URL) 복사 → Vercel 환경변수에 반영
- [ ] 로컬에서 `supabase link --project-ref <dari-prod-ref>`
- [ ] `supabase db push` — 12개 마이그레이션 순차 반영 ⚠️ **되돌리기 어려움**
- [ ] Auth 섹션 → Google Provider 설정 (client id/secret) + redirect URL 등록
- [ ] Storage 버킷 확인 (0010 마이그레이션의 `knowledge-files` 버킷 생성 여부)
- [ ] Supabase advisor 실행 → 신규 이슈 0 확인

### 4-6. Stage 1 smoke test

- [ ] Jayden 본인 계정으로 Google OAuth 로그인
- [ ] 봇 1개 생성 (테스트용)
- [ ] text 지식 저장 → 임베딩 파이프라인 동작
- [ ] 챗봇에 질문 → RAG 응답 반환
- [ ] 대화 로그 목록 + CSV export 동작
- [ ] Sentry Issues 에 의도적 에러 1건 도달 확인 → 검증 후 즉시 삭제

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

- [ ] Vercel prod 배포 녹색 + `dairect.kr` HTTPS 응답
- [ ] `dari-prod` Supabase 12 마이그레이션 반영 + advisor 0 이슈
- [ ] smoke test 6항목 (§4-6) 전부 통과
- [ ] Sentry production environment 이벤트 수집 확인
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
