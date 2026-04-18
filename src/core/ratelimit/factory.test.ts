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

  // ─── 신규 마스킹 패턴 (security re-review N-1) ───

  it("Anthropic API 키 (sk-ant-*) 를 [REDACTED_ANTHROPIC_KEY] 로 마스킹", async () => {
    envMock.NODE_ENV = "production";
    const limiter = makeLimiter(async () => {
      // gitleaks:allow — placeholder for sanitize regex test (not a real key)
      throw new Error("Invalid API key: sk-ant-FAKE-token-XYZ");
    });

    await checkRatelimit(limiter, "k", { name: "t" });

    const [payload] = loggerMock.error.mock.calls[0] ?? [];
    const msg = (payload as { err: { message: string } }).err.message;
    expect(msg).not.toContain("sk-ant-FAKE");
    expect(msg).toContain("[REDACTED_ANTHROPIC_KEY]");
  });

  it("JWT (eyJ...) 을 [REDACTED_JWT] 로 마스킹 (Supabase 등)", async () => {
    envMock.NODE_ENV = "production";
    const limiter = makeLimiter(async () => {
      // gitleaks:allow — synthetic 3-segment placeholder (not a real JWT)
      throw new Error("invalid JWT: eyJfakeHdr.eyJfakePayload.fakeSignaturePart");
    });

    await checkRatelimit(limiter, "k", { name: "t" });

    const [payload] = loggerMock.error.mock.calls[0] ?? [];
    const msg = (payload as { err: { message: string } }).err.message;
    expect(msg).not.toContain("eyJfakeHdr");
    expect(msg).not.toContain("fakeSignaturePart");
    expect(msg).toContain("[REDACTED_JWT]");
  });

  it("api_key= / api-key: / apikey= 형식을 모두 마스킹", async () => {
    envMock.NODE_ENV = "production";
    const limiter = makeLimiter(async () => {
      // gitleaks:allow — placeholder value (not a real key)
      throw new Error("auth failed: api_key=fake-test-value-123");
    });

    await checkRatelimit(limiter, "k", { name: "t" });

    const [payload] = loggerMock.error.mock.calls[0] ?? [];
    const msg = (payload as { err: { message: string } }).err.message;
    expect(msg).not.toContain("fake-test-value-123");
    expect(msg).toContain("api_key=[REDACTED]");
  });

  it("Authorization 헤더 값을 마스킹 (Basic / Bearer 외 임의 스킴)", async () => {
    envMock.NODE_ENV = "production";
    const limiter = makeLimiter(async () => {
      // gitleaks:allow — placeholder header (not a real credential)
      throw new Error("Authorization: Basic fake-test-credential");
    });

    await checkRatelimit(limiter, "k", { name: "t" });

    const [payload] = loggerMock.error.mock.calls[0] ?? [];
    const msg = (payload as { err: { message: string } }).err.message;
    expect(msg).not.toContain("fake-test-credential");
    expect(msg).toContain("Authorization: [REDACTED]");
  });

  it("'primary key constraint' 같은 정상 DB 에러는 false positive 없음", async () => {
    envMock.NODE_ENV = "production";
    const limiter = makeLimiter(async () => {
      throw new Error(
        "duplicate key value violates unique constraint primary key on conversations",
      );
    });

    await checkRatelimit(limiter, "k", { name: "t" });

    const [payload] = loggerMock.error.mock.calls[0] ?? [];
    const msg = (payload as { err: { message: string } }).err.message;
    // 'primary key' 표현이 보존되어야 디버깅 가능 (api_key 패턴이 prefix 강제)
    expect(msg).toContain("primary key");
    expect(msg).toContain("constraint");
    expect(msg).not.toContain("[REDACTED]");
  });
});
