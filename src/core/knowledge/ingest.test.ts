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
});

// vi.mock factory 는 import 구문보다 먼저 hoist 되므로 outer 변수 참조 시 TDZ.
// mock 함수는 vi.hoisted 로 함께 올려야 factory 안에서 안전하게 참조 가능.
const { mockEmbedBatch } = vi.hoisted(() => ({
  mockEmbedBatch: vi.fn(),
}));

vi.mock("./embedding", () => ({
  embedBatch: mockEmbedBatch,
}));

import { ingestTextKnowledge } from "./ingest";

function makeEmbedding(seed = 0): number[] {
  return Array.from({ length: 768 }, (_, i) => (i + seed) / 1000);
}

type RpcCall = {
  fn: string;
  args: { p_bot_id: string; p_chunks: Array<Record<string, unknown>> };
};

function makeSupabaseMock(rpcResult: {
  data?: number | null;
  error?: { message: string } | null;
}) {
  const rpcCalls: RpcCall[] = [];
  const rpc = vi.fn((fn: string, args: unknown) => {
    rpcCalls.push({ fn, args: args as RpcCall["args"] });
    return Promise.resolve({
      data: rpcResult.data ?? null,
      error: rpcResult.error ?? null,
    });
  });

  // 실제 SupabaseClient 의 복잡한 타입을 우회. ingest 는 .rpc 만 사용.
  const client = { rpc } as unknown as Parameters<
    typeof ingestTextKnowledge
  >[0];
  return { client, rpcCalls, rpc };
}

describe("ingestTextKnowledge", () => {
  beforeEach(() => {
    mockEmbedBatch.mockReset();
  });

  it("빈 content → chunks 없음 → RPC 에 [] 전달 → chunkCount=0", async () => {
    const { client, rpcCalls } = makeSupabaseMock({ data: 0 });
    const result = await ingestTextKnowledge(client, "bot-uuid", "   \n\t  ");

    expect(mockEmbedBatch).not.toHaveBeenCalled();
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("replace_text_knowledge_chunks");
    expect(rpcCalls[0].args.p_bot_id).toBe("bot-uuid");
    expect(rpcCalls[0].args.p_chunks).toEqual([]);
    expect(result).toEqual({ chunkCount: 0 });
  });

  it("짧은 content → 1 청크 → embedBatch 1회 → RPC 에 1개 payload", async () => {
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding(0)]);
    const { client, rpcCalls } = makeSupabaseMock({ data: 1 });
    const content = "안녕하세요. 이것은 짧은 지식 텍스트입니다.";

    const result = await ingestTextKnowledge(client, "bot-uuid", content);

    expect(mockEmbedBatch).toHaveBeenCalledWith([content]);
    expect(rpcCalls[0].args.p_chunks).toHaveLength(1);
    expect(rpcCalls[0].args.p_chunks[0]).toMatchObject({
      content,
      chunk_index: 0,
    });
    expect(
      (rpcCalls[0].args.p_chunks[0] as { embedding: number[] }).embedding,
    ).toHaveLength(768);
    expect(result).toEqual({ chunkCount: 1 });
  });

  it("1200자 → 3 청크 → 각 embedding 이 올바른 index 와 매칭", async () => {
    mockEmbedBatch.mockImplementationOnce(async (texts: string[]) =>
      texts.map((_, i) => makeEmbedding(i)),
    );
    const { client, rpcCalls } = makeSupabaseMock({ data: 3 });
    const content = "가".repeat(1200);

    const result = await ingestTextKnowledge(client, "bot-uuid", content);

    expect(rpcCalls[0].args.p_chunks).toHaveLength(3);
    const chunks = rpcCalls[0].args.p_chunks as Array<{
      chunk_index: number;
      embedding: number[];
    }>;
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1, 2]);
    expect(chunks[0].embedding[0]).toBeCloseTo(0);
    expect(chunks[1].embedding[0]).toBeCloseTo(0.001);
    expect(chunks[2].embedding[0]).toBeCloseTo(0.002);
    expect(result).toEqual({ chunkCount: 3 });
  });

  it("RPC 에러 → throw + 내부 Postgres 메시지 비노출 (sec H-1)", async () => {
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    const { client } = makeSupabaseMock({
      error: { message: "new row violates row-level security policy" },
    });

    // throw 메시지는 static identifier 만 — Postgres 내부 상세(정책명/테이블명)는
    // logger 에만 기록되어 상위 catch 가 일반화 응답으로 바꿀 여지를 준다.
    await expect(
      ingestTextKnowledge(client, "bot-uuid", "some content here"),
    ).rejects.toThrow(/^knowledge RPC failed$/);
    // 원본 DB 메시지는 throw 에 포함되지 않음
    await expect(
      ingestTextKnowledge(client, "bot-uuid", "some content here"),
    ).rejects.not.toThrow(/row-level security/);
  });

  it("embedBatch 에러 → throw 전파 + RPC 미호출", async () => {
    mockEmbedBatch.mockRejectedValueOnce(new Error("Gemini API 429"));
    const { client, rpcCalls } = makeSupabaseMock({ data: 0 });

    await expect(
      ingestTextKnowledge(client, "bot-uuid", "content"),
    ).rejects.toThrow(/Gemini API 429/);
    expect(rpcCalls).toHaveLength(0);
  });

  it("embedding 개수 불일치 → throw (방어적 검증)", async () => {
    // chunkText 결과가 2 개인 입력인데 embedBatch 가 1 개만 반환한 경우
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    const { client } = makeSupabaseMock({ data: 0 });
    const content = "가".repeat(800); // 2 청크 (500+300 뒷청크)

    await expect(
      ingestTextKnowledge(client, "bot-uuid", content),
    ).rejects.toThrow(/embedding count mismatch/);
  });
});
