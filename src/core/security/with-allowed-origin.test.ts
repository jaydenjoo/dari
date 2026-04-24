import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY ??= "sk-fake-anthropic-test-placeholder";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= "fake-google-genai-test-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fake-supabase-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    "fake-supabase-anon-test-placeholder";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fake-service-role-test-placeholder-fake";
  process.env.UPSTASH_REDIS_REST_URL ??= "https://fake-upstash-test.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN ??=
    "fake-upstash-token-test-placeholder";
  process.env.FIRECRAWL_API_KEY ??= "fc-fake-firecrawl-test-placeholder";
});

import { NextRequest, NextResponse } from "next/server";

import type { DariConfig } from "@/core/config";
import type { RatelimitCheck } from "@/core/ratelimit/factory";

import {
  computeRetryAfterSeconds,
  withAllowedOrigin,
} from "./with-allowed-origin";

type TestBot = { id: string; config: DariConfig };

function makeBot(allowedDomains: string[] = ["https://example.com"]): TestBot {
  // 최소한의 DariConfig 형태 (handler 가 사용하는 필드만 포함)
  return {
    id: "bot-1",
    config: { allowedDomains } as unknown as DariConfig,
  };
}

const ERR_MSG = {
  internal_error: "internal",
  bot_not_available: "not available",
  too_many_requests: "too many",
};

function makeRequest(
  origin: string | null = "https://example.com",
): NextRequest {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  headers.set("x-forwarded-for", "1.2.3.4");
  return new NextRequest("https://api.test/api/widget-config/slug", {
    method: "GET",
    headers,
  });
}

const passRl = async (): Promise<RatelimitCheck> => ({ ok: true });
const blockRl = (resetMs: number) => async (): Promise<RatelimitCheck> => ({
  ok: false,
  reset: resetMs,
});

const ctx = { params: Promise.resolve({ botId: "test-slug" }) };

describe("computeRetryAfterSeconds", () => {
  it("미래 reset → 양수 초", () => {
    expect(computeRetryAfterSeconds(10_000, 0)).toBe(10);
    expect(computeRetryAfterSeconds(1_500, 0)).toBe(2);
  });
  it("지나간 reset → 최소 1초", () => {
    expect(computeRetryAfterSeconds(0, 5_000)).toBe(1);
    expect(computeRetryAfterSeconds(-9999, 0)).toBe(1);
  });
});

describe("withAllowedOrigin", () => {
  it("bot 없음 → 404 + bot_not_available", async () => {
    const handler = withAllowedOrigin(
      {
        loadBot: async () => null,
        rateLimit: passRl,
        errorMessages: ERR_MSG,
      },
      async () => NextResponse.json({ unreachable: true }),
    );

    const res = await handler(makeRequest(), ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("bot_not_available");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("origin 미일치 → 404 + bot_not_available (enumeration 방지)", async () => {
    const handler = withAllowedOrigin(
      {
        loadBot: async () => makeBot(["https://other.com"]),
        rateLimit: passRl,
        errorMessages: ERR_MSG,
      },
      async () => NextResponse.json({ unreachable: true }),
    );

    const res = await handler(makeRequest("https://example.com"), ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("bot_not_available");
    // 거부 응답에는 Allow-Origin 헤더 부재
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rate limit 초과 → 429 + Retry-After 헤더", async () => {
    const resetIn30s = Date.now() + 30_000;
    const handler = withAllowedOrigin(
      {
        loadBot: async () => makeBot(),
        rateLimit: blockRl(resetIn30s),
        errorMessages: ERR_MSG,
      },
      async () => NextResponse.json({ unreachable: true }),
    );

    const res = await handler(makeRequest(), ctx);
    expect(res.status).toBe(429);
    const retry = res.headers.get("Retry-After");
    expect(retry).not.toBeNull();
    const sec = Number(retry);
    expect(sec).toBeGreaterThanOrEqual(28);
    expect(sec).toBeLessThanOrEqual(31);
  });

  it("정상 통과 → handler 호출 + corsHeaders 컨텍스트 전달", async () => {
    let called = false;
    const handler = withAllowedOrigin(
      {
        loadBot: async () => makeBot(),
        rateLimit: passRl,
        errorMessages: ERR_MSG,
      },
      async (c) => {
        called = true;
        expect(c.bot.id).toBe("bot-1");
        expect(c.origin).toBe("https://example.com");
        expect(c.clientIp).toBe("1.2.3.4");
        expect(c.corsHeaders["Access-Control-Allow-Origin"]).toBe(
          "https://example.com",
        );
        return NextResponse.json({ ok: true }, { headers: c.corsHeaders });
      },
    );

    const res = await handler(makeRequest(), ctx);
    expect(called).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com",
    );
  });

  it("Origin 헤더 부재 → bot 있어도 404 (브라우저 요청만 허용)", async () => {
    const handler = withAllowedOrigin(
      {
        loadBot: async () => makeBot(["https://example.com"]),
        rateLimit: passRl,
        errorMessages: ERR_MSG,
      },
      async () => NextResponse.json({ unreachable: true }),
    );

    const res = await handler(makeRequest(null), ctx);
    expect(res.status).toBe(404);
  });

  it("loadBot throw → 500 + internal_error (code M-1 fix)", async () => {
    const handler = withAllowedOrigin(
      {
        loadBot: async () => {
          throw new Error("DB unreachable");
        },
        rateLimit: passRl,
        errorMessages: ERR_MSG,
      },
      async () => NextResponse.json({ unreachable: true }),
    );

    const res = await handler(makeRequest(), ctx);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("internal_error");
  });

  it("빈 allowedDomains (allow-all) + origin 있음 → 통과", async () => {
    const handler = withAllowedOrigin(
      {
        loadBot: async () => makeBot([]),
        rateLimit: passRl,
        errorMessages: ERR_MSG,
      },
      async (c) => NextResponse.json({ ok: true }, { headers: c.corsHeaders }),
    );

    const res = await handler(makeRequest("https://anything.example"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://anything.example",
    );
  });
});
