import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";

import { env } from "@/shared/config/env";

/**
 * Gemini text-embedding-004 임베딩 래퍼.
 *
 * 스펙:
 *   - 모델: text-embedding-004 (768차원, knowledge_chunks.embedding 스키마와 일치).
 *   - 요금: 무료 tier (15 RPM, 분당 1500 req, Apr 2026 기준).
 *   - 배치 API: `batchEmbedContents` 한 번에 최대 100개 요청 가능.
 *
 * 설계:
 *   - 싱글턴 client (anthropic-client.ts 와 동일 패턴) — cold-start 재사용.
 *   - 100개 초과 입력은 내부에서 자동 슬라이스 → 순차 호출 (15 RPM 여유).
 *   - 빈 문자열 입력은 Gemini API 가 400 반환 → 호출자가 필터링 책임 (청크 단계에서 trim).
 *   - 에러는 wrap 하지 않고 그대로 throw (상위 서버 액션이 포착 + logger.error).
 */

const GEMINI_EMBEDDING_MODEL = "text-embedding-004";
const EXPECTED_DIMENSIONS = 768;
const MAX_BATCH_SIZE = 100;

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    client = new GoogleGenerativeAI(env.GOOGLE_GENERATIVE_AI_API_KEY);
  }
  return client;
}

/**
 * 텍스트 배열 → 임베딩 벡터 배열.
 *
 * @throws Gemini API 실패 / 차원 불일치 / 빈 배열 요청.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    throw new Error("embedBatch: texts is empty — caller must filter");
  }
  if (texts.some((t) => t.length === 0)) {
    throw new Error("embedBatch: empty string in texts — caller must filter");
  }

  const model = getClient().getGenerativeModel({
    model: GEMINI_EMBEDDING_MODEL,
  });

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const slice = texts.slice(i, i + MAX_BATCH_SIZE);
    const response = await model.batchEmbedContents({
      requests: slice.map((text) => ({
        content: { role: "user", parts: [{ text }] },
      })),
    });

    if (response.embeddings.length !== slice.length) {
      throw new Error(
        `embedBatch: response count mismatch (expected ${slice.length}, got ${response.embeddings.length})`,
      );
    }

    for (const emb of response.embeddings) {
      const values = emb.values;
      if (!Array.isArray(values) || values.length !== EXPECTED_DIMENSIONS) {
        throw new Error(
          `embedBatch: dimension mismatch (expected ${EXPECTED_DIMENSIONS}, got ${values?.length ?? "null"})`,
        );
      }
      results.push(values);
    }
  }

  return results;
}

export const EMBEDDING_DIMENSIONS = EXPECTED_DIMENSIONS;
export const EMBEDDING_MAX_BATCH = MAX_BATCH_SIZE;
