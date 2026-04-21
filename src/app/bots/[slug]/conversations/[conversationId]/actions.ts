"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/core/db/client-server";
import { logger } from "@/core/logging";
import { checkConversationDeleteRatelimit } from "@/core/ratelimit/conversation-delete-limiter";
import { isValidUuid } from "@/shared/conversations/meta";

import { isValidSlug } from "../../../new/slug-util";

export type DeleteConversationState = {
  error?: string;
};

/**
 * Task 1-8-d: 대화 단건 삭제 Server Action.
 *
 * 보안 방어 3중:
 *   1. slug / uuid 형식 정규식 — DB 왕복 전 조기 차단.
 *   2. bot 소유 확인 → conversation.bot_id === bot.id 재검증 (URL 조작 IDOR).
 *   3. RLS `conversations_delete_owner` (0012) — DB 레벨 최종 격리.
 *
 * messages 는 FK `on delete cascade` 로 자동 정리 — 별도 DELETE 정책 불필요.
 * Postgres 에러 메시지는 정적 문자열로 치환 — 내부 구조 노출 차단.
 * redirect 후 목록 페이지의 stale cache 는 revalidatePath 로 강제 갱신.
 */
export async function deleteConversationAction(
  _prev: DeleteConversationState | undefined,
  formData: FormData,
): Promise<DeleteConversationState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "").trim();

  if (!isValidSlug(slug) || !isValidUuid(conversationId)) {
    return { error: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  // Rate limit (Epic B Task B-1) — 자동화 대량 삭제 방어. 10 req / 5 min user.id.
  const rl = await checkConversationDeleteRatelimit(user.id);
  if (!rl.ok) {
    return {
      error:
        "삭제 요청이 너무 많아요. 잠시 후 다시 시도해 주세요. (5분 안에 10회 제한)",
    };
  }

  const { data: bot, error: botErr } = await supabase
    .from("bots")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (botErr) {
    logger.error(
      {
        errCode: botErr.code,
        errMsg: botErr.message,
        slug,
        userId: user.id,
      },
      "bot 조회 실패 — 대화 삭제 action",
    );
    return { error: "대화를 삭제하지 못했습니다." };
  }
  if (!bot) {
    return { error: "대화를 삭제하지 못했습니다." };
  }

  // bot_id 재검증 — RLS 만으로는 같은 owner 의 다른 bot 경유 삭제가 통과.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, bot_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) {
    logger.error(
      {
        errCode: convErr.code,
        errMsg: convErr.message,
        conversationId,
        userId: user.id,
      },
      "conversation 조회 실패 — 대화 삭제 action",
    );
    return { error: "대화를 삭제하지 못했습니다." };
  }
  if (!conv || conv.bot_id !== bot.id) {
    return { error: "대화를 삭제하지 못했습니다." };
  }

  const { error: delErr } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  if (delErr) {
    logger.error(
      {
        errCode: delErr.code,
        errMsg: delErr.message,
        conversationId,
        botId: bot.id,
        userId: user.id,
      },
      "conversation DELETE 실패",
    );
    return { error: "대화를 삭제하지 못했습니다." };
  }

  logger.info(
    { conversationId, botId: bot.id, userId: user.id },
    "conversation 삭제 완료",
  );

  // 목록 페이지 stale cache 무효화 + 리다이렉트 (서버 고정 경로 — open redirect 방어).
  revalidatePath(`/bots/${slug}/conversations`);
  redirect(`/bots/${slug}/conversations`);
}
