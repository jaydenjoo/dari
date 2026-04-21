import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    // Task 1-7-c: 파일 업로드 Server Action 본문 상한 10MB.
    // 기본 1MB 은 10KB TXT 조차 base64 오버헤드로 차단될 수 있음.
    // Supabase Storage 버킷 file_size_limit 도 10MB 로 이중 방어 (0010).
    serverActions: { bodySizeLimit: "10mb" },
  },
  /**
   * HTTP 보안 헤더 (security LOW-3 반영, 2026-04-21 Task A-3 리뷰).
   *
   * 고객 사이트에 embed 되는 SaaS 로서 기본 브라우저 보안 경계 설정.
   *   - X-Content-Type-Options: nosniff — MIME 스니핑 차단 (widget.js 가 text/html
   *     으로 오인되어 HTML 실행되는 경로 방지)
   *   - X-Frame-Options: SAMEORIGIN — 제3자 사이트가 Dari 관리 페이지를 iframe 으로
   *     탈취(clickjacking) 하는 경로 차단. widget 은 <script> embed 라 영향 없음.
   *   - Referrer-Policy: strict-origin-when-cross-origin — 고객 도메인이 Referer 로
   *     외부에 유출되는 정보 누수 최소화.
   *
   * widget.js 전용 `Cache-Control` 은 ADR-009 Open Q #1 (캐시 전략) 미결 — 확정 후 추가.
   * CSP 는 ADR-009 Open Q #3/#4 (고객사 권장 CSP) 확정 후 별도 매트릭스 설계.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
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
