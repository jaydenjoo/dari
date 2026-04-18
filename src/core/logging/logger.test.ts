import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { createRequestLogger } from "./context";
import { createTestLogger, logger, type Logger } from "./logger";

describe("logger (base instance)", () => {
  it("표준 pino 로그 레벨 메서드들이 존재한다", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.fatal).toBe("function");
    expect(typeof logger.trace).toBe("function");
  });

  it("base fields 로 service='dari' + env 가 바인딩된다", () => {
    const bindings = logger.bindings();
    expect(bindings.service).toBe("dari");
    expect(typeof bindings.env).toBe("string");
  });
});

describe("createRequestLogger", () => {
  it("모든 ctx 필드를 child logger 에 바인딩한다", () => {
    const child = createRequestLogger({
      requestId: "req-123",
      botId: "chatsio-support",
      userId: "user-42",
    });

    const bindings = child.bindings();
    expect(bindings.requestId).toBe("req-123");
    expect(bindings.botId).toBe("chatsio-support");
    expect(bindings.userId).toBe("user-42");
  });

  it("optional 필드는 생략 시 바인딩에서 제외된다", () => {
    const child = createRequestLogger({ requestId: "req-456" });
    const bindings = child.bindings();

    expect(bindings.requestId).toBe("req-456");
    expect("botId" in bindings).toBe(false);
    expect("userId" in bindings).toBe(false);
  });
});

describe("redact (민감 필드 자동 제거)", () => {
  function captureLogOutput(fn: (log: Logger) => void): string {
    const chunks: string[] = [];
    const sink = {
      write(chunk: string): void {
        chunks.push(chunk);
      },
    };
    const testLogger = createTestLogger(sink);
    fn(testLogger);
    return chunks.join("");
  }

  it("최상위 / 1-depth 중첩 / HTTP 헤더의 민감 필드를 모두 [Redacted] 로 치환한다", () => {
    const output = captureLogOutput((log) =>
      log.info(
        {
          username: "alice",
          password: "plain-1",
          token: "plain-2",
          accessToken: "plain-3",
          refreshToken: "plain-4",
          secret: "plain-5",
          serviceRoleKey: "plain-6",
          headers: {
            authorization: "plain-7",
            cookie: "plain-8",
            "x-api-key": "plain-9",
            "x-auth-token": "plain-10",
          },
          user: {
            name: "alice",
            password: "plain-11",
            accessToken: "plain-12",
          },
        },
        "로그인 시도",
      ),
    );

    const parsed = JSON.parse(output);

    // 안전 필드는 원래 값 유지
    expect(parsed.username).toBe("alice");
    expect(parsed.user.name).toBe("alice");
    expect(parsed.msg).toBe("로그인 시도");

    // 최상위 민감 필드
    expect(parsed.password).toBe("[Redacted]");
    expect(parsed.token).toBe("[Redacted]");
    expect(parsed.accessToken).toBe("[Redacted]");
    expect(parsed.refreshToken).toBe("[Redacted]");
    expect(parsed.secret).toBe("[Redacted]");
    expect(parsed.serviceRoleKey).toBe("[Redacted]");

    // HTTP 헤더
    expect(parsed.headers.authorization).toBe("[Redacted]");
    expect(parsed.headers.cookie).toBe("[Redacted]");
    expect(parsed.headers["x-api-key"]).toBe("[Redacted]");
    expect(parsed.headers["x-auth-token"]).toBe("[Redacted]");

    // 1-depth 중첩
    expect(parsed.user.password).toBe("[Redacted]");
    expect(parsed.user.accessToken).toBe("[Redacted]");

    // 원본 민감값은 출력 문자열 어디에도 존재하지 않는다
    for (let i = 1; i <= 12; i++) {
      expect(output).not.toContain(`plain-${i}`);
    }
  });

  it("이름이 비슷한 필드(`passwordHint`, `tokenCount`)는 redact 되지 않는다 (완전 일치)", () => {
    const output = captureLogOutput((log) =>
      log.info(
        {
          passwordHint: "첫 반려동물 이름",
          tokenCount: 42,
          apiKeyPrefix: "sk-xxx",
        },
        "이름 유사 필드",
      ),
    );

    const parsed = JSON.parse(output);
    expect(parsed.passwordHint).toBe("첫 반려동물 이름");
    expect(parsed.tokenCount).toBe(42);
    expect(parsed.apiKeyPrefix).toBe("sk-xxx");
  });

  it("LOG_LEVEL 에 잘못된 값이 들어와도 logger 생성이 실패하지 않는다", () => {
    // 간접 검증: 이미 이 테스트가 실행된다는 것 자체가 logger import 시 throw 없었음을 의미.
    // 추가로, base logger 의 level 이 유효한 pino level 이어야 함.
    const validLevels = [
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
      "silent",
    ];
    expect(validLevels).toContain(logger.level);
  });
});

describe("Sentry bridge (error/fatal 자동 캡처)", () => {
  // Sentry.captureException 의 2번째 인자는 union type (Scope | Partial<ScopeContext>).
  // 테스트에서는 logger.ts 가 항상 객체 리터럴 로 전달함을 알고 있으므로 그 형태로 캐스팅.
  type CapturedContext = { level?: string; extra?: Record<string, unknown> };

  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("logger.error 호출 시 Sentry.captureException 이 error 레벨로 호출된다", () => {
    const boom = new Error("something exploded");
    logger.error({ err: boom, botId: "b1" }, "bot failed");

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [capturedErr, options] = vi.mocked(Sentry.captureException).mock
      .calls[0];
    expect(capturedErr).toBeInstanceOf(Error);
    expect((capturedErr as Error).message).toBe("something exploded");
    const ctx = options as CapturedContext;
    expect(ctx.level).toBe("error");
    // 비민감 필드는 extra 로 전달되어 디버깅에 활용
    expect(ctx.extra).toMatchObject({ botId: "b1", msg: "bot failed" });
  });

  it("logger.fatal 호출 시 Sentry.captureException 이 fatal 레벨로 호출된다", () => {
    logger.fatal({ err: new Error("process dying") }, "crash");

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(Sentry.captureException).mock.calls[0];
    const ctx = options as CapturedContext;
    expect(ctx.level).toBe("fatal");
  });

  it("logger.info / logger.warn / logger.debug 호출 시 Sentry 는 호출되지 않는다", () => {
    logger.info({ botId: "b1" }, "regular info");
    logger.warn({ botId: "b1" }, "a warning");
    logger.debug({ botId: "b1" }, "verbose detail");

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("err 필드 없이 logger.error 호출해도 msg 로 Error 를 복원하여 캡처한다", () => {
    logger.error("string-only error message");

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [capturedErr] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(capturedErr).toBeInstanceOf(Error);
    expect((capturedErr as Error).message).toBe("string-only error message");
  });

  it("2-depth 이상 중첩 민감 필드가 Sentry extra 로 가기 전에 [Redacted] 로 치환된다", () => {
    // pino redact 는 1-depth 까지만 경로 매칭 → 2-depth 이상은 bridge 의
    // redactDeep 이 차단해야 한다 (ADR-006 단일 출처 일관성).
    logger.error(
      {
        err: new Error("deep leak attempt"),
        user: { profile: { password: "should-not-leak" } },
      },
      "nested sensitive",
    );

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(Sentry.captureException).mock.calls[0];
    const ctx = options as CapturedContext;
    const user = ctx.extra?.user as { profile: { password: string } };
    expect(user.profile.password).toBe("[Redacted]");
    // 원본 민감값이 Sentry 페이로드 어디에도 직렬화되지 않음
    expect(JSON.stringify(ctx.extra)).not.toContain("should-not-leak");
  });

  it("bridge 내부에서 예외가 나도 앱을 깨지 않고 silent 로 처리된다", () => {
    const parseSpy = vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
      throw new Error("forced parse failure");
    });

    expect(() =>
      logger.error({ err: new Error("boom") }, "during parse failure"),
    ).not.toThrow();

    // parse 가 실패하면 bridge 는 silent → Sentry.captureException 미호출
    expect(Sentry.captureException).not.toHaveBeenCalled();

    parseSpy.mockRestore();
  });
});
