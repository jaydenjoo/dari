import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

/**
 * Task 1-8-d E2E — 대화 삭제 + CSV export.
 *
 * 전제:
 *   - 0012 마이그레이션 apply 완료 (conversations_delete_owner).
 *   - MAIN_TEST_USER 로그인 후 본인 봇의 대화만 삭제/export.
 *
 * 범위 (α):
 *   - 삭제 모달 확정 → 목록 redirect + 404 확인.
 *   - 모달 취소 → 삭제 미실행.
 *   - CSV export 200 + Content-Type + 파일 내용 확인.
 *   - 비로그인 CSV 접근 → 401.
 *   - 잘못된 UUID CSV → 404.
 *
 * 제외:
 *   - cross-bot 삭제 차단 — Server Action 레벨은 1-8-b e2e 의 cross-bot IDOR
 *     테스트와 동일 패턴이며 단위 테스트 (actions.ts 반환값) 보강으로 충분.
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
    .fill("당신은 E2E 대화 관리 테스트용 봇입니다.");
  await page.getByTestId("create-bot-submit").click();
  await page.waitForURL(/\/bots$/, { timeout: 10_000 });
}

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

test.describe("/bots/[slug]/conversations/[conversationId] 관리 기능", () => {
  test("삭제 모달 확정 시 목록 redirect + 대상 대화 404", async ({ page }) => {
    const slug = uniqueSlug("e2e-del-confirm");
    const name = `삭제 확정 ${slug.slice(-6)}`;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      const botId = await getBotIdBySlug(slug);
      const conversationId = await seedConversation(botId, [
        { role: "user", content: "삭제될 메시지" },
      ]);

      await page.goto(`/bots/${slug}/conversations/${conversationId}`);
      await page.getByTestId("delete-conversation-open").click();
      await expect(page.getByTestId("delete-conversation-modal")).toBeVisible();
      await page.getByTestId("delete-conversation-confirm").click();

      // Server Action redirect → 목록 URL
      await page.waitForURL(new RegExp(`/bots/${slug}/conversations$`), {
        timeout: 10_000,
      });

      // 삭제된 대화로 직접 접근 → 404
      const res = await page.goto(
        `/bots/${slug}/conversations/${conversationId}`,
      );
      expect(res?.status()).toBe(404);
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("모달 취소 → 대화 유지 (삭제 미실행)", async ({ page }) => {
    const slug = uniqueSlug("e2e-del-cancel");
    const name = `삭제 취소 ${slug.slice(-6)}`;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      const botId = await getBotIdBySlug(slug);
      const conversationId = await seedConversation(botId, [
        { role: "user", content: "유지될 메시지" },
      ]);

      await page.goto(`/bots/${slug}/conversations/${conversationId}`);
      await page.getByTestId("delete-conversation-open").click();
      await expect(page.getByTestId("delete-conversation-modal")).toBeVisible();
      // 취소 버튼 클릭
      await page.getByRole("button", { name: "취소" }).click();
      await expect(
        page.getByTestId("delete-conversation-modal"),
      ).not.toBeVisible();

      // 새로고침해도 상세 페이지 정상 (대화 존재)
      await page.reload();
      await expect(page.getByTestId("conversation-detail-title")).toHaveText(
        name,
      );
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("CSV export → 200 + Content-Type + 파일 내용", async ({ page }) => {
    const slug = uniqueSlug("e2e-csv-ok");
    const name = `CSV ${slug.slice(-6)}`;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      const botId = await getBotIdBySlug(slug);
      const conversationId = await seedConversation(botId, [
        { role: "user", content: "질문입니다", tokensUsed: null },
        {
          role: "assistant",
          content: "답변입니다",
          tokensUsed: 15,
        },
      ]);

      // page.request 는 쿠키 세션을 자동 포함 — 로그인 상태로 API 호출.
      const res = await page.request.get(
        `/api/conversations/${conversationId}/export`,
      );
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/csv");
      expect(res.headers()["content-disposition"]).toContain("attachment");

      const body = await res.text();
      // UTF-8 BOM + 봇 이름 + 메시지 내용 포함
      expect(body.charCodeAt(0)).toBe(0xfeff);
      expect(body).toContain(name);
      expect(body).toContain("질문입니다");
      expect(body).toContain("답변입니다");
      expect(body).toContain("15"); // tokens_used
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("비로그인 CSV 접근 → 401", async ({ request }) => {
    // request fixture 는 쿠키/세션 없는 clean context.
    const res = await request.get(
      `/api/conversations/11111111-2222-3333-4444-555555555555/export`,
    );
    expect(res.status()).toBe(401);
  });

  test("잘못된 UUID CSV → 404", async ({ page }) => {
    await loginWithPassword(
      page,
      MAIN_TEST_USER.email,
      MAIN_TEST_USER.password,
    );
    const res = await page.request.get(
      `/api/conversations/not-a-valid-uuid/export`,
    );
    expect(res.status()).toBe(404);

    // 존재하지 않는 UUID 도 404
    const res2 = await page.request.get(
      `/api/conversations/${FAKE_UUID}/export`,
    );
    expect(res2.status()).toBe(404);
  });
});
