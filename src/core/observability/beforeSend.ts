// `@sentry/core` 대신 `@sentry/nextjs` 에서 import — 공식 re-export 경로.
// `@sentry/core` 를 직접 import 하면 package.json 에 명시 안 된 transitive 의존성이라
// Vercel strict 빌드에서 TS2307 (Cannot find module). 로컬 pnpm hoist 로는 우연히
// 해석됐지만 Vercel 에서 빌드 실패 (learnings 2026-04-21). Phase 0-E-3 잠복 시한 폭탄.
import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/nextjs";
import { redactDeep } from "./redact";
import { REDACTED, SENSITIVE_HEADER_NAMES } from "./sensitiveFields";

/**
 * Sentry 이벤트 전송 전에 민감 필드를 `[Redacted]` 로 치환한다.
 *
 * 적용 범위:
 * - event.extra / event.contexts — 재귀적으로 모든 depth
 * - event.request.data — 재귀적
 * - event.request.headers — 헤더명 기반 (case-insensitive, 단일/배열 값 모두)
 * - event.request.query_string — 전체 삭제 (URL 쿼리에 토큰이 포함될 수 있음)
 * - event.user — email / ip_address / username 삭제 (id 는 보존)
 * - event.breadcrumbs[].data — 재귀적 (XHR/fetch breadcrumb 의 request body 등)
 *
 * 의도적으로 redact 하지 않는 것:
 * - event.exception.values[].value (에러 메시지 자체) — 디버깅 가치 보존 우선.
 *   "에러 메시지에 민감값 넣지 않기" 는 호출 측의 코딩 규칙으로 관리.
 *
 * 재귀 치환 로직은 `./redact` 모듈로 공유 — logger → Sentry bridge 와 동일 동작.
 * immutability: 원본 event 를 mutate 하지 않고 새 객체를 반환.
 */

const SENSITIVE_HEADER_SET: ReadonlySet<string> = new Set(
  SENSITIVE_HEADER_NAMES,
);

/**
 * 헤더명 기반 redact. `Set-Cookie` 같은 multi-value 헤더(배열 값) 도 치환.
 */
function redactHeaders(
  headers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_SET.has(key.toLowerCase())) {
      result[key] = Array.isArray(value) ? value.map(() => REDACTED) : REDACTED;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function redactBreadcrumbs(breadcrumbs: Breadcrumb[]): Breadcrumb[] {
  return breadcrumbs.map((b) =>
    b.data ? { ...b, data: redactDeep(b.data) as Breadcrumb["data"] } : b,
  );
}

export function beforeSend(
  event: ErrorEvent,
  _hint: EventHint,
): ErrorEvent | null {
  const redactedRequest = event.request
    ? {
        ...event.request,
        query_string: undefined,
        data:
          event.request.data !== undefined
            ? redactDeep(event.request.data)
            : event.request.data,
        headers: event.request.headers
          ? (redactHeaders(
              event.request.headers as Record<string, string | string[]>,
            ) as typeof event.request.headers)
          : event.request.headers,
      }
    : event.request;

  const redactedUser = event.user
    ? {
        ...event.user,
        email: undefined,
        ip_address: undefined,
        username: undefined,
      }
    : event.user;

  const redactedBreadcrumbs = event.breadcrumbs
    ? redactBreadcrumbs(event.breadcrumbs)
    : event.breadcrumbs;

  return {
    ...event,
    extra: event.extra
      ? (redactDeep(event.extra) as typeof event.extra)
      : event.extra,
    contexts: event.contexts
      ? (redactDeep(event.contexts) as typeof event.contexts)
      : event.contexts,
    request: redactedRequest,
    user: redactedUser,
    breadcrumbs: redactedBreadcrumbs,
  };
}
