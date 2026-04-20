import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

/**
 * Task 1-7-c E2E — 파일 지식 업로드 (TXT 중심).
 *
 * PDF 파싱은 unpdf 를 호출 → 실 Gemini embedding + 실 Storage 업로드 경로.
 * 비용/flaky 고려해 MVP 는 **TXT 1회 + 미지원 파일 거부 + 파일 선택 UI** 로 한정.
 *
 * 전제:
 *   - `supabase/migrations/0010_create_knowledge_files_storage.sql` 적용 완료
 *     (버킷 + RLS 4정책). 미적용 시 upload 단계에서 RLS 거부.
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
    .fill("당신은 E2E 파일 업로드 테스트용 봇입니다.");
  await page.getByTestId("create-bot-submit").click();
  await page.waitForURL(/\/bots$/, { timeout: 10_000 });
}

test.describe("/bots/[slug]/edit 파일 지식 업로드", () => {
  test("파일 섹션 UI 가 편집 페이지에 노출된다 (smoke)", async ({ page }) => {
    const slug = uniqueSlug("e2e-file-smoke");
    const name = `파일 smoke ${slug.slice(-6)}`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/edit`);

      // 섹션 메타 박스 + 업로드 input + 버튼.
      await expect(page.getByTestId("knowledge-file-meta")).toBeVisible();
      await expect(page.getByTestId("knowledge-file-input")).toBeVisible();
      await expect(page.getByTestId("knowledge-file-submit")).toBeVisible();
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("TXT 파일 업로드 → 성공 배너 + 청크 수 표시 + 파일 목록 반영", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-file-txt");
    const name = `파일 TXT ${slug.slice(-6)}`;
    const fileName = `dari-ko-sample-${slug.slice(-4)}.txt`;
    const fileContent =
      "Dari 는 사이트에 임베드하는 맞춤형 챗봇 서비스입니다. " +
      "업로드한 지식 문서를 기반으로 답변하며, 관리자 페이지에서 텍스트·URL·파일을 추가할 수 있습니다.";

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/edit`);

      // 파일 선택 (Buffer → Playwright setInputFiles).
      await page.getByTestId("knowledge-file-input").setInputFiles({
        name: fileName,
        mimeType: "text/plain",
        buffer: Buffer.from(fileContent, "utf8"),
      });

      // 업로드 — Gemini + Storage + RPC 실 왕복 (~5~10초).
      await page.getByTestId("knowledge-file-submit").click();

      // 성공 배너 + 파일명 노출.
      await expect(page.getByTestId("knowledge-file-success")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("knowledge-file-success")).toContainText(
        fileName,
      );

      // 파일 목록 렌더 (revalidatePath 후 재진입 시).
      await page.reload();
      await expect(page.getByTestId("knowledge-file-list")).toContainText(
        fileName,
      );
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("미지원 확장자(.zip) MIME 거부 → fieldError 노출, 파이프라인 미호출", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-file-zip");
    const name = `파일 zip 거부 ${slug.slice(-6)}`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/edit`);

      // input accept 가 ".pdf,.txt,.md" 로 제한되어 있지만, MIME 위조 케이스 방어.
      // Playwright setInputFiles 는 accept 속성 무시 → 서버 단 검증 발동.
      await page.getByTestId("knowledge-file-input").setInputFiles({
        name: "archive.zip",
        mimeType: "application/zip",
        buffer: Buffer.from("PK\u0003\u0004mock-zip-bytes"),
      });

      await page.getByTestId("knowledge-file-submit").click();

      // fieldError 메시지 노출.
      await expect(
        page.getByTestId("knowledge-file-input-error"),
      ).toContainText("PDF, TXT, MD");
    } finally {
      await deleteBotBySlug(slug);
    }
  });

  test("비로그인 → /login?next= 리디렉트 (file 섹션도 동일 동작)", async ({
    page,
  }) => {
    await page.goto("/bots/ghost-slug/edit");
    await expect(page).toHaveURL(/\/login\?next=%2Fbots%2Fghost-slug%2Fedit/);
  });
});
