import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
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
  process.env.FIRECRAWL_API_KEY ??= "fc-test-placeholder-do-not-call";
});

import { removeKnowledgeSource } from "./remove-source";

type RpcCall = {
  fn: string;
  args: Record<string, unknown>;
};

function makeMocks(opts: {
  rpcResp?: { data: unknown; error: unknown };
  rpcThrow?: Error;
  storageRemoveResp?: { error: unknown };
  storageRemoveThrow?: Error;
}): {
  client: Parameters<typeof removeKnowledgeSource>[0]["supabase"];
  rpcCalls: RpcCall[];
  rpcSpy: ReturnType<typeof vi.fn>;
  removeSpy: ReturnType<typeof vi.fn>;
} {
  const rpcCalls: RpcCall[] = [];
  const rpcSpy = vi.fn((fn: string, args: unknown) => {
    rpcCalls.push({ fn, args: args as Record<string, unknown> });
    if (opts.rpcThrow) return Promise.reject(opts.rpcThrow);
    return Promise.resolve({
      data: opts.rpcResp?.data ?? null,
      error: opts.rpcResp?.error ?? null,
    });
  });

  const removeSpy = vi.fn((_paths: string[]) => {
    if (opts.storageRemoveThrow) return Promise.reject(opts.storageRemoveThrow);
    return Promise.resolve({ error: opts.storageRemoveResp?.error ?? null });
  });

  const client = {
    rpc: rpcSpy,
    storage: {
      from: (_bucket: string) => ({
        remove: removeSpy,
      }),
    },
  } as unknown as Parameters<typeof removeKnowledgeSource>[0]["supabase"];

  return { client, rpcCalls, rpcSpy, removeSpy };
}

describe("removeKnowledgeSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("text 삭제 → DB source_type='manual' + identifier='manual:inline'", async () => {
    const { client, rpcCalls } = makeMocks({
      rpcResp: { data: 3, error: null },
    });
    const result = await removeKnowledgeSource({
      supabase: client,
      botId: "bot-uuid-1",
      sourceType: "text",
      identifier: "",
    });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("replace_knowledge_chunks_for_source");
    expect(rpcCalls[0].args).toEqual({
      p_bot_id: "bot-uuid-1",
      p_source_type: "manual",
      p_source_identifier: "manual:inline",
      p_chunks: [],
    });
    expect(result.removedChunks).toBe(3);
    expect(result.removedFiles).toBe(0);
    expect(result.failedFiles).toEqual([]);
  });

  it("URL 삭제 → DB source_type='url' + identifier=URL 원본", async () => {
    const { client, rpcCalls } = makeMocks({
      rpcResp: { data: 2, error: null },
    });
    const result = await removeKnowledgeSource({
      supabase: client,
      botId: "bot-uuid-1",
      sourceType: "url",
      identifier: "https://example.com/page",
    });
    expect(rpcCalls[0].args).toMatchObject({
      p_source_type: "url",
      p_source_identifier: "https://example.com/page",
    });
    expect(result.removedChunks).toBe(2);
  });

  it("PDF 파일 삭제 → DB 'pdf' + identifier='file:{name}' + Storage 제거", async () => {
    const { client, rpcCalls, removeSpy } = makeMocks({
      rpcResp: { data: 4, error: null },
      storageRemoveResp: { error: null },
    });
    const result = await removeKnowledgeSource({
      supabase: client,
      botId: "bot-uuid-1",
      sourceType: "file",
      identifier: "report.pdf",
      storagePaths: ["bot-uuid-1/uuid-abc.pdf"],
    });
    expect(rpcCalls[0].args).toMatchObject({
      p_source_type: "pdf",
      p_source_identifier: "file:report.pdf",
    });
    expect(removeSpy).toHaveBeenCalledWith(["bot-uuid-1/uuid-abc.pdf"]);
    expect(result.removedChunks).toBe(4);
    expect(result.removedFiles).toBe(1);
    expect(result.failedFiles).toEqual([]);
  });

  it("MD/TXT 파일 삭제 → DB source_type='markdown'", async () => {
    const { client, rpcCalls } = makeMocks({
      rpcResp: { data: 1, error: null },
      storageRemoveResp: { error: null },
    });
    await removeKnowledgeSource({
      supabase: client,
      botId: "bot-uuid-1",
      sourceType: "file",
      identifier: "notes.md",
      storagePaths: ["bot-uuid-1/uuid-xyz.md"],
    });
    expect(rpcCalls[0].args).toMatchObject({
      p_source_type: "markdown",
      p_source_identifier: "file:notes.md",
    });

    const { client: client2, rpcCalls: rpcCalls2 } = makeMocks({
      rpcResp: { data: 1, error: null },
      storageRemoveResp: { error: null },
    });
    await removeKnowledgeSource({
      supabase: client2,
      botId: "bot-uuid-1",
      sourceType: "file",
      identifier: "plain.txt",
      storagePaths: ["bot-uuid-1/u.txt"],
    });
    expect(rpcCalls2[0].args).toMatchObject({
      p_source_type: "markdown",
      p_source_identifier: "file:plain.txt",
    });
  });

  it("storagePaths 없음/빈배열 → Storage 제거 스킵 (chunks 만)", async () => {
    // undefined
    const { client: c1, removeSpy: rm1 } = makeMocks({
      rpcResp: { data: 1, error: null },
    });
    const r1 = await removeKnowledgeSource({
      supabase: c1,
      botId: "bot-uuid-1",
      sourceType: "file",
      identifier: "legacy.pdf",
    });
    expect(rm1).not.toHaveBeenCalled();
    expect(r1.removedFiles).toBe(0);

    // 빈 배열
    const { client: c2, removeSpy: rm2 } = makeMocks({
      rpcResp: { data: 1, error: null },
    });
    const r2 = await removeKnowledgeSource({
      supabase: c2,
      botId: "bot-uuid-1",
      sourceType: "file",
      identifier: "legacy.pdf",
      storagePaths: [],
    });
    expect(rm2).not.toHaveBeenCalled();
    expect(r2.removedFiles).toBe(0);
  });

  it("RPC error 시 정적 메시지 throw + 내부 상세 숨김", async () => {
    const { client } = makeMocks({
      rpcResp: { data: null, error: { message: "internal postgres detail" } },
    });
    await expect(
      removeKnowledgeSource({
        supabase: client,
        botId: "bot-uuid-1",
        sourceType: "text",
        identifier: "",
      }),
    ).rejects.toThrow("knowledge RPC failed");
  });

  it("RPC throw 경로(fetch 실패)도 정적 메시지로 재포장", async () => {
    const { client } = makeMocks({
      rpcThrow: new Error("fetch disconnected"),
    });
    await expect(
      removeKnowledgeSource({
        supabase: client,
        botId: "bot-uuid-1",
        sourceType: "url",
        identifier: "https://example.com",
      }),
    ).rejects.toThrow("knowledge RPC failed");
  });

  it("Storage remove 실패 → failedFiles 기록 (throw 안 함, best-effort)", async () => {
    const { client } = makeMocks({
      rpcResp: { data: 2, error: null },
      storageRemoveResp: { error: { message: "access denied" } },
    });
    const result = await removeKnowledgeSource({
      supabase: client,
      botId: "bot-uuid-1",
      sourceType: "file",
      identifier: "x.pdf",
      storagePaths: ["bot-uuid-1/p1.pdf"],
    });
    expect(result.removedChunks).toBe(2);
    expect(result.removedFiles).toBe(0);
    expect(result.failedFiles).toEqual(["bot-uuid-1/p1.pdf"]);
  });

  it("Storage remove throw 경로도 best-effort (failedFiles 기록)", async () => {
    const { client } = makeMocks({
      rpcResp: { data: 2, error: null },
      storageRemoveThrow: new Error("network timeout"),
    });
    const result = await removeKnowledgeSource({
      supabase: client,
      botId: "bot-uuid-1",
      sourceType: "file",
      identifier: "y.pdf",
      storagePaths: ["bot-uuid-1/p2.pdf"],
    });
    expect(result.removedFiles).toBe(0);
    expect(result.failedFiles).toEqual(["bot-uuid-1/p2.pdf"]);
  });

  it("여러 storagePaths 병렬 처리 — 일부 성공 + 일부 실패 분리 기록", async () => {
    const rpcSpy = vi.fn(() => Promise.resolve({ data: 3, error: null }));
    const removeSpy = vi
      .fn<(paths: string[]) => Promise<{ error: unknown }>>()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "fail" } });

    const client = {
      rpc: rpcSpy,
      storage: {
        from: () => ({ remove: removeSpy }),
      },
    } as unknown as Parameters<typeof removeKnowledgeSource>[0]["supabase"];

    const result = await removeKnowledgeSource({
      supabase: client,
      botId: "bot-uuid-1",
      sourceType: "file",
      identifier: "doc.pdf",
      storagePaths: ["bot-uuid-1/a.pdf", "bot-uuid-1/b.pdf"],
    });
    expect(result.removedFiles).toBe(1);
    expect(result.failedFiles).toEqual(["bot-uuid-1/b.pdf"]);
  });

  it("잘못된 sourceType → 정적 메시지 throw", async () => {
    const { client } = makeMocks({});
    await expect(
      removeKnowledgeSource({
        supabase: client,
        botId: "bot-uuid-1",
        sourceType: "invalid" as unknown as "text",
        identifier: "",
      }),
    ).rejects.toThrow("invalid source type");
  });

  it("url/file 에서 identifier 빈값 → 'invalid source identifier'", async () => {
    const { client } = makeMocks({});
    await expect(
      removeKnowledgeSource({
        supabase: client,
        botId: "bot-uuid-1",
        sourceType: "url",
        identifier: "",
      }),
    ).rejects.toThrow("invalid source identifier");
    await expect(
      removeKnowledgeSource({
        supabase: client,
        botId: "bot-uuid-1",
        sourceType: "file",
        identifier: "",
      }),
    ).rejects.toThrow("invalid source identifier");
  });
});
