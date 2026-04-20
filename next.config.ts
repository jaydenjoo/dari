import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    // Task 1-7-c: 파일 업로드 Server Action 본문 상한 10MB.
    // 기본 1MB 은 10KB TXT 조차 base64 오버헤드로 차단될 수 있음.
    // Supabase Storage 버킷 file_size_limit 도 10MB 로 이중 방어 (0010).
    serverActions: { bodySizeLimit: "10mb" },
  },
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
