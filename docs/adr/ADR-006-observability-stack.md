# ADR-006: 관찰성 스택 — Pino + Sentry + sensitiveFields 공유 모듈

**상태**: Accepted
**작성일**: 2026-04-17
**작성자**: Jayden + Claude

## 맥락 (Context)

🔴 보안 중요 프로젝트. P1 안정성의 핵심이 관찰성. 요구 3 가지 —

1. structured server log + redact (민감 필드 자동 마스킹)
2. error 집계 + source map + release tracking
3. 민감 필드 **단일 정의** → log / Sentry 양쪽이 동일하게 마스킹 (drift 방지)

## 결정 (Decision)

- **Server log**: `pino` 10.3 (+ `pino-pretty` dev transport) — JSON 출력 + `redact` 옵션 자동 마스킹
- **Error tracking**: `@sentry/nextjs` 10.49.0 — `instrumentation.ts` + `instrumentation-client.ts` + `withSentryConfig` 패턴
- **민감 필드 공유**: `src/core/observability/sensitiveFields.ts` = Pino `REDACT_PATHS` + Sentry `beforeSend` 양쪽이 import

## 대안 (Alternatives Considered)

- **Winston**: Node 로깅 고전. Pino 가 성능 (~5x faster on serialize) / 생태계 / Next.js 친화 우세.
- **console + Sentry 만**: structured log 부재 + redact 부재. 🔴 프로젝트 불가.
- **Pino 와 Sentry 각 독립 sensitive list**: Task 0-E-2 / 0-E-3 독립 code-reviewer 리뷰에서 CRITICAL 2건씩 (총 4건) 발견 — 양쪽이 drift 되어 한 쪽은 redact 되지만 다른 쪽은 노출.

## 근거 (Rationale)

- Pino `redact` = serialize 시점 **경로 제거** (단순 문자열 replace 가 아님) → 성능·정확성 양립.
- Sentry `beforeSend` 훅은 event 객체 전체 (`event.user / breadcrumbs[].data / request.query_string / extra / contexts`) 후킹 가능 → 전 PII 경로 일괄 스위핑.
- **단일 배열 import** 로 drift 원천 차단. 필드 추가 시 한 파일만 수정 → 자동 양쪽 적용.
- 독립 code-reviewer 서브에이전트가 CRITICAL 을 사전에 걸러냄을 실증 (learnings.md).

## 결과 (Consequences)

- ✅ 민감 필드 추가 시 한 파일만 수정
- ✅ Task 0-E-2 / 0-E-3 독립 리뷰에서 CRITICAL 8건 사전 탐지
- ⚠️ Pino + `pino-pretty` transport 는 `worker_threads` 요구 → **Edge runtime 불가**. `middleware.ts` 등을 만들 때 별도 경량 logger 필요.
- ⚠️ Sentry `disableLogger` 는 Turbopack 미지원 → 관련 tree-shake 손실 감수 (ADR-001 와 연동)
- ⚠️ `/api/health` 엔드포인트 같은 "env 체인 로드 라우트" 가 없으면 env 검증이 실제로 돌지 않음 — 조기 배선 규칙을 준수 (learnings.md)

## 관련 ADR

- ADR-001 (Next.js + Turbopack)
- `docs/learnings.md`: "독립 code-reviewer 를 통한 보안 사각 발견"
