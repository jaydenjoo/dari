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
- **출력 구조**: `pino.multistream` 으로 두 개 stream 동시 운용
  1. **Primary**: dev 는 `pino-pretty` (colorize), 그 외는 JSON stdout → Vercel Logs
  2. **Sentry bridge** (아래 섹션) — `level >= error` 만 수신
- **base context**: `service: "dari"`, `env: NODE_ENV ?? "development"`, ISO timestamp

## Sentry bridge (error/fatal 자동 캡처)

`logger.error` / `logger.fatal` 호출 시 **별도 `Sentry.captureException` 호출 없이** 자동으로 Sentry 에 전송된다.

- **트리거**: pino level `>= 50` (error=50, fatal=60)
- **Sentry level 매핑**: level 60 → `"fatal"`, level 50 → `"error"`
- **Error 복원**: `{ err }` 필드가 객체(직렬화 후)면 `message`/`stack`/`type` 을 Error 로 재구성. 없으면 `msg` 문자열로 대체
- **extra payload**: 엔트리의 나머지 필드 (botId, requestId, msg 및 pino 시스템 필드 pid/hostname/time 포함) 를 Sentry `extra` 로 전달 → 디버깅 힌트 유지
- **Redact — 이중 방어선**:
  1. pino `redact.paths` (1-depth) 가 진입 단계에서 치환
  2. bridge 의 `redactDeep` (`@/core/observability/redact`) 이 2-depth 이상 중첩 민감 필드를 Sentry 전송 전에 한 번 더 차단
  3. `beforeSend` 가 서버/에지 진입 시점에 최종 재귀 redact
  - 모두 `sensitiveFields.ts` 단일 출처 공유 (ADR-006)
- **DSN 미설정**: `Sentry.captureException` 은 no-op → 앱 정상 동작
- **실패 내성**: bridge 내부 예외는 silent 처리 — 로거 훅이 앱을 깨뜨리지 않음

사용 예:

```ts
// 자동으로 Sentry 캡처됨 — captureException 직접 호출 불필요
logger.error({ err, botId }, "embedding 생성 실패");
logger.fatal({ err }, "DB 연결 불가 — 프로세스 종료");

// info/warn/debug 는 Sentry 로 전송되지 않음
logger.info({ botId }, "bot 생성");
logger.warn({ requestId }, "rate limit 근접");
```

### 민감값 코딩 규칙 (호출 측 책임)

자동 redact 는 **필드명** 기반이라 문자열 본문·스택에 박힌 민감값은 못 잡는다. 호출 측에서 아래 규칙 준수:

- **`msg` 문자열에 변수값 직접 삽입 금지**: `logger.error("token: " + t)` ❌ → `logger.error({ token: t }, "auth failed")` ✅ (field 는 redact 됨)
- **`Error` 메시지·스택에 민감값 금지**: `new Error("login failed for " + email)` ❌ → `new Error("login failed")` + `{ userId }` context ✅
- 새로운 민감 필드명은 `@/core/observability/sensitiveFields.ts` 에만 추가 → logger/Sentry 양쪽 자동 반영

## Redact 규칙

민감 필드는 `@/core/observability/sensitiveFields` 에서 **단일 출처**로 유지 — logger 의 `redact.paths` 와 Sentry `beforeSend` 가 **동일 목록** 참조. 추가 시 한 곳만 수정하면 양쪽 자동 반영.

예시: `authorization`, `cookie`, `password`, `token`, `apiKey`, `email`, `phone` 등 (`SENSITIVE_FIELD_NAMES` + `SENSITIVE_HEADER_NAMES`).

## 관련 ADR

- [ADR-006](../../../docs/adr/ADR-006-observability-stack.md) — 관찰성 스택: Pino + Sentry + sensitiveFields 공유

## 제약·주의사항

- **`console.log` 금지** (글로벌 규칙) — 모두 `logger` 경유
- 민감 필드 추가 시 `@/core/observability/sensitiveFields` 에서만 수정 → 이 모듈은 자동 반영
- ⚠️ **Edge 런타임 import 금지** (`middleware.ts`, `runtime: "edge"` segment 등): `pino-pretty` 가 `worker_threads` 를 요구 → Edge 에서 크래시. 경량 Edge 로거는 후일 별도 모듈로 대응
- ⚠️ **`LOG_LEVEL=silent` 시 Sentry bridge 도 차단됨** — multistream root 가 silent 이면 모든 stream 이 비활성화. 로그만 끄고 Sentry 는 유지해야 하면 root 를 `error` 이상으로, 필요 시 primary stream 만 `level="silent"` 로 변경할 것
- Request context 는 `AsyncLocalStorage` 기반 — **Node 런타임 전제**
- `createTestLogger(destination)` 는 테스트 전용 — stdout 대신 버퍼에 기록 (Sentry bridge 미포함)
