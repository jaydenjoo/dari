import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/core/db/types";
import { logger } from "@/core/logging";

import { chunkText } from "./chunking";
import { embedBatch } from "./embedding";
import {
  extractTextFromFile,
  type SupportedFileExtension,
} from "./file-extract";
import { sanitizeKnowledgeText } from "./sanitize";
import {
  buildKnowledgeFilePath,
  contentTypeForExtension,
  removeKnowledgeFile,
  uploadKnowledgeFile,
} from "./storage";

/**
 * 파일 지식 소스 수집 파이프라인 (Task 1-7-c).
 *
 * 흐름:
 *   1. extractTextFromFile: magic bytes 검증 + 파일명 sanitize + PDF/TXT/MD 텍스트 추출.
 *   2. sanitizeKnowledgeText: NULL byte + Trojan Source 제거.
 *   3. chunkText (500/100 overlap) → Gemini embedBatch.
 *   4. Storage upload ({bot_id}/{uuid}.{ext}) — upsert 로 동일 경로 덮어쓰기 허용.
 *   5. RPC replace_knowledge_chunks_for_source — (source_type, source_identifier) 원자 교체.
 *   6. RPC 실패 시 Storage 고아 롤백 (best-effort remove).
 *
 * source_type 매핑 (DB CHECK: url/pdf/manual/markdown):
 *   - pdf → "pdf"
 *   - txt → "markdown"  (plain text 는 markdown subset 로 취급, 0008 manual 전용과 분리)
 *   - md  → "markdown"
 *
 * source_identifier: `file:{sanitized_filename}`.
 *   - URL 패턴(1-7-b)과 대칭: "같은 파일명 재업로드 = 같은 청크 교체" UX.
 *   - identifier 충돌 회피: 1-7-a text(`manual:inline`) · 1-7-b URL(`{url}`) 과 겹치지 않음.
 *
 * 보안:
 *   - supabase 는 인증된 호출자 클라이언트. Storage RLS(0010) + RPC RLS(0009) 이중.
 *   - 에러 throw 는 정적 식별자만:
 *     - "파일 처리 실패" (extract/magic bytes)
 *     - "파일 업로드 실패" (Storage)
 *     - "knowledge embedding failed" (embedding count mismatch)
 *     - "knowledge RPC failed" (RPC)
 *   - 내부 상세(Postgres errcode, Storage 응답 등)는 logger.error 메타에만 단일 출처.
 */

export type IngestFileResult = Readonly<{
  chunkCount: number;
  sanitizedFilename: string;
  ext: SupportedFileExtension;
  bytes: number;
  storagePath: string;
}>;

const SOURCE_TYPE_BY_EXT: Record<SupportedFileExtension, "pdf" | "markdown"> = {
  pdf: "pdf",
  txt: "markdown",
  md: "markdown",
};

function sourceIdentifierFor(filename: string): string {
  return `file:${filename}`;
}

export async function ingestFileKnowledge(
  supabase: SupabaseClient<Database>,
  botId: string,
  args: Readonly<{
    buffer: Buffer;
    filename: string;
  }>,
): Promise<IngestFileResult> {
  // 1. 텍스트 추출 (+ 파일명·확장자·magic bytes 검증 일체).
  const extracted = await extractTextFromFile(args.buffer, args.filename);
  const { text, sanitizedFilename, ext, bytes } = extracted;

  // 2. 본문 sanitize (NULL/Trojan) → chunk.
  const sanitized = sanitizeKnowledgeText(text);
  const chunks = chunkText(sanitized);

  // 3. embedding.
  let payload: Array<{
    content: string;
    chunk_index: number;
    embedding: number[];
  }> = [];
  if (chunks.length > 0) {
    const embeddings = await embedBatch(chunks);
    if (embeddings.length !== chunks.length) {
      logger.error(
        {
          botId,
          sourceIdentifier: sourceIdentifierFor(sanitizedFilename),
          chunkCount: chunks.length,
          embeddingCount: embeddings.length,
        },
        "file embedding count mismatch (chunks != embeddings)",
      );
      throw new Error("knowledge embedding failed");
    }
    payload = chunks.map((chunk, index) => ({
      content: chunk,
      chunk_index: index,
      embedding: embeddings[index],
    }));
  }

  // 4. Storage 업로드 — RPC 실패 시 롤백 가능하도록 먼저 수행.
  const uuid = randomUUID();
  const storagePath = buildKnowledgeFilePath(botId, uuid, ext);
  const contentType = contentTypeForExtension(ext);

  await uploadKnowledgeFile(supabase, {
    path: storagePath,
    data: args.buffer,
    contentType,
  });

  // 5. RPC — (source_type, source_identifier) 단위 DELETE + INSERT 원자.
  //
  // 불변조건 (code review MEDIUM-1, 2026-04-20):
  //   이 지점 도달 = Storage 업로드 성공 완료. 아래 try 블록 내부에서 발생하는
  //   모든 실패 경로(RPC error / RPC throw)는 Storage 롤백 대상이다
  //   (rollbackStorage best-effort 호출). 향후 업로드 순서가 바뀌면 rollback
  //   호출 위치를 재검토해야 한다.
  const sourceType = SOURCE_TYPE_BY_EXT[ext];
  const sourceIdentifier = sourceIdentifierFor(sanitizedFilename);

  try {
    const { data, error } = await supabase.rpc(
      "replace_knowledge_chunks_for_source",
      {
        p_bot_id: botId,
        p_source_type: sourceType,
        p_source_identifier: sourceIdentifier,
        p_chunks: payload,
      },
    );

    if (error) {
      logger.error(
        {
          err: error,
          botId,
          sourceType,
          sourceIdentifier,
          chunkCount: payload.length,
          storagePath,
        },
        "replace_knowledge_chunks_for_source RPC 실패 (file ingest)",
      );
      await rollbackStorage(supabase, storagePath);
      throw new Error("knowledge RPC failed");
    }

    const chunkCount = typeof data === "number" ? data : 0;
    return {
      chunkCount,
      sanitizedFilename,
      ext,
      bytes,
      storagePath,
    };
  } catch (err) {
    // 위에서 이미 throw 한 정적 메시지는 그대로 재전달.
    if (err instanceof Error && err.message === "knowledge RPC failed")
      throw err;

    // supabase-js .rpc() 가 `{data,error}` 가 아닌 throw 경로를 탄 경우
    // (네트워크/TLS 단절 등). 정적 메시지로 재포장 + Storage 롤백.
    logger.error(
      {
        err,
        botId,
        sourceType,
        sourceIdentifier,
        chunkCount: payload.length,
        storagePath,
      },
      "RPC 호출 중 예외 (file ingest, supabase-js throw 경로)",
    );
    await rollbackStorage(supabase, storagePath);
    throw new Error("knowledge RPC failed");
  }
}

async function rollbackStorage(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  try {
    const { removed } = await removeKnowledgeFile(supabase, path);
    if (!removed) {
      logger.warn({ storagePath: path }, "Storage 롤백 실패 (고아 파일 가능)");
    }
  } catch (err) {
    logger.warn({ err, storagePath: path }, "Storage 롤백 중 예외");
  }
}
