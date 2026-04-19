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

// vi.hoisted 로 mock 을 import 위로 올려 factory 안에서 참조 가능하게.
const { mockEmbedBatch, mockRpc } = vi.hoisted(() => ({
  mockEmbedBatch: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("./embedding", () => ({
  embedBatch: mockEmbedBatch,
}));

vi.mock("@/core/db/client-admin", () => ({
  createAdminClient: () => ({ rpc: mockRpc }),
}));

import type { KnowledgeChunkMatch } from "@/core/db/types";

import {
  retrieveRelevantChunks,
  RETRIEVAL_MATCH_COUNT,
  RETRIEVAL_MIN_SCORE,
  RETRIEVAL_MAX_QUERY_LENGTH,
} from "./retrieval";

function makeEmbedding(seed = 0): number[] {
  return Array.from({ length: 768 }, (_, i) => (i + seed) / 1000);
}

function makeChunk(
  overrides: Partial<KnowledgeChunkMatch> = {},
): KnowledgeChunkMatch {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    content: "샘플 청크 내용",
    score: 0.9,
    source_type: "manual",
    source_identifier: "manual:inline",
    chunk_index: 0,
    metadata: {},
    ...overrides,
  };
}

describe("retrieveRelevantChunks", () => {
  beforeEach(() => {
    mockEmbedBatch.mockReset();
    mockRpc.mockReset();
  });

  it("정상 — 쿼리 embed → RPC 호출 → chunks 반환", async () => {
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding(1)]);
    const chunks = [
      makeChunk({ chunk_index: 0 }),
      makeChunk({ chunk_index: 1 }),
    ];
    mockRpc.mockResolvedValueOnce({ data: chunks, error: null });

    const result = await retrieveRelevantChunks("bot-uuid", "안녕 RAG");

    expect(mockEmbedBatch).toHaveBeenCalledWith(["안녕 RAG"]);
    expect(mockRpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      p_bot_id: "bot-uuid",
      p_query_embedding: expect.any(Array),
      p_match_count: RETRIEVAL_MATCH_COUNT,
      p_min_score: RETRIEVAL_MIN_SCORE,
    });
    expect(result).toEqual(chunks);
  });

  it("빈 문자열 쿼리 → 빈 배열, embedBatch/RPC 미호출", async () => {
    const result = await retrieveRelevantChunks("bot-uuid", "");
    expect(result).toEqual([]);
    expect(mockEmbedBatch).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("공백/탭/개행만 있는 쿼리 → 빈 배열 (trim 후 빈 문자열)", async () => {
    const result = await retrieveRelevantChunks("bot-uuid", "   \n\t  ");
    expect(result).toEqual([]);
    expect(mockEmbedBatch).not.toHaveBeenCalled();
  });

  it("쿼리 길이 초과 → 빈 배열, embedBatch 미호출 (DOS/비용 방어)", async () => {
    const longQuery = "가".repeat(RETRIEVAL_MAX_QUERY_LENGTH + 1);
    const result = await retrieveRelevantChunks("bot-uuid", longQuery);
    expect(result).toEqual([]);
    expect(mockEmbedBatch).not.toHaveBeenCalled();
  });

  it("embedBatch throw → 빈 배열 fallback, RPC 미호출 (chat 실패 전파 금지)", async () => {
    mockEmbedBatch.mockRejectedValueOnce(new Error("Gemini API 429"));

    const result = await retrieveRelevantChunks("bot-uuid", "질의");

    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("embedBatch 빈 결과 → 빈 배열 fallback", async () => {
    mockEmbedBatch.mockResolvedValueOnce([]);

    const result = await retrieveRelevantChunks("bot-uuid", "질의");

    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("RPC error → 빈 배열 fallback (내부 DB 메시지 throw 금지)", async () => {
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "function public.match_knowledge_chunks does not exist",
      },
    });

    const result = await retrieveRelevantChunks("bot-uuid", "질의");

    expect(result).toEqual([]);
  });

  it("RPC throw → 빈 배열 fallback (네트워크 단절·fetch 레이어 예외)", async () => {
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockRpc.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await retrieveRelevantChunks("bot-uuid", "질의");

    // throw 가 상위로 전파되면 chat 전체가 502 — 안전 계약 위반.
    // 반드시 빈 배열 fallback 으로 귀결되어야 한다.
    expect(result).toEqual([]);
  });

  it("RPC data null → 빈 배열", async () => {
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await retrieveRelevantChunks("bot-uuid", "질의");

    expect(result).toEqual([]);
  });
});
