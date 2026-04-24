import "server-only";

import { GoogleGenAI } from "@google/genai";

import { env } from "@/shared/config/env.server";

/**
 * Gemini gemini-embedding-001 임베딩 래퍼.
 *
 * 스펙:
 *   - 모델: gemini-embedding-001 (128~3072차원 지원, 768로 고정 사용).
 *   - 출력 차원: 768 (knowledge_chunks.embedding vector(768) 스키마와 일치).
 *   - 요금: 무료 tier 유지 (embedding API 무료 할당).
 *   - 배치: `embedContent` 의 contents 배열로 전달 (한 번에 최대 100개).
 *
 * 설계:
 *   - 싱글턴 client (anthropic-client.ts 와 동일 패턴) — cold-start 재사용.
 *   - 100개 초과 입력은 내부에서 자동 슬라이스 → 순차 호출.
 *   - 빈 문자열 입력은 Gemini API 가 400 반환 → 호출자가 필터링 책임 (청크 단계에서 trim).
 *   - 에러는 wrap 하지 않고 그대로 throw (상위 서버 액션이 포착 + logger.error).
 *
 * Migration 2026-04-25 (Task A-5b precursor):
 *   - 구: `@google/generative-ai 0.24.1` + `text-embedding-004` → 404 (모델 지원 종료).
 *   - 신: `@google/genai` + `gemini-embedding-001` + `outputDimensionality: 768` 명시.
 *   - API signature 변경: `model.batchEmbedContents({ requests })` →
 *     `ai.models.embedContent({ model, contents, config })`.
 */

const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EXPECTED_DIMENSIONS = 768;
const MAX_BATCH_SIZE = 100;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    // sec MEDIUM (security-reviewer 2026-04-25): `httpOptions` 의도적 미사용.
    // 신 SDK 는 `httpOptions.baseUrl` 로 API endpoint 오버라이드 가능 — 향후
    // 변경 시 임의 endpoint 로 API key 가 전송되는 SSRF 벡터가 될 수 있어
    // 생성자는 `apiKey` 만 전달하는 형태로 잠금.
    client = new GoogleGenAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
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

  const ai = getClient();

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const slice = texts.slice(i, i + MAX_BATCH_SIZE);
    const response = await ai.models.embedContent({
      model: GEMINI_EMBEDDING_MODEL,
      contents: slice.map((text) => ({
        role: "user",
        parts: [{ text }],
      })),
      config: {
        outputDimensionality: EXPECTED_DIMENSIONS,
      },
    });

    const embeddings = response.embeddings;
    if (!embeddings || embeddings.length !== slice.length) {
      throw new Error(
        `embedBatch: response count mismatch (expected ${slice.length}, got ${embeddings?.length ?? "null"})`,
      );
    }

    for (const emb of embeddings) {
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
