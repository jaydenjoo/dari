# PROGRESS.md

> **세션 시작 시 첫 번째로 읽는 파일**

## 현재 위치

- Phase: 0 (기반 공사)
- Epic: 0-B (DB 스키마) — **100% 완료 (4/4 테이블)** ✅
- 상태: Epic 0-B 완결. 다음 세션은 **Epic 0-D(인증) vs Epic 0-E(안정성)** 중 선택.

## 완료된 Epic

- ✅ Phase 0-A (개발 환경): deps + shadcn + prettier + eslint
- ✅ Phase 0-C (Config 스키마): DariConfig v1.0 + migrations.ts + 샘플 3종
- ✅ **Phase 0-B (DB 스키마, 4/4 테이블 완결)**
  - bots / conversations / messages / knowledge_chunks
  - pgvector 0.8.0 + ivfflat cosine + `match_knowledge_chunks` RPC
  - 함수 search_path 보안 강화 (ALTER FUNCTION `SET search_path = ''`)

## 이번 세션(2026-04-17 밤) 완료 내역

### 커밋 예정 (1건)

이 문서 + learnings.md + 아래 산출물을 한 커밋으로:

- `supabase/migrations/0004_fix_function_search_path.sql` (신규)
- `supabase/migrations/0005_create_knowledge_chunks.sql` (신규)
- `src/core/db/types.ts` (수정 — KnowledgeChunk Tables/Functions 추가)
- `src/core/db/index.ts` (수정 — KnowledgeSourceType/KnowledgeChunkMatch re-export)

### DB 작업

- ✅ 마이그레이션 6개 적용 (이전 4개 + 신규 2개):
  - `fix_function_search_path` (0004) — ALTER FUNCTION 로 search_path 고정
  - `create_knowledge_chunks` (0005) — 테이블 + 인덱스 3종 + RPC
- ✅ knowledge_chunks 테이블 (Gemini 768-dim, ivfflat cosine, lists=100)
- ✅ `match_knowledge_chunks` RPC (security invoker + search_path='')
- ✅ 보안 린트 WARN 2건 해소 (`function_search_path_mutable`)

### 검증 (라운드트립 완전 통과)

- 768-dim 단위 벡터 3개로 cosine similarity 서수 검증
  - 쿼리=vec_a → chunk A 1.0 / chunk C 0.7071 / chunk B 0.0 순 반환 확인
- bots → knowledge_chunks cascade DELETE 정상
- 함수 2개 `proconfig = ["search_path=\"\""]` 확인
- 기존 트리거 2종 동작 재검증 (과거 시점 덮어쓰기 기법)
- advisor security: WARN 0건 / INFO 4건(RLS policy 미작성 — 예상됨)

### 코드 작업

- ✅ `src/core/db/types.ts`
  - Enum-like: `KnowledgeSourceType` 추가
  - Sub-structures: `KnowledgeChunkMatch` 추가
  - `Database.public.Tables.knowledge_chunks` 추가
  - `Database.public.Functions.match_knowledge_chunks` 시그니처 정의
  - **수동 유지 결정** — 자동 생성은 DariConfig·MessageSource를 `Json` 으로 평탄화 → 정확도 손실. 주석에 결정 사유 명시.
- ✅ `src/core/db/index.ts` — 신규 타입 2종 re-export
- ✅ typecheck 에러 0

### 교훈 저장 (learnings.md에 3건 추가)

- DO 블록 내 `now()` 트랜잭션 고정값 (트리거 검증 시 주의)
- `ALTER FUNCTION ... SET search_path = ''`가 최소 변경 경로 (DROP+CREATE 불필요)
- Supabase types 자동 생성 보류 결정 (DariConfig 보존 우선)

### 메모리 저장 (글로벌)

- ✅ `feedback_plan_per_task.md` — Task마다 Plan→Approve→Build 엄격 준수 규칙
- ✅ MEMORY.md 3번째 엔트리 인덱스 업데이트

## 다음 세션 할 일

### 🎯 최우선: 두 경로 중 선택

**경로 B: Epic 0-D (인증) — Supabase Google OAuth**

- 블로커: Google Cloud Console에서 OAuth Client ID/Secret 발급 (Jayden 수동)
- 가치: `bots.owner_id` 활성화 → RLS 정책 작성 가능 (0006) → 진짜 보안 경계 완성
- 소요: 2~3시간 (OAuth 설정 + /login + 미들웨어 + 세션 체크)

**경로 D: Epic 0-E (안정성) — Vitest + Pino + Sentry + Health check**

- 블로커: 없음
- 가치: 앞으로 모든 기능에 테스트·로깅·관찰성 자동 적용. Phase 1 진입 전 필수 배선.
- 소요: 2~3시간 (각 요소 1개씩 최소 설정)

→ 다음 세션 시작 시 우선순위 재확인.

### 그 외 대기 중

- **Epic 0-B 후속(0006)**: RLS 정책 — Auth 완료 후에만 의미 있음
- **Epic 0-F (유지보수)**: ADR 5종 + GitHub Actions CI + 환경 분리
- **Epic 0-G (확장성)**: KnowledgeSource/BehaviorHandler/AIProvider 인터페이스 + EventBus

## 차단 요소

**없음**. 다음 세션 시작 시 경로 B vs D 선택만 필요.

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
- [x] **함수 search_path 보안 강화 (0004)**
- [x] **knowledge_chunks 테이블 + RPC (0005)**
- [x] **KnowledgeChunk 타입 추가 + 자동 생성 보류 결정**
- [x] **RAG 라운드트립 검증 (cosine similarity 서수 통과)**
- [x] **Task마다 Plan→Approve→Build 규칙 메모리 저장**

## 세션 이력

- 2026-04-17 (오전): 프로젝트 초기화 (init-project-v2.sh v9.3)
- 2026-04-17 (오후): PRD v2.0 재작성 + 마스터 플랜 v3.0 수립 + Phase 0-A/0-C 완료
- 2026-04-17 (저녁): Epic 0-B 3/4 테이블 완성 + Supabase 클라이언트 + 메모리 규칙 2개
- **2026-04-17 (밤): Epic 0-B 완결 (0004 함수 search_path + 0005 knowledge_chunks) + 타입 + 라운드트립 + 교훈 3건**

## 마지막 업데이트

- 날짜: 2026-04-17 밤
- 작성자: Jayden + Claude (Opus 4.7, effort=max)
