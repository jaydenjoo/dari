import { describe, it, expect, vi, beforeEach } from "vitest";

// env.ts 부팅 검증 통과용 필수 env placeholder. vi.hoisted 는 모든 import 전에 실행.
vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY ??= "sk-fake-anthropic-test-placeholder";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fake-supabase-service-role-test-key";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= "fake-google-genai-test-key";
  process.env.UPSTASH_REDIS_REST_URL ??= "https://fake-upstash-test.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN ??=
    "fake-upstash-token-test-placeholder";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fake-supabase-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    "fake-supabase-anon-test-placeholder";
  process.env.FIRECRAWL_API_KEY ??= "fc-test-placeholder-do-not-call";
});

const { mockScrape } = vi.hoisted(() => ({ mockScrape: vi.fn() }));

vi.mock("@/lib/clients/firecrawl", () => ({
  getFirecrawlClient: () => ({ scrape: mockScrape }),
}));

import {
  fetchUrlAsMarkdown,
  knowledgeUrlSchema,
  MAX_MARKDOWN_BYTES,
  MAX_URL_LENGTH,
  sanitizeUrlForLog,
} from "./url-fetch";

describe("sanitizeUrlForLog", () => {
  it("origin + pathname 만 남기고 쿼리스트링/해시 제거 (인라인 토큰 노출 방어)", () => {
    expect(sanitizeUrlForLog("https://example.com/a?access_token=secret")).toBe(
      "https://example.com/a",
    );
    expect(sanitizeUrlForLog("https://example.com/path#section")).toBe(
      "https://example.com/path",
    );
    expect(sanitizeUrlForLog("https://example.com/a?foo=1&bar=2#frag")).toBe(
      "https://example.com/a",
    );
  });

  it("쿼리스트링 없는 정상 URL 은 그대로 유지", () => {
    expect(sanitizeUrlForLog("https://example.com/")).toBe(
      "https://example.com/",
    );
  });

  it("invalid URL → '(invalid-url)' (내부 문자열 비노출)", () => {
    expect(sanitizeUrlForLog("not-a-url")).toBe("(invalid-url)");
    expect(sanitizeUrlForLog("")).toBe("(invalid-url)");
  });
});

describe("knowledgeUrlSchema", () => {
  it.each(["https://example.com", "http://example.com/path?q=1"])(
    "http/https 통과: %s",
    (url) => {
      expect(knowledgeUrlSchema.safeParse(url).success).toBe(true);
    },
  );

  it.each([
    "ftp://example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<h1>",
  ])("비 http/https 거부: %s", (url) => {
    expect(knowledgeUrlSchema.safeParse(url).success).toBe(false);
  });

  it("길이 상한 초과 거부", () => {
    const tooLong = "https://example.com/" + "a".repeat(MAX_URL_LENGTH);
    expect(knowledgeUrlSchema.safeParse(tooLong).success).toBe(false);
  });

  it("빈 문자열 거부", () => {
    expect(knowledgeUrlSchema.safeParse("").success).toBe(false);
  });

  it("비 URL 문자열 거부", () => {
    expect(knowledgeUrlSchema.safeParse("not a url").success).toBe(false);
  });

  it("앞뒤 공백 trim", () => {
    const parsed = knowledgeUrlSchema.safeParse("  https://example.com  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("https://example.com");
  });
});

describe("fetchUrlAsMarkdown", () => {
  beforeEach(() => {
    mockScrape.mockReset();
  });

  it("정상 markdown → truncated=false + 원본 반환", async () => {
    mockScrape.mockResolvedValueOnce({
      markdown: "# Title\n\n본문 내용",
      metadata: { sourceURL: "https://example.com/final", statusCode: 200 },
    });

    const result = await fetchUrlAsMarkdown("https://example.com");

    expect(result.markdown).toBe("# Title\n\n본문 내용");
    expect(result.sourceUrl).toBe("https://example.com/final");
    expect(result.truncated).toBe(false);
    expect(result.originalBytes).toBeGreaterThan(0);
  });

  it("metadata.sourceURL 누락 → 입력 URL 유지", async () => {
    mockScrape.mockResolvedValueOnce({
      markdown: "짧은 내용",
      metadata: {},
    });

    const result = await fetchUrlAsMarkdown("https://example.com/a");
    expect(result.sourceUrl).toBe("https://example.com/a");
  });

  it("markdown 비어있음 → throw URL 처리 실패", async () => {
    mockScrape.mockResolvedValueOnce({
      markdown: "",
      metadata: { statusCode: 200 },
    });

    await expect(fetchUrlAsMarkdown("https://example.com")).rejects.toThrow(
      /^URL 처리 실패$/,
    );
  });

  it("markdown 공백만 → throw (trim 기준 빈 것으로 간주)", async () => {
    mockScrape.mockResolvedValueOnce({
      markdown: "   \n\t  ",
      metadata: {},
    });

    await expect(fetchUrlAsMarkdown("https://example.com")).rejects.toThrow(
      /^URL 처리 실패$/,
    );
  });

  it("Firecrawl scrape 가 throw → 동일 static 메시지 + 원본 메시지 비노출 (보안)", async () => {
    mockScrape.mockRejectedValueOnce(
      new Error("HTTP 402 — payment required, quota exceeded for org xyz-123"),
    );

    await expect(fetchUrlAsMarkdown("https://example.com")).rejects.toThrow(
      /^URL 처리 실패$/,
    );
    // Firecrawl 내부 상세(409, quota, org slug)가 throw 에 새지 않아야 함.
    await expect(fetchUrlAsMarkdown("https://example.com")).rejects.not.toThrow(
      /quota/,
    );
  });

  it("200KB 초과 → truncated=true + 결과 바이트 ≤ MAX, originalBytes 는 원본", async () => {
    const huge = "가".repeat(MAX_MARKDOWN_BYTES); // '가' = 3 bytes (utf8) → ≈ 600KB
    mockScrape.mockResolvedValueOnce({
      markdown: huge,
      metadata: {},
    });

    const result = await fetchUrlAsMarkdown("https://example.com");
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.markdown, "utf8")).toBeLessThanOrEqual(
      MAX_MARKDOWN_BYTES,
    );
    expect(result.originalBytes).toBeGreaterThan(MAX_MARKDOWN_BYTES);
  });

  it("200KB 경계 내 → truncated=false", async () => {
    // 200KB 직전 — 1바이트 문자 200KB-10
    const ascii = "a".repeat(MAX_MARKDOWN_BYTES - 10);
    mockScrape.mockResolvedValueOnce({
      markdown: ascii,
      metadata: {},
    });

    const result = await fetchUrlAsMarkdown("https://example.com");
    expect(result.truncated).toBe(false);
    expect(result.markdown).toBe(ascii);
  });

  it("scrape 호출 인자가 formats=['markdown'] + onlyMainContent + timeout 포함", async () => {
    mockScrape.mockResolvedValueOnce({ markdown: "x", metadata: {} });
    await fetchUrlAsMarkdown("https://example.com");

    expect(mockScrape).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: expect.any(Number),
      }),
    );
  });
});
