import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

/**
 * Stage 1 §4-6 마지막 항목 — CSV export 동작 smoke.
 *
 * 검증:
 *   - 봇 owner 인증 + 자기 봇의 conversation export 200
 *   - Content-Type / Content-Disposition / Cache-Control 헤더
 *   - body: UTF-8 BOM + 메타 5행 + 헤더 행 + 메시지 행
 *   - CSV escape (한글/이모지/쉼표/따옴표/개행) + injection 방어 (=SUM → '=SUM)
 *
 * 격리: 신 봇 + 신 conversation 생성 → 검증 → cleanup. 다른 spec 영향 없음.
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
    .insert({
      bot_id: botId,
      status: "active",
      visitor_id: crypto.randomUUID(),
    })
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
    .fill("CSV export E2E 테스트용 봇.");
  await page.getByTestId("create-bot-submit").click();
  await page.waitForURL(/\/bots$/, { timeout: 10_000 });
}

test.describe("CSV export smoke (Stage 1 §4-6 마지막)", () => {
  test("자기 봇 conversation export — UTF-8 BOM + 메타 + 헤더 + escape/injection 안전", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-csv-export");
    const name = `CSV smoke ${slug.slice(-6)}`;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      const botId = await getBotIdBySlug(slug);
      const conversationId = await seedConversation(botId, [
        {
          role: "user",
          content: '한글 + 이모지 🎉 + 쉼표, + 따옴표 "hi"',
          tokensUsed: null,
        },
        {
          role: "assistant",
          content: "CSV escape — newline\nin content",
          tokensUsed: 42,
        },
        {
          role: "system",
          content: "=SUM(A1:A2)+1",
          tokensUsed: null,
        },
      ]);

      const res = await page.request.get(
        `/api/conversations/${conversationId}/export`,
      );

      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("text/csv; charset=utf-8");
      expect(res.headers()["content-disposition"]).toBe(
        `attachment; filename="dari-conversation-${conversationId.slice(0, 8)}.csv"`,
      );
      expect(res.headers()["cache-control"]).toBe("no-store");

      const body = await res.text();

      expect(body.charCodeAt(0)).toBe(0xfeff);
      expect(body).toContain(`봇 이름,${name}`);
      expect(body).toContain(`대화 ID,${conversationId}`);
      expect(body).toContain("방문자,");
      expect(body).toContain("상태,");
      expect(body).toContain("시작 시각,");
      expect(body).toContain("role,content,tokens_used,created_at");

      expect(body).toContain("이모지 🎉");
      expect(body).toContain("CSV escape");
      expect(body).toMatch(/'=SUM/);
      expect(body).toMatch(/,42,/);

      expect(body).toContain("user,");
      expect(body).toContain("assistant,");
      expect(body).toContain("system,");
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("UUID 형식 위반 → 404 (DB 왕복 전 차단)", async ({ page }) => {
    const slug = uniqueSlug("e2e-csv-bad");
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, `bad UUID ${slug.slice(-6)}`, page);

      const res = await page.request.get(
        "/api/conversations/not-a-uuid/export",
      );
      expect(res.status()).toBe(404);
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("비로그인 → 401", async ({ browser }) => {
    const ctx = await browser.newContext();
    const fakeUuid = "00000000-0000-0000-0000-000000000000";
    const res = await ctx.request.get(`/api/conversations/${fakeUuid}/export`);
    expect(res.status()).toBe(401);
    await ctx.close();
  });
});
