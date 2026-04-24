#!/usr/bin/env tsx
/**
 * Storage Orphan Cleanup CLI (Task β-3b).
 *
 * 실행:
 *   pnpm cleanup:orphan-storage                  # dry-run (default, 안전)
 *   pnpm cleanup:orphan-storage:apply            # --apply, CONFIRM_DELETE=yes 필요
 *   pnpm cleanup:orphan-storage -- --bot=<id>    # 특정 봇만 검사
 *   pnpm cleanup:orphan-storage -- --ttl-hours=48
 *
 * 안전장치:
 *   - 기본 dry-run (--apply 없으면 출력만)
 *   - --apply 단독은 부족: CONFIRM_DELETE=yes 환경변수도 필요 (이중 게이트)
 *   - TTL 24h 기본 (방금 업로드된 파일 race 보호)
 *   - Soft-deleted 봇 30d 이내 파일 보존 (B-3 정합)
 *   - Legacy 봇 (file source 가 있으나 storagePaths 없음) 전체 보존
 *
 * 권한: service_role 키 사용 (RLS bypass — cross-bot 감사). `.env.local` 로드 필수.
 */

import { createClient } from "@supabase/supabase-js";

import { CURRENT_CONFIG_VERSION, dariConfigSchema } from "@/core/config/schema";
import type { Database } from "@/core/db/types";
import { KNOWLEDGE_FILES_BUCKET } from "@/core/knowledge/storage";

import {
  computeOrphans,
  type BotInput,
  type StorageFileInput,
} from "@/core/knowledge/orphan-cleanup";

type CliOptions = Readonly<{
  apply: boolean;
  ttlHours: number;
  retentionDays: number;
  botFilter: string | null;
  storageListLimit: number;
}>;

type SupabaseAdmin = ReturnType<typeof createClient<Database>>;

const STORAGE_REMOVE_BATCH_SIZE = 50;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArgs(argv: readonly string[]): CliOptions {
  let apply = false;
  let ttlHours = 24;
  let retentionDays = 30;
  let botFilter: string | null = null;
  let storageListLimit = 1000;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--ttl-hours=")) {
      ttlHours = parseIntFlag(arg, "--ttl-hours", 1, 24 * 30);
      continue;
    }
    if (arg.startsWith("--retention-days=")) {
      retentionDays = parseIntFlag(arg, "--retention-days", 1, 365);
      continue;
    }
    if (arg.startsWith("--bot=")) {
      const value = arg.slice("--bot=".length);
      if (!value) {
        throw new Error("--bot=<id> 값이 비어 있습니다.");
      }
      // sec M-1 (β-3b 리뷰): UUID 형식 검증 — DB 0 row 반환으로 인한 운영자 실수
      // (전체 봇 미감지) 를 조기에 차단. SQL injection 자체는 SDK parameterized
      // query 가 막지만, 잘못된 ID 면 즉시 실패가 더 안전.
      if (!UUID_RE.test(value)) {
        throw new Error(`--bot 값이 UUID 형식이 아닙니다: ${value}`);
      }
      botFilter = value;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      storageListLimit = parseIntFlag(arg, "--limit", 1, 10000);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`알 수 없는 인자: ${arg}`);
  }

  return { apply, ttlHours, retentionDays, botFilter, storageListLimit };
}

function parseIntFlag(
  arg: string,
  name: string,
  min: number,
  max: number,
): number {
  const value = Number.parseInt(arg.slice(name.length + 1), 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(
      `${name} 값이 유효하지 않습니다 (정수 ${min}~${max} 범위). 입력: ${arg}`,
    );
  }
  return value;
}

function printHelp(): void {
  console.log(`Storage Orphan Cleanup (Task β-3b)

옵션:
  --apply                 실제 삭제 실행 (CONFIRM_DELETE=yes 환경변수 동시 필요)
  --ttl-hours=N           신규 업로드 보호 윈도우 (default 24, 1~720 시간)
  --retention-days=N      Soft-deleted 봇 파일 보존 기간 (default 30, 1~365 일)
  --bot=<id>              특정 봇만 검사 (UUID)
  --limit=N               봇 폴더당 Storage list 한도 (default 1000)
  -h, --help              도움말

예시:
  pnpm cleanup:orphan-storage
  pnpm cleanup:orphan-storage:apply
  pnpm cleanup:orphan-storage -- --bot=00000000-0000-0000-0000-000000000000
`);
}

function buildAdminClient(): SupabaseAdmin {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 누락. .env.local 확인.",
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type BotRow = Readonly<{
  id: string;
  slug: string;
  deleted_at: string | null;
  config: unknown;
}>;

async function fetchBots(
  supabase: SupabaseAdmin,
  filter: string | null,
): Promise<readonly BotRow[]> {
  let query = supabase.from("bots").select("id, slug, deleted_at, config");
  if (filter) {
    query = query.eq("id", filter);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`bots SELECT 실패: ${error.message}`);
  }
  return data as readonly BotRow[];
}

function extractBotInputs(rows: readonly BotRow[]): BotInput[] {
  return rows.map((row) => {
    const referenced = new Set<string>();
    let hasFileSource = false;
    let hasUntracked = false;

    const parsed = dariConfigSchema.safeParse(row.config);
    if (parsed.success) {
      for (const source of parsed.data.knowledge.sources) {
        if (source.type !== "file") continue;
        hasFileSource = true;
        if (!source.storagePaths || source.storagePaths.length === 0) {
          hasUntracked = true;
          continue;
        }
        for (const path of source.storagePaths) {
          referenced.add(path);
        }
      }
    } else {
      // code M-1 (β-3b 리뷰): config 파싱 실패 = legacy 버전 또는 손상.
      // 두 경로 모두 동일하게 "전체 보존" 처리 — 안전 기본값. 향후 버전별 차등
      // 처리 (예: v0.x 마이그레이션) 도입 시 분기하면 됨. 현재는 단일 분기.
      const legacy = (row.config as { version?: string } | null)?.version;
      if (legacy && legacy !== CURRENT_CONFIG_VERSION) {
        // legacy 버전 — 명시적 untracked 분류 (운영 로그에서 식별 가능).
      }
      hasUntracked = true;
      hasFileSource = true;
    }

    return {
      id: row.id,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
      referencedStoragePaths: referenced,
      // file source 가 있으나 storagePaths 가 일부/전부 없으면 보수적 보존.
      hasUntrackedFileSource: hasFileSource && hasUntracked,
    };
  });
}

async function listBotStorageFiles(
  supabase: SupabaseAdmin,
  botId: string,
  limit: number,
): Promise<StorageFileInput[]> {
  const collected: StorageFileInput[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(KNOWLEDGE_FILES_BUCKET)
      .list(botId, { limit, offset });

    if (error) {
      throw new Error(`Storage list 실패 (bot=${botId}): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const item of data) {
      // 폴더는 metadata 가 null. 파일만 수집.
      if (!item.metadata) continue;
      const createdAt = item.created_at
        ? new Date(item.created_at)
        : new Date();
      collected.push({ botId, fileName: item.name, createdAt });
    }

    if (data.length < limit) break;
    offset += data.length;
  }

  return collected;
}

function maskPath(path: string): string {
  // {bot_id}/{uuid}.{ext} → {bot_id_short}/{uuid_short}.{ext}
  const [botId, file] = path.split("/", 2);
  if (!botId || !file) return path;
  const dot = file.lastIndexOf(".");
  const stem = dot >= 0 ? file.slice(0, dot) : file;
  const ext = dot >= 0 ? file.slice(dot) : "";
  const stemShort = stem.length > 8 ? `${stem.slice(0, 8)}…` : stem;
  const botShort = botId.length > 8 ? `${botId.slice(0, 8)}…` : botId;
  return `${botShort}/${stemShort}${ext}`;
}

function ageHours(createdAt: Date, now: Date): number {
  return Math.floor((now.getTime() - createdAt.getTime()) / (60 * 60 * 1000));
}

async function deleteOrphansBatch(
  supabase: SupabaseAdmin,
  paths: readonly string[],
): Promise<{ removed: number; failed: readonly string[] }> {
  const failed: string[] = [];
  let removed = 0;

  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + STORAGE_REMOVE_BATCH_SIZE);
    const { error } = await supabase.storage
      .from(KNOWLEDGE_FILES_BUCKET)
      .remove(Array.from(batch));
    if (error) {
      // 배치 단위 실패 — 보수적으로 전체를 failed 로.
      for (const p of batch) failed.push(p);
      console.error(
        `  ❌ batch ${i / STORAGE_REMOVE_BATCH_SIZE + 1}: ${error.message}`,
      );
      continue;
    }
    removed += batch.length;
    console.error(
      `  ✓ batch ${i / STORAGE_REMOVE_BATCH_SIZE + 1}: ${batch.length}개 삭제`,
    );
  }

  return { removed, failed };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  // 이중 게이트: --apply + CONFIRM_DELETE=yes
  const confirm = process.env.CONFIRM_DELETE === "yes";
  const applyMode = opts.apply && confirm;
  const dryRun = !applyMode;

  if (opts.apply && !confirm) {
    console.error(
      "🛑 --apply 가 지정됐지만 CONFIRM_DELETE=yes 환경변수가 없습니다.",
    );
    console.error("   이중 게이트 — 실수 방지. 사용 예:");
    console.error("   CONFIRM_DELETE=yes pnpm cleanup:orphan-storage:apply\n");
    process.exit(2);
  }

  const supabase = buildAdminClient();
  const now = new Date();

  console.error("🔍 Storage Orphan Cleanup");
  console.error(`   모드: ${dryRun ? "DRY-RUN (분석만)" : "APPLY (실 삭제)"}`);
  console.error(
    `   TTL: ${opts.ttlHours}h / Retention: ${opts.retentionDays}d`,
  );
  if (opts.botFilter) console.error(`   대상 봇: ${opts.botFilter}`);
  console.error("");

  console.error("[1/3] bots 조회…");
  const botRows = await fetchBots(supabase, opts.botFilter);
  console.error(`   ✓ ${botRows.length}개 봇`);

  const bots = extractBotInputs(botRows);
  const slugById = new Map(botRows.map((r) => [r.id, r.slug]));

  console.error("[2/3] Storage list 수집…");
  const storageFiles: StorageFileInput[] = [];
  for (const bot of bots) {
    const files = await listBotStorageFiles(
      supabase,
      bot.id,
      opts.storageListLimit,
    );
    storageFiles.push(...files);
  }
  console.error(`   ✓ ${storageFiles.length}개 파일`);

  console.error("[3/3] 분류…");
  const result = computeOrphans({
    bots,
    storageFiles,
    ttlMs: opts.ttlHours * 60 * 60 * 1000,
    retentionMs: opts.retentionDays * 24 * 60 * 60 * 1000,
    now,
  });

  console.error("");
  console.error("─── 분류 결과 ───");
  console.error(`총 파일:                 ${result.stats.totalFiles}`);
  console.error(`참조됨 (정상):           ${result.stats.referencedCount}`);
  console.error(`Orphan (삭제 후보):      ${result.stats.orphanCount}`);
  console.error(
    `보존 (recent_ttl):       ${result.stats.preservedRecentCount}`,
  );
  console.error(
    `보존 (휴지통, retention 내): ${result.stats.preservedDeletedBotCount}`,
  );
  console.error(
    `보존 (legacy 봇):        ${result.stats.preservedUntrackedBotCount}`,
  );
  console.error(
    `보존 (봇 없음):          ${result.stats.preservedBotNotFoundCount}`,
  );
  console.error("");

  if (result.orphans.length > 0) {
    console.error("─── Orphan 목록 ───");
    for (const o of result.orphans) {
      const slug = slugById.get(o.botId) ?? "(unknown)";
      console.error(
        `  ${maskPath(o.path)}  age=${ageHours(o.createdAt, now)}h  bot=${slug}`,
      );
    }
    console.error("");
  }

  if (dryRun) {
    if (result.orphans.length > 0) {
      console.error("ℹ️  Dry-run 종료. 삭제하려면:");
      console.error(
        "   CONFIRM_DELETE=yes pnpm cleanup:orphan-storage:apply\n",
      );
    } else {
      console.error("✅ Orphan 없음. 정상 상태.\n");
    }
    process.exit(0);
  }

  if (result.orphans.length === 0) {
    console.error("✅ 삭제할 orphan 없음.\n");
    process.exit(0);
  }

  console.error(`🗑  ${result.orphans.length}개 삭제 시작…`);
  const paths = result.orphans.map((o) => o.path);
  const { removed, failed } = await deleteOrphansBatch(supabase, paths);
  console.error("");
  console.error(`✓ 삭제 완료: ${removed}개`);
  if (failed.length > 0) {
    console.error(`❌ 실패: ${failed.length}개`);
    for (const p of failed.slice(0, 10)) {
      console.error(`   ${maskPath(p)}`);
    }
    if (failed.length > 10) {
      console.error(`   … 외 ${failed.length - 10}개`);
    }
    process.exit(1);
  }

  console.error("\n✅ 완료.\n");
}

main().catch((err: unknown) => {
  console.error("\n❌ 실행 실패:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
