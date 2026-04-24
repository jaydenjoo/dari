import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

/**
 * Task 1-7-d E2E — 지식 소스 통합 리스트 + 개별 삭제.
 *
 * 전제:
 *   - 0005~0010 마이그레이션 + RLS 정책 apply 완료.
 *   - MAIN_TEST_USER 로그인 후 본인 봇만 목록/편집 가능.
 *
 * 범위:
 *   - smoke: SectionCard + empty state.
 *   - text 저장/삭제 + 재진입 시 empty state 복귀 (revalidatePath 동작 검증).
 *   - 삭제 취소(native confirm dismiss) → 항목 유지.
 *   - 비로그인 리디렉트.
 *
 * 제외 (비용/단위테스트 커버 영역):
 *   - URL/file 삭제 flow — Firecrawl/unpdf 외부 호출 비용. remove-source.test.ts 에서
 *     (source_type, source_identifier) 매핑 + Storage 롤백 이미 검증.
 *
 * Task B-6 (CI): text 저장 경로가 **실 Gemini embedding API** 를 호출한다.
 * CI 에서 `E2E_SKIP_EXTERNAL_API=true` 설정 시 전체 파일 skip — placeholder env
 * 로는 401/403 응답 → 봇 편집 저장 단계에서 실패 유발. 로컬은 기본 실행.
 */

test.skip(
  process.env.E2E_SKIP_EXTERNAL_API === "true",
  "CI: Gemini embedding API 키 미설정 (E2E_SKIP_EXTERNAL_API=true)",
);

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
    .fill("당신은 E2E 소스 삭제 테스트용 봇입니다.");
  await page.getByTestId("create-bot-submit").click();
  await page.waitForURL(/\/bots$/, { timeout: 10_000 });
}

test.describe("/bots/[slug]/edit 지식 소스 리스트 + 삭제", () => {
  test("등록된 지식 섹션 + 빈 봇은 empty state (smoke)", async ({ page }) => {
    const slug = uniqueSlug("e2e-src-smoke");
    const name = `소스 smoke ${slug.slice(-6)}`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/edit`);

      await expect(page.locator("#knowledge-sources")).toBeVisible();
      await expect(page.getByTestId("knowledge-sources-empty")).toBeVisible();
      await expect(page.getByTestId("knowledge-sources-list")).toHaveCount(0);
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("text 저장 후 리스트 표시 → 삭제 버튼 → empty state 복귀", async ({
    page,
  }) => {
    // Gemini 임베딩 + RPC + 편집 재진입 + 삭제(chunks RPC) 합산 30s 초과 가능.
    test.setTimeout(90_000);
    const slug = uniqueSlug("e2e-src-text-del");
    const name = `텍스트 삭제 ${slug.slice(-6)}`;
    const textContent =
      "Dari 삭제 E2E 테스트용 텍스트 지식입니다. 최소 10자 이상 필요합니다.";

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      // text 저장 (Gemini embed + RPC) — 동시 대기 패턴으로 race 축소.
      await page.goto(`/bots/${slug}/edit`);
      await page.getByTestId("knowledge-text-content").fill(textContent);
      await Promise.all([
        page.waitForURL(new RegExp(`/bots/${slug}$`), { timeout: 60_000 }),
        page.getByTestId("edit-bot-submit").click(),
      ]);

      // 편집 페이지 재진입 — sources-list 에 TEXT row.
      await page.goto(`/bots/${slug}/edit`);
      const textRow = page.getByTestId("knowledge-source-row-text");
      await expect(textRow).toBeVisible();
      await expect(textRow).toContainText("TEXT");

      // 삭제 버튼 클릭 + native confirm 자동 수락.
      page.once("dialog", (d) => d.accept());
      await textRow.getByTestId("knowledge-source-row-delete").click();

      // revalidatePath → empty state.
      await expect(page.getByTestId("knowledge-sources-empty")).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("삭제 취소(dialog dismiss) → 항목 유지", async ({ page }) => {
    test.setTimeout(90_000); // Gemini 임베딩 포함 flow — 기본 30s 초과 가능.
    const slug = uniqueSlug("e2e-src-cancel");
    const name = `삭제 취소 ${slug.slice(-6)}`;
    const textContent = "취소 테스트용 텍스트 지식 (10자 이상이어야 합니다).";

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/edit`);
      await page.getByTestId("knowledge-text-content").fill(textContent);
      await Promise.all([
        page.waitForURL(new RegExp(`/bots/${slug}$`), { timeout: 60_000 }),
        page.getByTestId("edit-bot-submit").click(),
      ]);

      await page.goto(`/bots/${slug}/edit`);
      const textRow = page.getByTestId("knowledge-source-row-text");
      await expect(textRow).toBeVisible();

      // dialog dismiss → action 호출 전 중단.
      page.once("dialog", (d) => d.dismiss());
      await textRow.getByTestId("knowledge-source-row-delete").click();

      // dismiss 는 동기적 preventDefault — 즉시 assertion 으로도 충분 (code INFO-1).
      // row 가 여전히 보이고 empty state 가 생성되지 않음 = 삭제가 실행되지 않음.
      await expect(textRow).toBeVisible();
      await expect(page.getByTestId("knowledge-sources-empty")).toHaveCount(0);
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("비로그인 → /login?next= 리디렉트 (sources 섹션도 동일 동작)", async ({
    page,
  }) => {
    await page.goto("/bots/ghost-slug/edit");
    await expect(page).toHaveURL(/\/login\?next=%2Fbots%2Fghost-slug%2Fedit/);
  });
});
