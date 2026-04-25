/**
 * prod 외부 의존 smoke 전용 Playwright 설정.
 *
 * 일반 playwright.config.ts 와 분리한 이유:
 *   - prod-chat-smoke.spec.ts 는 https://dari-theta.vercel.app 에 직접 호출
 *   - 로컬 dev 서버 (`pnpm dev`) + cross-origin host (`serve.mjs`) 불필요
 *   - global-setup 의 e2e 계정/위젯 빌드 셋업 불필요
 *
 * 실행:
 *   - 로컬: `RUN_PROD_CHAT_SMOKE=1 pnpm test:prod-smoke`
 *   - CI cron: external-api-smoke.yml workflow (주 1회 자동)
 */

import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: ".env.local" });

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /prod-chat-smoke\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // webServer / globalSetup / globalTeardown 모두 미사용 (외부 prod 호출만)
});
