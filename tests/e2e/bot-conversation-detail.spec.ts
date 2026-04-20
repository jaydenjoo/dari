import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

/**
 * Task 1-8-b E2E — 대화 상세 페이지.
 *
 * 전제:
 *   - 0005~0010 마이그레이션 + RLS 정책 apply 완료.
 *   - MAIN_TEST_USER 로그인 후 본인 봇의 대화만 열람 가능.
 *
 * 범위 (α: 외부 API 쿼터 의존 없음):
 *   - 비로그인 → /login?next= 리디렉트.
 *   - 잘못된 UUID 포맷 → 404 (DB 왕복 전 차단).
 *   - 존재하지 않는 UUID → 404.
 *   - smoke: 관리자 직접 삽입한 대화/메시지가 상세 페이지에 렌더.
 *   - 목록 → 상세 링크 클릭 네비게이션.
 *
 * 제외:
 *   - 실제 chat API 흐름 (Anthropic/Gemini) — 단위 테스트 (meta-util) 및
 *     factory 레벨에서 검증.
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
    .fill("당신은 E2E 상세 페이지 테스트용 봇입니다.");
  await page.getByTestId("create-bot-submit").click();
  await page.waitForURL(/\/bots$/, { timeout: 10_000 });
}

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";
const VALID_UUID_PATTERN = "11111111-2222-3333-4444-555555555555";

test.describe("/bots/[slug]/conversations/[conversationId] 상세 페이지", () => {
  test("비로그인 → /login?next= 리디렉트 (UUID 형식 유효)", async ({
    page,
  }) => {
    await page.goto(`/bots/ghost-slug/conversations/${VALID_UUID_PATTERN}`);
    await expect(page).toHaveURL(
      new RegExp(
        `/login\\?next=%2Fbots%2Fghost-slug%2Fconversations%2F${VALID_UUID_PATTERN}`,
      ),
    );
  });

  test("잘못된 UUID 포맷 → 404 (DB 왕복 전 차단)", async ({ page }) => {
    const slug = uniqueSlug("e2e-detail-bad");
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, `잘못된 UUID ${slug.slice(-6)}`, page);

      const res = await page.goto(
        `/bots/${slug}/conversations/not-a-uuid-at-all`,
      );
      expect(res?.status()).toBe(404);
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("존재하지 않는 UUID → 404", async ({ page }) => {
    const slug = uniqueSlug("e2e-detail-missing");
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, `없는 UUID ${slug.slice(-6)}`, page);

      const res = await page.goto(`/bots/${slug}/conversations/${FAKE_UUID}`);
      expect(res?.status()).toBe(404);
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("관리자 삽입 대화가 상세 페이지에 렌더된다 (smoke)", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-detail-smoke");
    const name = `상세 smoke ${slug.slice(-6)}`;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      const botId = await getBotIdBySlug(slug);
      const conversationId = await seedConversation(botId, [
        { role: "user", content: "안녕하세요!", tokensUsed: null },
        {
          role: "assistant",
          content: "반갑습니다. 무엇을 도와드릴까요?",
          tokensUsed: 32,
        },
        { role: "system", content: "대화가 시작되었습니다." },
      ]);

      await page.goto(`/bots/${slug}/conversations/${conversationId}`);

      await expect(page.getByTestId("conversation-detail-title")).toHaveText(
        name,
      );
      await expect(page.getByTestId("conversation-status-badge")).toContainText(
        "진행 중",
      );
      await expect(page.getByTestId("conversation-meta")).toBeVisible();

      // 3종 메시지 role 각각 표시
      await expect(page.getByTestId("message-user")).toHaveCount(1);
      await expect(page.getByTestId("message-assistant")).toHaveCount(1);
      await expect(page.getByTestId("message-system")).toHaveCount(1);

      // user 내용, assistant 내용, tokens 메타
      await expect(page.getByTestId("message-user")).toContainText(
        "안녕하세요!",
      );
      await expect(page.getByTestId("message-assistant")).toContainText(
        "반갑습니다",
      );
      await expect(page.getByTestId("message-tokens")).toContainText(
        "32 tokens",
      );
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("같은 소유자의 다른 봇 UUID 교차 접근 차단 (cross-bot IDOR → 404)", async ({
    page,
  }) => {
    // sec A01 + code L-2: RLS 만으로는 owner 가 같고 bot 만 다른 경우 통과하므로
    // 앱 레벨 `conversation.bot_id === bot.id` 재검증이 필수. 실전 방어 확인.
    const slugA = uniqueSlug("e2e-detail-x-a");
    const slugB = uniqueSlug("e2e-detail-x-b");
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slugA, `봇A ${slugA.slice(-6)}`, page);
      await createOwnBot(slugB, `봇B ${slugB.slice(-6)}`, page);

      const botIdB = await getBotIdBySlug(slugB);
      const convBId = await seedConversation(botIdB, [
        { role: "user", content: "봇B 에만 속한 대화" },
      ]);

      // slugA 의 URL 로 convBId 접근 시도 → RLS 는 통과(같은 owner) 하지만
      // bot_id 재검증에서 차단되어 404.
      const res = await page.goto(`/bots/${slugA}/conversations/${convBId}`);
      expect(res?.status()).toBe(404);
    } finally {
      await deleteBotBySlug(slugA);
      await deleteBotBySlug(slugB);
    }
  });

  test("목록 페이지에서 상세 링크 클릭 시 상세로 네비게이션", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-detail-nav");
    const name = `링크 클릭 ${slug.slice(-6)}`;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      const botId = await getBotIdBySlug(slug);
      const conversationId = await seedConversation(botId, [
        { role: "user", content: "링크 테스트 질문입니다." },
      ]);

      await page.goto(`/bots/${slug}/conversations`);
      await expect(page.getByTestId("conversations-list")).toBeVisible();

      // 첫 링크 클릭 → 상세 URL
      const firstItem = page
        .getByTestId("conversations-list")
        .locator("a")
        .first();
      await firstItem.click();
      await page.waitForURL(
        new RegExp(`/bots/${slug}/conversations/${conversationId}(?:\\?|$)`),
        { timeout: 10_000 },
      );
      await expect(page.getByTestId("conversation-detail-title")).toHaveText(
        name,
      );
    } finally {
      await deleteBotBySlug(slug);
    }
  });
});
