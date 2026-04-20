import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/core/db/types";
import { logger } from "@/core/logging";

import { chunkText } from "./chunking";
import { embedBatch } from "./embedding";
import { sanitizeKnowledgeText } from "./sanitize";
import { fetchUrlAsMarkdown, sanitizeUrlForLog } from "./url-fetch";

/**
 * URL 지식 소스 수집 파이프라인 (Task 1-7-b).
 *
 * 흐름:
 *   1. Firecrawl scrape → markdown + 200KB 절단 가드 (url-fetch.ts).
 *   2. sanitize (NULL byte + Trojan Source) → chunking (500/100 overlap).
 *   3. Gemini embed → 일반화 RPC `replace_knowledge_chunks_for_source` (DELETE+INSERT 원자).
 *
 * source_identifier 정책:
 *   - **입력 URL 자체** 를 identifier 로 사용 (Firecrawl 리다이렉트 후 sourceURL 이 아님).
 *   - 이유: "같은 URL 재요청 = 같은 청크 덩어리 교체" 라는 예측 가능한 UX 유지.
 *     리다이렉트 후 URL 을 identifier 로 쓰면 사용자가 동일 URL 재입력 시 이전과 다른
 *     identifier 가 되어 중복 청크가 쌓일 수 있다.
 *   - resolvedUrl (리다이렉트 후) 은 반환값에 담아 UX/로깅에 참고만.
 *
 * 보안:
 *   - supabase 는 인증된 클라이언트로 호출자가 주입. RPC 는 security invoker → RLS 자동.
 *   - URL 사전 검증은 호출자 책임 (knowledgeUrlSchema). 이 함수는 이미 안전한 입력 전제.
 *   - 에러 throw 메시지는 정적 식별자만 — "URL 처리 실패" 또는 "knowledge RPC failed".
 *     Postgres/Firecrawl 내부 메시지는 logger.error 메타 단일 출처에만 기록.
 *
 * supabase-js 안전 계약 (learnings 2026-04-19):
 *   - `.rpc()` 는 `{data, error}` + throw 두 경로 모두 가능 → try-catch 로 둘 다 포착.
 */

export type IngestUrlResult = Readonly<{
  chunkCount: number;
  truncated: boolean;
  resolvedUrl: string;
}>;

export async function ingestUrlKnowledge(
  supabase: SupabaseClient<Database>,
  botId: string,
  url: string,
): Promise<IngestUrlResult> {
  const fetched = await fetchUrlAsMarkdown(url);
  const sanitized = sanitizeKnowledgeText(fetched.markdown);
  const chunks = chunkText(sanitized);

  let payload: Array<{
    content: string;
    chunk_index: number;
    embedding: number[];
  }> = [];
  if (chunks.length > 0) {
    const embeddings = await embedBatch(chunks);
    if (embeddings.length !== chunks.length) {
      // security LOW 2026-04-20: 내부 수치(chunks/embeddings 개수)는 throw 메시지에
      // 담지 않는다. 호출자(actions.ts)가 static identifier 로 사용자 메시지 매핑하고,
      // 상세는 아래 logger.error 단일 출처에만 기록.
      logger.error(
        {
          botId,
          sourceIdentifier: sanitizeUrlForLog(url),
          chunkCount: chunks.length,
          embeddingCount: embeddings.length,
        },
        "embedding count mismatch (chunks != embeddings)",
      );
      throw new Error("knowledge embedding failed");
    }
    payload = chunks.map((chunk, index) => ({
      content: chunk,
      chunk_index: index,
      embedding: embeddings[index],
    }));
  }

  try {
    const { data, error } = await supabase.rpc(
      "replace_knowledge_chunks_for_source",
      {
        p_bot_id: botId,
        p_source_type: "url",
        p_source_identifier: url,
        p_chunks: payload,
      },
    );

    if (error) {
      logger.error(
        {
          err: error,
          botId,
          sourceIdentifier: sanitizeUrlForLog(url),
          chunkCount: payload.length,
        },
        "replace_knowledge_chunks_for_source RPC 실패",
      );
      throw new Error("knowledge RPC failed");
    }

    const chunkCount = typeof data === "number" ? data : 0;
    return {
      chunkCount,
      truncated: fetched.truncated,
      resolvedUrl: fetched.sourceUrl,
    };
  } catch (err) {
    // 위에서 이미 throw 한 "knowledge RPC failed" 는 그대로 재던짐.
    if (err instanceof Error && err.message === "knowledge RPC failed")
      throw err;

    // supabase-js .rpc() 가 `{data,error}` 대신 **직접 throw** 한 경우
    // (네트워크/TLS 단절, fetch 레이어 실패 등) — 정적 메시지로 재포장.
    // fetchUrlAsMarkdown / embedBatch / embedding mismatch throw 는 이 try 블록
    // 밖에서 발생하므로 여기 도달하지 않는다 (code review H-1, 2026-04-20).
    logger.error(
      {
        err,
        botId,
        sourceIdentifier: sanitizeUrlForLog(url),
        chunkCount: payload.length,
      },
      "RPC 호출 중 예외 (supabase-js throw 경로)",
    );
    throw new Error("knowledge RPC failed");
  }
}
