import { describe, expect, it, vi } from "vitest";

// env.ts 는 모듈 로드 시 즉시 `parseEnv()` 를 호출하므로, import 전에 필수 env 주입.
// vi.hoisted 는 모든 import 보다 먼저 실행되도록 hoist 된다. `??=` 로 기존 값 보존.
vi.hoisted(() => {
  // NODE_ENV 는 vitest 가 "test" 로 자동 주입 (readonly literal union).
  // 아래 값은 모두 **테스트 전용 플레이스홀더** — 실 API 키 아님 (gitleaks 오탐 회피 위해 명시적 `fake-*` prefix 사용).
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fake-supabase-service-role-test-key";
  process.env.ANTHROPIC_API_KEY ??= "sk-fake-anthropic-test-placeholder";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??=
    "fake-gemini-api-test-placeholder";
  process.env.UPSTASH_REDIS_REST_URL ??= "https://test.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN ??=
    "fake-upstash-rest-test-token-placeholder";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    "fake-supabase-anon-test-placeholder";
});

import { clientSchema, serverSchema } from "./env";

const baseClient = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40),
};

describe("clientSchema — NEXT_PUBLIC_SENTRY_ENVIRONMENT", () => {
  it("미설정 시 optional undefined 로 통과", () => {
    const result = clientSchema.safeParse(baseClient);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_SENTRY_ENVIRONMENT).toBeUndefined();
    }
  });

  it.each(["development", "preview", "production"] as const)(
    "허용 enum 값 %s 통과",
    (value) => {
      const result = clientSchema.safeParse({
        ...baseClient,
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: value,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NEXT_PUBLIC_SENTRY_ENVIRONMENT).toBe(value);
      }
    },
  );

  it.each(["prod", "PRODUCTION", "staging", ""])(
    "enum 외 값 %p 거부",
    (value) => {
      const result = clientSchema.safeParse({
        ...baseClient,
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: value,
      });
      expect(result.success).toBe(false);
    },
  );
});

describe("serverSchema — NEXT_PUBLIC_SENTRY_ENVIRONMENT 상속", () => {
  const baseServer = {
    ...baseClient,
    NODE_ENV: "test",
    SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40),
    ANTHROPIC_API_KEY: "sk-fake-anthropic-test-placeholder",
    GOOGLE_GENERATIVE_AI_API_KEY: "c".repeat(40),
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "d".repeat(40),
  };

  it("clientSchema enum 이 serverSchema 에도 동일 적용", () => {
    const result = serverSchema.safeParse({
      ...baseServer,
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "preview",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_SENTRY_ENVIRONMENT).toBe("preview");
    }
  });

  it("enum 외 값은 serverSchema 에서도 거부", () => {
    const result = serverSchema.safeParse({
      ...baseServer,
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "prod",
    });
    expect(result.success).toBe(false);
  });
});
