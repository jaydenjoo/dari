import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "./src/core/observability/beforeSend";

/**
 * Sentry 클라이언트(브라우저) 초기화.
 *
 * 브라우저 번들에 포함되므로 `NEXT_PUBLIC_SENTRY_DSN` 을 사용.
 * DSN 없으면 no-op. Replay/ErrorBoundary 는 별도 Task 에서 추가.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
const IS_DEV = process.env.NODE_ENV === "development";

// NOTE: 브라우저 번들에는 `NEXT_PUBLIC_*` 접두사 없는 env 가 주입되지 않음.
// 따라서 `SENTRY_ENVIRONMENT` 는 서버/엣지에서만 구분되고, 브라우저 측은
// NODE_ENV 기반으로만 분류된다 (preview 와 prod 가 동일하게 production).
// 상세: docs/environments.md §7
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: IS_DEV ? 1.0 : 0.1,
    sendDefaultPii: false,
    beforeSend,
  });
}

// App Router navigation tracing — Sentry 10+ 에서 클라이언트 instrumentation 필수 hook.
// DSN 유무와 무관하게 export 되어야 함 (Sentry SDK 가 no-op 처리).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
