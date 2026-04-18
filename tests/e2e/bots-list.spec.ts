import { expect, test } from "@playwright/test";

import { MAIN_TEST_USER } from "./support/fixtures";
import { loginWithPassword, logout } from "./support/auth-helpers";

test.describe("/bots 목록 페이지", () => {
  test("비로그인 접근 → /login?next=%2Fbots 로 리디렉트", async ({ page }) => {
    const response = await page.goto("/bots");
    // proxy 가 307 로 리디렉트하지만 Playwright 는 최종 응답을 반환.
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login\?next=%2Fbots/);
    await expect(page.getByTestId("login-email")).toBeVisible();
  });

  test("id/pw 로그인 후 /bots → 빈 상태 + 새 봇 만들기 CTA", async ({
    page,
  }) => {
    await loginWithPassword(
      page,
      MAIN_TEST_USER.email,
      MAIN_TEST_USER.password,
    );

    await page.goto("/bots");

    await expect(
      page.getByRole("heading", { name: "내 봇", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("아직 봇이 없어요")).toBeVisible();

    const cta = page.getByRole("link", { name: /새 봇 만들기/ });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/bots/new");
  });

  test("로그아웃 → /login 으로 복귀", async ({ page }) => {
    await loginWithPassword(
      page,
      MAIN_TEST_USER.email,
      MAIN_TEST_USER.password,
    );

    await logout(page);
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByTestId("login-email")).toBeVisible();
  });

  test("로그인 상태에서 /login 직접 접근 → 홈으로 리디렉트 (재로그인 화면 숨김)", async ({
    page,
  }) => {
    await loginWithPassword(
      page,
      MAIN_TEST_USER.email,
      MAIN_TEST_USER.password,
    );

    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);
    // 홈에는 로그인됨 뱃지가 노출되어야 한다.
    await expect(page.getByText("로그인됨")).toBeVisible();

    await logout(page);
  });
});
