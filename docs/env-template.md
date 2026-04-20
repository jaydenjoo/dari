# 환경변수 템플릿 (.env.local 작성 가이드)

> **역할**: `.env.example` 대체 문서 (보안 정책으로 `.env*` 파일 생성 차단됨)
> **사용**: 아래 블록을 복사 → 프로젝트 루트에 `.env.local` 파일로 저장 → 실제 값 입력
> **검증**: 앱 부팅 시 `src/shared/config/env.ts`가 자동 검증. 누락/형식 오류 시 즉시 실패.

---

## 📋 `.env.local` 내용 (복사용)

```env
# ============================================================
# Dari — 환경변수
# ============================================================

# ─── Node 환경 ───
NODE_ENV=development

# ─── App URL ───
NEXT_PUBLIC_APP_URL=http://localhost:4000

# ─── Supabase ───
# 발급: https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste-anon-key-from-supabase-dashboard>

# 서버 전용 — 절대 클라이언트에 노출 금지
SUPABASE_SERVICE_ROLE_KEY=<paste-service-role-key-from-supabase-dashboard>

# supabase CLI (migration) 전용 — 앱 런타임 불요 (Drizzle 미사용, ADR-002)
# 로컬 `supabase db push` 실행 시만 필요. Vercel 환경변수에 등록 불요.
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# ─── AI Providers ───
# Anthropic (Claude): https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Google Generative AI (Gemini embedding): https://aistudio.google.com/apikey
GOOGLE_GENERATIVE_AI_API_KEY=xxxxx

# ─── Rate Limiting (Upstash Redis) ───
# 발급: https://console.upstash.com/ → Create Database → REST tab
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxxx

# ─── Observability (dev 환경에서는 선택) ───
# Sentry: https://sentry.io → Project → Settings → Client Keys (DSN)
SENTRY_DSN=https://xxxxx@oXXXXX.ingest.sentry.io/XXXXX
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@oXXXXX.ingest.sentry.io/XXXXX
# Sentry 환경 태그 — local/preview/prod 구분 (환경별 값: docs/environments.md §7)
# 서버·엣지용
SENTRY_ENVIRONMENT=development
# 브라우저용 (`NEXT_PUBLIC_*` 빌드 타임 인라인, Vercel Preview/Production 각각 등록)
# 로컬 dev 서버(`pnpm dev`)는 아래 `development` 사용, Vercel 빌드는 Dashboard 등록값 우선
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development

# ─── 웹 크롤링 (Firecrawl Cloud — 필수) ───
# Firecrawl: https://www.firecrawl.dev/
# Task 1-7-b: URL 지식 업로드 파이프라인이 사용. 부팅 시 `fc-` prefix 검증.
FIRECRAWL_API_KEY=fc-xxxxx
```

---

## 🔑 각 키 발급처 요약

| 변수                             | 어디서?                                                   | 필수?       | 참고                                 |
| -------------------------------- | --------------------------------------------------------- | ----------- | ------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`       | Supabase Dashboard → Settings → API → Project URL         | ✅          | Phase 0-B에서 발급                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | 같은 페이지 → `anon` `public` 키                          | ✅          | 브라우저 노출 OK                     |
| `SUPABASE_SERVICE_ROLE_KEY`      | 같은 페이지 → `service_role` `secret` 키                  | ✅          | ⚠️ 절대 클라이언트 노출 금지         |
| `DATABASE_URL`                   | Dashboard → Settings → Database → Connection string → URI | 🟡 CLI only | 로컬 migration 시만, 런타임 불요     |
| `ANTHROPIC_API_KEY`              | https://console.anthropic.com/                            | ✅          | `sk-ant-`로 시작                     |
| `GOOGLE_GENERATIVE_AI_API_KEY`   | https://aistudio.google.com/apikey                        | ✅          | Gemini 임베딩용                      |
| `UPSTASH_REDIS_REST_URL`         | https://console.upstash.com/ → DB 생성 → REST 탭          | ✅          | Rate limit용                         |
| `UPSTASH_REDIS_REST_TOKEN`       | 같은 페이지                                               | ✅          |                                      |
| `SENTRY_DSN`                     | https://sentry.io → 프로젝트 생성 → Client Keys           | 🟡 dev 선택 | 프로덕션 권장                        |
| `NEXT_PUBLIC_SENTRY_DSN`         | 동일 (클라이언트용)                                       | 🟡 dev 선택 |                                      |
| `SENTRY_ENVIRONMENT`             | 직접 설정 (`development`/`preview`/`production`)          | 🟡 dev 선택 | 서버·엣지 Sentry 환경 구분           |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | 동일 값 (브라우저용)                                      | 🟡 dev 선택 | 빌드 타임 인라인, 환경별 등록        |
| `FIRECRAWL_API_KEY`              | https://www.firecrawl.dev/                                | ✅          | `fc-` 로 시작. Task 1-7-b URL 크롤링 |

---

## 🌍 환경별 값 차이 (local / preview / prod)

**요약**: 위 복사용 블록은 **`local` 전용**. `preview` + `prod` 값은 Vercel Dashboard Env UI 에 등록한다.
운영 전략·이행 로드맵은 [environments.md](./environments.md) 참조.

| 변수                             | `local`                 | `preview`                  | `prod`                    |
| -------------------------------- | ----------------------- | -------------------------- | ------------------------- |
| `NODE_ENV`                       | `development`           | `production` (Vercel 자동) | `production`              |
| `NEXT_PUBLIC_APP_URL`            | `http://localhost:4000` | `$VERCEL_URL` (자동 주입)  | `https://dairect.kr`      |
| `NEXT_PUBLIC_SUPABASE_URL`       | dari-dev URL            | dari-dev URL (공유)        | **dari-prod URL**         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | dari-dev 키             | dari-dev 키                | **dari-prod 키**          |
| `SUPABASE_SERVICE_ROLE_KEY`      | dari-dev 키             | dari-dev 키                | **dari-prod 키**          |
| `DATABASE_URL`                   | (선택, CLI 용)          | ❌ 불필요                  | ❌ 불필요 (로컬 CLI only) |
| `ANTHROPIC_API_KEY`              | 개인 개발 키            | 개인 개발 키               | **프로덕션 키**           |
| `GOOGLE_GENERATIVE_AI_API_KEY`   | 개인 개발 키            | 개인 개발 키               | **프로덕션 키**           |
| `UPSTASH_REDIS_REST_URL/TOKEN`   | dari-dev Redis          | dari-dev Redis             | **dari-prod Redis**       |
| `SENTRY_ENVIRONMENT`             | `development`           | `preview`                  | `production`              |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `development`           | `preview`                  | `production`              |
| `FIRECRAWL_API_KEY`              | 개인 개발 키            | 개인 개발 키               | **프로덕션 키**           |

> 🚨 **절대 공유 금지**: AI 키·Redis·Supabase 는 **환경별로 반드시 분리**. prod 키를 local 에서 쓰면 비용 폭발, 반대면 개발 실수가 prod 데이터를 오염.

### Vercel 환경변수 등록 팁

Vercel Dashboard → Project → Settings → Environment Variables 에서 각 변수당 **3개 체크박스** 제공:

- `dari-prod` 키 → **Production 만** 체크 (preview 노출 금지)
- `dari-dev` 키 → **Preview + Development** 체크
- 공유 키 (Sentry DSN 등) → 3개 모두 체크 가능

자세한 절차: [environments.md §4-1](./environments.md)

---

## 🛡️ 보안 주의사항

1. **`.env.local`은 절대 커밋 금지** — `.gitignore`에 이미 등록됨 (`.env*`)
2. **`NEXT_PUBLIC_*` 접두사 의미**:
   - 브라우저 번들에 포함됨 → 누구나 볼 수 있음
   - 민감 정보(서버 키)는 이 접두사 **없이** 작성
3. **`SUPABASE_SERVICE_ROLE_KEY`는 RLS 우회 가능한 관리자 키** — 노출 시 DB 전체 장악 위험
4. **API 키 유출 시** → 즉시 해당 서비스 대시보드에서 rotate

---

## 🧪 검증 방법

```bash
pnpm dev
# 또는
npm run dev
```

- 정상: Next.js 서버 정상 기동
- 실패: `❌ 환경변수 검증 실패` 메시지 + 어떤 변수가 잘못됐는지 표시

---

## 📝 첫 시작 시 최소 구성 (로컬 테스트용)

Supabase 프로젝트 없이 env 검증만 통과하려면 임시로 아래 값 사용 가능:

```env
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:4000

# Supabase는 Phase 0-B에서 실제 프로젝트 생성 후 교체
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<placeholder-anon-key-for-dev-boot>
SUPABASE_SERVICE_ROLE_KEY=<placeholder-service-key-for-dev-boot>
DATABASE_URL=postgresql://postgres:pw@localhost:5432/postgres

# AI 키는 Phase 1 Task 1-3 전에 실제 발급
ANTHROPIC_API_KEY=sk-ant-placeholder
GOOGLE_GENERATIVE_AI_API_KEY=placeholder_gemini_key_20_chars

# Upstash는 Phase 1 Task 1-0 전에 실제 발급
UPSTASH_REDIS_REST_URL=https://placeholder.upstash.io
UPSTASH_REDIS_REST_TOKEN=placeholder_token_at_least_20_chars

# Firecrawl은 Task 1-7-b 전에 실제 발급 (fc- 접두어 필수)
FIRECRAWL_API_KEY=fc-placeholder-for-boot-only
```

> **주의**: 위 placeholder 값으로는 실제 기능(DB 접근, AI 호출) 동작 안 함. 부팅 통과 + 코드 작성만 가능.
