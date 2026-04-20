import { NextResponse } from "next/server";

import {
  buildConversationCsv,
  type CsvMessageRow,
} from "@/app/bots/[slug]/conversations/[conversationId]/csv-util";
import { isValidUuid } from "@/app/bots/[slug]/conversations/[conversationId]/meta-util";
import { createClient } from "@/core/db/client-server";
import { logger } from "@/core/logging";

/**
 * Task 1-8-d: 대화 CSV export API.
 *
 * GET /api/conversations/{conversationId}/export
 *
 * 보안:
 *   - UUID 형식 검증 (DB 왕복 전 차단).
 *   - auth.getUser() 로 세션 확인. RLS 2-hop (messages → conv → bots.owner_id).
 *   - CSV injection 방어는 `buildConversationCsv` 단계에서 처리.
 *   - 파일명 은 conversation.id 의 prefix 8자 — 방문자 이메일/slug 미포함.
 *   - 5000 메시지 상한 DoS 가드.
 *
 * 응답:
 *   - 200: text/csv; charset=utf-8 (UTF-8 BOM 내장 → Excel 한글 OK).
 *   - 401: 비로그인.
 *   - 404: 잘못된 UUID / 존재하지 않음 / 권한 없음.
 *   - 500: 내부 에러 (정적 메시지).
 */

const CSV_MESSAGE_LIMIT = 5000;

type ConvStatus = "active" | "closed" | "handed_off";
const STATUS_LABEL: Record<ConvStatus, string> = {
  active: "진행 중",
  closed: "종료",
  handed_off: "담당자 이관",
};

// 1-8-a/b 와 동일 로직. 공통화는 후속 Task 에서.
function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx <= 0) return "***";
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  if (local.length === 1) return `***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  if (!isValidUuid(conversationId)) {
    return jsonError("not_found", 404);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("unauthorized", 401);
  }

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, bot_id, visitor_id, user_id, email, status, created_at")
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
      "conversation 조회 실패 — CSV export",
    );
    return jsonError("internal_error", 500);
  }
  if (!conv) {
    // RLS 로 걸러진 경우 포함 — "존재하지 않음" 과 "권한 없음" 을 구분하지 않음.
    return jsonError("not_found", 404);
  }

  const { data: bot, error: botErr } = await supabase
    .from("bots")
    .select("name")
    .eq("id", conv.bot_id)
    .maybeSingle();
  if (botErr || !bot) {
    logger.error(
      {
        errCode: botErr?.code,
        errMsg: botErr?.message,
        botId: conv.bot_id,
        userId: user.id,
      },
      "bot 이름 조회 실패 — CSV export",
    );
    return jsonError("internal_error", 500);
  }

  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("role, content, tokens_used, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(CSV_MESSAGE_LIMIT);

  if (msgErr) {
    logger.error(
      {
        errCode: msgErr.code,
        errMsg: msgErr.message,
        conversationId,
        userId: user.id,
      },
      "messages 조회 실패 — CSV export",
    );
    return jsonError("internal_error", 500);
  }

  const messages: CsvMessageRow[] = (msgs ?? []).map((m) => ({
    role: m.role,
    content: m.content,
    tokens_used: m.tokens_used,
    created_at: m.created_at,
  }));

  const truncated = messages.length >= CSV_MESSAGE_LIMIT;
  if (truncated) {
    logger.warn(
      {
        conversationId,
        userId: user.id,
        fetched: messages.length,
        limit: CSV_MESSAGE_LIMIT,
      },
      "CSV export 메시지 상한 도달 — 일부 누락 가능",
    );
  }

  const statusLabel: string =
    STATUS_LABEL[conv.status as ConvStatus] ?? String(conv.status);
  const visitorLabel = conv.email
    ? maskEmail(conv.email)
    : conv.user_id
      ? "로그인 방문자"
      : "익명 방문자";

  const csv = buildConversationCsv(messages, {
    botName: bot.name,
    conversationId: conv.id,
    visitorLabel,
    statusLabel,
    startedAt: conv.created_at,
    // truncation 투명성: CSV 파일 자체에도 알림 행 추가 (code M-3).
    truncationNotice: truncated
      ? `메시지 ${CSV_MESSAGE_LIMIT.toLocaleString("ko-KR")}개 상한 도달 — 일부 누락`
      : undefined,
  });

  // 파일명은 ASCII 로 제한 (HTTP 헤더 안전). id prefix 8자 만으로 충분 고유.
  const filename = `dari-conversation-${conv.id.slice(0, 8)}.csv`;

  const headers: Record<string, string> = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
  if (truncated) {
    // 프로그램적 확인용 — 클라이언트 스크립트가 truncation 감지 가능 (code M-3).
    headers["X-Truncated"] = "true";
    headers["X-Truncated-Limit"] = String(CSV_MESSAGE_LIMIT);
  }

  return new NextResponse(csv, { status: 200, headers });
}
