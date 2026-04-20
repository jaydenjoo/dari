import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// .env.local 로드 — global-setup/teardown 에서 SUPABASE_SERVICE_ROLE_KEY 참조.
loadEnv({ path: ".env.local" });

/**
 * Playwright 설정 (Dari)
 *
 * - baseURL: http://localhost:4000 (`pnpm dev`)
 * - webServer: 로컬에서 실행 중이면 재사용, 없으면 자동 기동
 * - testDir: tests/e2e (Vitest 의 기본 include 와 분리)
 * - projects: chromium 1종 (CI 확장 시 firefox/webkit 추가)
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
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:4000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },

  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
});
