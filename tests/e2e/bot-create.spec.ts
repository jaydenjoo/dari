import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

// 테스트 생성 봇을 admin 권한으로 정리하기 위한 클라이언트.
let adminClient: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "[e2e] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
      );
    }
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${key}` } },
    });
  }
  return adminClient;
}

async function deleteBotBySlug(slug: string): Promise<void> {
  const { error } = await admin().from("bots").delete().eq("slug", slug);
  if (error) {
    console.error(`[e2e] deleteBotBySlug(${slug}) 실패: ${error.message}`);
  }
}

function uniqueSlug(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rnd}`;
}

test.describe("/bots/new 봇 생성", () => {
  test("비로그인 접근 → /login?next=/bots/new 리디렉트", async ({ page }) => {
    await page.goto("/bots/new");
    await expect(page).toHaveURL(/\/login\?next=%2Fbots%2Fnew/);
    await expect(page.getByTestId("login-email")).toBeVisible();
  });

  test("로그인 → 폼 제출 → /bots 복귀 + 목록 반영", async ({ page }) => {
    const slug = uniqueSlug("e2e-create");
    const name = `E2E 봇 ${slug.slice(-6)}`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await page.goto("/bots/new");

      await expect(
        page.getByRole("heading", { name: "봇 정체성 정하기" }),
      ).toBeVisible();

      await page.getByTestId("bot-name").fill(name);
      // 한글 이름이라 slugify 결과가 비어있음 → slug 직접 입력.
      await page.getByTestId("bot-slug").fill(slug);
      await page
        .getByTestId("bot-system-prompt")
        .fill(
          "당신은 E2E 테스트용 도우미입니다. 친절하고 간결하게 답변하세요.",
        );

      await page.getByTestId("create-bot-submit").click();

      // /bots 복귀 대기 (리디렉트).
      await page.waitForURL(/\/bots$/, { timeout: 10_000 });

      await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
      await expect(page.locator("code", { hasText: slug })).toBeVisible();
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("slug 중복 제출 → 필드 에러 표시 + 같은 페이지 유지", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-dup");

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );

      // 1차 — 정상 생성.
      await page.goto("/bots/new");
      await page.getByTestId("bot-name").fill("첫 봇");
      await page.getByTestId("bot-slug").fill(slug);
      await page
        .getByTestId("bot-system-prompt")
        .fill("당신은 첫 봇입니다. 친절하게 답하세요.");
      await page.getByTestId("create-bot-submit").click();
      await page.waitForURL(/\/bots$/, { timeout: 10_000 });

      // 2차 — 같은 slug 로 재시도.
      await page.goto("/bots/new");
      await page.getByTestId("bot-name").fill("중복 시도");
      await page.getByTestId("bot-slug").fill(slug);
      await page
        .getByTestId("bot-system-prompt")
        .fill("중복 slug 테스트용 봇입니다. 친절하게 답하세요.");
      await page.getByTestId("create-bot-submit").click();

      // 같은 페이지 유지 + slug 필드 에러 노출.
      await expect(page).toHaveURL(/\/bots\/new$/);
      await expect(page.getByTestId("bot-slug-error")).toContainText(
        "이미 사용 중",
      );
    } finally {
      await deleteBotBySlug(slug);
    }
  });
});
