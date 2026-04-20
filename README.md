# Dari

> 사이트 주인이 **코드 한 줄**만 붙여넣으면 즉시 AI 상담원이 생기는 SaaS. 운영자가 자연어로 봇의 성격·지식을 정의하면 방문자와 한국어로 맞춤 대화.

**상태**: Phase 1 MVP 개발 중 · v0.1.0 · Stage 1 (Soft Launch) 진입 준비

---

## 🎯 주요 기능

**완료 (Phase 0 + Phase 1 일부)**:

- ✅ **봇 CRUD** — 슬러그 기반 생성·편집·소프트 삭제 (owner 격리 RLS)
- ✅ **DariConfig** — 단일 JSONB config 로 정체성/AI/대화 스타일 정의 (Zod 검증 + 마이그레이션)
- ✅ **지식 업로드** — text / URL 크롤링 (Firecrawl) / PDF·TXT·MD 파일 (unpdf)
- ✅ **RAG 응답** — Gemini `text-embedding-004` + pgvector ivfflat + Anthropic Claude
- ✅ **관리 대시보드** — 대화 목록·상세·KPI 집계·CSV export·삭제
- ✅ **Google OAuth** — Supabase Auth + Next 16 `proxy.ts` PKCE
- ✅ **관찰성** — Pino 로거 + Sentry Native Integration + 민감 필드 redact (2-depth)

**준비 중**:

- ⏳ **위젯 런타임 스크립트** — 사이트 embed 용 (Phase 2)
- ⏳ **결제/구독** — Phase 2 이후

---

## 🧰 기술 스택

| 레이어     | 선택                                             |
| ---------- | ------------------------------------------------ |
| Framework  | Next.js 16.2 (App Router + Turbopack)            |
| Language   | TypeScript strict, Zod 검증                      |
| DB         | Supabase Postgres + RLS + pgvector               |
| Auth       | Supabase Auth (Google OAuth)                     |
| AI         | Anthropic Claude (응답) + Google Gemini (임베딩) |
| 크롤링     | Firecrawl Cloud                                  |
| Rate limit | Upstash Redis (sliding window)                   |
| UI         | React 19 + Tailwind v4 + shadcn/ui               |
| 로깅       | Pino + Sentry Native Integration                 |
| 테스트     | Vitest (unit) + Playwright (E2E)                 |
| CI         | GitHub Actions + gitleaks                        |
| Host       | Vercel (Edge Runtime)                            |

> 각 선택의 근거는 [`docs/adr/`](./docs/adr/) 의 ADR 문서 참조.

---

## 🚀 시작하기

### 1. 의존성 설치

```bash
pnpm install
```

> Node 24 LTS 권장. `.nvmrc` 지정.

### 2. 환경변수 설정

전체 가이드 + 복사용 템플릿: [`docs/env-template.md`](./docs/env-template.md).

필수 키 요약:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL` + anon key + `SUPABASE_SERVICE_ROLE_KEY`
- Anthropic Claude: `ANTHROPIC_API_KEY` (`sk-ant-...`)
- Google Gemini: `GOOGLE_GENERATIVE_AI_API_KEY`
- Upstash Redis: REST URL + token
- Firecrawl: `FIRECRAWL_API_KEY` (`fc-...`)

`.env.local` 작성 후:

```bash
pnpm dev
```

- 정상: [`http://localhost:4000`](http://localhost:4000) 로 열림 (**포트 4000 고정**).
- 실패: `❌ 환경변수 검증 실패` + 누락/형식 오류 변수명.

### 3. DB 마이그레이션 (첫 실행 시)

```bash
supabase link --project-ref <your-supabase-project-ref>
supabase db push
```

마이그레이션 12개: [`supabase/migrations/`](./supabase/migrations/) (0001~0012).

---

## 📁 프로젝트 구조

```
src/
├── app/                    Next.js App Router (페이지·API·Server Actions)
│   ├── bots/               봇 CRUD + 관리 대시보드
│   ├── api/                API Routes (chat/export/health/widget-config)
│   ├── login/              Google OAuth 진입
│   └── auth/               callback / logout
├── core/                   인프라 레이어
│   ├── config/             DariConfig 스키마 + 버전 마이그레이션
│   ├── db/                 Supabase 클라이언트 + generated types
│   ├── knowledge/          RAG 파이프라인 (ingest/retrieval/file/url)
│   ├── logging/            Pino 로거 + Sentry bridge
│   ├── observability/      redactDeep 공유 유틸
│   └── ratelimit/          Upstash 슬라이딩 윈도우 limiter
├── shared/                 도메인 레이어 (Server+Client 공용)
│   ├── bots/               봇 상태 레이블/클래스
│   ├── conversations/      상태·이메일 마스킹·방문자·CSV·메타
│   ├── config/             env.ts (Zod 부팅 검증)
│   └── time/               상대 시각 포맷
├── components/ui/          shadcn/ui 변형
└── proxy.ts                세션 게이트 (구 middleware)

supabase/migrations/        SQL 마이그레이션 (0001~0012)
docs/                       PRD · ADR · environments · env-template · learnings
tests/e2e/                  Playwright 시나리오
```

---

## 🛠️ 개발 명령

| 명령                                | 역할                                   |
| ----------------------------------- | -------------------------------------- |
| `pnpm dev`                          | 개발 서버 (`:4000`, Turbopack)         |
| `pnpm build`                        | 프로덕션 빌드 (widget + Next)          |
| `pnpm typecheck`                    | TypeScript strict 검증                 |
| `pnpm lint`                         | ESLint                                 |
| `pnpm format` / `pnpm format:check` | Prettier (`--write` / `--check`)       |
| `pnpm test`                         | Vitest 단위/통합 (현재 **468 passed**) |
| `pnpm test:watch`                   | Vitest watch 모드                      |
| `pnpm test:coverage`                | 커버리지 리포트                        |
| `pnpm test:e2e`                     | Playwright E2E                         |
| `pnpm check`                        | typecheck + lint + format + test 일괄  |

CI 는 위 `pnpm check` 와 `pnpm build` 검증 + gitleaks secret scan 을 실행한다. 상세: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

---

## 📚 주요 문서

- [**`docs/PRD.md`**](./docs/PRD.md) — 제품 요구사항 + Epic/Task 분해 + "만들지 않을 것"
- [**`docs/environments.md`**](./docs/environments.md) — 환경 분리 전략 (local / preview / prod)
- [**`docs/env-template.md`**](./docs/env-template.md) — 환경변수 발급처 + 값 가이드
- [**`docs/adr/`**](./docs/adr/) — Architecture Decision Records
- [**`docs/learnings.md`**](./docs/learnings.md) — 운영 지식 + 설계 교훈 (compound engineering)
- [**`PROGRESS.md`**](./PROGRESS.md) — 현재 진행 상황 + Backlog

---

## 🔒 보안 요점

- `.env.local` 은 `.gitignore` 등록 + gitleaks pre-commit 으로 이중 차단
- 모든 쿼리는 Supabase RLS 로 owner 격리 — 앱 레이어 `bot_id` 재검증 동반 (URL 조작 IDOR 방어)
- Server Action + API Route 는 UUID/슬러그 형식을 DB 왕복 전 검증 (early 404 — enumeration 차단)
- PII 마스킹: 이메일 `ab***@domain`, Supabase `PostgrestError.details/hint` raw 로깅 금지, Pino redact 2-depth
- CSV export 는 OWASP CSV Injection 3단 방어 (prefix + wrap + escape) + UTF-8 BOM
- 🟡 현재 **가맹점 정보/대외비** 등급. 결제 도입 시 🔴 승격 후 재검토.

보안 규약 상세: [`docs/learnings.md`](./docs/learnings.md) 의 "Supabase PostgrestError ...", "CSV Injection OWASP 3단 방어" 등.

---

## 🗺️ 로드맵

- **v0.1.0** (현재) — Phase 1 MVP 관리 대시보드 완결 (Epic 1-8)
- **Stage 1 진입 (예정)** — Vercel 프로젝트 생성 + `dairect.kr` 도메인 + `dari-prod` Supabase 분리
- **Stage 2~3** — 지인 베타 → 퍼블릭 오픈

상세 이행 계획: [`docs/environments.md §2`](./docs/environments.md).
