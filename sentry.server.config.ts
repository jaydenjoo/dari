import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "./src/core/observability/beforeSend";

/**
 * Sentry 서버(Node) 런타임 초기화.
 *
 * DSN 이 없으면 init 을 건너뛴다 — 앱은 정상 부팅, Sentry 는 no-op.
 * PII 자동 수집은 비활성화 (🔴 프로젝트 기본값). `beforeSend` 에서 민감 필드 redact.
 */

const dsn = process.env.SENTRY_DSN?.trim();
const IS_DEV = process.env.NODE_ENV === "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: IS_DEV ? 1.0 : 0.1,
    sendDefaultPii: false,
    beforeSend,
  });
}
