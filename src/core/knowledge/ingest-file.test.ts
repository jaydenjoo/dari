import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY ??= "sk-fake-anthropic-test-placeholder";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fake-supabase-service-role-test-key";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= "fake-google-genai-test-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fake-supabase-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    "fake-supabase-anon-test-placeholder";
  process.env.UPSTASH_REDIS_REST_URL ??= "https://fake-upstash-test.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN ??= "fake-upstash-token";
  process.env.FIRECRAWL_API_KEY ??= "fc-test-placeholder-do-not-call";
});

const { mockExtract, mockEmbedBatch, mockUpload, mockRemove } = vi.hoisted(
  () => ({
    mockExtract: vi.fn(),
    mockEmbedBatch: vi.fn(),
    mockUpload: vi.fn(),
    mockRemove: vi.fn(),
  }),
);

vi.mock("./file-extract", async () => {
  const actual =
    await vi.importActual<typeof import("./file-extract")>("./file-extract");
  return {
    ...actual,
    extractTextFromFile: mockExtract,
  };
});

vi.mock("./embedding", () => ({
  embedBatch: mockEmbedBatch,
}));

vi.mock("./storage", async () => {
  const actual = await vi.importActual<typeof import("./storage")>("./storage");
  return {
    ...actual,
    uploadKnowledgeFile: mockUpload,
    removeKnowledgeFile: mockRemove,
  };
});

import { ingestFileKnowledge } from "./ingest-file";

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

function makeSupabaseMock(spec: {
  data?: number | null;
  error?: { message: string } | null;
  rpcThrows?: Error;
}) {
  const rpcCalls: RpcCall[] = [];
  const rpc = vi.fn((fn: string, args: unknown) => {
    rpcCalls.push({ fn, args: args as RpcCall["args"] });
    if (spec.rpcThrows) return Promise.reject(spec.rpcThrows);
    return Promise.resolve({
      data: spec.data ?? null,
      error: spec.error ?? null,
    });
  });
  const client = { rpc } as unknown as Parameters<
    typeof ingestFileKnowledge
  >[0];
  return { client, rpcCalls };
}

describe("ingestFileKnowledge", () => {
  beforeEach(() => {
    mockExtract.mockReset();
    mockEmbedBatch.mockReset();
    mockUpload.mockReset();
    mockRemove.mockReset();
  });

  it("PDF 정상: extract → chunk → embed → Storage → RPC(pdf, file:{name}) → chunkCount", async () => {
    mockExtract.mockResolvedValueOnce({
      text: "짧은 PDF 본문.",
      sanitizedFilename: "report.pdf",
      ext: "pdf",
      bytes: 2048,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding(0)]);
    mockUpload.mockResolvedValueOnce({
      path: "bot-1/uuid-x.pdf",
      storagePath: "bot-1/uuid-x.pdf",
      contentType: "application/pdf",
    });
    const { client, rpcCalls } = makeSupabaseMock({ data: 1 });

    const out = await ingestFileKnowledge(client, "bot-1", {
      buffer: Buffer.from("%PDF-1.5"),
      filename: "report.pdf",
    });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload.mock.calls[0][1].contentType).toBe("application/pdf");

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("replace_knowledge_chunks_for_source");
    expect(rpcCalls[0].args).toMatchObject({
      p_bot_id: "bot-1",
      p_source_type: "pdf",
      p_source_identifier: "file:report.pdf",
    });
    expect(rpcCalls[0].args.p_chunks).toHaveLength(1);

    expect(out).toMatchObject({
      chunkCount: 1,
      sanitizedFilename: "report.pdf",
      ext: "pdf",
      bytes: 2048,
    });
    expect(out.storagePath).toMatch(/^bot-1\/[0-9a-f-]+\.pdf$/);
  });

  it("TXT → source_type='markdown' (0008 manual 전용과 분리)", async () => {
    mockExtract.mockResolvedValueOnce({
      text: "plain text body",
      sanitizedFilename: "note.txt",
      ext: "txt",
      bytes: 15,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockUpload.mockResolvedValueOnce({});
    const { client, rpcCalls } = makeSupabaseMock({ data: 1 });

    await ingestFileKnowledge(client, "bot-1", {
      buffer: Buffer.from("plain text body"),
      filename: "note.txt",
    });

    expect(rpcCalls[0].args.p_source_type).toBe("markdown");
    expect(rpcCalls[0].args.p_source_identifier).toBe("file:note.txt");
  });

  it("MD → source_type='markdown'", async () => {
    mockExtract.mockResolvedValueOnce({
      text: "# Heading\n\nbody",
      sanitizedFilename: "README.md",
      ext: "md",
      bytes: 20,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockUpload.mockResolvedValueOnce({});
    const { client, rpcCalls } = makeSupabaseMock({ data: 1 });

    await ingestFileKnowledge(client, "bot-1", {
      buffer: Buffer.from("# Heading\n\nbody"),
      filename: "README.md",
    });

    expect(rpcCalls[0].args.p_source_type).toBe("markdown");
    expect(rpcCalls[0].args.p_source_identifier).toBe("file:README.md");
  });

  it("Trojan Source + NULL byte 포함 본문 → sanitize 후 청크 저장", async () => {
    mockExtract.mockResolvedValueOnce({
      text: "정\u0000상\u202E뒤집힘\uFEFF끝",
      sanitizedFilename: "trick.txt",
      ext: "txt",
      bytes: 30,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockUpload.mockResolvedValueOnce({});
    const { client, rpcCalls } = makeSupabaseMock({ data: 1 });

    await ingestFileKnowledge(client, "bot-1", {
      buffer: Buffer.from("any"),
      filename: "trick.txt",
    });

    const chunks = rpcCalls[0].args.p_chunks as Array<{ content: string }>;
    expect(chunks[0].content).toBe("정상뒤집힘끝");
  });

  it("본문이 sanitize 후 빈 문자열 → payload=[] + chunkCount=0 (소스 제거 의도)", async () => {
    mockExtract.mockResolvedValueOnce({
      text: "\u0000\u202E\uFEFF",
      sanitizedFilename: "empty.txt",
      ext: "txt",
      bytes: 10,
    });
    mockUpload.mockResolvedValueOnce({});
    const { client, rpcCalls } = makeSupabaseMock({ data: 0 });

    const out = await ingestFileKnowledge(client, "bot-1", {
      buffer: Buffer.from("x"),
      filename: "empty.txt",
    });

    expect(mockEmbedBatch).not.toHaveBeenCalled();
    expect(rpcCalls[0].args.p_chunks).toEqual([]);
    expect(out.chunkCount).toBe(0);
  });

  it("extract throw '파일 처리 실패' → 그대로 전파, upload/rpc 미호출", async () => {
    mockExtract.mockRejectedValueOnce(new Error("파일 처리 실패"));
    const { client, rpcCalls } = makeSupabaseMock({ data: 0 });

    await expect(
      ingestFileKnowledge(client, "bot-1", {
        buffer: Buffer.from("x"),
        filename: "x.pdf",
      }),
    ).rejects.toThrow(/^파일 처리 실패$/);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(rpcCalls).toHaveLength(0);
  });

  it("Storage upload 실패 → throw '파일 업로드 실패' + RPC 미호출", async () => {
    mockExtract.mockResolvedValueOnce({
      text: "ok",
      sanitizedFilename: "r.pdf",
      ext: "pdf",
      bytes: 100,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockUpload.mockRejectedValueOnce(new Error("파일 업로드 실패"));
    const { client, rpcCalls } = makeSupabaseMock({ data: 0 });

    await expect(
      ingestFileKnowledge(client, "bot-1", {
        buffer: Buffer.from("%PDF-1.5"),
        filename: "r.pdf",
      }),
    ).rejects.toThrow(/^파일 업로드 실패$/);

    expect(rpcCalls).toHaveLength(0);
  });

  it("RPC {error} → Storage 롤백 + throw 'knowledge RPC failed' (Postgres 상세 비노출)", async () => {
    mockExtract.mockResolvedValueOnce({
      text: "ok",
      sanitizedFilename: "r.pdf",
      ext: "pdf",
      bytes: 100,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockUpload.mockResolvedValueOnce({});
    mockRemove.mockResolvedValueOnce({ removed: true });
    const { client } = makeSupabaseMock({
      error: { message: "new row violates row-level security policy" },
    });

    await expect(
      ingestFileKnowledge(client, "bot-1", {
        buffer: Buffer.from("%PDF-1.5"),
        filename: "r.pdf",
      }),
    ).rejects.toThrow(/^knowledge RPC failed$/);

    // Storage 롤백 호출됨
    expect(mockRemove).toHaveBeenCalled();
  });

  it("RPC throw (네트워크 단절) → Storage 롤백 + throw 'knowledge RPC failed'", async () => {
    mockExtract.mockResolvedValueOnce({
      text: "ok",
      sanitizedFilename: "r.pdf",
      ext: "pdf",
      bytes: 100,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockUpload.mockResolvedValueOnce({});
    mockRemove.mockResolvedValueOnce({ removed: true });
    const { client } = makeSupabaseMock({
      rpcThrows: new Error("fetch failed"),
    });

    await expect(
      ingestFileKnowledge(client, "bot-1", {
        buffer: Buffer.from("%PDF-1.5"),
        filename: "r.pdf",
      }),
    ).rejects.toThrow(/^knowledge RPC failed$/);

    expect(mockRemove).toHaveBeenCalled();
  });

  it("embedding count mismatch → throw 'knowledge embedding failed' (내부 수치 비노출)", async () => {
    mockExtract.mockResolvedValueOnce({
      text: "가".repeat(800), // 2 청크
      sanitizedFilename: "big.txt",
      ext: "txt",
      bytes: 2400,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]); // 1개만
    const { client, rpcCalls } = makeSupabaseMock({ data: 0 });

    await expect(
      ingestFileKnowledge(client, "bot-1", {
        buffer: Buffer.from("x"),
        filename: "big.txt",
      }),
    ).rejects.toThrow(/^knowledge embedding failed$/);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(rpcCalls).toHaveLength(0);
  });

  it("같은 파일명 재업로드 → source_identifier 동일 → RPC 가 자동 교체", async () => {
    // 1차
    mockExtract.mockResolvedValueOnce({
      text: "v1",
      sanitizedFilename: "same.pdf",
      ext: "pdf",
      bytes: 100,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockUpload.mockResolvedValueOnce({});
    const { client: c1, rpcCalls: calls1 } = makeSupabaseMock({ data: 1 });

    await ingestFileKnowledge(c1, "bot-1", {
      buffer: Buffer.from("%PDF-1.5"),
      filename: "same.pdf",
    });

    // 2차 — 같은 파일명, 다른 내용
    mockExtract.mockResolvedValueOnce({
      text: "v2 updated content",
      sanitizedFilename: "same.pdf",
      ext: "pdf",
      bytes: 200,
    });
    mockEmbedBatch.mockResolvedValueOnce([makeEmbedding()]);
    mockUpload.mockResolvedValueOnce({});
    const { client: c2, rpcCalls: calls2 } = makeSupabaseMock({ data: 1 });

    await ingestFileKnowledge(c2, "bot-1", {
      buffer: Buffer.from("%PDF-1.5\nv2"),
      filename: "same.pdf",
    });

    // 둘 다 같은 source_identifier → DB 에서 자동 교체
    expect(calls1[0].args.p_source_identifier).toBe("file:same.pdf");
    expect(calls2[0].args.p_source_identifier).toBe("file:same.pdf");
  });
});
