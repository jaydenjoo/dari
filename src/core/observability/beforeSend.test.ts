import { describe, it, expect } from "vitest";
import type { ErrorEvent, EventHint } from "@sentry/core";
import { beforeSend } from "./beforeSend";

const emptyHint: EventHint = {};

// ErrorEvent 는 discriminator 로 `type: undefined` 를 요구. 테스트마다 반복하지 않기 위한 헬퍼.
function runBeforeSend(partial: Omit<ErrorEvent, "type">): ErrorEvent {
  const event: ErrorEvent = { ...partial, type: undefined };
  const result = beforeSend(event, emptyHint);
  if (result === null) {
    throw new Error("beforeSend returned null unexpectedly");
  }
  return result;
}

describe("beforeSend — extra / contexts", () => {
  it("extra 의 최상위/중첩 민감 필드를 [Redacted] 로 치환한다", () => {
    const out = runBeforeSend({
      extra: {
        username: "alice",
        password: "plain-1",
        user: {
          name: "alice",
          accessToken: "plain-2",
          nested: { secret: "plain-3" },
        },
      },
    });

    expect(out.extra).toMatchObject({
      username: "alice",
      password: "[Redacted]",
      user: {
        name: "alice",
        accessToken: "[Redacted]",
        nested: { secret: "[Redacted]" },
      },
    });
  });

  it("contexts 내부의 민감 필드도 치환한다", () => {
    const out = runBeforeSend({
      contexts: {
        app: { version: "1.0", serviceRoleKey: "plain-4" },
        auth: { token: "plain-5", userId: "u-1" },
      },
    });

    expect(out.contexts?.app).toMatchObject({
      version: "1.0",
      serviceRoleKey: "[Redacted]",
    });
    expect(out.contexts?.auth).toMatchObject({
      token: "[Redacted]",
      userId: "u-1",
    });
  });

  it("이름이 비슷한 필드(passwordHint, tokenCount)는 치환하지 않는다 (완전 일치)", () => {
    const out = runBeforeSend({
      extra: {
        passwordHint: "첫 반려동물 이름",
        tokenCount: 42,
        apiKeyPrefix: "sk-xxx",
      },
    });

    expect(out.extra).toMatchObject({
      passwordHint: "첫 반려동물 이름",
      tokenCount: 42,
      apiKeyPrefix: "sk-xxx",
    });
  });
});

describe("beforeSend — request", () => {
  it("request.data 의 민감 필드 치환 + 안전 필드 보존", () => {
    const out = runBeforeSend({
      request: {
        method: "POST",
        url: "https://example.com/api/login",
        data: {
          email: "alice@example.com",
          password: "plain-6",
          refreshToken: "plain-7",
        },
      },
    });

    expect(out.request?.data).toMatchObject({
      email: "alice@example.com",
      password: "[Redacted]",
      refreshToken: "[Redacted]",
    });
    expect(out.request?.method).toBe("POST");
    expect(out.request?.url).toBe("https://example.com/api/login");
  });

  it("request.headers 를 헤더명 기반으로 치환한다 (case-insensitive)", () => {
    const out = runBeforeSend({
      request: {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer plain-8",
          Cookie: "sid=plain-9",
          "X-API-Key": "plain-10",
          "User-Agent": "test-agent",
        } as Record<string, string>,
      },
    });

    expect(out.request?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "[Redacted]",
      Cookie: "[Redacted]",
      "X-API-Key": "[Redacted]",
      "User-Agent": "test-agent",
    });
  });

  it("request.headers 값이 배열일 때도 모든 요소를 redact 한다 (multi-value header)", () => {
    const out = runBeforeSend({
      request: {
        headers: {
          "Set-Cookie": ["sid=plain-a", "refresh=plain-b"],
          Cookie: ["first=plain-c"],
          "X-Request-ID": ["req-1", "req-2"],
        } as unknown as Record<string, string>,
      },
    });

    // Cookie 배열의 모든 요소가 redact
    const cookieHeader = (
      out.request?.headers as Record<string, string | string[]>
    ).Cookie;
    expect(cookieHeader).toEqual(["[Redacted]"]);

    // X-Request-ID 는 민감 리스트 밖 → 보존
    const reqId = (out.request?.headers as Record<string, string | string[]>)[
      "X-Request-ID"
    ];
    expect(reqId).toEqual(["req-1", "req-2"]);

    // 원본 값이 출력에 남지 않는다
    const serialized = JSON.stringify(out.request?.headers);
    expect(serialized).not.toContain("plain-a");
    expect(serialized).not.toContain("plain-b");
    expect(serialized).not.toContain("plain-c");
  });

  it("request.query_string 은 전체 삭제한다 (URL 쿼리에 토큰이 올 수 있음)", () => {
    const out = runBeforeSend({
      request: {
        url: "https://example.com/api?token=plain-x",
        query_string: "token=plain-x&other=ok",
      },
    });

    expect(out.request?.query_string).toBeUndefined();
    // url 은 보존 (리뷰어 정책: URL 자체는 디버깅 가치 유지, query는 구조 단위로 제거)
    expect(out.request?.url).toBe("https://example.com/api?token=plain-x");
  });
});

describe("beforeSend — user PII", () => {
  it("user.email / ip_address / username 은 삭제하고 id 는 보존한다", () => {
    const out = runBeforeSend({
      user: {
        id: "u-123",
        email: "alice@example.com",
        ip_address: "192.0.2.1",
        username: "alice",
        segment: "premium",
      },
    });

    expect(out.user?.id).toBe("u-123");
    expect(out.user?.email).toBeUndefined();
    expect(out.user?.ip_address).toBeUndefined();
    expect(out.user?.username).toBeUndefined();
    // 비-PII 커스텀 필드는 보존
    expect((out.user as Record<string, unknown>).segment).toBe("premium");
  });
});

describe("beforeSend — breadcrumbs", () => {
  it("breadcrumb[].data 의 민감 필드를 재귀적으로 치환한다", () => {
    const out = runBeforeSend({
      breadcrumbs: [
        {
          category: "xhr",
          data: {
            url: "/api/login",
            method: "POST",
            body: { email: "alice@example.com", password: "plain-y" },
          },
        },
        {
          category: "fetch",
          data: {
            headers: { authorization: "Bearer plain-z" },
          },
        },
      ],
    });

    const first = out.breadcrumbs?.[0];
    expect(first?.data).toMatchObject({
      url: "/api/login",
      method: "POST",
      body: { email: "alice@example.com", password: "[Redacted]" },
    });

    const second = out.breadcrumbs?.[1];
    expect(second?.data).toMatchObject({
      headers: { authorization: "[Redacted]" },
    });
  });

  it("breadcrumb.data 가 없으면 그대로 보존한다", () => {
    const out = runBeforeSend({
      breadcrumbs: [
        { category: "navigation", message: "route change" },
      ],
    });

    expect(out.breadcrumbs?.[0]).toMatchObject({
      category: "navigation",
      message: "route change",
    });
  });
});

describe("beforeSend — 안전성", () => {
  it("순환 참조를 안전하게 처리한다 (depth limit → [Redacted])", () => {
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;

    expect(() => runBeforeSend({ extra: { cyclic } })).not.toThrow();
  });

  it("원본 event 를 mutate 하지 않는다 (immutability)", () => {
    const original: ErrorEvent = {
      type: undefined,
      extra: { password: "plain-11" },
      user: { id: "u-1", email: "a@b.com" },
      breadcrumbs: [{ data: { token: "plain-12" } }],
    };
    const snapshot = JSON.stringify(original);

    beforeSend(original, emptyHint);

    expect(JSON.stringify(original)).toBe(snapshot);
    expect((original.extra as Record<string, unknown>).password).toBe(
      "plain-11",
    );
    expect(original.user?.email).toBe("a@b.com");
  });

  it("event 에 request/extra/contexts/user/breadcrumbs 가 없을 때도 오류 없이 반환한다", () => {
    const out = runBeforeSend({
      message: "단순 로그",
      level: "info",
    });

    expect(out.message).toBe("단순 로그");
    expect(out.level).toBe("info");
  });
});
