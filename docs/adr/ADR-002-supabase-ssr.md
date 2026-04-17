# ADR-002: Drizzle 제외, @supabase/ssr 일원화

**상태**: Accepted (원 계획: Supabase + Drizzle 하이브리드 → 실행 직전 재평가 후 반전)
**작성일**: 2026-04-17
**작성자**: Jayden + Claude

## 맥락 (Context)

Epic 0-B (DB 스키마) 구현 Task 3 Step 4 진입 직전. 원 계획은 **Drizzle = 쿼리 빌더** + **Supabase = auth/session** 하이브리드. 실행 단계에서 RLS 자동 적용 문제를 발견하고 재평가가 필요해짐.

## 결정 (Decision)

**Drizzle 제외. `@supabase/ssr` + `supabase-js` 일원화.** Supabase 클라이언트 3종 (browser / server / admin) 분리. 복잡 집계 쿼리는 Postgres RPC 로.

## 대안 (Alternatives Considered)

- **Drizzle 하이브리드 (원안)**: `postgres-js` 드라이버가 `DATABASE_URL` 로 직결 → **service_role 권한으로 연결 → RLS 완전 우회**. 매 쿼리마다 `SET LOCAL request.jwt.claim.sub = '...'` 수동 세션 설정 필요. Next.js SSR 쿠키/세션 공식 통합 없음.
- **Prisma**: 동일한 RLS 우회 문제. Supabase 공식 문서도 비권장.
- **Kysely**: 유사. 같은 RLS 이슈.

## 근거 (Rationale)

- 🔴 보안 중요 프로젝트에서 "쿼리마다 RLS 수동 설정" 은 실수 유발 1순위 경로.
- `@supabase/ssr` 는 Supabase 가 직접 관리하는 **RLS-aware 클라이언트** + Next SSR 쿠키 공식 지원.
- "에러 최소 + 효율" 원칙 = **공식 패턴 단일화**. 하이브리드는 첫 구현에서 비추천.
- 계획과 구현 사이 "실행 직전 재평가" 의 가치 실증 — 사전 완벽 계획은 불가능.

## 결과 (Consequences)

- ✅ RLS 가 쿼리마다 자동 적용 (auth.uid() 연동)
- ✅ SSR 쿠키/세션 공식 지원
- ✅ Supabase 생태계 이득 (타입 생성 / realtime / storage) 일관 사용
- ⚠️ 복잡 집계 쿼리는 RPC 또는 JS 단 로직으로 분산 — 성능 이슈 발생 시 Drizzle 부분 재도입 가능성 열어둠
- ⚠️ `supabase-js` 의 쿼리 빌더는 Drizzle 대비 타입 안전성 약함 → Zod 기반 수동 검증으로 보완 (ADR-003)

## 관련 ADR

- ADR-003 (Config jsonb + 수동 types)
- `docs/learnings.md`: "Drizzle + Supabase RLS 궁합 — 실행 직전 재평가 필요"
