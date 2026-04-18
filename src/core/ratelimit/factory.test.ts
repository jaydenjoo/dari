import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Ratelimit } from "@upstash/ratelimit";

const envMock = vi.hoisted(() => ({ NODE_ENV: "test" as string }));
const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
}));

vi.mock("@/shared/config/env", () => ({
  env: envMock,
}));

vi.mock("@/core/logging", () => ({
  logger: loggerMock,
}));

// redis-client 는 실제로 호출되지 않지만, factory 모듈이 경유하지 않도록 안전망.
vi.mock("./redis-client", () => ({
  getRedisClient: vi.fn(() => ({})),
}));

import { checkRatelimit } from "./factory";

type LimitFn = (key: string) => Promise<{ success: boolean; reset: number }>;

function makeLimiter(impl: LimitFn): Ratelimit {
  return { limit: vi.fn(impl) } as unknown as Ratelimit;
}

describe("checkRatelimit", () => {
  beforeEach(() => {
    envMock.NODE_ENV = "test";
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
  });

  it("dev/test 환경에서는 Upstash 호출 없이 통과", async () => {
    const limiter = makeLimiter(async () => ({ success: false, reset: 9999 }));

    const result = await checkRatelimit(limiter, "key-a", { name: "t" });

    expect(result).toEqual({ ok: true });
    expect(limiter.limit).not.toHaveBeenCalled();
    expect(loggerMock.debug).not.toHaveBeenCalled();
  });

  it("production 에서 success=true 면 ok=true", async () => {
    envMock.NODE_ENV = "production";
    const limiter = makeLimiter(async () => ({ success: true, reset: 0 }));

    const result = await checkRatelimit(limiter, "key-b", { name: "t" });

    expect(result).toEqual({ ok: true });
    expect(limiter.limit).toHaveBeenCalledWith("key-b");
    expect(loggerMock.debug).not.toHaveBeenCalled();
  });

  it("production 에서 차단 시 ok=false + reset + debug 로그", async () => {
    envMock.NODE_ENV = "production";
    const limiter = makeLimiter(async () => ({
      success: false,
      reset: 1234567,
    }));

    const result = await checkRatelimit(limiter, "key-c", { name: "t" });

    expect(result).toEqual({ ok: false, reset: 1234567 });
    expect(loggerMock.debug).toHaveBeenCalledOnce();
    const [payload] = loggerMock.debug.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ limiter: "t", resetIn: 1234567 });
  });

  it("production 에서 예외 발생 시 fail-open + URL/토큰 마스킹된 err 로깅", async () => {
    envMock.NODE_ENV = "production";
    const limiter = makeLimiter(async () => {
      throw new Error(
        "fetch failed for https://us1-example.upstash.io?token=sk-abc123",
      );
    });

    const result = await checkRatelimit(limiter, "key-d", {
      name: "unit-test",
    });

    expect(result).toEqual({ ok: true });
    expect(loggerMock.error).toHaveBeenCalledOnce();

    const [payload, msg] = loggerMock.error.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      limiter: "unit-test",
      err: { name: "Error" },
    });
    const sanitizedMessage = (payload as { err: { message: string } }).err
      .message;
    expect(sanitizedMessage).not.toContain("upstash.io");
    expect(sanitizedMessage).not.toContain("sk-abc123");
    expect(sanitizedMessage).toContain("[REDACTED_URL]");
    expect(String(msg)).toContain("fail-open");
  });

  it("production 에서 non-Error throw 도 안전하게 sanitize", async () => {
    envMock.NODE_ENV = "production";
    const limiter = makeLimiter(async () => {
      throw "raw https://secret.example.com?token=leak";
    });

    const result = await checkRatelimit(limiter, "key-e", { name: "t" });

    expect(result).toEqual({ ok: true });
    const [payload] = loggerMock.error.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ err: { name: "UnknownError" } });
    const sanitizedMessage = (payload as { err: { message: string } }).err
      .message;
    expect(sanitizedMessage).not.toContain("secret.example.com");
    expect(sanitizedMessage).not.toContain("leak");
  });
});
