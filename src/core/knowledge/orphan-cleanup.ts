/**
 * Storage Orphan Cleanup — 순수 분류 로직 (Task β-3b).
 *
 * "Orphan" = `knowledge-files` 버킷에 존재하나 어떤 봇 config 의 file source
 * `storagePaths` 에서도 참조되지 않는 파일. 발생 경로:
 *   1) ingest-file rollback Storage 삭제 실패 (best-effort)
 *   2) remove-source Storage 삭제 실패 (best-effort)
 *   3) trash permanent delete 실패
 *   4) Legacy 데이터 (1-7-c 초기 저장본 — `storagePaths` 없음)
 *
 * 분류 정책:
 *   - **TTL 24h** — 신규 업로드 race 보호 (config UPDATE 직전 상태일 수 있음).
 *   - **Soft-deleted 봇 30d 보존** — Phase 0-D-2 / B-3 결정 정합 (휴지통 내 파일 유지).
 *   - **legacy 봇** (file source 가 있으나 storagePaths 미기록) — 보수적 전체 보존.
 *   - **봇 없음** — `bot_not_found` 로 별도 보존 (수동 검토 대상).
 *
 * 본 모듈은 **순수 함수** — Supabase 호출 없음. entry script(`scripts/cleanup-orphan-storage.ts`)
 * 가 데이터 수집 후 본 함수로 분류.
 */

export type OrphanReason = "unreferenced";

export type PreservedReason =
  | "recent_ttl"
  | "soft_deleted_bot_within_retention"
  | "untracked_bot"
  | "bot_not_found";

export type BotInput = Readonly<{
  id: string;
  deletedAt: Date | null;
  // config.knowledge.sources[].storagePaths 의 모든 path 를 합집합으로 미리 계산.
  referencedStoragePaths: ReadonlySet<string>;
  // file source 가 존재하나 storagePaths 가 없거나 빈 배열인 경우 true (legacy/race).
  hasUntrackedFileSource: boolean;
}>;

export type StorageFileInput = Readonly<{
  botId: string;
  // {uuid}.{ext} — 봇 폴더 기준 파일명.
  fileName: string;
  createdAt: Date;
}>;

export type ComputeOrphansArgs = Readonly<{
  bots: readonly BotInput[];
  storageFiles: readonly StorageFileInput[];
  // 신규 업로드 보호 윈도우 (default 24h).
  ttlMs?: number;
  // soft-deleted 봇 파일 보존 기간 (default 30d).
  retentionMs?: number;
  now: Date;
}>;

export type OrphanItem = Readonly<{
  botId: string;
  path: string;
  createdAt: Date;
  reason: OrphanReason;
}>;

export type PreservedItem = Readonly<{
  botId: string;
  path: string;
  reason: PreservedReason;
}>;

export type OrphanStats = Readonly<{
  totalFiles: number;
  referencedCount: number;
  orphanCount: number;
  preservedRecentCount: number;
  preservedDeletedBotCount: number;
  preservedUntrackedBotCount: number;
  preservedBotNotFoundCount: number;
}>;

export type ComputeOrphansResult = Readonly<{
  orphans: readonly OrphanItem[];
  preserved: readonly PreservedItem[];
  referencedCount: number;
  stats: OrphanStats;
}>;

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function computeOrphans(args: ComputeOrphansArgs): ComputeOrphansResult {
  const ttlMs = args.ttlMs ?? DEFAULT_TTL_MS;
  const retentionMs = args.retentionMs ?? DEFAULT_RETENTION_MS;
  const nowMs = args.now.getTime();

  const botById = new Map<string, BotInput>(args.bots.map((b) => [b.id, b]));

  const orphans: OrphanItem[] = [];
  const preserved: PreservedItem[] = [];
  let referencedCount = 0;
  let preservedRecentCount = 0;
  let preservedDeletedBotCount = 0;
  let preservedUntrackedBotCount = 0;
  let preservedBotNotFoundCount = 0;

  for (const file of args.storageFiles) {
    const path = `${file.botId}/${file.fileName}`;
    const bot = botById.get(file.botId);

    if (!bot) {
      preserved.push({ botId: file.botId, path, reason: "bot_not_found" });
      preservedBotNotFoundCount += 1;
      continue;
    }

    if (
      bot.deletedAt !== null &&
      nowMs - bot.deletedAt.getTime() < retentionMs
    ) {
      preserved.push({
        botId: file.botId,
        path,
        reason: "soft_deleted_bot_within_retention",
      });
      preservedDeletedBotCount += 1;
      continue;
    }

    if (bot.hasUntrackedFileSource) {
      preserved.push({ botId: file.botId, path, reason: "untracked_bot" });
      preservedUntrackedBotCount += 1;
      continue;
    }

    if (bot.referencedStoragePaths.has(path)) {
      referencedCount += 1;
      continue;
    }

    if (nowMs - file.createdAt.getTime() < ttlMs) {
      preserved.push({ botId: file.botId, path, reason: "recent_ttl" });
      preservedRecentCount += 1;
      continue;
    }

    orphans.push({
      botId: file.botId,
      path,
      createdAt: file.createdAt,
      reason: "unreferenced",
    });
  }

  return {
    orphans,
    preserved,
    referencedCount,
    stats: {
      totalFiles: args.storageFiles.length,
      referencedCount,
      orphanCount: orphans.length,
      preservedRecentCount,
      preservedDeletedBotCount,
      preservedUntrackedBotCount,
      preservedBotNotFoundCount,
    },
  };
}
