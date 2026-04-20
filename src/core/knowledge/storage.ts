import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/core/db/types";

/**
 * Supabase Storage helper — knowledge-files 버킷 전용 (Task 1-7-c).
 *
 * 경로 규약: `{bot_id}/{uuid}.{ext}`
 *   - first segment = bot_id → 0010 RLS 정책이 이 세그먼트로 소유권 검증.
 *   - uuid 는 호출자(ingest-file.ts)에서 `crypto.randomUUID()` 생성.
 *   - ext 는 sanitized filename 에서 파생 (file-extract.getExtension).
 *
 * 보안:
 *   - 호출자가 인증된 SupabaseClient 주입. RLS 4정책(insert/select/update/delete/owner)
 *     이 자동 적용 → 타인 봇 경로 upload 시 403 반환.
 *   - 버킷 file_size_limit=10MB + allowed_mime_types 화이트리스트가 DB layer 에서도
 *     이중 방어 (0010 마이그레이션).
 *
 * 실패 계약:
 *   - upload/remove 실패는 정적 identifier 로 throw ("파일 업로드 실패").
 *   - 내부 에러 상세는 호출자가 logger.error 에 기록.
 */

export const KNOWLEDGE_FILES_BUCKET = "knowledge-files";

export type KnowledgeFileObject = Readonly<{
  // Storage 내 전체 경로 (RLS 판별 키와 동일 형식).
  path: string;
  // 버킷 기준 상대 경로 = path (호환 위해 동일).
  storagePath: string;
  // 업로드 시 사용된 Content-Type.
  contentType: string;
}>;

/**
 * {bot_id}/{uuid}.{ext} 경로 생성.
 *
 * 주의: uuid/ext 는 신뢰된 입력이어야 한다 (호출자 검증 책임).
 * - uuid: `crypto.randomUUID()` 생성값
 * - ext: file-extract.getExtension 반환값 (화이트리스트)
 */
export function buildKnowledgeFilePath(
  botId: string,
  uuid: string,
  ext: string,
): string {
  return `${botId}/${uuid}.${ext}`;
}

/**
 * 파일 업로드 — `upsert: true` 로 동일 경로 덮어쓰기 허용.
 * (같은 파일명 재업로드 UX 와 정합. source_identifier 교체 로직과 함께 동작.)
 */
export async function uploadKnowledgeFile(
  supabase: SupabaseClient<Database>,
  args: Readonly<{
    path: string;
    data: Buffer;
    contentType: string;
  }>,
): Promise<KnowledgeFileObject> {
  const { error } = await supabase.storage
    .from(KNOWLEDGE_FILES_BUCKET)
    .upload(args.path, args.data, {
      contentType: args.contentType,
      // security review INFO-2 (2026-04-20):
      //   private 버킷이라 현재는 CDN 미적용이지만, 향후 버킷이 public 전환될 가능성에
      //   대비해 "no-store" 로 명시. 대외비 지식 파일이므로 프록시·캐시 금지.
      cacheControl: "no-store",
      upsert: true,
    });

  if (error) {
    // 상세는 호출자 logger.error — 여기서는 정적 메시지만.
    throw new Error("파일 업로드 실패");
  }

  return {
    path: args.path,
    storagePath: args.path,
    contentType: args.contentType,
  };
}

/**
 * 실패 롤백 — ingest 도중 RPC 실패 시 Storage 고아(orphan) 방지.
 *
 * 참고: Storage 삭제 실패는 로그만 남기고 throw 하지 않는다 (best-effort).
 * 호출자가 이 함수로 roll back 을 시도했다는 사실 자체를 기록.
 */
export async function removeKnowledgeFile(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<{ removed: boolean }> {
  const { error } = await supabase.storage
    .from(KNOWLEDGE_FILES_BUCKET)
    .remove([path]);

  return { removed: !error };
}

/**
 * MIME 매핑 — 확장자 → 업로드 시 Content-Type.
 *
 * TXT 는 `text/plain` (가장 보편).
 * MD 는 `text/markdown` (RFC 7763 등록). Supabase 버킷 allowed_mime_types 에도 등록됨.
 */
export function contentTypeForExtension(ext: string): string {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    default:
      throw new Error("파일 업로드 실패");
  }
}
