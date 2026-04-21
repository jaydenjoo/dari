"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AUDIT_EVENTS, logAuditEvent } from "@/core/audit";
import { createClient } from "@/core/db/client-server";
import { logger } from "@/core/logging";
import { checkBotDeleteRatelimit } from "@/core/ratelimit/bot-delete-limiter";

import { isValidSlug } from "../new/slug-util";

// Storage list 한 번당 상한 (기존 B-1 근거 재활용).
// 파일 10MB × 1000 = 10GB/봇. Supabase storage.list 최대 limit=1000.
// 초과 시 상위 1000개만 제거, 나머지는 Phase 2 sweeper 로 정리.
const STORAGE_CLEANUP_LIST_LIMIT = 1000;

// ─── 봇 복구 (휴지통 → 활성) ─────────────────────────────────────────────────
//
// 복구 성공/실패 모두 `redirect()` 로 종료되어 호출자에게 반환값 전달 안 됨
// → `Promise<void>`. `useActionState` 미사용 (form action 직접 바인딩).

/**
 * 봇 복구 Server Action (Epic B Task B-3).
 *
 * 휴지통(`/bots/trash`) 의 "복구" 버튼 → 이 action 호출.
 * `UPDATE deleted_at = NULL` 로 활성 상태 복원.
 *
 * 방어:
 *   - slug 형식 정규식 (DB 왕복 전).
 *   - 세션 `getUser()`.
 *   - RLS `bots_update_owner` 가 owner 격리.
 *   - `.not("deleted_at", "is", null)` 필터 — 활성 봇 덮어쓰기 방지 (idempotent 아님).
 *
 * slug 충돌:
 *   - DB 전체 slug UNIQUE 제약 (0001) 이 soft-deleted 봇도 점유.
 *   - 즉 휴지통에 `chatsio` 가 있으면 새 봇 `chatsio` 를 만들 수 없음 → 복구 시 충돌 없음.
 *   - 근본 해결은 `UNIQUE WHERE deleted_at IS NULL` partial unique index 도입 — Phase 2 이월.
 */
export async function restoreBotAction(slug: string): Promise<void> {
  if (!isValidSlug(slug)) {
    redirect("/bots/trash?error=invalid_slug");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/bots/trash")}`);
  }

  // 대상 확인 — soft-deleted 봇만.
  const { data: existing, error: selectErr } = await supabase
    .from("bots")
    .select("id")
    .eq("slug", slug)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (selectErr) {
    logger.error(
      {
        errCode: selectErr.code,
        errMsg: selectErr.message,
        slug,
        userId: user.id,
      },
      "봇 조회 실패 — restore action",
    );
    redirect("/bots/trash?error=select_failed");
  }
  if (!existing) {
    redirect("/bots/trash?error=not_found");
  }

  const { data: updated, error: updErr } = await supabase
    .from("bots")
    .update({ deleted_at: null })
    .eq("slug", slug)
    .not("deleted_at", "is", null)
    .select("id");

  if (updErr) {
    logger.error(
      {
        errCode: updErr.code,
        errMsg: updErr.message,
        slug,
        botId: existing.id,
        userId: user.id,
      },
      "봇 복구 실패",
    );
    redirect("/bots/trash?error=restore_failed");
  }
  if (!updated || updated.length === 0) {
    redirect("/bots/trash?error=not_found");
  }

  logger.info({ botId: existing.id, slug, userId: user.id }, "봇 복구 완료");

  // 감사 로그 — Epic B Task B-3. BOT_RESTORE 이벤트 신규.
  await logAuditEvent(supabase, {
    eventType: AUDIT_EVENTS.BOT_RESTORE,
    entityType: "bot",
    entityId: existing.id,
    actorId: user.id,
    metadata: { slug },
  });

  revalidatePath("/bots");
  revalidatePath("/bots/trash");
  redirect("/bots");
}

// ─── 봇 영구 삭제 (휴지통 전용) ─────────────────────────────────────────────

export type PermanentDeleteBotFormState = {
  error?: string;
};

/**
 * 봇 영구 삭제 Server Action (Epic B Task B-3, 기존 B-1 로직 이동).
 *
 * 휴지통(`/bots/trash`) 의 "영구 삭제" 버튼 → typed confirmation → 이 action.
 * **되돌릴 수 없음**. DB cascade + Storage cleanup.
 *
 * 방어 (5중):
 *   1. slug 형식 정규식.
 *   2. typed confirmation (`confirmName === bot.name`).
 *   3. 세션 `getUser()`.
 *   4. Rate limit (5 req/1h).
 *   5. RLS `bots_delete_owner` + **`.not("deleted_at", "is", null)`** 필터 (활성 봇 영구 삭제 차단).
 *
 * 삭제 순서 (B-1 과 동일):
 *   - Storage cleanup → DB DELETE 순. RLS 참조 유효 상태 유지.
 *
 * Cascade (DB): bots → conversations → messages / bots → knowledge_chunks.
 */
export async function permanentDeleteBotAction(
  slug: string,
  _prev: PermanentDeleteBotFormState,
  formData: FormData,
): Promise<PermanentDeleteBotFormState> {
  if (!isValidSlug(slug)) {
    return { error: "잘못된 봇 주소예요." };
  }

  const confirmName = String(formData.get("confirmName") ?? "").trim();
  if (confirmName.length === 0) {
    return { error: "봇 이름을 입력해 주세요." };
  }
  if (confirmName.length > 1024) {
    return { error: "입력값이 너무 길어요." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/bots/trash")}`);
  }

  const rl = await checkBotDeleteRatelimit(user.id);
  if (!rl.ok) {
    return {
      error:
        "삭제 요청이 너무 많아요. 잠시 후 다시 시도해 주세요. (1시간 안에 5회 제한)",
    };
  }

  // soft-deleted 봇만 영구 삭제 대상 (활성 봇 실수 영구 삭제 차단).
  const { data: existing, error: selectErr } = await supabase
    .from("bots")
    .select("id, name")
    .eq("slug", slug)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (selectErr) {
    logger.error(
      {
        errCode: selectErr.code,
        errMsg: selectErr.message,
        slug,
        userId: user.id,
      },
      "봇 조회 실패 — permanent delete action",
    );
    return {
      error: "봇 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!existing) {
    return { error: "휴지통에서 봇을 찾을 수 없어요." };
  }

  if (confirmName !== existing.name) {
    return { error: "봇 이름이 일치하지 않아요." };
  }

  // Storage cleanup (best-effort, DB 삭제 전).
  try {
    const { data: files, error: listErr } = await supabase.storage
      .from("knowledge-files")
      .list(existing.id, { limit: STORAGE_CLEANUP_LIST_LIMIT });

    if (listErr) {
      logger.warn(
        {
          errMsg: listErr.message,
          botId: existing.id,
          userId: user.id,
        },
        "Storage list 실패 — DB 삭제는 진행, orphan 잔존 가능",
      );
    } else if (files && files.length > 0) {
      const paths = files.map((f) => `${existing.id}/${f.name}`);
      const { error: rmErr } = await supabase.storage
        .from("knowledge-files")
        .remove(paths);
      if (rmErr) {
        logger.warn(
          {
            errMsg: rmErr.message,
            botId: existing.id,
            userId: user.id,
            count: paths.length,
          },
          "Storage remove 실패 — orphan 잔존 가능, Phase 2 sweeper 대상",
        );
      }
    }
  } catch (err) {
    logger.warn(
      {
        err,
        botId: existing.id,
        userId: user.id,
      },
      "Storage cleanup 예외 — DB 삭제는 진행",
    );
  }

  // DB DELETE — FK cascade 가 conversations/messages/knowledge_chunks 자동 정리.
  const { data: deleted, error: delErr } = await supabase
    .from("bots")
    .delete()
    .eq("slug", slug)
    .not("deleted_at", "is", null)
    .select("id");

  if (delErr) {
    logger.error(
      {
        errCode: delErr.code,
        errMsg: delErr.message,
        slug,
        botId: existing.id,
        userId: user.id,
      },
      "봇 permanent delete 실패",
    );
    return {
      error: "봇 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!deleted || deleted.length === 0) {
    return { error: "봇을 삭제할 권한이 없거나 이미 삭제되었어요." };
  }

  logger.info(
    {
      botId: existing.id,
      slug,
      userId: user.id,
    },
    "봇 영구 삭제 완료",
  );

  // 감사 로그 — Epic B Task B-3. entity_id 는 row 이미 삭제되어 dangling (B-2 교훈 참조).
  await logAuditEvent(supabase, {
    eventType: AUDIT_EVENTS.BOT_DELETE,
    entityType: "bot",
    entityId: existing.id,
    actorId: user.id,
    metadata: { slug, deleteMode: "permanent" },
  });

  revalidatePath("/bots");
  revalidatePath("/bots/trash");
  redirect("/bots/trash");
}
