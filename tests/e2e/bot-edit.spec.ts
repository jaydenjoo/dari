import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

// admin client — 타인 봇/보조 계정 생성 + teardown 정리.
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

function minimalConfig(slug: string, name: string): Record<string, unknown> {
  return {
    botId: slug,
    version: "1.0",
    identity: { name, welcomeMessage: "안녕하세요!" },
    ai: { systemPrompt: "E2E 타인 봇 테스트용 config" },
  };
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
    .fill("당신은 E2E 편집 테스트용 봇입니다. 친절하게 답변하세요.");
  await page.getByTestId("create-bot-submit").click();
  await page.waitForURL(/\/bots$/, { timeout: 10_000 });
}

test.describe("/bots/[slug]/edit 봇 편집", () => {
  test("비로그인 접근 → /login?next=/bots/xxx/edit 리디렉트", async ({
    page,
  }) => {
    await page.goto("/bots/some-slug/edit");
    await expect(page).toHaveURL(/\/login\?next=%2Fbots%2Fsome-slug%2Fedit/);
    await expect(page.getByTestId("login-email")).toBeVisible();
  });

  test("본인 봇 → name 변경 → /bots/[slug] 복귀 + 변경 반영", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-edit");
    const initialName = `편집 봇 ${slug.slice(-6)}`;
    const updatedName = `${initialName} (수정됨)`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );

      await createOwnBot(slug, initialName, page);

      // 편집 진입.
      await page.goto(`/bots/${slug}/edit`);
      await expect(page.getByTestId("edit-bot-name-heading")).toHaveText(
        initialName,
      );
      await expect(page.getByTestId("edit-bot-slug-readonly")).toHaveText(slug);

      // 이름 변경.
      const nameInput = page.getByTestId("identity-name");
      await nameInput.fill(updatedName);

      // 저장 → 상세 페이지 복귀.
      await page.getByTestId("edit-bot-submit").click();
      await page.waitForURL(new RegExp(`/bots/${slug}$`), { timeout: 10_000 });

      // 상세에서 변경된 이름 확인.
      await expect(page.getByTestId("bot-detail-name")).toHaveText(updatedName);
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("타인 봇 slug 로 edit 진입 → not-found (RLS 필터)", async ({ page }) => {
    const otherEmail = `e2e-edit-other-${Date.now().toString(36)}@dari.test`;
    const otherPassword = "OtherEditE2E!2026";
    const slug = uniqueSlug("e2e-edit-other");

    const { data: created, error: createErr } =
      await admin().auth.admin.createUser({
        email: otherEmail,
        password: otherPassword,
        email_confirm: true,
      });
    if (createErr || !created.user) {
      throw new Error(
        `[e2e] 보조 계정 생성 실패: ${createErr?.message ?? "unknown"}`,
      );
    }
    const otherUserId = created.user.id;

    try {
      const payload = {
        slug,
        name: "타인 편집 봇",
        owner_id: otherUserId,
        config: minimalConfig(slug, "타인 편집 봇"),
      };
      const { error: insertErr } = await admin()
        .from("bots")
        .insert(payload as never);
      if (insertErr) {
        throw new Error(`[e2e] 타인 봇 insert 실패: ${insertErr.message}`);
      }

      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );

      await page.goto(`/bots/${slug}/edit`);
      // 1-5-c 와 동일 — Turbopack dev 모드 HTTP 200 가능성으로 콘텐츠 판정.
      await expect(
        page.getByRole("heading", { name: "봇을 찾을 수 없어요" }),
      ).toBeVisible();
    } finally {
      const results = await Promise.allSettled([
        deleteBotBySlug(slug),
        admin().auth.admin.deleteUser(otherUserId),
      ]);
      for (const [idx, r] of results.entries()) {
        if (r.status === "rejected") {
          const name = idx === 0 ? "deleteBotBySlug" : "deleteUser";
          console.error(`[e2e] ${name} 실패: ${r.reason}`);
        }
      }
    }
  });

  test("잘못된 업무시간 형식 → 같은 페이지 + 필드 에러 + 입력 유지", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-edit-vfail");
    const name = `검증 실패 봇 ${slug.slice(-6)}`;
    const partiallyChangedName = `${name} (편집중)`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );

      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/edit`);

      // 이름 살짝 바꿔서 "입력 유지" 검증 베이스 마련.
      await page.getByTestId("identity-name").fill(partiallyChangedName);

      // 업무 시간 활성화 → hours 에 잘못된 형식 입력 (Zod regex 실패).
      // (브라우저 native pattern 이 없는 필드라 server 까지 도달.)
      await page.getByTestId("behavior-bh-enabled").check();
      await page.getByTestId("behavior-bh-hours").fill("not-a-time-format");

      await page.getByTestId("edit-bot-submit").click();

      // 같은 페이지 유지 (redirect 없음).
      await expect(page).toHaveURL(new RegExp(`/bots/${slug}/edit$`));

      // hours 필드 에러 노출.
      await expect(page.getByTestId("behavior-bh-hours-error")).toContainText(
        "HH:MM-HH:MM",
      );

      // 사용자 입력 유지 — controlled state 라 form reset 후에도 값 보존.
      await expect(page.getByTestId("identity-name")).toHaveValue(
        partiallyChangedName,
      );
      await expect(page.getByTestId("behavior-bh-hours")).toHaveValue(
        "not-a-time-format",
      );
    } finally {
      await deleteBotBySlug(slug);
    }
  });
});
