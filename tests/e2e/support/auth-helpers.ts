/**
 * Playwright 로그인/로그아웃 헬퍼.
 *
 * Task 0-D-3 에서 추가되는 id/pw 로그인 폼을 사용한다.
 * 폼 셀렉터는 `data-testid` 로 통일:
 *   - `data-testid="login-email"`
 *   - `data-testid="login-password"`
 *   - `data-testid="login-submit"`
 *   - 로그아웃: `data-testid="logout-button"`
 */

import { expect, type Page } from "@playwright/test";

export async function loginWithPassword(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 10_000,
    }),
    page.getByTestId("login-submit").click(),
  ]);
}

export async function logout(page: Page): Promise<void> {
  // 로그아웃 버튼은 홈 `/` 페이지에만 있다는 현재 구현 전제 (Phase 1 에서 글로벌
  // 헤더로 이동 예정). 현재 경로가 홈이 아니면 먼저 이동.
  if (!new URL(page.url()).pathname.match(/^\/?$/)) {
    await page.goto("/");
  }
  await page.getByTestId("logout-button").click();
  await expect(page).toHaveURL(/\/login(\?|$)/);
}
