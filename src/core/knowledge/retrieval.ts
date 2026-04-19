import "server-only";

import { createAdminClient } from "@/core/db/client-admin";
import type { KnowledgeChunkMatch } from "@/core/db/types";
import { embedBatch } from "@/core/knowledge/embedding";
import { logger } from "@/core/logging";
import { sanitizeLoggableError } from "@/core/ratelimit/factory";

/**
 * Task 1-6-c: 사용자 질의 → 임베딩 → `match_knowledge_chunks` RPC → 상위 K 청크.
 *
 * 안전 계약 (CRITICAL):
 *   - 이 함수는 throw 하지 않는다. 모든 실패 경로(빈 쿼리, 길이 초과, 임베딩 실패,
 *     RPC 실패)에서 빈 배열 반환. RAG 는 보조 기능이므로 실패가 chat 전체를
 *     503/502 로 전파되면 안 된다 — 기존 systemPrompt 로 fallback 이 UX 우선.
 *   - 실패는 logger.warn (error 아님). fallback 안전망이 있으므로 Sentry 발화
 *     임계치는 운영 관찰 후 조정.
 *
 * 결정:
 *   - match_count=5 / min_score=0.3: MVP 단일값. Phase 2 A/B 이후 config 노출.
 *   - 단일 쿼리 임베딩은 `embedBatch([query])` 로 처리 — 배치 API 단일 진입점 유지.
 *   - 쿼리 길이 상한 재검증: chat route 에서 max(4000) 검증되지만 내부 경로 재사용 대비.
 */

const DEFAULT_MATCH_COUNT = 5;
const DEFAULT_MIN_SCORE = 0.3;
const MAX_QUERY_LENGTH = 4000;

export async function retrieveRelevantChunks(
  botId: string,
  query: string,
): Promise<KnowledgeChunkMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length > MAX_QUERY_LENGTH) {
    // 빈 쿼리(정상 경로)와 달리 길이 초과는 비정상 진입 신호 — chat route 의
    // Zod max(4000) 를 우회했거나 내부 호출자가 선행 검증 누락. 운영 관찰 목적.
    logger.warn(
      { botId, queryLength: trimmed.length, limit: MAX_QUERY_LENGTH },
      "knowledge retrieval 쿼리 길이 초과 — fallback 빈 배열",
    );
    return [];
  }

  let embedding: number[];
  try {
    const [vec] = await embedBatch([trimmed]);
    if (!vec) return [];
    embedding = vec;
  } catch (err) {
    logger.warn(
      { err: sanitizeLoggableError(err), botId },
      "knowledge retrieval embedding 실패 — fallback 빈 배열",
    );
    return [];
  }

  // admin.rpc 자체가 네트워크 단절·fetch 레이어 예외 시 { data, error } 가 아닌
  // throw 로 나올 수 있다. embedBatch catch 와 대칭성 유지 + 안전 계약
  // (throw 하지 않음) 보장을 위해 try-catch 로 감싼다.
  const admin = createAdminClient();
  let rpcData: KnowledgeChunkMatch[] | null;
  let rpcError: { message?: string } | null;
  try {
    const res = await admin.rpc("match_knowledge_chunks", {
      p_bot_id: botId,
      p_query_embedding: embedding,
      p_match_count: DEFAULT_MATCH_COUNT,
      p_min_score: DEFAULT_MIN_SCORE,
    });
    rpcData = res.data;
    rpcError = res.error;
  } catch (err) {
    logger.warn(
      { err: sanitizeLoggableError(err), botId },
      "knowledge retrieval RPC throw — fallback 빈 배열",
    );
    return [];
  }
  if (rpcError) {
    logger.warn(
      { err: sanitizeLoggableError(rpcError), botId },
      "knowledge retrieval RPC 실패 — fallback 빈 배열",
    );
    return [];
  }
  return rpcData ?? [];
}

export const RETRIEVAL_MATCH_COUNT = DEFAULT_MATCH_COUNT;
export const RETRIEVAL_MIN_SCORE = DEFAULT_MIN_SCORE;
export const RETRIEVAL_MAX_QUERY_LENGTH = MAX_QUERY_LENGTH;
