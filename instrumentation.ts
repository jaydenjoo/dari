import * as Sentry from "@sentry/nextjs";

/**
 * Next.js 16.2 instrumentation hook — 서버/Edge 런타임에서 한 번 실행된다.
 * 각 런타임별 Sentry 초기화 모듈을 조건부 import 한다 (Node vs Edge 번들 분리).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Server Components / middleware / proxies 에서 발생한 에러를 Sentry 로 전달.
// DSN 이 없어 Sentry.init 이 스킵된 경우에도 SDK 내부에서 no-op 처리되므로
// 이 export 는 항상 안전하게 존재할 수 있다.
export const onRequestError = Sentry.captureRequestError;
