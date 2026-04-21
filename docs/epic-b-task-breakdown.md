# Phase 2 Epic B — 운영 품질 Hardening Task 분해

> **역할**: Epic B 진입 전 `phase-2-plan.md §2 Epic B` 의 bullet list 를 **실행 가능한 Task** 로 분해한 문서.
>
> **배경**: 이번 세션 (2026-04-21 Ⅲ) 에서 Phase 2 Epic A 완결 + `env.ts` 분리 + CI 현대화 완료. 다음 Epic 은 **B (운영 품질)** — 실사용자 오픈 전 안정성 확보가 목적. Task 1-8 리뷰에서 누적된 Backlog + 새롭게 식별된 보안/운영 이슈 통합.
>
> **작성 시점**: 2026-04-21
>
> **관련 문서**: [phase-2-plan.md](./phase-2-plan.md), [phase-1-release-checklist.md](./phase-1-release-checklist.md)

---

## 1. Epic B Task 맵 (권장 순서)

```
B-1 (보안 hardening) → B-6 (Playwright CI) → B-2 (audit log) → B-3 (soft delete) → B-4 (KPI 확장) → B-5 (품질 sweep)
```

| Task    | 주제                                                       | 규모  | 선결                         | 우선순위       |
| ------- | ---------------------------------------------------------- | ----- | ---------------------------- | -------------- |
| **B-1** | 작은 보안 hardening (typed confirmation + rate limit 통합) | ~2h   | 없음                         | 🔴 즉시        |
| **B-6** | Playwright E2E CI job (Task 3-C 이월)                      | ~1.5h | Supabase 테스트 환경         | 🟡 출시 품질   |
| **B-2** | audit log (감사 로그 테이블 + 이벤트 기록)                 | ~3h   | B-1 완료                     | 🟡 RGPD/DPIA   |
| **B-3** | soft delete (tombstone + 복구 + cron)                      | ~2h   | B-2 선행 (audit 이벤트 기록) | 🟡 데이터 보호 |
| **B-4** | 원가 환산 + 일별 차트 (bot_stats 확장)                     | ~2h   | 없음                         | 🟢 UX          |
| **B-5** | 코드 품질 sweep (shared barrel / server-only 재검토)       | ~1.5h | 없음                         | 🟢 기술 부채   |

**Epic B 예상 총 소요**: **5~6 세션 (1~2주)** — 각 Task 독립 진행 가능.

---

## 2. Task 상세

### B-1. 작은 보안 hardening

**범위**:

- `봇 삭제 UI` 에 typed confirmation (봇 이름 입력 → 일치하면 삭제 버튼 활성화). 리뷰 code MEDIUM 이월 (Task 1-8-d).
- `DELETE /api/conversations/[id]` + `/api/conversations/[id]/export/route.ts` + bot 삭제 Server Action 에 **rate limit 통합** (기존 `factory.ts` 패턴 재사용). 리뷰 sec MEDIUM 이월 (Task 1-8-d).

**선결 조건**: 없음

**파일**:

- 신규 2: `src/core/ratelimit/bot-delete-limiter.ts` + `bot-export-limiter.ts` (factory pattern)
- 수정 3~5: 봇 삭제 버튼 컴포넌트 + actions.ts + 관련 테스트

**검증**:

- vitest 신규 테스트 (rate limit factory pattern 기존 test 재사용)
- Playwright E2E typed confirmation 시나리오 추가 (optional)

**위험도**: 🟢 낮음 — 기존 패턴 재사용.

---

### B-6. Playwright E2E CI job (Task 3-C 이월)

**범위**:

- `.github/workflows/ci.yml` 에 `e2e` job 추가 (별도 job, verify 와 병렬 또는 direct 후속)
- Supabase 테스트 환경 설계: 전용 프로젝트 (`dari-ci`) 또는 `dari-dev` 공유 + CI 전용 test user
- CI secrets: `SUPABASE_CI_URL` / `SUPABASE_CI_ANON_KEY` / `SUPABASE_CI_SERVICE_ROLE` / `SUPABASE_CI_TEST_USER_EMAIL` 등
- `pnpm playwright install --with-deps chromium` (2분)
- dev server spawn (Next.js + static host @ :4001 — 현 `playwright.config.ts` 의 webServer 배열 재사용)
- 실패 시 artifact (trace/screenshot) 업로드 — 🔒 **service_role 키 마스킹 검증 필수**

**선결 조건**: Supabase 테스트 환경 결정 (새 프로젝트 vs 공유)

**파일**:

- `.github/workflows/ci.yml` (e2e job 섹션 추가)
- `tests/e2e/support/auth-helpers.ts` 조정 (CI 에서만 CI test user 사용)
- `testing-accounts.md` 업데이트

**검증**:

- CI 에서 E2E 25+ 테스트 통과
- 로컬 `pnpm test:e2e` 여전히 동작

**위험도**: 🟡 중간 — CI 환경 설계 이슈 / Flaky 가능성 / artifact 보안 이슈.

**교훈 반영**: sec L-2 (Task 1-8-c 리뷰) — playwright artifact 에 `Authorization: Bearer <service_role>` 헤더 포함 위험. 보존 기간 단축 + 접근 제어 이중화.

---

### B-2. audit log

**범위**:

- `audit_logs` 테이블 마이그레이션 (0013): `id uuid PK`, `event_type text`, `entity_type text`, `entity_id uuid`, `actor_id uuid FK auth.users`, `metadata jsonb`, `created_at timestamptz`
- RLS: owner 본인 읽기만 (`SELECT` = `actor_id = auth.uid()`, `INSERT` = `to authenticated` with actor_id match)
- Server Action / API 에서 중요 이벤트 기록: 봇 생성/수정/삭제, 대화 삭제, export
- (선택) `/bots/[slug]/audit` 간단 조회 페이지

**선결 조건**: B-1 (rate limit 통합 후 진입 = 로그 증폭 방지)

**파일**:

- 신규 1: `supabase/migrations/0013_create_audit_logs.sql`
- 신규 2: `src/core/audit/{log,types}.ts` + 테스트
- 수정 ~5: 관련 Server Action/API 에 `logAuditEvent()` 추가

**검증**: vitest (log 함수) + Supabase RLS 시뮬레이션

**위험도**: 🟢 낮음 — 추가 테이블 + 헬퍼.

**교훈 반영**: RGPD 삭제 요청 시 "언제 누가 삭제했나" 조회 가능 — 법적 근거.

---

### B-3. soft delete

**범위**:

- `bots` + `conversations` 테이블에 `deleted_at timestamptz` 컬럼 추가 (0014)
- 삭제 Server Action 수정: `DELETE` → `UPDATE deleted_at = now()`
- RLS 업데이트: `deleted_at IS NULL` 필터 (기본 숨김)
- 휴지통 UI (`/bots/trash` + 복구 버튼) — optional
- Cron / Supabase Edge Function: 30일 후 실 DELETE

**선결 조건**: B-2 (audit 이벤트 기록 선행 → 실제 삭제 시점 추적)

**파일**:

- 신규 1: `supabase/migrations/0014_add_deleted_at.sql`
- 수정 ~10: 삭제 Server Action + RLS 정책 업데이트 + 쿼리 필터

**검증**: Supabase RLS 시뮬레이션 10+ 시나리오

**위험도**: 🟡 중간 — 마이그레이션 + RLS 정책 변경 범위 넓음. 기존 데이터 호환성 중요.

---

### B-4. 원가 환산 + 일별 차트

**범위**:

- `bot_stats` RPC 확장: `usd_cents bigint` 필드 추가 (Claude 토큰 × 단가)
- `getBotDailyStats(botId, range)` 신규 RPC: 일별 메시지수/토큰/원가
- `/bots/[slug]` KPI 섹션에 14일 차트 (Chart.js 또는 Recharts)
- 단가 테이블 (input/output 토큰당 USD) 하드코딩 → Phase 3 에서 env 로 이관

**선결 조건**: 없음 — 독립

**파일**:

- 신규 1: `supabase/migrations/0015_add_usd_cents_to_bot_stats.sql`
- 신규 1: `src/components/bots/DailyChart.tsx`
- 수정 2: `src/app/bots/[slug]/stats-section.tsx` + `stats-util.ts`

**검증**: vitest + E2E (optional)

**위험도**: 🟢 낮음 — 데이터 표현 레이어.

---

### B-5. 코드 품질 sweep

**범위**:

- **shared barrel `index.ts`**: `src/shared/{bots,conversations,time}/index.ts` 로 barrel re-export. import 경로 간소화. 리뷰 code MEDIUM (Task 1-8-e) 이월.
- **server-only 경계 재검토**: `src/shared/` 하위 중 서버 전용 헬퍼에 `"server-only"` import 추가. Task 1-8-e 에서 `conversations/csv,meta` 는 완료, 나머지 점검.
- 리뷰 이월된 소소한 code quality (type re-export / LOW dead code 정리)

**선결 조건**: 없음 — 독립

**파일**:

- 신규 ~4: `src/shared/{bots,conversations,time,config}/index.ts` (barrel)
- 수정 ~15: import 경로 간소화 (consumer 측)

**검증**: typecheck 0 / vitest 491 유지

**위험도**: 🟢 낮음 — refactor 전용 (Task 2 env 분리 경험 재활용).

---

## 3. Epic B 완결 기준 (Go/No-Go)

- [ ] B-1 ~ B-6 6개 Task 모두 완결
- [ ] vitest baseline 유지 (491+ passed)
- [ ] CI coverage threshold 유지 (B-5 추가로 커버리지 상향 가능)
- [ ] Supabase 신규 마이그레이션 (0013~0015) prod 반영 + advisor 0 이슈
- [ ] 독립 리뷰 (code + security) 각 Task 완료 후 Fix-then-ship 또는 Ship
- [ ] `docs/phase-2-plan.md` §2 Epic B bullet list → 본 문서 Task 링크로 대체

---

## 4. Epic B 이후 (Phase 2 Epic C/D 전환 신호)

Epic B 완결 시점에 아래 조건 평가 → 다음 Epic 결정:

| 조건                           | Epic C (멀티테넌트)              | Epic D (카카오톡)          |
| ------------------------------ | -------------------------------- | -------------------------- |
| 실사용자 10명+                 | 🟡 보류 (5명)                    | 🔴 즉시 (카카오 채널 신청) |
| SI 계약 3건+                   | 🔴 즉시 (워크스페이스 필수)      | 🟡 대기                    |
| 카카오 비즈니스 채널 승인 완료 | 🟡 대기                          | 🔴 즉시                    |
| SaaS 수익 모델 확정            | 🔴 즉시 (가격 정책 + 멀티테넌트) | 🟡 대기                    |

---

## 5. 변경 이력

| 날짜         | 내용                                |
| ------------ | ----------------------------------- |
| 2026-04-21 Ⅲ | Epic B Task 분해 초안 작성 (6 Task) |
