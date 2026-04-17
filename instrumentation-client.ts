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
