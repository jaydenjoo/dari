import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// .env.local 로드 — global-setup/teardown 에서 SUPABASE_SERVICE_ROLE_KEY 참조.
loadEnv({ path: ".env.local" });

const WIDGET_EMBED_MATCH = /widget-embed\.spec\.ts$/;

/**
 * Playwright 설정 (Dari)
 *
 * - baseURL: http://localhost:4000 (`pnpm dev`)
 * - testDir: tests/e2e
 * - projects:
 *     - chromium: **전체 spec** 실행 (기본 개발/리그레션)
 *     - firefox / webkit / mobile-chrome / mobile-safari: **widget-embed 전용**
 *       (Task A-3, ADR-009 Open Q #3/#4 실측 — 데스크톱 3종 + 모바일 2종 매트릭스)
 * - webServer 2종:
 *     - Next.js dev @ :4000 (위젯 스크립트 + API)
 *     - Static host @ :4001 (embed 목업, cross-origin 재현)
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:4000",
    // 주의 (sec L-2): trace / video 는 실패 테스트에 한해 기록되지만, E2E 에서
    // admin client 가 `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` 헤더를
    // 사용하므로 실패 시 artifact 에 키가 포함될 수 있다. CI artifact 접근 제어
    // + 단기 보존 정책을 유지하고, 로컬 `.gitignore` 의 `playwright-report/` /
    // `test-results/` 차단은 필수.
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // 기본 개발 리그레션 — 모든 spec 을 chromium 으로 실행.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // widget-embed 전용 5종 매트릭스 (Task A-3).
    // chromium 은 위 기본 프로젝트가 커버하므로 중복 실행 방지 위해 firefox/webkit 만.
    {
      name: "firefox-widget",
      testMatch: WIDGET_EMBED_MATCH,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-widget",
      testMatch: WIDGET_EMBED_MATCH,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome-widget",
      testMatch: WIDGET_EMBED_MATCH,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari-widget",
      testMatch: WIDGET_EMBED_MATCH,
      use: { ...devices["iPhone 13"] },
    },
  ],

  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:4000",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Task A-3: cross-origin embed 재현용 정적 호스트 (4001).
      command: "node tests/e2e/widget-embed/serve.mjs",
      url: "http://localhost:4001/host.html",
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],

  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
});
