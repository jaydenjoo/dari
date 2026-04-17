import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";

/**
 * Dari 구조화 로거 (Pino).
 *
 * ⚠️ Node runtime 전용.
 *    middleware.ts 나 `runtime: "edge"` 세그먼트에서 import 금지 —
 *    `pino-pretty` transport 가 worker_threads 를 요구하므로 Edge 에서 크래시.
 *    Edge 로깅은 후일 경량 console 기반 별도 모듈로 대응.
 */

const IS_PROD = process.env.NODE_ENV === "production";
const IS_TEST = process.env.NODE_ENV === "test";
const IS_EDGE = process.env.NEXT_RUNTIME === "edge";

const VALID_LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

function resolveLogLevel(
  raw: string | undefined,
  fallback: LogLevel,
): LogLevel {
  return raw && (VALID_LOG_LEVELS as readonly string[]).includes(raw)
    ? (raw as LogLevel)
    : fallback;
}

/**
 * 로깅 시 자동 redact 대상.
 * - 최상위 / 1-depth 중첩 / 흔한 HTTP 헤더를 모두 커버.
 * - pino redact 는 완전 일치 기반 → `passwordHint` 같은 이름 유사 필드는 안전.
 */
export const REDACT_PATHS = [
  // 최상위
  "password",
  "token",
  "authorization",
  "apiKey",
  "api_key",
  "secret",
  "clientSecret",
  "client_secret",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "privateKey",
  "private_key",
  "serviceRoleKey",
  "service_role_key",
  // 1-depth 중첩
  "*.password",
  "*.token",
  "*.authorization",
  "*.apiKey",
  "*.api_key",
  "*.secret",
  "*.clientSecret",
  "*.client_secret",
  "*.accessToken",
  "*.access_token",
  "*.refreshToken",
  "*.refresh_token",
  "*.privateKey",
  "*.private_key",
  "*.serviceRoleKey",
  "*.service_role_key",
  // HTTP 헤더 (req/res 객체 로깅 시 흔히 노출)
  "headers.authorization",
  "headers.cookie",
  "headers.x-api-key",
  "headers.x-auth-token",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.x-api-key",
  "req.headers.x-auth-token",
] as const;

const baseOptions: LoggerOptions = {
  level: resolveLogLevel(process.env.LOG_LEVEL, IS_PROD ? "info" : "debug"),
  base: {
    service: "dari",
    env: process.env.NODE_ENV ?? "development",
  },
  redact: {
    paths: [...REDACT_PATHS],
    censor: "[Redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const usePrettyTransport = !IS_PROD && !IS_TEST && !IS_EDGE;

function createPrettyDestination(): DestinationStream {
  return pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:HH:MM:ss.l",
      ignore: "pid,hostname",
    },
  });
}

export const logger: Logger = usePrettyTransport
  ? pino(baseOptions, createPrettyDestination())
  : pino(baseOptions);

/**
 * 테스트 전용 logger 팩토리 — destination 에 JSON 라인을 기록한다.
 * 프로덕션 코드에서 import 하면 안 된다 (`index.ts` 에 노출되지 않음).
 */
export function createTestLogger(destination: DestinationStream): Logger {
  return pino(baseOptions, destination);
}

export type { Logger } from "pino";
