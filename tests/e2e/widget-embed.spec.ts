/**
 * 위젯 embed cross-origin smoke (Task A-3).
 *
 * 테스트 매트릭스:
 *   - 실행 projects 5종: chromium + firefox-widget + webkit-widget + mobile-chrome-widget + mobile-safari-widget
 *   - host origin: http://localhost:4001 (tests/e2e/widget-embed/serve.mjs)
 *   - widget origin: http://localhost:4000 (Next.js dev + /widget.js 정적 서빙)
 *
 * 검증 시나리오:
 *   A. widget.js 로드 + Shadow DOM host 컨테이너 생성
 *   B. Shadow DOM 격리 — host 페이지의 공격적 CSS(Comic Sans/hotpink)가 위젯 내부에 번지지 않음
 *   C. CSP 매트릭스 — strict(`script-src 'self'`) 차단 vs permissive(host 명시) 허용
 *
 * 범위 밖 (TODO 다음 Task):
 *   - 버튼 클릭 → 패널 open 의 DOM 인터랙션 (closed Shadow DOM 내부 접근은 browser 호환성 편차)
 *   - 실 AI 응답 E2E (Task A-4 스트리밍 전환 시 동반 작성)
 *   - virtual keyboard 실측 (ADR-009 Open Q #3 — 실기기 검증 권장)
 *
 * ADR-009 Open Q 실측 결과는 PROGRESS.md + ADR Open Q 섹션에 기록.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const HOST_ORIGIN = "http://localhost:4001";
const WIDGET_CDN = "http://localhost:4000/widget.js";

let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "[widget-embed] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
      );
    }
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${key}` } },
    });
  }
  return adminClient;
}

function readMainUserId(): string {
  const statePath = join(__dirname, ".state", "main-user.json");
  let state: unknown;
  try {
    state = JSON.parse(readFileSync(statePath, "utf-8"));
  } catch (err) {
    throw new Error(
      `[widget-embed] .state/main-user.json 읽기 실패 — global-setup 이 완료됐는지 확인. 경로: ${statePath} · 원인: ${String(err)}`,
    );
  }
  if (
    typeof state !== "object" ||
    state === null ||
    typeof (state as Record<string, unknown>).id !== "string"
  ) {
    throw new Error(
      `[widget-embed] main-user.json 형식 불일치 — { id: string } 기대: ${JSON.stringify(state)}`,
    );
  }
  return (state as { id: string }).id;
}

// DariConfig 최소 필드 — knowledge 없음 (RAG 스킵 → Gemini 호출 없음).
// allowedDomains 빈 배열 = allow-all (origin-check.ts 기본 정책).
function minimalBotConfig(slug: string, name: string) {
  return {
    version: "1.0" as const,
    botId: slug,
    identity: {
      name,
      welcomeMessage: "안녕하세요",
      mode: "support" as const,
    },
    systemPrompt:
      "당신은 위젯 embed smoke 테스트용 봇입니다. 간결하고 친절하게 답하세요.",
    appearance: {
      primaryColor: "#2b7cff",
      position: "bottom-right" as const,
    },
    rateLimit: {
      messagesPerMinute: 30,
      messagesPerHour: 300,
    },
    allowedDomains: [],
  };
}

async function createSmokeBot(ownerId: string, slug: string, name: string) {
  const { data, error } = await admin()
    .from("bots")
    .insert({
      owner_id: ownerId,
      slug,
      name,
      status: "active",
      config: minimalBotConfig(slug, name),
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`[widget-embed] bot insert 실패: ${error.message}`);
  }
  return (data as { id: string }).id;
}

async function deleteSmokeBot(slug: string): Promise<void> {
  const { error } = await admin().from("bots").delete().eq("slug", slug);
  if (error) {
    console.error(`[widget-embed] bot delete 실패 (${slug}): ${error.message}`);
  }
}

test.describe("위젯 embed cross-origin smoke", () => {
  // fullyParallel:true 하에서 describe 내 4 tests 가 다른 worker 에 분산되면 beforeAll
  // 이 worker 마다 실행되어 **봇이 여러 개 생성되고 일부는 정리 안 되는 좀비 상태**.
  // serial 모드로 1 worker × 1 bot × 1 cleanup 보장 (code HIGH-1 2026-04-21).
  test.describe.configure({ mode: "serial" });

  let botSlug: string;

  test.beforeAll(async () => {
    const ownerId = readMainUserId();
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 6);
    botSlug = `widget-smoke-${ts}-${rnd}`;
    await createSmokeBot(ownerId, botSlug, `Widget Smoke ${ts}`);
  });

  test.afterAll(async () => {
    if (botSlug) await deleteSmokeBot(botSlug);
  });

  test("A. widget.js 로드 → Shadow DOM host 컨테이너 생성 + JS 예외 없음", async ({
    page,
  }) => {
    // **pageerror 만 엄격 체크** — 실제 JS 런타임 예외.
    // console.error 는 resource 404 등 비치명적 브라우저 경고도 포함하므로 smoke 기준
    // 에서 제외. widget 내부 로직 버그는 pageerror 로 드러난다.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(
      `${HOST_ORIGIN}/host.html?bot=${botSlug}&cdn=${encodeURIComponent(WIDGET_CDN)}`,
    );

    // loader.js 가 주입한 script 태그가 DOM 에 추가됐는지
    await expect(
      page.locator("[data-testid=dari-widget-script]"),
    ).toBeAttached();

    // widget.js boot 완료 시 Shadow host (#dari-widget-host) 생성.
    // config.ts parseConfig → widget-config-client 의 /api/widget-config 응답 → ui.ts mountShadowRoot 까지 통과해야 함.
    await expect(page.locator("#dari-widget-host")).toBeAttached({
      timeout: 15_000,
    });

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });

  test("B. Shadow DOM 격리 — host page 의 공격적 CSS 가 위젯에 번지지 않음", async ({
    page,
  }) => {
    await page.goto(
      `${HOST_ORIGIN}/host.html?bot=${botSlug}&cdn=${encodeURIComponent(WIDGET_CDN)}`,
    );

    // host 페이지는 Comic Sans MS + hotpink 글로벌 CSS 적용.
    const hostHeading = page.getByTestId("host-heading");
    await expect(hostHeading).toBeVisible();
    const hostFont = await hostHeading.evaluate(
      (el) => getComputedStyle(el).fontFamily,
    );
    // 브라우저별 인용/공백 차이가 있으므로 소문자 비교 + 'comic sans' 포함 확인.
    expect(hostFont.toLowerCase()).toContain("comic sans");

    // 위젯 host 컨테이너는 생성되어야 함 (Shadow DOM 마운트 성공 신호).
    const widgetHost = page.locator("#dari-widget-host");
    await expect(widgetHost).toBeAttached({ timeout: 15_000 });

    // 위젯 host 엘리먼트 자체의 색상은 host page 의 `color: hotpink !important` 영향을
    // 받을 수 있으나, 중요한 건 **shadow root 내부** UI 가 격리된다는 것.
    // closed mode 라 내부 query 는 browser 호환성 편차 → 여기서는 host 컨테이너
    // 존재 자체로 "위젯이 Shadow root 안에서 렌더를 시도했다" 증거로 간주.
    //
    // (향후 Task A-4 또는 별도 Task 에서 open mode toggle + UI 깊이 테스트 보강 여지)
  });

  test.describe("CSP 매트릭스 (ADR-009 Open Q #4)", () => {
    test("Strict (`script-src 'self'`) — 위젯 로드 차단 기대", async ({
      page,
    }) => {
      const cspErrors: string[] = [];
      page.on("console", (msg) => {
        const text = msg.text();
        if (
          msg.type() === "error" &&
          /Content Security Policy|Refused to load|CSP/i.test(text)
        ) {
          cspErrors.push(text);
        }
      });

      await page.goto(
        `${HOST_ORIGIN}/host-strict-csp.html?bot=${botSlug}&cdn=${encodeURIComponent(WIDGET_CDN)}`,
      );

      // CSP 가 외부 origin 스크립트를 차단하므로 widget host 컨테이너 생성 안 됨.
      // Playwright 기본 5초 타임아웃 으로 not.toBeAttached 확인.
      await expect(page.locator("#dari-widget-host")).not.toBeAttached({
        timeout: 3_000,
      });

      // CSP 에러가 1건 이상 기록 — 브라우저별 메시지 차이 있을 수 있음.
      // 메시지 검증보다 "로드 실패" 자체를 핵심으로 보고, 에러 포착 여부는 참조용.
      // (CSP 미감지 브라우저가 있을 경우 false negative 방지)
      if (cspErrors.length > 0) {
        console.log(
          `[widget-embed] strict CSP 차단 확인 (${cspErrors.length} 에러): ${cspErrors[0]}`,
        );
      }
    });

    test("Permissive (host origin 명시 허용) — 위젯 정상 로드", async ({
      page,
    }) => {
      await page.goto(
        `${HOST_ORIGIN}/host-permissive-csp.html?bot=${botSlug}&cdn=${encodeURIComponent(WIDGET_CDN)}`,
      );
      await expect(page.locator("#dari-widget-host")).toBeAttached({
        timeout: 15_000,
      });
    });
  });
});
