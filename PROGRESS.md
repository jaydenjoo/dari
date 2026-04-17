# PROGRESS.md

> **세션 시작 시 첫 번째로 읽는 파일**

## 현재 위치

- Phase: 0 (기반 공사)
- Epic: 0-B (DB 스키마) 착수 직전
- Task: Jayden `.env.local` 작성 중 → 완료 후 Epic 0-B 재개
- 상태: Phase 0-A 완료 ✅ / Phase 0-C 완료 ✅ / Phase 0-B 대기 중

## 이번 세션 완료 내역

1. **PRD v2.0 학습**: Dari 범용 AI 챗봇 엔진 ("챗봇의 워드프레스")
2. **마스터 플랜 v3.0 수립**: 3대 우선순위(안정성·유지보수·확장성) 검증 후 보강판 채택
   - Epic 0-E/F/G 추가 (안정성·유지보수·확장성 기반)
   - Task 1-0 추가 (보안 기반)
   - Soft Launch 4 Stage 공개 전략 통합
3. **Epic 0-A (개발 환경) 전체 완료**:
   - 0-A-1: 운영 의존성 11종 + 개발 의존성 4종 설치 (Supabase, Drizzle, Claude SDK, Gemini, Upstash, Sentry, Pino, Zod 등)
   - 0-A-2: shadcn/ui 초기화 + 9종 컴포넌트 (Button/Input/Card/Dialog/Sonner/Tabs/Textarea/Select/Badge)
   - 0-A-3: env.ts (client/server 스키마 분리) + docs/env-template.md
   - 0-A-4: Prettier + ESLint 정합 + `npm run check` 통합 스크립트
4. **Epic 0-C (Config 스키마) 완료**:
   - `src/core/config/schema.ts` — Zod 스키마 9개 영역 + 10개 타입 export
   - `migrations.ts` — 버전 마이그레이션 체인 (v1.0 → 미래 버전 대비)
   - 샘플 Config 3종 (`docs/config-examples/`): Chatsio / OnboardKit / Dairect Portfolio
5. **ADR 시스템 도입**: `docs/adr/README.md` + 인덱스 (5개 예정 ADR)

## 다음 할 일 (다음 세션)

### 즉시 시작 (Jayden env 완료 후)

1. **Epic 0-B (DB 스키마)** — Supabase pgvector 활성화 + Drizzle 스키마 4종 (bots/knowledge_chunks/conversations/messages) + RLS 정책 + seed

### 독립적으로 추가 가능

2. **Epic 0-D (인증)** — Supabase Google OAuth + /login + 미들웨어 가드
3. **Epic 0-E (안정성 기반)** — Vitest + Playwright + Pino + Sentry + Health check API
4. **Epic 0-F (유지보수 기반)** — ADR 5종 + GitHub Actions CI + Dev/Staging/Prod 환경 분리
5. **Epic 0-G (확장성 기반)** — KnowledgeSource/BehaviorHandler/AIProvider 인터페이스 + EventBus

## 완료한 Task

- [x] PRD v2.0 학습
- [x] 마스터 플랜 v3.0 수립 (3대 우선순위 + Soft Launch 통합)
- [x] Epic 0-A-1: 의존성 설치
- [x] Epic 0-A-2: shadcn/ui 초기화 + 9종 컴포넌트
- [x] Epic 0-A-3: env.ts + env-template.md
- [x] Epic 0-A-4: Prettier + ESLint 정합
- [x] Epic 0-C: Config 스키마 + 샘플 3종
- [x] ADR 시스템 폴더 + 인덱스

## 막힌 부분

**없음.** (이번 세션 끝 시점: Jayden이 4개 서비스 키 발급 완료, `.env.local` 작성 중)

## ⚠️ 미커밋 코드 변경분 (중요)

이번 세션에서 다량의 코드 변경 발생. `/save` 스킬은 문서 파일(PROGRESS.md, learnings.md)만 커밋함.

**다음 세션 시작 시 Jayden 승인 후 별도 커밋 필요**:

- `src/core/config/*` (Config 스키마 신규)
- `src/shared/config/env.ts` (env 검증 확장)
- `src/components/ui/*` (shadcn 9종)
- `src/lib/utils.ts` (shadcn 생성)
- `docs/adr/`, `docs/env-template.md`, `docs/config-examples/` (신규)
- `eslint.config.mjs`, `.prettierrc`, `.prettierignore` (설정)
- `.gitignore` (`.env.example` 예외 추가)
- `package.json`, `package-lock.json` (의존성)

권장 커밋 분할:
1. `chore: setup dev environment (deps, shadcn, prettier, eslint)` — Phase 0-A
2. `feat(config): add Dari config schema with Zod` — Phase 0-C
3. `docs: add ADR system and config examples` — 문서

## 세션 이력

- 2026-04-17 (오전): 프로젝트 초기화 (init-project-v2.sh v9.3)
- 2026-04-17 (오후): PRD v2.0 재작성 + 마스터 플랜 v3.0 수립 + Phase 0-A/0-C 완료

## 마지막 업데이트

- 날짜: 2026-04-17
- 작성자: Jayden + Claude
