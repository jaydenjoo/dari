import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  // env.ts 는 import 즉시 parseEnv() 호출 → test 환경에 필수 env 주입.
  // 교훈: docs/learnings.md 2026-04-19 side-effect import 모듈 테스트 패턴.
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

// @google/generative-ai 의 class 를 모킹. `new GoogleGenerativeAI(apiKey)` 호출이
// constructor 로 동작해야 하므로 class 선언이 안전. `vi.hoisted` 로 mock 함수를 올려
// `vi.mock` factory 가 outer 변수 접근 시 발생하는 hoisting race 를 회피.
const { mockBatchEmbedContents } = vi.hoisted(() => ({
  mockBatchEmbedContents: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { batchEmbedContents: mockBatchEmbedContents };
    }
  },
}));

import { embedBatch } from "./embedding";

function makeEmbedding(seed = 0): number[] {
  return Array.from({ length: 768 }, (_, i) => (i + seed) / 1000);
}

describe("embedBatch", () => {
  beforeEach(() => {
    mockBatchEmbedContents.mockReset();
  });

  it("빈 배열 입력 → throw (호출자 책임)", async () => {
    await expect(embedBatch([])).rejects.toThrow(/texts is empty/);
  });

  it("빈 문자열 포함 → throw (호출자 책임)", async () => {
    await expect(embedBatch(["valid", ""])).rejects.toThrow(
      /empty string in texts/,
    );
  });

  it("정상 3개 → 단일 배치 호출 + 768차원 배열 반환", async () => {
    mockBatchEmbedContents.mockResolvedValueOnce({
      embeddings: [
        { values: makeEmbedding(0) },
        { values: makeEmbedding(1) },
        { values: makeEmbedding(2) },
      ],
    });

    const result = await embedBatch(["a", "b", "c"]);
    expect(mockBatchEmbedContents).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(768);
    expect(result[0][0]).toBeCloseTo(0);
    expect(result[1][0]).toBeCloseTo(0.001);
  });

  it("101개 입력 → 100 + 1 두 번 호출 (배치 분할)", async () => {
    const inputs = Array.from({ length: 101 }, (_, i) => `text-${i}`);
    mockBatchEmbedContents
      .mockResolvedValueOnce({
        embeddings: Array.from({ length: 100 }, (_, i) => ({
          values: makeEmbedding(i),
        })),
      })
      .mockResolvedValueOnce({
        embeddings: [{ values: makeEmbedding(100) }],
      });

    const result = await embedBatch(inputs);
    expect(mockBatchEmbedContents).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(101);
  });

  it("응답 차원 불일치 → throw", async () => {
    mockBatchEmbedContents.mockResolvedValueOnce({
      embeddings: [{ values: Array(512).fill(0) }], // 512차원 (잘못됨)
    });

    await expect(embedBatch(["a"])).rejects.toThrow(/dimension mismatch/);
  });

  it("응답 개수 불일치 → throw", async () => {
    mockBatchEmbedContents.mockResolvedValueOnce({
      embeddings: [{ values: makeEmbedding() }],
    });

    // 2개 요청했는데 1개만 옴
    await expect(embedBatch(["a", "b"])).rejects.toThrow(/count mismatch/);
  });
});
