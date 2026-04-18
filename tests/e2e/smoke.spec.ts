import { expect, test } from "@playwright/test";

/**
 * 인프라 smoke — 홈페이지가 로드되는지만 확인.
 * 이 테스트가 green 이면 Playwright 설정 + webServer + baseURL 이 정상.
 */
test("홈페이지 200 로드 + 브랜드 노출", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByText("Dari", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /대화형 AI 봇/ }),
  ).toBeVisible();
});
