# 환경 분리 전략 (Environments)

> **역할**: Dari 프로젝트의 `local` / `preview` / `prod` 환경 정의와 운영 규칙.
> **관련 ADR**: [ADR-008](./adr/ADR-008-environment-separation.md) (결정 근거)
> **연관 문서**: [env-template.md](./env-template.md) (환경변수 값)

---

## 1. 요약

Dari 는 현재 **1인 운영 규모**(Soft Launch Stage 1~4) 이므로 **2환경 Lean** 으로 시작한다.

| 환경      | 정의                             | 호스팅             | 도메인                                                                                                   | Supabase 프로젝트                  |
| --------- | -------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `local`   | 개발자 로컬 머신                 | `pnpm dev` @ :4000 | `http://localhost:4000`                                                                                  | `dari-dev` (개발 전용 프로젝트)    |
| `preview` | Vercel Preview (PR 브랜치 자동)  | Vercel Edge        | `dari-git-<branch>-<team>.vercel.app`                                                                    | `dari-dev` 공유 (preview = dev)    |
| `prod`    | 프로덕션 (Soft Launch Stage 1~4) | Vercel Production  | 테스트 단계 `dari-theta.vercel.app` → 10곳 업체 검증 후 `dairect.kr` 커스텀 도메인 연결 (ADR-009 §9-1 γ) | `dari-prod` (Stage 1 진입 시 생성) |

**`stg` (스테이징) 환경은 의도적 제외**. Vercel Preview 가 자연스러운 stg 역할을 담당한다. Stage 3(퍼블릭 오픈) 이후 필요성 재평가.

> 🎯 **판단 기준**: 운영 중인 실사용자가 "베타 10명" 을 넘어가고, "DB schema 변경이 prod 트래픽과 충돌 가능" 한 상황이 3회 이상 발생하면 그때 `stg` 도입 재평가.

---

## 2. 현재 상태 & 이행 로드맵

```
[2026-04-25 현재] ── 데모 모드 (dev/prod 미분리, Jayden 결정 보류)
                     ├─ Supabase 프로젝트 1개 (dari = pxdopzlaffjcxqfrqidq) — local + Vercel prod 공용
                     │   ⚠️ .env.local 이 prod 를 직접 참조 (위험 인지 + 보류)
                     ├─ Vercel prod 배포 활성 (dari-theta.vercel.app, ADR-009 γ 호스트)
                     ├─ 활성 봇 2개: dairect (포트폴리오 데모) + dari (self-reference)
                     ├─ Supabase Authentication URL Configuration 등록 완료 (2026-04-21 Ⅲ)
                     ├─ NEXT_PUBLIC_WIDGET_CDN_URL Vercel Production+Preview 명시 등록 (2026-04-21 Ⅲ)
                     └─ Jayden prod Google OAuth end-to-end 로그인 성공 확인

[분리 재진행 트리거] ── 아래 중 1개 충족 시 dari-dev 신규 프로젝트 생성 + .env.local 분리
                     ├─ 외부 사이트 1곳과 정식 embed 계약 체결
                     ├─ 봇 수 5개 초과
                     ├─ LLM 페어 프로그래밍 중 prod 데이터 사고 1회 발생 (preventive)
                     └─ Stage 2 (베타 10명) 진입 직전

[분리 시 작업] ── (재개 시점에 docs/learnings.md 2026-04-25 항목 + 본 §2 참조)
                     ├─ 새 Free organization 생성 (비용 0)
                     ├─ dari-dev 프로젝트 생성 (ap-northeast-2, Free Nano)
                     ├─ pgvector enable + 마이그 0001~0015 apply
                     ├─ Auth URL Config + Google OAuth client 재사용
                     ├─ .env.local 의 SUPABASE 3 키 교체 + "dari-dev (NOT prod)" 주석
                     └─ prod 잔재 정리 (e2e-main@dari.test + rls-test-b@example.com)

[Stage 3~4 이후] ── stg 도입 재평가 조건 충족 시 (§10)
                    → ADR-008 갱신 후 dari-stg 프로젝트 추가
                    → `dairect.kr` 은 별개 프로젝트 (`jaydenjoo/dairect` 리포). Dari 자체는 `dari-theta.vercel.app` 유지
```

> **⚠️ 보류 결정 근거 (2026-04-25 Ⅱ)**: 봇 2개 데모 모드 + 1인 운영 + 비계약 단계 → 분리 비용 ($0 + ~1.5h) 대비 위험 노출 시간이 짧음 (계약 진입 시점까지). 단 LLM 페어 프로그래밍 시 prod DB 직접 수정 위험 항상 인지 + 안전 체크리스트 운영. 분리 재개 시 비용 0 (Free org) + 1~1.5시간 복구.

---

## 3. 환경변수 차이 매트릭스

| 변수                             | `local`                     | `preview`                   | `prod`                                                                                     |
| -------------------------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`                       | `development`               | `production` (Vercel 자동)  | `production`                                                                               |
| `NEXT_PUBLIC_APP_URL`            | `http://localhost:4000`     | `$VERCEL_URL` (Vercel 자동) | `https://dairect.kr`                                                                       |
| `NEXT_PUBLIC_SUPABASE_URL`       | dari-dev URL                | dari-dev URL                | **dari-prod URL** (교체)                                                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | dari-dev anon               | dari-dev anon               | **dari-prod anon** (교체)                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`      | dari-dev service_role       | dari-dev service_role       | **dari-prod service_role** (교체)                                                          |
| `DATABASE_URL`                   | (선택, migration CLI 전용)  | ❌ 불필요                   | ❌ 불필요 (migration 은 로컬 CLI)                                                          |
| `ANTHROPIC_API_KEY`              | 개인 개발 키 (저비용)       | 개인 개발 키                | **프로덕션 키** (사용량 분리)                                                              |
| `GOOGLE_GENERATIVE_AI_API_KEY`   | 개인 개발 키                | 개인 개발 키                | **프로덕션 키**                                                                            |
| `UPSTASH_REDIS_REST_URL`         | dari-dev Redis              | dari-dev Redis              | **dari-prod Redis** (교체)                                                                 |
| `UPSTASH_REDIS_REST_TOKEN`       | dari-dev token              | dari-dev token              | **dari-prod token**                                                                        |
| `SENTRY_DSN`                     | (선택, 로컬 디버그용)       | prod 와 동일 DSN            | prod DSN                                                                                   |
| `NEXT_PUBLIC_SENTRY_DSN`         | (선택)                      | prod 와 동일 DSN            | prod DSN                                                                                   |
| `SENTRY_ENVIRONMENT`             | `development`               | `preview`                   | `production`                                                                               |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `development`               | `preview`                   | `production`                                                                               |
| `FIRECRAWL_API_KEY`              | 개인 개발 키 (`fc-` 접두어) | 개인 개발 키                | **프로덕션 키**                                                                            |
| `NEXT_PUBLIC_WIDGET_CDN_URL`     | (default 사용)              | (default 사용)              | `dari-theta.vercel.app/widget.js` → 10곳 테스트 후 `dairect.kr/widget.js` (ADR-009 §9-1 γ) |

> **원칙**: **dev 비용 ≠ prod 비용**. AI 키·Redis·Supabase 는 환경별로 **반드시 분리**. 한 key 공유 시 prod 트래픽이 dev 크레딧을 소진하거나 반대로 개발 실수가 prod 데이터를 오염시킨다.

---

## 4. 시크릿 저장처 매핑

| 환경      | 저장처                                      | 접근 권한            | 갱신 방법                          |
| --------- | ------------------------------------------- | -------------------- | ---------------------------------- |
| `local`   | `.env.local` (프로젝트 루트, gitignored)    | Jayden 개인          | 수동 편집                          |
| `preview` | Vercel Dashboard → Project → Settings → Env | Jayden (Vercel 계정) | Vercel UI (`Preview` 범위 체크)    |
| `prod`    | Vercel Dashboard → Project → Settings → Env | Jayden (Vercel 계정) | Vercel UI (`Production` 범위 체크) |
| CI        | GitHub Secrets (`Settings → Secrets`)       | 리포 Admin           | GitHub UI                          |

### 4-1. Vercel 환경변수 범위 (중요)

Vercel 은 각 환경변수에 대해 **3개 체크박스** 제공: `Production` / `Preview` / `Development`.
Dari 의 권장 설정:

- **dari-prod 키** (서비스 키): `Production` **만** 체크 (preview 에 절대 노출 금지)
- **dari-dev 키** (개발 키): `Preview` + `Development` 체크
- **공유 키** (Sentry DSN 등): 3개 모두 체크 가능

### 4-2. GitHub Secrets (CI 전용)

- CI 는 **실 키를 쓰지 않는다**. `openssl rand -hex 24` 로 동적 placeholder 생성 (Task 0-F-2 참조).
- 실 키가 필요한 시점(E2E 테스트 등)이 오면 그때 `.env.test` 및 GitHub Secrets 전략 재정의.

---

## 5. 배포 플로우

```
┌─────────────┐    push    ┌──────────────┐   auto    ┌─────────────────┐
│ feature/xxx │──────────▶│ GitHub       │──────────▶│ Vercel Preview  │
└─────────────┘            │ (PR 오픈)    │           │ (branch 별 URL) │
                           └──────┬───────┘           └─────────────────┘
                                  │                         │
                                  │ PR merge                │ QA / 리뷰
                                  ▼                         │
                           ┌──────────────┐   auto    ┌─────▼───────────┐
                           │ main         │──────────▶│ Vercel Prod     │
                           │              │           │ dairect.kr       │
                           └──────────────┘           └─────────────────┘
                                  │
                                  │ (병렬)
                                  ▼
                           ┌──────────────┐
                           │ GitHub Actions│  verify + secret-scan
                           │ CI           │  (0-F-2)
                           └──────────────┘
```

### 5-1. 로컬 → prod 배포 체크리스트 (Stage 1 진입 시)

**1회성 셋업** (Jayden 수동):

1. Vercel 계정에서 리포 import → 프로젝트 생성
2. Build Command: `pnpm build` / Output: `.next` (Turbopack 는 Vercel 자동 감지)
3. 환경변수 등록 (§4-1 범위 원칙 준수) — `NEXT_PUBLIC_WIDGET_CDN_URL` 포함 (ADR-009 §9-1 γ)
4. 테스트 단계: 도메인 연결 보류 (Vercel 기본 `dari-theta.vercel.app` 유지). **10곳 업체 테스트 완료 후** `dairect.kr` 연결 + DNS 설정 + `NEXT_PUBLIC_WIDGET_CDN_URL` 값 교체
5. Supabase `dari-prod` 프로젝트 신규 생성
6. `dari-dev` → `dari-prod` 로 migration 순차 적용 (§6 참조)
7. Stage 1 smoke test: 본인 계정으로 봇 1개 생성 → 응답 확인

**반복 배포**:

- PR open → Preview URL 자동 → 리뷰 → main merge → prod 자동 배포
- 긴급 hotfix: `main` 에 직접 push 금지. 항상 PR 경유 (Branch Protection 예정)

---

## 6. Migration 반영 순서 (Supabase)

### 6-1. 원칙

- **local 에서 먼저 검증** → **prod 에 수동 반영** (Phase 1 초반까지)
- Stage 3 이후 CI 에서 자동 migration apply 검토 (지금은 오버엔지니어링)

### 6-2. 절차 (Stage 1 이후)

```bash
# 1. local 에서 migration 작성 + 검증
supabase migration new <name>           # 파일 생성
# SQL 편집...
supabase db reset                        # local 재검증

# 2. local 에서 앱 동작 확인
pnpm test && pnpm build

# 3. prod 에 반영
supabase link --project-ref <dari-prod-ref>
supabase db push                         # prod 반영 (⚠️ 되돌리기 어려움)

# 4. Vercel 재배포 (코드가 migration 기대할 때)
# Vercel Dashboard → Deployments → Redeploy
```

### 6-3. 데이터 이동 정책

- **prod → dev 데이터 복제 금지** (개인정보/대화 로그 포함 가능)
- 재현 필요 시 **prod 에서 문제 추출 → 익명화 → dev seed 작성**
- schema 만 동기화 (data 는 하지 않음)

---

## 7. Sentry 환경 태그

각 환경의 에러·성능 데이터를 Sentry UI 에서 구분하려면 환경 변수 2개를 세팅한다. Dari 는 fallback chain 을 적용해 미설정 시 `NODE_ENV` 로 대체한다.

```ts
// sentry.server.config.ts + sentry.edge.config.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment:
    process.env.SENTRY_ENVIRONMENT ?? // 'development' | 'preview' | 'production'
    process.env.NODE_ENV ?? // fallback
    "development",
});

// instrumentation-client.ts (브라우저)
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? // 빌드 타임 인라인
    process.env.NODE_ENV ?? // fallback
    "development",
});
```

> 📌 **브라우저 특성**: `NEXT_PUBLIC_*` 접두사 변수는 Next.js 빌드 타임에 번들로 인라인된다. 따라서 Vercel Preview 와 Production **각각 등록**해야 값이 빌드별로 주입된다 (동적 주입 불가). 미등록 시 `NODE_ENV` fallback 으로 Preview/Prod 가 `production` 으로 병합된다.

### Sentry UI 에서 활용

- **Issues 필터**: `environment:production` 으로 실사용자 에러만 필터 (서버/엣지 기준)
- **Release 추적**: Vercel deploy ID 를 `release` 로 설정하면 배포별 회귀 감지 가능
- **Alert 규칙**: `environment:production AND level:error` → Jayden 알림. dev/preview 는 알림 제외.

### Stage 2 (지인 베타 10명) 진입 전 대비

브라우저·서버·엣지 모두 3종 환경 구분 완료 (Task γ-3, 2026-04-19). 운영 체크리스트:

- **Vercel 환경 등록 확인**: `NEXT_PUBLIC_SENTRY_ENVIRONMENT` 가 Preview(`preview`) / Production(`production`) 각각 등록되었는지 Settings → Environment Variables 에서 검증
- **Sentry UI 필터 준비**: Issues 목록에서 `environment:production` 필터로 실사용자 에러만 집계
- **Alert 규칙**: `environment:production AND level:error` → Jayden 알림. preview 는 PR 단위 사전 검증용으로 노이즈 감안하고 관찰

### Vercel Native Integration (2026-04-20 재설정, 단일 경로 확정)

Sentry 조직 2개 공존(수동 `dari-vb` + Vercel 자동 `jayden-f0`)으로 인한 source map/release 이중화 이슈를 2026-04-20 해결. 두 조직 완전 삭제 후 **Vercel Marketplace → Sentry Native Integration** 단일 경로로 재설치. 현행 단일 조직/프로젝트: `jayden-kz / jayden-projects` (DSN host `o4511246432796672.ingest.us.sentry.io`).

**Vercel Integration 이 자동 주입하는 env 7개** (Project → Settings → Environment Variables UI 숨김 주입, 빌드/런타임 양쪽 사용):

| env                           | 역할                                      | 코드 참조                                                               |
| ----------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`      | 브라우저 + 서버/엣지 DSN (fallback 경유)  | `instrumentation-client.ts` / `sentry.{server,edge}.config.ts` fallback |
| `SENTRY_ORG`                  | 빌드 시 source map 업로드 대상 조직       | `next.config.ts` (`withSentryConfig`)                                   |
| `SENTRY_PROJECT`              | 빌드 시 source map 업로드 대상 프로젝트   | `next.config.ts` (`withSentryConfig`)                                   |
| `SENTRY_AUTH_TOKEN`           | source map + release 인증 토큰            | `next.config.ts` (빌드 전용)                                            |
| `SENTRY_PUBLIC_KEY`           | DSN 의 public key 부분 (Integration 메타) | ➖ 미사용                                                               |
| `SENTRY_VERCEL_LOG_DRAIN_URL` | Vercel 로그 → Sentry 전송 URL             | ➖ 미사용 (선택 기능)                                                   |
| `SENTRY_OTLP_TRACES_URL`      | OpenTelemetry tracing endpoint            | ➖ 미사용 (고급 기능)                                                   |

> ⚠️ **`SENTRY_DSN` (non-public) 은 주입되지 않음**. Vercel Native Integration 설계 철학은 `NEXT_PUBLIC_*` 단일 DSN 을 서버/클라가 공유. 이에 대응해 `sentry.server.config.ts` + `sentry.edge.config.ts` 는 `SENTRY_DSN ?? NEXT_PUBLIC_SENTRY_DSN` fallback 적용 (2026-04-20). 로컬 `.env.local` 에서는 두 변수 모두 명시 (env-template.md 일관성).

**검증 방법** (재설치/이관 시):

1. Vercel Dashboard → Project → Settings → Integrations → Sentry "Configured" 상태
2. 배포 로그 3개 라인 동시 확인 (UI 에 env 가 안 보여도 이게 진실의 근원):
   - `Organization: jayden-kz`
   - `Uploaded X sourcemaps`
   - `Creating release ...`
3. Sentry Issues 탭에 의도적 에러 1건 도착 (임시 `/api/sentry-test` 라우트 → 검증 후 즉시 삭제)

**주의사항 (Vercel Marketplace Sentry 특성)**:

- "Create New Sentry Account" 는 기존 Sentry 계정 탐색 없이 **별도 조직 자동 생성**. Resource Name 이 **프로젝트 slug** 로 반영되지만 **조직 slug** 은 Vercel 계정 기준 자동 slug (예: `jayden-kz`) 으로 생성. 이후 rename 은 Sentry 대시보드에서 가능하나 URL 변경 전파 시간 고려.
- 설치 시 **Plan = Developer (Free)** 선택 필수 (5k errors/월, 1 user). Team/Business 는 신용카드 요구.
- Next.js 앱 라우터에서 테스트 라우트 경로에 `_` prefix 사용 금지 — private folder 로 취급되어 라우팅 제외 (`__sentry-test` 실패 케이스, `sentry-test` 로 수정).

---

## 8. Preview 데이터 격리 전략

Preview 는 `dari-dev` Supabase DB 를 공유한다 (ADR-008 결정). 여러 PR 동시 진행 시 데이터 충돌 완화 전략:

| 전략                        | 원리                                | 오버헤드  | 권장    |
| --------------------------- | ----------------------------------- | --------- | ------- |
| **PR 별 test user 분리**    | Plus addressing (`jayden+pr12@...`) | 없음      | ⭐ 권장 |
| Bot slug 에 브랜치명 prefix | `{branch-name}-<slug>`              | 수동 규율 | 보조    |
| Preview 읽기 전용           | 쓰기 경로 검증 불가                 | 매우 큼   | 비권장  |

### 8-1. 권장 절차

- **Playwright 도입 전 (현재)**: 수동 QA 시 PR 번호를 이메일 alias 로 사용 (`jayden+pr12@gmail.com`).
- **Playwright 도입 후 (Epic 0-D 이후)**: [testing-accounts.md §1](./testing-accounts.md) 의 Plus addressing 규칙을 Preview 에도 동일 적용.

### 8-2. 누적 테스트 데이터 정리

- 주 1회 `dari-dev` DB cleanup. 스크립트 위치 예정: `scripts/dev-cleanup.ts` (Epic 0-D 이후 첫 Playwright job 과 함께 도입).

### 8-3. 격리 한계 (수용 비용)

- Preview 는 `dari-dev` 와 **동일 스키마 / 동일 데이터 공간**. 스키마 breaking change 시 여전히 prod 반영 전 완전 격리 검증 불가.
- 이는 ADR-008 "2환경 Lean" 선택의 수용 비용 — §10 stg 재평가 기준에서 판단.

### 8-4. 재평가 트리거

- 1주일 내 PR 당 데이터 충돌 사고 **2회 이상** 발생 시 → §10 의 조건 #2 에 해당, stg 도입 재논의.

---

## 9. 운영 안전 규칙

### 🔴 절대 금지

- `SUPABASE_SERVICE_ROLE_KEY` 를 클라이언트 번들에 노출 (Next.js `NEXT_PUBLIC_` prefix 금지)
- prod 환경에서 `supabase db reset` 실행 (모든 데이터 삭제)
- prod AI 키로 local 테스트 돌리기 (비용 폭발 + 크레딧 소진)
- `.env.local` 을 commit (gitleaks 가 차단하지만, 의도적 우회 금지)
- prod Supabase 대시보드에서 직접 SQL 실행 (migration 파일 없이)

### 🟡 주의

- 🔴 **RLS 미활성화 상태 경고** (Epic 0-D Auth + 0-B-Post RLS 완료 전): Preview URL 을 **외부 공유 금지**. 인증 없는 API 엔드포인트에 외부인이 접근하면 RLS 부재로 `dari-dev` DB 의 타 test user 데이터가 노출될 수 있음. Epic 0-B-Post 완료 후 본 경고 제거.
- preview 에서 dari-dev DB 를 쓰므로, 여러 PR 동시 테스트 시 **데이터 충돌 가능**. 필요 시 각 PR 별 격리 스키마 또는 test user 분리.
- Vercel Preview URL 은 공개. 인증 없는 페이지에 민감 UI 노출 주의.
- `NODE_ENV=production` 하에서만 Next.js 가 최적화 빌드. local 에서도 실성능 보려면 `pnpm build && pnpm start`.

---

## 10. stg 환경 도입 재평가 기준

아래 중 **3개 이상** 충족 시 ADR-008 을 갱신하여 `dari-stg` 프로젝트 추가:

1. 실사용자 10명 이상 + 유료 전환 존재
2. Schema 변경이 prod 트래픽과 충돌한 사건 3회 이상
3. PR 당 QA 소요 시간 > 1시간 (preview 로 커버 불가한 시나리오 많음)
4. 팀 인원 Jayden 외 추가됨 (협업 시 preview 공유 DB 충돌 빈발)
5. 외부 파트너/SI 고객이 사전 승인 환경을 요구

> 현재(2026-04-17): 0개 충족. 경로 A(2환경 Lean) 유지.

---

## 11. 관련 문서

- [ADR-008](./adr/ADR-008-environment-separation.md) — 이 전략을 택한 이유
- [env-template.md](./env-template.md) — 변수별 실제 값과 발급처
- [testing-accounts.md](./testing-accounts.md) — E2E 테스트 계정 전략 (ADR-007)
- [ADR-001](./adr/ADR-001-nextjs-16-app-router.md) — Next.js 16.2 + Vercel 배포 가정
- [ADR-002](./adr/ADR-002-supabase-ssr.md) — Supabase 일원화 (프로젝트 분리 기반)
