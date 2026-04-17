# PROGRESS.md

> **세션 시작 시 첫 번째로 읽는 파일**

## 현재 위치

- Phase: 0 (기반 공사)
- Epic: 0-F (유지보수 기반) — **100% 완결 (4/4 Task)** ✅
- 상태: 다음 경로 선택 필요 (Epic 0-D 인증 / Phase 1 진입 / 기타)

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

## 이번 세션(2026-04-17 마감) 완료 내역

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

**경로 β (권장): Epic 0-D (인증)**

- 블로커: **Jayden 의 Google OAuth Client ID/Secret 발급 필요** (Google Cloud Console, 5~10분)
- Supabase Google OAuth + `/login` + 미들웨어 + 세션 체크
- 완료 시 RLS 정책 활성화 가능 (`supabase/migrations/0006_rls.sql`) → Phase 1 진입 안전 확보
- 소요: 2~3h

**경로 δ: Phase 1 진입 직행 (봇 CRUD + AI 응답)**

- Auth 없이 하드코딩 userId 로 개발 시작
- 리스크: Auth 도입 시 수정 범위 큼
- 소요: 긴 (여러 세션)

**경로 γ: Epic 0-G (확장성 기반)**

- 블로커 없음, 리스크: 실 요구 없이 추상화 (조기 추상화 금지 원칙 충돌)
- Phase 1 에서 실 요구 발견 후 도입이 더 안전

**경로 ε (짧은 정비, 선택)**

- **Task 0-E-5** logger ↔ Sentry bridge — `logger.error` 호출이 자동 Sentry 캡처 (30~45m)
- **CI Node 24 전환** — `actions/*@v4` → `@v5` (2026-06-02 전, 10~15m)
- **NEXT_PUBLIC_SENTRY_ENVIRONMENT 도입** — 브라우저 preview/prod 구분 (Stage 2 진입 전, 30~45m)

### 그 외 대기 중

- **Epic 0-B-Post (0006)**: RLS 정책 — Auth 완료 후에만 의미 있음
- **gitleaks 오탐 선제 정리**: `env-template.md` 의 `sk-ant-xxxxx` 등을 `<placeholder>` 각괄호로 통일 (보안 리뷰 부가 제안, CI 통과 중이라 우선순위 낮음)

## 차단 요소

**없음** — 경로 β 는 Jayden 이 Google OAuth Client 발급하면 해금. 나머지 경로 즉시 시작 가능.

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

## 세션 이력

- 2026-04-17 (오전): 프로젝트 초기화
- 2026-04-17 (오후): PRD v2.0 재작성 + 마스터 플랜 v3.0 수립 + Phase 0-A/0-C 완료
- 2026-04-17 (저녁): Epic 0-B 3/4 테이블 + Supabase 클라이언트 + 메모리 규칙 2개
- 2026-04-17 (밤): Epic 0-B 완결 (0004 함수 search_path + 0005 knowledge_chunks) + 타입 + 라운드트립 + 교훈 3건
- 2026-04-17 (심야): Epic 0-E 완결 (4/4 Task) + 독립 리뷰 2회 + 커밋 4건 + 교훈 3건
- 2026-04-17 (후속): Epic 0-F 50% (2/4 Task) — 0-F-2 CI + 0-F-1 ADR 5종 + 교훈 1건
- **2026-04-17 (마감): Epic 0-F 100% 완결 — 0-F-3 환경 분리 + 0-F-4 모듈 README + 독립 리뷰 4회 (MEDIUM 7건 반영) + 커밋 2건 + 교훈 2건 + 메모리 1건**

## 마지막 업데이트

- 날짜: 2026-04-17 마감 (Epic 0-F 100% 완결, Phase 0 유지보수 기반 확립)
- 작성자: Jayden + Claude (Opus 4.7, effort=max)
