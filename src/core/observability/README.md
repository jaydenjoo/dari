# `@/core/observability` — 관찰성 모듈

Sentry `beforeSend` hook, 민감 필드 공유 정의, 헬스 체크 유틸. ADR-006 (관찰성 스택) + ADR-008 (환경 분리) 기반.

## 파일

| 파일                 | 역할                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `beforeSend.ts`      | Sentry 이벤트 전송 전 PII / 민감 필드 redact                          |
| `sensitiveFields.ts` | 민감 필드 목록 단일 출처 (logger + Sentry 양쪽 공유)                  |
| `health.ts`          | 헬스 체크 (`runHealthChecks`) — `/api/health` Route Handler 에서 사용 |
| `index.ts`           | `beforeSend` re-export (나머지는 파일 직접 import)                    |
| `beforeSend.test.ts` | 단위 테스트 (redact 정확성)                                           |
| `health.test.ts`     | 단위 테스트 (check 실행·타임아웃)                                     |

## 공개 API

```ts
import { beforeSend } from "@/core/observability";
import {
  SENSITIVE_FIELD_NAMES,
  SENSITIVE_HEADER_NAMES,
  REDACTED,
  buildPinoRedactPaths,
} from "@/core/observability/sensitiveFields";
import {
  runHealthChecks,
  type HealthCheckResult,
  type HealthReport,
} from "@/core/observability/health";
```

## Sentry 통합

`sentry.{server,edge}.config.ts` + `instrumentation-client.ts` 에서 `beforeSend` 를 `Sentry.init` 에 전달:

```ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  sendDefaultPii: false,
  beforeSend, // ← 이 모듈의 hook
});
```

## `beforeSend` 책임

- 이벤트의 `request.data` / `extra` / `contexts` 를 재귀 순회하며 민감 필드 삭제·`REDACTED` 치환
- `query_string` 전체 제거 (토큰 유출 방지)
- 재귀 깊이 10 제한 (순환 참조 방어)
- 원본 mutate 금지 — 새 객체 반환 (immutability, 글로벌 규칙)

## `sensitiveFields` 구성

- `SENSITIVE_FIELD_NAMES` — body/query 필드명 배열 (예: `password`, `token`, `apiKey`, `email` …)
- `SENSITIVE_HEADER_NAMES` — HTTP 헤더 배열 (예: `authorization`, `cookie`, `x-api-key` …)
- `REDACTED` — 치환 상수 (`"[Redacted]"`)
- `buildPinoRedactPaths()` — Pino `redact.paths` 설정 생성 (logger 에서 사용)

## 헬스 체크

`runHealthChecks(supabase)` 는 주입받은 Supabase client 로 헬스 체크를 실행해 `HealthReport` 를 반환.

- **순수 함수 설계**: Supabase client 를 인자로 주입받음 → Next.js 런타임 의존 없이 단위 테스트 가능
- **현재 check**: **DB ping 1종** (`bots` 테이블 SELECT 1). 향후 Redis / AI provider 추가 시 병렬로 확장
- **타임아웃**: DB 2s 고정 (`DB_TIMEOUT_MS`) — 느린 DB 가 가용성 판정을 오래 막지 않음
- **로깅 정책**: 성공은 조용, 실패만 `logger.error` — 고빈도 호출 시 로그 노이즈 방지
- **읽기 전용** — 쓰기 작업 금지
- **호출처**: `/api/health` Route Handler (`createAdminClient()` 를 인자로 전달)

## 의존성

- `@sentry/nextjs` — Sentry SDK (`beforeSend` 는 `Sentry.init` 의 hook 으로 전달)
- `@/core/logging` — health check 실패 로깅 (`logger.error`)
- `@/core/db` 타입 — `runHealthChecks` 가 `SupabaseClient<Database>` 를 인자로 받음

> **주의**: 이 모듈 자체는 `@/shared/config/env` 나 `process.env.SENTRY_*` 를 직접 참조하지 않음. Sentry 환경변수는 `sentry.{server,edge}.config.ts` + `instrumentation-client.ts` 에서 `process.env` 직접 조회 — `beforeSend` 는 설정값 무관.

## 관련 ADR·문서

- [ADR-006](../../../docs/adr/ADR-006-observability-stack.md) — 관찰성 스택 결정
- [ADR-008](../../../docs/adr/ADR-008-environment-separation.md) — Sentry environment 태그 전략
- [docs/environments.md §7](../../../docs/environments.md) — Sentry 환경 태그 fallback chain + 브라우저 제약

## 제약·주의사항

- **민감 필드 수정은 이 모듈에서만** — logger / Sentry 양쪽 영향. 추가 시 `beforeSend.test.ts` + `logger.test.ts` 통과 필수
- **브라우저 Sentry 는 preview/prod 구분 불가** (`NEXT_PUBLIC_*` 제약). Stage 2 진입 전 `NEXT_PUBLIC_SENTRY_ENVIRONMENT` 도입 검토 ([environments.md §7](../../../docs/environments.md))
- `sendDefaultPii: false` 전제 — Sentry 자동 PII 수집 비활성. 필요 시 `beforeSend` 에서 masking
- `runHealthChecks` DB 타임아웃 2s 고정 (`DB_TIMEOUT_MS`). check 추가 시 각 독립 타임아웃 유지 — 전체 지연 상한 관리
- `/api/health` 는 **인증 불요 엔드포인트** — 외부 모니터링 (Vercel, UptimeRobot 등) 호출 가능해야 함. 응답에 민감 정보 포함 금지
