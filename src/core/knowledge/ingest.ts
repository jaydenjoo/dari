import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TextKnowledgeChunkPayload } from "@/core/db/types";
import { logger } from "@/core/logging";

import { chunkText } from "./chunking";
import { embedBatch } from "./embedding";

/**
 * text 지식 소스 수집 파이프라인 (Task 1-7-a).
 *
 * 흐름:
 *   1. content 를 trim → 비었으면 기존 청크 전체 삭제 (RPC with []).
 *   2. 500자 + 100 오버랩으로 청킹.
 *   3. Gemini text-embedding-004 로 각 청크 임베딩 (배치).
 *   4. RPC `replace_text_knowledge_chunks` 단일 호출 → DELETE + INSERT 원자.
 *
 * 보안:
 *   - supabase 는 호출자(Server Action)에서 인증된 클라이언트로 주입.
 *   - RPC 는 `security invoker` + RLS → bot_id 의 owner 가 auth.uid() 일 때만 성공.
 *   - RLS 거부 시 DELETE 0 row, INSERT 차단 → 실제 owner 가 아닌 경우 chunks 가 추가되지 않음.
 *   - 추가 owner 사전 검증은 호출자(Server Action)가 책임 (fail-fast + UX 메시지).
 *
 * 반환: 실제 DB 에 삽입된 row 수 (RPC return 값).
 */
export async function ingestTextKnowledge(
  supabase: SupabaseClient<Database>,
  botId: string,
  content: string,
): Promise<{ chunkCount: number }> {
  const chunks = chunkText(content);

  let payload: TextKnowledgeChunkPayload[] = [];
  if (chunks.length > 0) {
    const embeddings = await embedBatch(chunks);
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `ingestTextKnowledge: embedding count mismatch (chunks=${chunks.length}, embeddings=${embeddings.length})`,
      );
    }
    payload = chunks.map((chunk, index) => ({
      content: chunk,
      chunk_index: index,
      embedding: embeddings[index],
    }));
  }

  const { data, error } = await supabase.rpc("replace_text_knowledge_chunks", {
    p_bot_id: botId,
    p_chunks: payload,
  });

  if (error) {
    // sec H-1: error.message 에는 Postgres 내부 에러(테이블/컬럼명, errcode)가
    // 포함될 수 있음. 상세는 logger 에만 기록하고, throw 메시지는 호출자 경유로
    // 클라이언트에 노출될 위험을 최소화하기 위해 정적 식별자만 사용.
    logger.error(
      {
        errCode: error.code,
        errMsg: error.message,
        botId,
        chunkCount: payload.length,
      },
      "replace_text_knowledge_chunks RPC 실패",
    );
    throw new Error("knowledge RPC failed");
  }

  // RPC 반환 = int (실제 삽입된 row 수). RLS 거부 시 0 반환.
  const chunkCount = typeof data === "number" ? data : 0;
  return { chunkCount };
}
