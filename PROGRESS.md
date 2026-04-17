# PROGRESS.md

> **세션 시작 시 첫 번째로 읽는 파일**

## 현재 위치

- Phase: 0 (기반 공사)
- Epic: 0-E (안정성 기반) — **100% 완료 (4/4 Task)** ✅
- 상태: Epic 0-E 완결. 다음 세션은 **경로 α(0-F 유지보수) vs β(0-D 인증) vs γ(0-G 확장성)** 중 선택.

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

## 이번 세션(2026-04-17 심야) 완료 내역

### 커밋 4건

- `53a99e6` feat(test): Vitest infra + Zod schema test suite (Task 0-E-1)
- `ab919f6` feat(logging): Pino structured logger with redact + context (Task 0-E-2)
- `3e7e800` feat(observability): Sentry + shared sensitive-fields module (Task 0-E-3)
- `19172ce` feat(observability): /api/health endpoint with DB ping (Task 0-E-4)

### 주요 결정 / 발견

- **독립 리뷰 제도화**: `code-reviewer` 서브에이전트를 Task 0-E-2, 0-E-3 에 투입 → 각 CRITICAL 2건(+ MEDIUM 4건 + NITS 2건) 발견. Writer/Reviewer 분리 효과 실증.
- **민감 필드 단일 진실 공급원**: `src/core/observability/sensitiveFields.ts` 신설 → logger(Pino REDACT_PATHS) + Sentry(beforeSend) 양쪽이 공유. drift 원천 차단.
- **Vite 네이티브 tsconfigPaths** 채택으로 `vite-tsconfig-paths` 플러그인 제거. 테스트 속도 604ms → 136ms (4.4배).
- **Next.js 16.2 + Sentry 10.49.0 + Turbopack 호환 실증**: `withSentryConfig` + `instrumentation.ts` + `instrumentation-client.ts` 패턴 검증. `disableLogger` 는 Turbopack 미지원이라 제거, `onRouterTransitionStart` export 추가.
- **Edge runtime 경계 문서화**: Pino + `pino-pretty` transport 는 worker_threads 요구 → Node 전용. middleware.ts 만들 때 별도 경량 logger 필요.
- **env.ts 누락 감지**: `/api/health` 추가 시 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 미설정이 최초로 드러남. 이전 4번의 빌드는 env 체인을 로드하는 라우트가 없어서 통과. Jayden 즉시 보완.

### learnings.md 추가 (이번 세션 +3건, 총 12건)

1. 공식 가이드 vs 도구 런타임 권고 충돌 시 (Task 0-E-1 경험)
2. 독립 code-reviewer 를 통한 보안 사각 발견 (Task 0-E-2, 0-E-3 경험)
3. env.ts 누락은 "첫 사용 라우트" 추가 시에만 드러남 (Task 0-E-4 경험)

## 다음 세션 할 일

### 🎯 경로 선택 (블로커 여부 우선)

**경로 α (권장): Epic 0-F (유지보수 기반)**

- 블로커: 없음 — 즉시 시작 가능
- 내용: ADR 5종 작성 + GitHub Actions CI + 환경 분리 + 모듈 README
- 가치: 팀 규약 확립, CI green-bar 자동화, 신규 기여자/세션 온보딩 시간 단축
- 소요: 2~3시간

**경로 β: Epic 0-D (인증)**

- 블로커: **Jayden 이 Google Cloud Console 에서 OAuth Client ID/Secret 발급 필요**
- 내용: Supabase Google OAuth + `/login` + 미들웨어 + 세션 체크
- 가치: `bots.owner_id` 활성화 → RLS 정책 작성 가능 → 보안 경계 완성 (Phase 1 진입 전 필수)
- 소요: 2~3시간

**경로 γ: Epic 0-G (확장성 기반)**

- 블로커: 없음
- 내용: KnowledgeSource / BehaviorHandler / AIProvider 인터페이스 + EventBus
- 리스크: "실 요구 없이 추상화" 주의 (조기 추상화 금지 규칙). Phase 1 에서 실 요구 발견 시 도입이 더 안전할 수 있음.
- 소요: 2~3시간

### 그 외 대기 중

- **Task 0-E-5 (optional)**: logger ↔ Sentry bridge — `logger.error` 호출이 자동 Sentry 캡처 (30~45분)
- **Epic 0-B-Post (0006)**: RLS 정책 — Auth 완료 후에만 의미 있음
- **Phase 1 진입**: 핵심 기능 시작 — RLS 없는 상태에서는 가짜 보안 경계 위험

## 차단 요소

**없음** — 경로 α / γ 는 즉시 시작 가능. 경로 β 선택 시 Jayden 이 사전에 Google Cloud Console 설정 필요.

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
- [x] **Task 0-E-1: Vitest 인프라 + schema 테스트 6개**
- [x] **Task 0-E-2: Pino 구조화 로거 + 독립 리뷰 8건 반영 (redact 40 paths)**
- [x] **Task 0-E-3: Sentry 배선 + sensitiveFields 공유 모듈 + 독립 리뷰 8건 반영**
- [x] **Task 0-E-4: /api/health + DB ping + 실 HTTP 200 검증**

## 세션 이력

- 2026-04-17 (오전): 프로젝트 초기화
- 2026-04-17 (오후): PRD v2.0 재작성 + 마스터 플랜 v3.0 수립 + Phase 0-A/0-C 완료
- 2026-04-17 (저녁): Epic 0-B 3/4 테이블 + Supabase 클라이언트 + 메모리 규칙 2개
- 2026-04-17 (밤): Epic 0-B 완결 (0004 함수 search_path + 0005 knowledge_chunks) + 타입 + 라운드트립 + 교훈 3건
- **2026-04-17 (심야): Epic 0-E 완결 (4/4 Task) + 독립 리뷰 2회 + 커밋 4건 + 교훈 3건**

## 마지막 업데이트

- 날짜: 2026-04-17 심야
- 작성자: Jayden + Claude (Opus 4.7, effort=max)
