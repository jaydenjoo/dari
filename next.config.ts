import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Sentry build-time 통합.
 *
 * - `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` 는 빌드 타임 전용.
 *   env.ts 스키마에 포함하지 않고 `process.env` 직접 사용 (런타임 로딩과 무관).
 *   3개 중 하나라도 없으면 `withSentryConfig` 가 source map 업로드를 스킵하고
 *   앱 빌드는 정상 진행된다.
 * - `silent: !CI` — 로컬 빌드 노이즈 제거, CI 에서만 상세 로그.
 * - `disableLogger` 는 Turbopack 미지원이라 생략. 관련 treeshake 옵션은
 *   Sentry 가 Turbopack 공식 지원 추가하면 재평가.
 */
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
