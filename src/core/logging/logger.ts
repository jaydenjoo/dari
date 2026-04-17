import * as Sentry from "@sentry/nextjs";
import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
  type StreamEntry,
} from "pino";
import pretty from "pino-pretty";
import { redactDeep } from "../observability/redact";
import {
  buildPinoRedactPaths,
  REDACTED,
} from "../observability/sensitiveFields";

/**
 * Dari 구조화 로거 (Pino).
 *
 * ⚠️ Node runtime 전용.
 *    middleware.ts 나 `runtime: "edge"` 세그먼트에서 import 금지 —
 *    `pino-pretty` stream 이 worker_threads 를 요구하므로 Edge 에서 크래시.
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
 * 로깅 시 자동 redact 대상 경로.
 * 실제 필드명 정의는 `core/observability/sensitiveFields.ts` 단일 진실 공급원.
 * pino redact 는 완전 일치 기반 → `passwordHint` 같은 이름 유사 필드는 안전.
 */
export const REDACT_PATHS = buildPinoRedactPaths();

const rootLevel: LogLevel = resolveLogLevel(
  process.env.LOG_LEVEL,
  IS_PROD ? "info" : "debug",
);

const baseOptions: LoggerOptions = {
  level: rootLevel,
  base: {
    service: "dari",
    env: process.env.NODE_ENV ?? "development",
  },
  redact: {
    paths: [...REDACT_PATHS],
    censor: REDACTED,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const usePretty = !IS_PROD && !IS_TEST && !IS_EDGE;

/**
 * pino 가 직렬화한 err 오브젝트 ({ type, message, stack, ... }) 를
 * Sentry.captureException 이 요구하는 Error instance 로 복원한다.
 * 직렬화 과정에서 instanceof Error 정보가 소실되므로 필요.
 */
function normalizeToError(err: unknown, fallbackMsg?: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object") {
    const obj = err as { message?: unknown; stack?: unknown; type?: unknown };
    const restored = new Error(
      typeof obj.message === "string"
        ? obj.message
        : (fallbackMsg ?? "logger.error"),
    );
    if (typeof obj.stack === "string") restored.stack = obj.stack;
    if (typeof obj.type === "string") restored.name = obj.type;
    return restored;
  }
  return new Error(fallbackMsg ?? "logger.error");
}

/**
 * Sentry bridge stream — error/fatal 레벨만 Sentry 로 라우팅한다.
 *
 * - redact 는 pino 단계에서 이미 적용됨 → entry 에 민감값 없음
 * - Sentry DSN 미설정 시 `captureException` 은 no-op (안전)
 * - 실패 시 silent — 로거 훅이 앱을 깨뜨리면 안 됨
 */
function createSentryStream(): DestinationStream {
  return {
    write(raw: string): void {
      try {
        const entry = JSON.parse(raw) as {
          level?: unknown;
          err?: unknown;
          msg?: unknown;
          [key: string]: unknown;
        };
        if (typeof entry.level !== "number" || entry.level < 50) return;

        // msg 는 extra 에 남겨 운영 컨텍스트 보존 (err.message 와 별개).
        // pid/hostname/time 같은 pino 시스템 필드도 extra 에 포함 — 운영 가시성 의도.
        // err 만 destructure — Error 복원에 필요.
        const { level, err, ...rest } = entry;
        // pino redact 는 1-depth 경로 기반 → 2-depth 이상 중첩 민감 필드를 `beforeSend`
        // 전에 한 번 더 차단하여 이중 방어선 유지 (ADR-006 redact 단일 출처).
        const extra = redactDeep(rest) as Record<string, unknown>;
        const errorToReport = normalizeToError(
          err,
          typeof entry.msg === "string" ? entry.msg : undefined,
        );
        Sentry.captureException(errorToReport, {
          level: level >= 60 ? "fatal" : "error",
          extra,
        });
      } catch {
        /* silent — 로거 훅이 앱을 깨뜨리면 안 됨 */
      }
    },
  };
}

/**
 * ⚠️ `rootLevel === "silent"` 일 경우 pino root 가 모든 출력을 차단하므로
 *    Sentry bridge 도 함께 비활성화된다 (multistream 동작 특성).
 *    운영에서 로그는 끄되 Sentry 는 유지해야 하는 요구가 생기면 root 를 "error"
 *    이상으로 두고 primary stream 만 level="silent" 로 둘 것.
 */
function buildStreams(): StreamEntry<LogLevel>[] {
  const primary: StreamEntry<LogLevel> = usePretty
    ? {
        level: rootLevel,
        stream: pretty({
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
        }),
      }
    : { level: rootLevel, stream: process.stdout };

  return [primary, { level: "error", stream: createSentryStream() }];
}

export const logger: Logger = pino(
  baseOptions,
  pino.multistream(buildStreams()),
);

/**
 * 테스트 전용 logger 팩토리 — destination 에 JSON 라인을 기록한다.
 * 단일 stream (Sentry bridge 미포함) — redact 등 순수 동작 검증용.
 * 프로덕션 코드에서 import 하면 안 된다 (`index.ts` 에 노출되지 않음).
 */
export function createTestLogger(destination: DestinationStream): Logger {
  return pino(baseOptions, destination);
}

export type { Logger } from "pino";
