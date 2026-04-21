import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({ NODE_ENV: "test" as string }));
const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
}));
const limitSpy = vi.hoisted(() => vi.fn());

vi.mock("@/shared/config/env.server", () => ({
  env: envMock,
}));

vi.mock("@/core/logging", () => ({
  logger: loggerMock,
}));

vi.mock("./redis-client", () => ({
  getRedisClient: vi.fn(() => ({})),
}));

// Ratelimit 생성자 전체를 mock — 실제 Upstash 호출 없이 limit 스파이 추적.
vi.mock("@upstash/ratelimit", () => {
  class MockRatelimit {
    limit = limitSpy;
    static slidingWindow = vi.fn((limit: number, window: string) => ({
      algorithm: "sliding",
      limit,
      window,
    }));
    static fixedWindow = vi.fn(() => ({ algorithm: "fixed" }));
    static tokenBucket = vi.fn(() => ({ algorithm: "token" }));
  }
  return { Ratelimit: MockRatelimit };
});

import { checkBotCreateRatelimit } from "./bot-create-limiter";

describe("checkBotCreateRatelimit", () => {
  beforeEach(() => {
    envMock.NODE_ENV = "test";
    limitSpy.mockReset();
    loggerMock.debug.mockReset();
  });

  it("dev/test 환경에서는 skip (ok=true, Upstash 호출 없음)", async () => {
    const result = await checkBotCreateRatelimit("user-abc");
    expect(result).toEqual({ ok: true });
    expect(limitSpy).not.toHaveBeenCalled();
  });

  it("production 에서 key=userId 로 limiter.limit 에 위임한다", async () => {
    envMock.NODE_ENV = "production";
    limitSpy.mockResolvedValueOnce({ success: true, reset: 0 });

    const result = await checkBotCreateRatelimit("user-xyz");

    expect(result).toEqual({ ok: true });
    expect(limitSpy).toHaveBeenCalledWith("user-xyz");
  });
});
