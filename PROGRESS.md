# PROGRESS.md

> **세션 시작 시 첫 번째로 읽는 파일**

## 현재 위치

- Phase: 0 (기반 공사)
- Epic: 0-B (DB 스키마) — **75% 완료 (3/4 테이블)**
- 상태: 다음 세션에서 `knowledge_chunks` + pgvector 작업 예정

## 완료된 Epic

- ✅ Phase 0-A (개발 환경): deps + shadcn + prettier + eslint
- ✅ Phase 0-C (Config 스키마): DariConfig v1.0 + migrations.ts + 샘플 3종
- 🟡 Phase 0-B 진행 중 (bots / conversations / messages ✅, knowledge_chunks 남음)

## 이번 세션(2026-04-17 저녁) 완료 내역

### 커밋 7개

1. `9510223` chore: setup dev environment (deps/shadcn/prettier/eslint)
2. `a10bbe3` feat(config): Dari config schema with Zod
3. `408ecf4` docs: ADR + env template + config examples
4. `fb7d59e` chore(dev): switch local dev port to 4000 (포트 충돌 회피)
5. `922cdb5` docs: design system guides (경로 C — MD 커밋 + zip/폴더 .gitignore)
6. `454a057` feat(db): bots table + Supabase client modules
7. `56e3e4e` feat(db): rename bots.bot_id→slug + conversations + messages

### DB 작업 (Supabase project: `pxdopzlaffjcxqfrqidq` / dari / ap-northeast-2)

- ✅ pgvector 0.8.0 활성화 (schema: extensions)
- ✅ 마이그레이션 4개 적용:
  - `enable_pgvector`
  - `create_bots_table` (0001)
  - `rename_bot_id_to_slug` (0002)
  - `create_conversations_and_messages` (0003)
- ✅ 3 테이블 RLS enable (정책은 Epic 0-D Auth 후 0004 예정)
- ✅ 라운드트립 검증:
  - bots: INSERT → UPDATE(trigger) → DELETE
  - 2단계 cascade: bot → conversation → messages 모두 자동 삭제
  - `last_message_at` 트리거 정상 작동 (trigger_ok=true)

### 코드 작업

- ✅ `src/core/db/` 모듈 (browser/server/admin 3 클라이언트 + types + index)
- ✅ `@supabase/ssr` 기반 SSR 세션 자동 관리
- ✅ `server-only` 가드로 service_role 키 번들 유입 차단
- ✅ **Drizzle 제외 결정** (RLS 이중 관리 회피 — 실행 직전 재평가 결과)
- ✅ typecheck 전 구간 에러 0

### 메모리 저장 (글로벌)

- ✅ `project_dari_port.md` — 로컬 포트 4000 (3000 아님)
- ✅ `feedback_error_avoidance_first.md` — 기술 선택 시 에러/효율 비교 규칙
- ✅ `MEMORY.md` 2개 엔트리 인덱스

### 글로벌 규칙 반영

- `.env.local`은 Jayden이 직접 생성 (Claude 생성 차단)
- gitleaks 템플릿 예시는 `<placeholder>` 각괄호 형식 사용

## 다음 세션 할 일

### 🎯 최우선: Epic 0-B 마무리 — knowledge_chunks

**설계 결정 포인트 (세션 시작 시 결정)**:

1. **임베딩 제공자/차원**
   - Gemini text-embedding-004: 768-dim (무료 tier 관대, 한국어 양호)
   - OpenAI text-embedding-3-small: 1536-dim
   - Claude는 임베딩 API 없음 (Voyage AI 권장)
   - → 현재 `.env.local`에 `GOOGLE_GENERATIVE_AI_API_KEY` 있으므로 Gemini 768-dim 유력
2. **인덱스 타입**: ivfflat(간단/삽입 빠름) vs hnsw(검색 빠름/메모리 多)
3. **청킹 전략**: 고정 크기(500 토큰) vs 의미 단위 분할
4. 마이그레이션 `0004_create_knowledge_chunks.sql`
5. types.ts에 `KnowledgeChunk` 추가
6. 유사도 검색 SQL 함수 or RPC
7. 라운드트립 검증

### 그 다음 (독립 가능)

- **Epic 0-D (인증)**: Supabase Google OAuth + /login + 미들웨어
- **Epic 0-B 마무리2**: RLS 정책 0004 → 0005 (인증 완료 후)
- **Epic 0-E (안정성)**: Vitest + Playwright + Pino + Sentry + Health check
- **Epic 0-F (유지보수)**: ADR 5종 + GitHub Actions CI + 환경 분리
- **Epic 0-G (확장성)**: KnowledgeSource/BehaviorHandler/AIProvider 인터페이스 + EventBus

## 차단 요소

**없음**. 다음 세션 시작 시 knowledge_chunks 설계 결정(임베딩 제공자)만 필요.

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

## 세션 이력

- 2026-04-17 (오전): 프로젝트 초기화 (init-project-v2.sh v9.3)
- 2026-04-17 (오후): PRD v2.0 재작성 + 마스터 플랜 v3.0 수립 + Phase 0-A/0-C 완료
- **2026-04-17 (저녁)**: Epic 0-B 3/4 테이블 완성 + Supabase 클라이언트 + 메모리 규칙 2개

## 마지막 업데이트

- 날짜: 2026-04-17 저녁
- 작성자: Jayden + Claude (Opus 4.7, effort=max)
