# PROGRESS.md

> **세션 시작 시 첫 번째로 읽는 파일**

## 현재 위치

- Phase: 0 (기반 공사)
- Epic: 0-F (유지보수 기반) — **50% 진행 (2/4 Task)** 🚧
- 상태: 경로 α 진행 중. Task 0-F-3 (환경 분리) + 0-F-4 (모듈 README) 남음.

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
- 🚧 **Phase 0-F (유지보수 기반, 2/4 Task)**
  - 0-F-2: GitHub Actions CI + eslint/prettier baseline 정리 (CI 녹색 2회 연속)
  - 0-F-1: ADR 5종 (001/002/003/006/007) + `docs/testing-accounts.md`
  - 남음: 0-F-3 (환경 분리 dev/stg/prod) / 0-F-4 (모듈 README 골격)

## 이번 세션(2026-04-17 후속) 완료 내역

### 커밋 3건

- `53d1607` feat(ci): GitHub Actions CI + baseline cleanup (Task 0-F-2)
- `6a27431` docs(learnings): CI placeholder env via openssl 동적 생성 (Task 0-F-2 회고)
- `d02ed78` docs(adr): Phase 0 핵심 결정 5종 ADR + E2E 계정 전략 (Task 0-F-1)

### Task 0-F-2 (CI + baseline)

- `.github/workflows/ci.yml` 단일 workflow + 2 job (verify + secret-scan 병렬)
- Build step 직전 `openssl rand -hex 24` 로 placeholder env 동적 생성 → gitleaks 오탐 0
- `actions/checkout@v4` + `actions/setup-node@v4` + `gitleaks/gitleaks-action@v2` (개인 리포 무료)
- baseline 정리: `.prettierignore` 에 `docs/design-references/` 추가, `eslint.config.mjs` 에 `coverage/**` globalIgnore + `_` prefix 허용 rule
- CI 2회 연속 녹색 (runs 24559733612, 24560762532)
- 실행 시간: verify 1m21s + secret-scan 11s

### Task 0-F-1 (ADR 5종 + E2E 전략)

- **ADR-001** Next.js 16.2 + App Router + Turbopack (Accepted)
- **ADR-002** Drizzle 제외, @supabase/ssr 일원화 (Accepted, 원안 반전)
- **ADR-003** Config jsonb + DB types 수동 유지 (Accepted)
- **ADR-006** 관찰성 스택: Pino + Sentry + sensitiveFields (Accepted, 신규)
- **ADR-007** 테스트 전략: Vitest 네이티브 + Playwright 보류 (Accepted, 신규)
- `docs/testing-accounts.md` 신규 — Playwright E2E (Epic 0-D 이후) 시 쓸 계정/fixture/secret 전략 선행 정의 (dari.test 도메인 + plus addressing + test Supabase 프로젝트 분리 + GitHub Secrets 격리)
- `docs/adr/README.md` 인덱스 갱신. ADR-004 Widget / ADR-005 Plugin 은 Planned 유지 (해당 Epic 에서 실결정 후)

### 주요 결정 / 발견

- **예약 주제 vs 실 결정의 반전**: `ADR-002-supabase-drizzle.md` 원 예약 주제 → 실 결정은 "Drizzle 제외" 로 반전. 파일명 `supabase-ssr.md` 로 갱신. 하이브리드 방식으로 004/005 는 Planned 유지.
- **리포 상태 가정 금지**: Jayden 의 "새로 만들어서 푸시" 지시에 바로 `gh repo create` 돌리지 않고 `git remote -v` + `gh repo view` 확인 → 리포 기존 존재 확인 → fast-forward push. destructive action 회피.
- **CI 가 기존 quality 이슈 즉시 조명**: CI 추가 시점에 `coverage/` ignore 누락, `_` prefix 규칙 부재, prettier 4파일 포맷 누락 모두 발견. 한 건도 그냥 넘기지 않음. CI 도입의 즉효성 실증.
- **Playwright 도입 보류 (Epic 0-D 이후)**: 지금 UI/Auth 없음 → 빈 인프라. 계정·fixture·secret 전략만 문서화 선행 (`docs/testing-accounts.md`) — Auth 구현 시 재논의 제거.
- **CI deprecation warning 2건 포착**: Node 20 기반 actions 가 2026-06-02 부터 Node 24 강제. `@v5` 업그레이드 또는 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 로 대응 가능. 4개월 여유, 별도 Task 으로 백로그.

### learnings.md 추가 (+1, 총 13건)

- CI placeholder env 는 workflow YAML 하드코딩 금지 — shell 동적 생성 (`openssl rand -hex`) (Task 0-F-2 회고)

## 다음 세션 할 일

### 🎯 경로 선택

**경로 α 연속: Epic 0-F 마무리 (권장, 블로커 없음)**

- Task 0-F-3 환경 분리 문서 (dev/stg/prod) — 30~45m
- Task 0-F-4 모듈 README 골격 (src/core/\* 5~6개) — 45~60m
- 합 ~1.5h. Epic 0-F 100% 완결 → Phase 0 유지보수 기반 확립

**경로 β 전환: Epic 0-D (인증)**

- 블로커: **Jayden 의 Google OAuth Client ID/Secret 발급 필요** (Google Cloud Console, 5~10분)
- Supabase Google OAuth + `/login` + 미들웨어 + 세션 체크
- 완료 시 RLS 정책 활성화 가능 → Phase 1 진입 안전 확보
- 소요: 2~3h

**경로 γ: Epic 0-G (확장성 기반)**

- 블로커 없음
- 리스크: 실 요구 없이 추상화 (조기 추상화 금지 규칙) — Phase 1 에서 실 요구 발견 시 도입이 더 안전할 수 있음

### 그 외 대기 중

- **Task 0-E-5 (optional)**: logger ↔ Sentry bridge — `logger.error` 호출이 자동 Sentry 캡처 (30~45m)
- **Epic 0-B-Post (0006)**: RLS 정책 — Auth 완료 후에만 의미 있음
- **CI Node 24 전환**: `actions/checkout@v4` → `@v5`, `actions/setup-node@v4` → `@v5` (2026-06-02 전). 별도 짧은 Task (10~15m).

## 차단 요소

**없음** — 경로 α 연속은 즉시 시작 가능. 경로 β 는 Jayden 이 Google OAuth Client 발급하면 해금.

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
- [x] **Task 0-F-2: GitHub Actions CI + eslint/prettier baseline 정리 (CI 2회 녹색)**
- [x] **Task 0-F-1: ADR 5종 (001/002/003/006/007) + `docs/testing-accounts.md`**

## 세션 이력

- 2026-04-17 (오전): 프로젝트 초기화
- 2026-04-17 (오후): PRD v2.0 재작성 + 마스터 플랜 v3.0 수립 + Phase 0-A/0-C 완료
- 2026-04-17 (저녁): Epic 0-B 3/4 테이블 + Supabase 클라이언트 + 메모리 규칙 2개
- 2026-04-17 (밤): Epic 0-B 완결 (0004 함수 search_path + 0005 knowledge_chunks) + 타입 + 라운드트립 + 교훈 3건
- 2026-04-17 (심야): Epic 0-E 완결 (4/4 Task) + 독립 리뷰 2회 + 커밋 4건 + 교훈 3건
- **2026-04-17 (후속): Epic 0-F 50% (2/4 Task) — 0-F-2 CI + 0-F-1 ADR 5종 + `docs/testing-accounts.md` + 커밋 3건 + 교훈 1건**

## 마지막 업데이트

- 날짜: 2026-04-17 후속 (Epic 0-F 50%)
- 작성자: Jayden + Claude (Opus 4.7, effort=max)
