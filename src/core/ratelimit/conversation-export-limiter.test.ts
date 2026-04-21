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

vi.mock("@upstash/ratelimit", () => {
  class MockRatelimit {
    limit = limitSpy;
    static slidingWindow = vi.fn(() => ({ algorithm: "sliding" }));
  }
  return { Ratelimit: MockRatelimit };
});

import { checkConversationExportRatelimit } from "./conversation-export-limiter";

describe("checkConversationExportRatelimit", () => {
  beforeEach(() => {
    envMock.NODE_ENV = "test";
    limitSpy.mockReset();
  });

  it("dev/test 환경에서는 skip (Upstash 비용/Flaky 회피)", async () => {
    const result = await checkConversationExportRatelimit("user-uuid-1");
    expect(result).toEqual({ ok: true });
    expect(limitSpy).not.toHaveBeenCalled();
  });

  it("production 에서 key=user.id 단일키로 호출 (owner 기준 제한)", async () => {
    envMock.NODE_ENV = "production";
    limitSpy.mockResolvedValueOnce({ success: true, reset: 0 });

    const result = await checkConversationExportRatelimit("user-uuid-1");

    expect(result).toEqual({ ok: true });
    expect(limitSpy).toHaveBeenCalledWith("user-uuid-1");
  });

  it("production 차단 시 ok=false + reset 전달", async () => {
    envMock.NODE_ENV = "production";
    limitSpy.mockResolvedValueOnce({ success: false, reset: 9999 });

    const result = await checkConversationExportRatelimit("user-uuid-1");

    expect(result).toEqual({ ok: false, reset: 9999 });
  });
});
