import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/core/db/types";
import { logger } from "@/core/logging";

import { mapUiToDb } from "./source-key";
import { removeKnowledgeFile } from "./storage";

/**
 * 지식 소스 삭제 오케스트레이션 (Task 1-7-d).
 *
 * 흐름:
 *   1. UI 타입(`text`/`url`/`file`) + identifier → DB (source_type, source_identifier) 매핑.
 *      - text → ('manual', 'manual:inline')
 *      - url  → ('url', URL 원본)
 *      - file → ('pdf' | 'markdown', `file:{filename}`)  ※ 확장자 기준
 *   2. `replace_knowledge_chunks_for_source(botId, type, id, [])` 호출.
 *      - 빈 배열 = 해당 (type, id) 청크 전체 삭제 (0009 RPC 계약).
 *      - RLS 자동 적용 → 타인 봇이면 0 row + WITH CHECK 거부.
 *   3. file 타입 + storagePaths 있으면 Storage best-effort 제거 (병렬).
 *      - 실패 시 failedFiles 에 기록, throw 안 함 — chunks/sources 는 이미 정합 상태.
 *
 * 실패 계약:
 *   - RPC `{error}` 또는 throw → `"knowledge RPC failed"` 정적 메시지.
 *   - Storage 실패 → best-effort (logger.warn + failedFiles 반환).
 *   - 잘못된 입력 → `"invalid source type"` / `"invalid source identifier"`.
 *
 * 호출자 책임 (actions.ts):
 *   - 세션/권한/rate limit 선검증.
 *   - storagePaths 를 config.knowledge.sources 에서 추출해 전달 (1-7-d 신규 데이터) —
 *     없으면 legacy(1-7-c 초기 저장) 로 간주하고 Storage orphan 수용.
 *   - 호출 후 config.knowledge.sources 에서 해당 소스 제거 → bots UPDATE.
 */

export type RemoveSourceArgs = Readonly<{
  supabase: SupabaseClient<Database>;
  botId: string;
  sourceType: "text" | "url" | "file";
  identifier: string;
  storagePaths?: readonly string[];
}>;

export type RemoveSourceResult = Readonly<{
  removedChunks: number;
  removedFiles: number;
  failedFiles: readonly string[];
}>;

// code review L-2: TS 에서 UiSourceType 이 이미 좁혀져 있지만, Server Action 이
// formData 문자열을 캐스팅해 전달하므로 런타임 경계 방어 1단을 유지 (defense-in-depth).
const VALID_UI_TYPES = ["text", "url", "file"] as const;

export async function removeKnowledgeSource(
  args: RemoveSourceArgs,
): Promise<RemoveSourceResult> {
  if (!VALID_UI_TYPES.includes(args.sourceType)) {
    throw new Error("invalid source type");
  }

  // code review M-1: 매핑 규칙 단일 출처 (source-key.ts) — sources-list 와 공유.
  const { sourceType: dbType, sourceIdentifier: dbId } = mapUiToDb(
    args.sourceType,
    args.identifier,
  );

  // 1. chunks 삭제 — 0009 RPC `p_chunks=[]` = 해당 (type, id) 전체 제거.
  let removedChunks = 0;
  try {
    const { data, error } = await args.supabase.rpc(
      "replace_knowledge_chunks_for_source",
      {
        p_bot_id: args.botId,
        p_source_type: dbType,
        p_source_identifier: dbId,
        p_chunks: [],
      },
    );
    if (error) {
      logger.error(
        {
          err: error,
          botId: args.botId,
          sourceType: dbType,
          sourceIdentifier: dbId,
        },
        "replace_knowledge_chunks_for_source RPC 실패 (remove-source)",
      );
      throw new Error("knowledge RPC failed");
    }
    removedChunks = typeof data === "number" ? data : 0;
  } catch (err) {
    if (err instanceof Error && err.message === "knowledge RPC failed") {
      throw err;
    }
    // supabase-js .rpc() 가 `{data,error}` 가 아닌 throw 경로를 탄 경우
    // (네트워크/TLS 단절 등). 정적 메시지로 재포장.
    logger.error(
      {
        err,
        botId: args.botId,
        sourceType: dbType,
        sourceIdentifier: dbId,
      },
      "RPC 호출 중 예외 (remove-source, supabase-js throw 경로)",
    );
    throw new Error("knowledge RPC failed");
  }

  // 2. Storage 파일 best-effort 제거 (file + storagePaths 있을 때만).
  let removedFiles = 0;
  const failedFiles: string[] = [];
  if (
    args.sourceType === "file" &&
    args.storagePaths &&
    args.storagePaths.length > 0
  ) {
    const results = await Promise.all(
      args.storagePaths.map(async (path) => {
        try {
          const { removed } = await removeKnowledgeFile(args.supabase, path);
          return { path, removed };
        } catch (err) {
          logger.warn(
            { err, botId: args.botId, storagePath: path },
            "Storage 파일 삭제 중 예외 (best-effort)",
          );
          return { path, removed: false };
        }
      }),
    );
    for (const r of results) {
      if (r.removed) {
        removedFiles += 1;
      } else {
        failedFiles.push(r.path);
        logger.warn(
          { botId: args.botId, storagePath: r.path },
          "Storage 파일 삭제 실패 (best-effort, chunks 는 이미 삭제됨)",
        );
      }
    }
  }

  return {
    removedChunks,
    removedFiles,
    failedFiles,
  };
}
