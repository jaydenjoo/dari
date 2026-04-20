import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

/**
 * Task 1-8-c E2E — 봇 상세 KPI 섹션.
 *
 * 전제:
 *   - 0005~0011 마이그레이션 apply 완료 (bot_stats RPC 포함).
 *   - MAIN_TEST_USER 로그인 후 본인 봇 통계만 조회.
 *
 * 범위:
 *   - smoke: 새 봇 상세 진입 시 KPI 섹션 표시 + 전 지표 0.
 *   - 기간 preset 전환 → URL 변경, active 탭 갱신.
 *   - 비로그인 → /login?next= 리다이렉트 (기존 가드 재확인).
 *   - admin 삽입 대화 후 `all` preset 에서 숫자 반영 확인.
 *
 * 제외:
 *   - 토큰 정확성 단위 — parseBotStats vitest 에서 검증.
 *   - RPC 실패 시 폴백 0 UI — RPC 의도적 장애 주입 어려움. logger.warn 경로
 *     는 수동 확인 또는 통합 테스트로 위임.
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

async function getBotIdBySlug(slug: string): Promise<string> {
  const { data, error } = await admin()
    .from("bots")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error || !data) {
    throw new Error(`[e2e] bot id 조회 실패: ${error?.message ?? "no data"}`);
  }
  return data.id as string;
}

async function seedConversation(
  botId: string,
  messages: ReadonlyArray<{
    role: "user" | "assistant" | "system";
    content: string;
    tokensUsed?: number | null;
  }>,
): Promise<string> {
  const { data: conv, error: cErr } = await admin()
    .from("conversations")
    .insert({ bot_id: botId, status: "active" })
    .select("id")
    .single();
  if (cErr || !conv) {
    throw new Error(
      `[e2e] conversation insert 실패: ${cErr?.message ?? "no data"}`,
    );
  }
  const rows = messages.map((m) => ({
    conversation_id: conv.id as string,
    role: m.role,
    content: m.content,
    tokens_used: m.tokensUsed ?? null,
  }));
  const { error: mErr } = await admin().from("messages").insert(rows);
  if (mErr) {
    throw new Error(`[e2e] messages insert 실패: ${mErr.message}`);
  }
  return conv.id as string;
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
    .fill("당신은 E2E KPI 테스트용 봇입니다.");
  await page.getByTestId("create-bot-submit").click();
  await page.waitForURL(/\/bots$/, { timeout: 10_000 });
}

test.describe("/bots/[slug] 사용 통계 섹션", () => {
  test("신규 봇: KPI 섹션 표시 + 전 지표 0 (smoke)", async ({ page }) => {
    const slug = uniqueSlug("e2e-stats-smoke");
    const name = `통계 smoke ${slug.slice(-6)}`;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}`);

      await expect(page.getByTestId("bot-stats-section")).toBeVisible();
      await expect(
        page.getByTestId("stats-kpi-conversations-value"),
      ).toHaveText("0");
      await expect(page.getByTestId("stats-kpi-messages-value")).toHaveText(
        "0",
      );
      await expect(page.getByTestId("stats-kpi-tokens-value")).toHaveText("0");
      await expect(page.getByTestId("stats-kpi-active-value")).toHaveText("0");
      await expect(page.getByTestId("stats-kpi-total-value")).toHaveText("0");

      // 기본 preset '7d' 가 활성 탭
      await expect(page.getByTestId("stats-range-7d")).toHaveAttribute(
        "aria-current",
        "page",
      );
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("기간 preset 전환 → URL + 활성 탭 변경", async ({ page }) => {
    const slug = uniqueSlug("e2e-stats-range");
    const name = `기간 전환 ${slug.slice(-6)}`;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}`);
      await page.getByTestId("stats-range-30d").click();
      await page.waitForURL(new RegExp(`/bots/${slug}\\?range=30d$`), {
        timeout: 10_000,
      });
      await expect(page.getByTestId("stats-range-30d")).toHaveAttribute(
        "aria-current",
        "page",
      );

      // 7d 로 돌아갈 때 canonical URL 은 쿼리 없음
      await page.getByTestId("stats-range-7d").click();
      await page.waitForURL(new RegExp(`/bots/${slug}$`), { timeout: 10_000 });
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("비로그인 → /login?next= 리디렉트", async ({ page }) => {
    // 전제: `ghost-slug` 는 SLUG_PATTERN (/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/) 을
    // 통과하므로 page.tsx 의 순서(isValidSlug → auth 가드)에서 auth redirect 가
    // 먼저 발동된다. 실제로 이 slug 로 등록된 봇은 존재하지 않음.
    await page.goto("/bots/ghost-slug?range=30d");
    await expect(page).toHaveURL(/\/login\?next=%2Fbots%2Fghost-slug/);
  });

  test("관리자 삽입 대화 후 'all' preset 에서 숫자 반영", async ({ page }) => {
    const slug = uniqueSlug("e2e-stats-count");
    const name = `카운트 반영 ${slug.slice(-6)}`;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      const botId = await getBotIdBySlug(slug);
      await seedConversation(botId, [
        { role: "user", content: "테스트 질문", tokensUsed: null },
        { role: "assistant", content: "답변입니다.", tokensUsed: 42 },
      ]);

      // 'all' preset 으로 조회 — 방금 삽입한 1 대화, 2 메시지, 42 토큰 반영.
      await page.goto(`/bots/${slug}?range=all`);

      await expect(
        page.getByTestId("stats-kpi-conversations-value"),
      ).toHaveText("1");
      await expect(page.getByTestId("stats-kpi-messages-value")).toHaveText(
        "2",
      );
      await expect(page.getByTestId("stats-kpi-tokens-value")).toHaveText("42");
      // 삽입한 대화는 status='active' 이므로 activeCount 도 1
      await expect(page.getByTestId("stats-kpi-active-value")).toHaveText("1");
      await expect(page.getByTestId("stats-kpi-total-value")).toHaveText("1");
    } finally {
      await deleteBotBySlug(slug);
    }
  });
});
