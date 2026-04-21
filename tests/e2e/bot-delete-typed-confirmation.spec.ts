import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { loginWithPassword } from "./support/auth-helpers";
import { MAIN_TEST_USER } from "./support/fixtures";

// Epic B Task B-1: 봇 영구 삭제 typed confirmation E2E.
//
// 커버리지:
//   - C1: 잘못된 이름 입력 시 "영구 삭제" 버튼 비활성 (UX 일치 검증)
//   - C2: 올바른 이름 입력 → 삭제 성공 → /bots 리다이렉트 + 해당 봇 부재
//   - C3: 취소 버튼 → 모달 닫힘 (UX 회귀 방지)
//
// 비로그인 edit 페이지 리디렉트는 bot-edit.spec.ts 에서 이미 커버하므로 중복 생략.
// Gemini/Firecrawl 등 외부 API 의존 없음 (typed confirmation + RLS + rate limit 만).

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
    // 테스트 teardown 전용 로그 — Playwright 리포트에 cleanup 실패 가시성 확보.
    // prod 코드의 console.* 금지 규칙과는 별개 (테스트 파일 컨텍스트).
    console.warn(
      `[e2e cleanup] deleteBotBySlug(${slug}) 실패: ${error.message}`,
    );
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
    .fill("B-1 타입드 컨펌 테스트용 봇입니다.");
  await page.getByTestId("create-bot-submit").click();
  await page.waitForURL(/\/bots$/, { timeout: 10_000 });
}

test.describe("봇 영구 삭제 typed confirmation", () => {
  // adminClient 가 module scope 에 캐시되므로 spec 완료 후 명시적 해제 (소켓 누수 방어,
  // code review M-4 반영). Playwright worker 는 프로세스 격리라 실효성은 낮지만,
  // spec 이 늘어나도 안전한 기본값 유지.
  test.afterAll(() => {
    adminClient = null;
  });

  test("C1: 잘못된 이름 입력 시 영구 삭제 버튼 비활성", async ({ page }) => {
    const slug = uniqueSlug("e2e-del-mismatch");
    const name = `삭제 테스트 ${slug.slice(-6)}`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/edit`);
      await page.getByTestId("delete-bot-trigger").click();

      // 다이얼로그 열림 확인.
      const input = page.getByTestId("delete-bot-confirm-input");
      await expect(input).toBeVisible();

      // 비어있을 때 비활성.
      const submit = page.getByTestId("delete-bot-submit");
      await expect(submit).toBeDisabled();

      // 잘못된 값 입력 시도 비활성.
      await input.fill(`${name}-wrong`);
      await expect(submit).toBeDisabled();

      // 대소문자 구분 확인 — client/server 모두 exact match (case-sensitive).
      // (공백 trim 은 양쪽 끝만 적용되므로 중간 대문자 치환은 매칭 불가)
      await input.fill(name.toUpperCase());
      await expect(submit).toBeDisabled();
    } finally {
      // 테스트가 C1 만 실행돼도 봇은 남으므로 정리.
      await deleteBotBySlug(slug);
    }
  });

  test("C2: 올바른 이름 입력 → 삭제 성공 → /bots 리다이렉트 + 봇 부재", async ({
    page,
  }) => {
    const slug = uniqueSlug("e2e-del-ok");
    const name = `삭제 성공 ${slug.slice(-6)}`;

    let cleanedUp = false;
    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/edit`);
      await page.getByTestId("delete-bot-trigger").click();

      await page.getByTestId("delete-bot-confirm-input").fill(name);

      const submit = page.getByTestId("delete-bot-submit");
      await expect(submit).toBeEnabled();

      await Promise.all([
        page.waitForURL(/\/bots$/, { timeout: 10_000 }),
        submit.click(),
      ]);

      // DB 레벨 부재 확인 (RLS 무관 admin 채널).
      const { data, error } = await admin()
        .from("bots")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toBeNull();
      cleanedUp = true;
    } finally {
      if (!cleanedUp) await deleteBotBySlug(slug);
    }
  });

  test("C3: 취소 버튼 클릭 → 모달 닫힘 + 봇 보존", async ({ page }) => {
    const slug = uniqueSlug("e2e-del-cancel");
    const name = `삭제 취소 ${slug.slice(-6)}`;

    try {
      await loginWithPassword(
        page,
        MAIN_TEST_USER.email,
        MAIN_TEST_USER.password,
      );
      await createOwnBot(slug, name, page);

      await page.goto(`/bots/${slug}/edit`);
      await page.getByTestId("delete-bot-trigger").click();

      const input = page.getByTestId("delete-bot-confirm-input");
      await expect(input).toBeVisible();
      await input.fill(name);

      // "취소" 클릭 — DialogClose render 로 Button 을 받아 text=취소.
      await page.getByRole("button", { name: "취소" }).click();

      // 모달 닫힘 — input 이 DOM 에서 사라지거나 숨겨짐.
      await expect(input).toBeHidden();

      // 봇은 여전히 존재 — 편집 페이지에서 name 이 그대로.
      await page.reload();
      await expect(page.getByTestId("edit-bot-name-heading")).toHaveText(name);
    } finally {
      await deleteBotBySlug(slug);
    }
  });
});
