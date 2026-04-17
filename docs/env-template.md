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
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─── Supabase ───
# 발급: https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste-anon-key-from-supabase-dashboard>

# 서버 전용 — 절대 클라이언트에 노출 금지
SUPABASE_SERVICE_ROLE_KEY=<paste-service-role-key-from-supabase-dashboard>

# Drizzle 마이그레이션용 (Settings → Database → Connection string → URI)
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

# ─── 웹 크롤링 (선택 — 미설정 시 cheerio 폴백) ───
# Firecrawl: https://www.firecrawl.dev/
FIRECRAWL_API_KEY=fc-xxxxx
```

---

## 🔑 각 키 발급처 요약

| 변수                            | 어디서?                                                   | 필수?       | 참고                         |
| ------------------------------- | --------------------------------------------------------- | ----------- | ---------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase Dashboard → Settings → API → Project URL         | ✅          | Phase 0-B에서 발급           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 같은 페이지 → `anon` `public` 키                          | ✅          | 브라우저 노출 OK             |
| `SUPABASE_SERVICE_ROLE_KEY`     | 같은 페이지 → `service_role` `secret` 키                  | ✅          | ⚠️ 절대 클라이언트 노출 금지 |
| `DATABASE_URL`                  | Dashboard → Settings → Database → Connection string → URI | ✅          | 비밀번호 치환 필요           |
| `ANTHROPIC_API_KEY`             | https://console.anthropic.com/                            | ✅          | `sk-ant-`로 시작             |
| `GOOGLE_GENERATIVE_AI_API_KEY`  | https://aistudio.google.com/apikey                        | ✅          | Gemini 임베딩용              |
| `UPSTASH_REDIS_REST_URL`        | https://console.upstash.com/ → DB 생성 → REST 탭          | ✅          | Rate limit용                 |
| `UPSTASH_REDIS_REST_TOKEN`      | 같은 페이지                                               | ✅          |                              |
| `SENTRY_DSN`                    | https://sentry.io → 프로젝트 생성 → Client Keys           | 🟡 dev 선택 | 프로덕션 권장                |
| `NEXT_PUBLIC_SENTRY_DSN`        | 동일 (클라이언트용)                                       | 🟡 dev 선택 |                              |
| `FIRECRAWL_API_KEY`             | https://www.firecrawl.dev/                                | 🟡 선택     | 미설정 시 cheerio 폴백       |

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
NEXT_PUBLIC_APP_URL=http://localhost:3000

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
```

> **주의**: 위 placeholder 값으로는 실제 기능(DB 접근, AI 호출) 동작 안 함. 부팅 통과 + 코드 작성만 가능.
