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

vi.mock("@/shared/config/env", () => ({
  env: envMock,
}));

vi.mock("@/core/logging", () => ({
  logger: loggerMock,
}));

vi.mock("./redis-client", () => ({
  getRedisClient: vi.fn(() => ({})),
}));

vi.mock("@upstash/ratelimit", () => {
  class MockRatelimit {
    limit = limitSpy;
    static slidingWindow = vi.fn(() => ({ algorithm: "sliding" }));
  }
  return { Ratelimit: MockRatelimit };
});

import { checkBotChatRatelimit } from "./bot-chat-limiter";

describe("checkBotChatRatelimit", () => {
  beforeEach(() => {
    envMock.NODE_ENV = "test";
    limitSpy.mockReset();
  });

  it("dev/test 환경에서는 skip", async () => {
    const result = await checkBotChatRatelimit("bot-1", "1.2.3.4");
    expect(result).toEqual({ ok: true });
    expect(limitSpy).not.toHaveBeenCalled();
  });

  it("production 에서 key=`botId:ip` 복합키로 호출", async () => {
    envMock.NODE_ENV = "production";
    limitSpy.mockResolvedValueOnce({ success: true, reset: 0 });

    const result = await checkBotChatRatelimit("bot-abc", "10.0.0.1");

    expect(result).toEqual({ ok: true });
    expect(limitSpy).toHaveBeenCalledWith("bot-abc:10.0.0.1");
  });

  it("production 차단 시 ok=false + reset 전달", async () => {
    envMock.NODE_ENV = "production";
    limitSpy.mockResolvedValueOnce({ success: false, reset: 9999 });

    const result = await checkBotChatRatelimit("bot-abc", "10.0.0.1");

    expect(result).toEqual({ ok: false, reset: 9999 });
  });
});
