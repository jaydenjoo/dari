import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "./src/core/observability/beforeSend";

/**
 * Sentry 서버(Node) 런타임 초기화.
 *
 * DSN 이 없으면 init 을 건너뛴다 — 앱은 정상 부팅, Sentry 는 no-op.
 * PII 자동 수집은 비활성화 (🔴 프로젝트 기본값). `beforeSend` 에서 민감 필드 redact.
 *
 * DSN 참조 순서: `SENTRY_DSN` → `NEXT_PUBLIC_SENTRY_DSN` fallback.
 * Vercel Native Integration 은 `NEXT_PUBLIC_SENTRY_DSN` 만 자동 주입하는 설계라
 * 서버/엣지 런타임도 해당 env 를 읽을 수 있어야 Sentry 가 활성화된다
 * (서버에서 `NEXT_PUBLIC_*` 접근은 안전 — 빌드 인라인 + `process.env` 양쪽 제공).
 */

const dsn =
  process.env.SENTRY_DSN?.trim() ?? process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
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
