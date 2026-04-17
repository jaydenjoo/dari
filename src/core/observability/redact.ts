import { REDACTED, SENSITIVE_FIELD_NAMES } from "./sensitiveFields";

/**
 * 민감 필드명을 재귀적으로 `[Redacted]` 로 치환한다.
 *
 * Pino `redact` 는 경로 명시 기반 (최상위 + 1-depth glob) 이라 2-depth 이상 중첩
 * 민감 필드를 놓칠 수 있다. 이 함수는 그 사각지대를 메워 **Sentry bridge 와
 * `beforeSend` 가 같은 로직으로 민감값을 차단**하도록 한다 (ADR-006 단일 출처).
 *
 * - immutability: 원본을 mutate 하지 않고 새 객체 반환
 * - 순환 참조: `MAX_DEPTH` 초과 시 `[Redacted]` 로 치환하여 무한 재귀 차단
 * - 필드명 대소문자는 `SENSITIVE_FIELD_NAMES` 정의와 정확히 일치해야 함
 */

const SENSITIVE_FIELD_SET: ReadonlySet<string> = new Set(SENSITIVE_FIELD_NAMES);
const MAX_DEPTH = 10;

export function redactDeep(value: unknown): unknown {
  return walk(value, 0);
}

function walk(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value === null || typeof value !== "object") return value;
  // 내장 non-plain-object 는 원본 유지.
  // `Object.entries()` 가 빈 `{}` 를 반환해 Date/RegExp/Map/Set 가 직렬화 과정에서
  // 빈 객체로 치환되는 데이터 손실을 방지. Error 도 Sentry SDK 가 별도 직렬화 하도록 위임.
  if (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof Error
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_FIELD_SET.has(key)
      ? REDACTED
      : walk(val, depth + 1);
  }
  return result;
}
