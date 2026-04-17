# ADR-007: 테스트 전략 — Vitest 네이티브 tsconfigPaths + Playwright 보류

**상태**: Accepted
**작성일**: 2026-04-17
**작성자**: Jayden + Claude

## 맥락 (Context)

Phase 0 단계의 테스트 전략 확정 필요. 검증 대상은 —

- **Unit**: Zod 스키마, 유틸, config 마이그레이션
- **Integration**: DB RPC, `/api/health`, env 로딩 체인
- **E2E**: 브라우저 UI 흐름 (Auth, 봇 CRUD, 위젯 임베드)

현재 UI 페이지 거의 없음 + Auth 미구현 → E2E 를 지금 도입하는 비용 대비 가치 판단 필요.

## 결정 (Decision)

1. **Unit + Integration**: **Vitest 4.x** + `resolve.tsconfigPaths: true` (Vite 네이티브). `vite-tsconfig-paths` 플러그인 **불사용**.
2. **E2E (Playwright)**: Epic 0-D (Auth) 완료 이후 도입. Phase 0 에서는 **전략만 문서화** (`docs/testing-accounts.md`).
3. **커버리지**: 80%+ 유지 (글로벌 규칙). Phase 0 기준 29 테스트 통과.

## 대안 (Alternatives Considered)

- **Jest**: Next 공식 가이드 존재. 그러나 ESM 1급 지원 / 속도 / Vite 에코 호환 모두 Vitest 우세.
- **Playwright 를 지금 설치**: 검증할 UI · Auth 없음 → 빈 인프라. maintenance 비용만 쌓임.
- **Cypress**: Playwright 가 다중 브라우저 · 병렬 · trace viewer 전면 우세.
- **`vite-tsconfig-paths` 플러그인**: Vite 5 이하 필수였으나 Vite 6+ / Vitest 4+ 에서 네이티브 내장 — 플러그인은 중복 의존성.

## 근거 (Rationale)

- Vitest 네이티브 옵션 채택 = 테스트 실행 604ms → 136ms (4.4×). `learnings.md` 기록.
- 공식 Next 가이드 vs 도구 런타임 권고 충돌 시 → **도구 런타임 권고 우선** (learnings.md 교훈).
- Playwright 조기 설치는 **검증 대상 없는 빈 인프라** → maintenance 비용만 쌓임.
- 계정 · fixture · secret 정책은 지금 정해둬야 Auth 구현 시 "어떻게 만들지" 재논의 제거 → `docs/testing-accounts.md` 선행.

## 결과 (Consequences)

- ✅ Phase 0 Vitest 단일 스택 — 29 테스트 통과, CI 2분 이내
- ✅ Playwright 도입 시점에 계정 · fixture · secret 정책 이미 확정 → 재논의 없음
- ⚠️ Phase 0 단계에서 UI 회귀 자동 검증 부재 → 수동 검증 의존
- ⚠️ Playwright 설치 시 CI 시간 증가 → 단일 job 구조 재평가 필요 (별도 E2E job 분리 유력)

## 관련 ADR

- ADR-001 (Next.js)
- `docs/testing-accounts.md` (E2E 계정 · fixture · secret 전략)
- `docs/learnings.md`: "공식 가이드 vs 도구 런타임 권고 충돌 시"
