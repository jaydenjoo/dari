# `@/core/logging` — 구조화 로깅 모듈

Pino 기반 JSON 구조화 로거. Request 컨텍스트 (`AsyncLocalStorage`) 와 민감 필드 redact 내장 (ADR-006).

## 파일

| 파일             | 역할                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------- |
| `logger.ts`      | Pino 인스턴스 (`logger`) + base context + redact paths + test 헬퍼                      |
| `context.ts`     | `AsyncLocalStorage` 기반 request 스코프 로거 (`RequestContext` + `createRequestLogger`) |
| `index.ts`       | 공개 API re-export                                                                      |
| `logger.test.ts` | 단위 테스트                                                                             |

## 공개 API

```ts
import {
  logger,
  createRequestLogger,
  type Logger,
  type RequestContext,
} from "@/core/logging";

// 1. 전역 로거 (request context 없음)
logger.info({ botId: "b1" }, "bot created");

// 2. Request 스코프 로거 (middleware / route handler)
const log = createRequestLogger({
  requestId: "r1",
  path: "/api/chat",
  method: "POST",
});
log.info("processing");
```

## 의존성

- `pino` — JSON 구조화 로깅
- Node `AsyncLocalStorage` — request 컨텍스트 격리
- `@/core/observability/sensitiveFields` (`buildPinoRedactPaths()`) — redact 경로 **단일 출처** 공유

## 로그 레벨 & 출력

- **레벨**: `LOG_LEVEL` env 로 조정 (허용: `fatal|error|warn|info|debug|trace|silent`)
  - 기본값: production 은 `info`, dev/test 는 `debug`
  - 유효하지 않은 값은 무시되고 기본값 사용 (`resolveLogLevel` 가드)
- **dev pretty transport**: `NODE_ENV !== production && !== test && NEXT_RUNTIME !== edge` 일 때 `pino-pretty` 사용
- **prod / test / edge**: JSON stdout → Vercel Logs + Sentry breadcrumb
- **base context**: `service: "dari"`, `env: NODE_ENV ?? "development"`, ISO timestamp

## Redact 규칙

민감 필드는 `@/core/observability/sensitiveFields` 에서 **단일 출처**로 유지 — logger 의 `redact.paths` 와 Sentry `beforeSend` 가 **동일 목록** 참조. 추가 시 한 곳만 수정하면 양쪽 자동 반영.

예시: `authorization`, `cookie`, `password`, `token`, `apiKey`, `email`, `phone` 등 (`SENSITIVE_FIELD_NAMES` + `SENSITIVE_HEADER_NAMES`).

## 관련 ADR

- [ADR-006](../../../docs/adr/ADR-006-observability-stack.md) — 관찰성 스택: Pino + Sentry + sensitiveFields 공유

## 제약·주의사항

- **`console.log` 금지** (글로벌 규칙) — 모두 `logger` 경유
- 민감 필드 추가 시 `@/core/observability/sensitiveFields` 에서만 수정 → 이 모듈은 자동 반영
- ⚠️ **Edge 런타임 import 금지** (`middleware.ts`, `runtime: "edge"` segment 등): `pino-pretty` 가 `worker_threads` 를 요구 → Edge 에서 크래시. 경량 Edge 로거는 후일 별도 모듈로 대응
- Request context 는 `AsyncLocalStorage` 기반 — **Node 런타임 전제**
- `createTestLogger(destination)` 는 테스트 전용 — stdout 대신 버퍼에 기록
