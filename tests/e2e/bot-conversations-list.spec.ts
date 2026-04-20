import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

/**
 * Task 1-8-a E2E — 대화 로그 목록 페이지.
 *
 * 전제:
 *   - 0005~0010 마이그레이션 + RLS 정책 apply 완료.
 *   - MAIN_TEST_USER 로그인 후 본인 봇만 conversations 열람.
 *
 * 범위 (α: 외부 API 쿼터 의존 없음):
 *   - smoke: 로그인 → 봇 생성 → 목록 접근 → empty state + "총 0건".
 *   - 비로그인 → /login?next= 리디렉트.
 *   - page 쿼리 비정상값 → 500 없음 (page 1 fallback).
 *
 * 제외:
 *   - 실제 대화 생성 flow — Gemini 임베딩 + chat API 호출. 단위 테스트 (preview-util) 커버.
 */

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

async function createOwnBot(
  slug: string,
  name: string,
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto("/bots/new");
  await page.getByTestId("bot-name").fill(name);
  await page.getByTestId("bot-slug").fill(slug);
  await page
    .getByTestId("bot-system-prompt")
    .fill("당신은 E2E 대화 로그 테스트용 봇입니다.");
  await page.getByTestId("create-bot-submit").click();
  await page.waitForURL(/\/bots$/, { timeout: 10_000 });
}

test.describe("/bots/[slug]/conversations 목록 페이지", () => {
  test("신규 봇: empty state + '총 0건' 표시 (smoke)", async ({ page }) => {
    const slug = uniqueSlug("e2e-conv-smoke");
    const name = `대화로그 smoke ${slug.slice(-6)}`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/conversations`);

      await expect(page.getByTestId("conversations-page-title")).toHaveText(
        name,
      );
      await expect(page.getByTestId("conversations-total")).toContainText(
        "총 0건",
      );
      await expect(page.getByTestId("conversations-empty")).toBeVisible();
      await expect(page.getByTestId("conversations-list")).toHaveCount(0);
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("비로그인 → /login?next= 리디렉트", async ({ page }) => {
    await page.goto("/bots/ghost-slug/conversations");
    await expect(page).toHaveURL(
      /\/login\?next=%2Fbots%2Fghost-slug%2Fconversations/,
    );
  });

  test("page 쿼리 비정상값도 500 없이 page 1 fallback", async ({ page }) => {
    const slug = uniqueSlug("e2e-conv-page");
    const name = `page 파라미터 ${slug.slice(-6)}`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      // invalid: 문자열 / 음수 / 0 / 과도한 숫자 — 모두 500 없이 렌더되어야.
      for (const badValue of ["abc", "-5", "0", "99999999999999999999"]) {
        const res = await page.goto(
          `/bots/${slug}/conversations?page=${badValue}`,
        );
        expect(res?.status()).toBeLessThan(500);
        await expect(page.getByTestId("conversations-total")).toContainText(
          "총 0건",
        );
      }
    } finally {
      await deleteBotBySlug(slug);
    }
  });
});
