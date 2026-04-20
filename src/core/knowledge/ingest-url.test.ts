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

const { mockFetch, mockEmbedBatch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockEmbedBatch: vi.fn(),
}));

vi.mock("./url-fetch", () => ({
  fetchUrlAsMarkdown: mockFetch,
  // ingest-url.ts 가 로깅 용도로 import — 테스트에서는 identity 로 충분.
  sanitizeUrlForLog: (u: string) => u,
}));

vi.mock("./embedding", () => ({
  embedBatch: mockEmbedBatch,
}));

import { ingestUrlKnowledge } from "./ingest-url";

function makeEmbedding(seed = 0): number[] {
  return Array.from({ length: 768 }, (_, i) => (i + seed) / 1000);
}

type RpcCall = {
  fn: string;
  args: {
    p_bot_id: string;
    p_source_type: string;
    p_source_identifier: string;
    p_chunks: Array<Record<string, unknown>>;
  };
};

function makeSupabaseMock(rpcResult: {
  data?: number | null;
  error?: { message: string } | null;
  rpcThrows?: Error;
}) {
  const rpcCalls: RpcCall[] = [];
  const rpc = vi.fn((fn: string, args: unknown) => {
    rpcCalls.push({ fn, args: args as RpcCall["args"] });
    if (rpcResult.rpcThrows) return Promise.reject(rpcResult.rpcThrows);
    return Promise.resolve({
      data: rpcResult.data ?? null,
      error: rpcResult.error ?? null,
    });
  });

  const client = { rpc } as unknown as Parameters<typeof ingestUrlKnowledge>[0];
  return { client, rpcCalls, rpc };
}

describe("ingestUrlKnowledge", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockEmbedBatch.mockReset();
  });

  it("정상 흐름: fetch → chunk → embed → RPC (url) → chunkCount", async () => {
    mockFetch.mockResolvedValueOnce({
      markdown: "짧은 지식 텍스트.",
      sourceUrl: "https://example.com/final",
      truncated: false,
      originalBytes: 22,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding(0)]);
    const { client, rpcCalls } = makeSupabaseMock({ data: 1 });

    const result = await ingestUrlKnowledge(
      client,
      "bot-uuid",
      "https://example.com",
    );

    expect(mockFetch).toHaveBeenCalledWith("https://example.com");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("replace_knowledge_chunks_for_source");
    expect(rpcCalls[0].args).toMatchObject({
      p_bot_id: "bot-uuid",
      p_source_type: "url",
      p_source_identifier: "https://example.com",
    });
    expect(rpcCalls[0].args.p_chunks).toHaveLength(1);
    expect(result).toEqual({
      chunkCount: 1,
      truncated: false,
      resolvedUrl: "https://example.com/final",
    });
  });

  it("source_identifier = 입력 URL (Firecrawl sourceUrl 이 아님) — idempotent UX 보장", async () => {
    mockFetch.mockResolvedValueOnce({
      markdown: "content",
      sourceUrl: "https://example.com/redirected/canonical",
      truncated: false,
      originalBytes: 7,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    const { client, rpcCalls } = makeSupabaseMock({ data: 1 });

    await ingestUrlKnowledge(client, "bot-uuid", "https://example.com/a");

    expect(rpcCalls[0].args.p_source_identifier).toBe("https://example.com/a");
  });

  it("Trojan Source + NULL byte 포함 markdown → sanitize 후 청크 저장", async () => {
    mockFetch.mockResolvedValueOnce({
      markdown: "정\u0000상\u202E뒤집힘\uFEFF끝",
      sourceUrl: "https://example.com",
      truncated: false,
      originalBytes: 20,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    const { client, rpcCalls } = makeSupabaseMock({ data: 1 });

    await ingestUrlKnowledge(client, "bot-uuid", "https://example.com");

    const chunks = rpcCalls[0].args.p_chunks as Array<{ content: string }>;
    expect(chunks[0].content).toBe("정상뒤집힘끝");
  });

  it("markdown 이 sanitize 후 빈 문자열 → RPC payload=[] + chunkCount=0 (소스 제거)", async () => {
    // NULL/Trojan 만으로 구성된 입력
    mockFetch.mockResolvedValueOnce({
      markdown: "\u0000\u202E\uFEFF",
      sourceUrl: "https://example.com",
      truncated: false,
      originalBytes: 3,
    });
    const { client, rpcCalls } = makeSupabaseMock({ data: 0 });

    const result = await ingestUrlKnowledge(
      client,
      "bot-uuid",
      "https://example.com",
    );

    expect(mockEmbedBatch).not.toHaveBeenCalled();
    expect(rpcCalls[0].args.p_chunks).toEqual([]);
    expect(result.chunkCount).toBe(0);
  });

  it("200KB+ truncated 전파", async () => {
    mockFetch.mockResolvedValueOnce({
      markdown: "x".repeat(500),
      sourceUrl: "https://example.com",
      truncated: true,
      originalBytes: 300_000,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    const { client } = makeSupabaseMock({ data: 1 });

    const result = await ingestUrlKnowledge(
      client,
      "bot-uuid",
      "https://example.com",
    );

    expect(result.truncated).toBe(true);
  });

  it("url-fetch throw 'URL 처리 실패' → 그대로 전파", async () => {
    mockFetch.mockRejectedValueOnce(new Error("URL 처리 실패"));
    const { client, rpcCalls } = makeSupabaseMock({ data: 0 });

    await expect(
      ingestUrlKnowledge(client, "bot-uuid", "https://example.com"),
    ).rejects.toThrow(/^URL 처리 실패$/);
    expect(rpcCalls).toHaveLength(0);
    expect(mockEmbedBatch).not.toHaveBeenCalled();
  });

  it("RPC {error} → throw 'knowledge RPC failed' + Postgres 내부 메시지 비노출 (sec 패턴)", async () => {
    mockFetch.mockResolvedValueOnce({
      markdown: "content",
      sourceUrl: "https://example.com",
      truncated: false,
      originalBytes: 7,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    const { client } = makeSupabaseMock({
      error: { message: "new row violates row-level security policy" },
    });

    await expect(
      ingestUrlKnowledge(client, "bot-uuid", "https://example.com"),
    ).rejects.toThrow(/^knowledge RPC failed$/);

    // 원본 DB 메시지가 throw 에 포함되지 않음
    mockFetch.mockResolvedValueOnce({
      markdown: "content",
      sourceUrl: "https://example.com",
      truncated: false,
      originalBytes: 7,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    await expect(
      ingestUrlKnowledge(client, "bot-uuid", "https://example.com"),
    ).rejects.not.toThrow(/row-level security/);
  });

  it("RPC throw (네트워크 단절) → static 메시지로 재포장 (supabase-js 안전 계약)", async () => {
    mockFetch.mockResolvedValueOnce({
      markdown: "content",
      sourceUrl: "https://example.com",
      truncated: false,
      originalBytes: 7,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    const { client } = makeSupabaseMock({
      rpcThrows: new Error("fetch failed"),
    });

    await expect(
      ingestUrlKnowledge(client, "bot-uuid", "https://example.com"),
    ).rejects.toThrow(/^knowledge RPC failed$/);
  });

  it("embedding count mismatch → 정적 throw 'knowledge embedding failed' + 내부 수치 비노출", async () => {
    mockFetch.mockResolvedValueOnce({
      markdown: "가".repeat(800), // 2 청크 (500+300)
      sourceUrl: "https://example.com",
      truncated: false,
      originalBytes: 2400,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]); // 1개만 반환
    const { client } = makeSupabaseMock({ data: 0 });

    await expect(
      ingestUrlKnowledge(client, "bot-uuid", "https://example.com"),
    ).rejects.toThrow(/^knowledge embedding failed$/);

    // 내부 수치(chunks=, embeddings=) 가 throw 메시지에 새지 않아야 함
    mockFetch.mockResolvedValueOnce({
      markdown: "가".repeat(800),
      sourceUrl: "https://example.com",
      truncated: false,
      originalBytes: 2400,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    await expect(
      ingestUrlKnowledge(client, "bot-uuid", "https://example.com"),
    ).rejects.not.toThrow(/chunks=|embeddings=/);
  });

  it("긴 문서: 1200자 → 3 청크 → embedding 3개 → RPC 에 3 payload", async () => {
    mockFetch.mockResolvedValueOnce({
      markdown: "가".repeat(1200),
      sourceUrl: "https://example.com",
      truncated: false,
      originalBytes: 3600,
    });
    mockEmbedBatch.mockImplementationOnce(async (texts: string[]) =>
      texts.map((_, i) => makeEmbedding(i)),
    );
    const { client, rpcCalls } = makeSupabaseMock({ data: 3 });

    const result = await ingestUrlKnowledge(
      client,
      "bot-uuid",
      "https://example.com",
    );

    expect(rpcCalls[0].args.p_chunks).toHaveLength(3);
    const chunks = rpcCalls[0].args.p_chunks as Array<{
      chunk_index: number;
    }>;
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1, 2]);
    expect(result.chunkCount).toBe(3);
  });
});
