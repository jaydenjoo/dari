import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

// admin client 재사용 — 타인 봇 / 보조 계정 생성 및 teardown 정리.
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

// 타인 봇 INSERT 에 필요한 최소 DariConfig 구조.
// bots.config JSONB 는 CHECK 제약이 없고, 페이지는 타인 봇을 RLS 에서 0 row 로
// 거르기 때문에 (Zod) safeParse 단계까지 도달하지 않는다. 그래도 향후 디버깅을
// 돕기 위해 식별 가능한 최소 필드를 넣어둔다.
function minimalConfig(slug: string, name: string): Record<string, unknown> {
  return {
    botId: slug,
    version: "1.0",
    identity: { name, welcomeMessage: "안녕하세요!" },
    ai: { systemPrompt: "E2E 타인 봇 테스트용 config" },
  };
}

test.describe("/bots/[slug] 상세 페이지", () => {
  test("비로그인 접근 → /login?next=/bots/xxx 리디렉트", async ({ page }) => {
    await page.goto("/bots/some-slug");
    await expect(page).toHaveURL(/\/login\?next=%2Fbots%2Fsome-slug/);
    await expect(page.getByTestId("login-email")).toBeVisible();
  });

  test("로그인 + 본인 봇 → 상세 정보 + 위젯 스니펫 + 편집 링크 노출", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-detail");
    const name = `상세 봇 ${slug.slice(-6)}`;
    const systemPrompt =
      "당신은 상세 페이지 E2E 테스트용 봇입니다. 친절하고 간결하게 답하세요.";

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );

      // 봇 생성 (/bots/new → /bots 리디렉트). RLS INSERT 실증은 bot-create.spec.ts 에서 이미 커버.
      await page.goto("/bots/new");
      await page.getByTestId("bot-name").fill(name);
      await page.getByTestId("bot-slug").fill(slug);
      await page.getByTestId("bot-system-prompt").fill(systemPrompt);
      await page.getByTestId("create-bot-submit").click();
      await page.waitForURL(/\/bots$/, { timeout: 10_000 });

      // 상세 페이지 접근.
      await page.goto(`/bots/${slug}`);

      await expect(page.getByTestId("bot-detail-name")).toHaveText(name);
      await expect(page.getByTestId("bot-detail-slug")).toHaveText(slug);
      await expect(page.getByTestId("bot-detail-welcome")).toBeVisible();
      await expect(page.getByTestId("bot-detail-system-prompt")).toContainText(
        "상세 페이지 E2E",
      );

      // 위젯 스니펫 — slug 포함 + 실제 dari.kr 도메인.
      const snippet = page.getByTestId("widget-snippet");
      await expect(snippet).toBeVisible();
      await expect(snippet).toContainText(`data-bot-slug="${slug}"`);
      await expect(snippet).toContainText("dari.kr/widget.js");

      // 편집 버튼 — href 만 검증 (실제 페이지는 Task 1-5-d).
      const editLink = page.getByTestId("bot-detail-edit");
      await expect(editLink).toBeVisible();
      await expect(editLink).toHaveAttribute("href", `/bots/${slug}/edit`);
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("로그인 + 타인 봇 slug → 404 (RLS 필터 + notFound)", async ({
    page,
  }) => {
    // 보조 계정 + 타인 소유 봇을 admin 으로 생성 (RLS 우회).
    const otherEmail = `e2e-other-${Date.now().toString(36)}@dari.test`;
    const otherPassword = "OtherUserE2E!2026";
    const slug = uniqueSlug("e2e-other");

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
        name: "타인 봇",
        owner_id: otherUserId,
        config: minimalConfig(slug, "타인 봇"),
      };
      // admin 은 service_role 로 RLS 우회 — 타인 owner 로 직접 INSERT 가능.
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

      await page.goto(`/bots/${slug}`);
      // Next.js notFound() → not-found.tsx 렌더. Turbopack dev 모드에서는
      // HTTP 상태 가 200 으로 내려가고 (프로덕션 빌드는 404), 렌더 내용은 양쪽
      // 모두 정확히 not-found. 따라서 콘텐츠로만 판정.
      await expect(
        page.getByRole("heading", { name: "봇을 찾을 수 없어요" }),
      ).toBeVisible();
    } finally {
      // bot 과 보조 계정을 모두 정리 — 실패해도 나머지는 진행, 실패만 로그.
      // (security M-3: deleteUser 에러 처리 누락 시 고아 계정 잔류)
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

  test("로그인 + 존재하지 않는 slug → not-found 렌더", async ({ page }) => {
    await loginWithPassword(
      page,
      MAIN_TEST_USER.email,
      MAIN_TEST_USER.password,
    );

    await page.goto(`/bots/${uniqueSlug("nope")}`);
    // 상동 — dev/prod HTTP 상태 차이를 피하려 콘텐츠로 판정.
    await expect(
      page.getByRole("heading", { name: "봇을 찾을 수 없어요" }),
    ).toBeVisible();
  });
});
