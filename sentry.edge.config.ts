import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "./src/core/observability/beforeSend";

/**
 * Sentry Edge 런타임 초기화 (middleware, Edge API routes).
 *
 * ⚠️ sentry.server.config.ts 와 의도적으로 거의 동일한 내용.
 *    Node 와 Edge 런타임 번들 분리가 필수라 추출 불가 — 한쪽 수정 시 반대편 동기화 필수.
 */

const dsn = process.env.SENTRY_DSN?.trim();
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
