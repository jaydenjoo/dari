import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  // env.server 가 부팅 시 fail-fast 로 읽는 필수 변수 placeholder.
  // 실제 Supabase/Anthropic 호출은 없지만 logger 가 env 를 통해 초기화됨.
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
});

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}));

vi.mock("@/core/logging", () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AUDIT_EVENTS } from "./types";
import { logAuditEvent } from "./log";

type InsertCall = { table: string; payload: Record<string, unknown> };

function makeSupabaseMock(insertResult: {
  error?: { code?: string; message: string } | null;
  throws?: Error;
}) {
  const insertCalls: InsertCall[] = [];
  const insert = vi.fn((payload: Record<string, unknown>) => {
    insertCalls.push({ table: "audit_logs", payload });
    if (insertResult.throws) {
      return Promise.reject(insertResult.throws);
    }
    return Promise.resolve({ error: insertResult.error ?? null });
  });
  const from = vi.fn((table: string) => {
    if (table !== "audit_logs") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return { insert };
  });

  // 실 SupabaseClient 타입 우회. logAuditEvent 는 .from("audit_logs").insert() 만 사용.
  const client = { from } as unknown as Parameters<typeof logAuditEvent>[0];
  return { client, insertCalls };
}

describe("logAuditEvent", () => {
  beforeEach(() => {
    mockLoggerError.mockReset();
  });

  it("정상 insert → ok:true + snake_case 컬럼 매핑", async () => {
    const { client, insertCalls } = makeSupabaseMock({});

    const result = await logAuditEvent(client, {
      eventType: AUDIT_EVENTS.BOT_CREATE,
      entityType: "bot",
      entityId: "bot-uuid-1",
      actorId: "user-uuid-1",
      metadata: { slug: "chatsio" },
    });

    expect(result).toEqual({ ok: true });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload).toEqual({
      event_type: "bot.create",
      entity_type: "bot",
      entity_id: "bot-uuid-1",
      actor_id: "user-uuid-1",
      metadata: { slug: "chatsio" },
    });
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("metadata 미제공 → 빈 객체 {} 로 치환되어 저장", async () => {
    const { client, insertCalls } = makeSupabaseMock({});

    const result = await logAuditEvent(client, {
      eventType: AUDIT_EVENTS.BOT_DELETE,
      entityType: "bot",
      entityId: "bot-uuid-2",
      actorId: "user-uuid-2",
    });

    expect(result).toEqual({ ok: true });
    expect(insertCalls[0].payload.metadata).toEqual({});
  });

  it("metadata 에 민감 필드(email) → redactDeep 마스킹 후 저장", async () => {
    const { client, insertCalls } = makeSupabaseMock({});

    await logAuditEvent(client, {
      eventType: AUDIT_EVENTS.CONVERSATION_EXPORT,
      entityType: "conversation",
      entityId: "conv-uuid",
      actorId: "user-uuid",
      metadata: {
        format: "csv",
        email: "visitor@example.com",
        nested: { phone: "010-1111-2222", visible: "ok" },
      },
    });

    const metadata = insertCalls[0].payload.metadata as Record<string, unknown>;
    expect(metadata.format).toBe("csv");
    expect(metadata.email).toBe("[Redacted]");
    const nested = metadata.nested as Record<string, unknown>;
    expect(nested.phone).toBe("[Redacted]");
    expect(nested.visible).toBe("ok");
  });

  it("DB error 반환 → ok:false + logger.error 호출 (throw 금지)", async () => {
    const { client } = makeSupabaseMock({
      error: { code: "42501", message: "permission denied" },
    });

    const result = await logAuditEvent(client, {
      eventType: AUDIT_EVENTS.BOT_UPDATE,
      entityType: "bot",
      entityId: "bot-uuid",
      actorId: "user-uuid",
    });

    expect(result).toEqual({ ok: false });
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const firstArg = mockLoggerError.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(firstArg.errCode).toBe("42501");
    expect(firstArg.errMsg).toBe("permission denied");
    expect(firstArg.eventType).toBe("bot.update");
    // 로그 키명 일관성 — 기존 프로젝트 패턴 `userId` 로 통일 (code review MEDIUM-2).
    expect(firstArg.userId).toBe("user-uuid");
    expect(mockLoggerError.mock.calls[0][1]).toBe("audit log insert 실패");
  });

  it("insert 예외 throw → catch → ok:false + logger.error", async () => {
    const { client } = makeSupabaseMock({
      throws: new Error("network timeout"),
    });

    const result = await logAuditEvent(client, {
      eventType: AUDIT_EVENTS.CONVERSATION_DELETE,
      entityType: "conversation",
      entityId: "conv-uuid",
      actorId: "user-uuid",
    });

    expect(result).toEqual({ ok: false });
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const firstArg = mockLoggerError.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(firstArg.err).toBeInstanceOf(Error);
    expect(mockLoggerError.mock.calls[0][1]).toBe("audit log insert 예외");
  });

  it("AUDIT_EVENTS 상수 값 — DB CHECK 패턴 `^[a-z_]+\\.[a-z_]+$` 일치", async () => {
    const pattern = /^[a-z_]+\.[a-z_]+$/;
    for (const value of Object.values(AUDIT_EVENTS)) {
      expect(value).toMatch(pattern);
    }
    // 회귀 방지 — 상수가 변경되면 DB CHECK 업데이트 필요.
    expect(Object.values(AUDIT_EVENTS).sort()).toEqual([
      "bot.create",
      "bot.delete",
      "bot.update",
      "conversation.delete",
      "conversation.export",
    ]);
  });

  it("metadata 순환참조 → MAX_DEPTH 초과해도 throw 없이 저장 (label 보존 + cycle 끊김)", async () => {
    const { client, insertCalls } = makeSupabaseMock({});
    const cycle: Record<string, unknown> = { label: "root" };
    cycle.self = cycle;

    const result = await logAuditEvent(client, {
      eventType: AUDIT_EVENTS.BOT_UPDATE,
      entityType: "bot",
      entityId: "bot-uuid",
      actorId: "user-uuid",
      metadata: cycle,
    });

    expect(result).toEqual({ ok: true });
    const metadata = insertCalls[0].payload.metadata as Record<string, unknown>;
    // 민감 필드 아닌 label 은 보존.
    expect(metadata.label).toBe("root");
    // self 는 MAX_DEPTH(10) 도달 시점에 [Redacted] 로 치환되어 순환이 끊어짐.
    // 깊이 10 이하 구간은 재귀된 객체로 유지됨 — JSON 직렬화 가능한 트리 형태.
    const snapshot = JSON.stringify(metadata);
    expect(snapshot).toContain("[Redacted]");
  });
});
