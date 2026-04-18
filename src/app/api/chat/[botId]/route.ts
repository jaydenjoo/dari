import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAnthropicClient } from "@/core/ai/anthropic-client";
import { dariConfigSchema, type DariConfig } from "@/core/config";
import { createAdminClient } from "@/core/db/client-admin";
import { logger } from "@/core/logging";
import { checkBotChatRatelimit } from "@/core/ratelimit/bot-chat-limiter";
import { sanitizeLoggableError } from "@/core/ratelimit/factory";
import { resolveClientIp } from "@/core/ratelimit/login-limiter";
import {
  buildCorsHeaders,
  matchAllowedDomain,
} from "@/core/security/origin-check";

// Chat API 레이어의 추가 하한. bot config 의 maxTokens 는 소유자 설정이지만,
// allowedDomains 빈 배열(=allow-all) + 공개 노출 상태에서 100 req/h × 8192 = 819K 토큰/h/봇
// 까지 비용 노출될 수 있어 레이어에서 한 번 더 clamp. Phase 2 과금 모델 설계 시 재조정. (security M-3)
const CHAT_MAX_OUTPUT_TOKENS = 2048;

// conversation 당 누적 메시지 수 상한. 초과 시 새 conversation 으로 전환해
// 단일 conversation 에 무한 누적되는 저장 공격을 차단. (security M-2)
const MAX_MESSAGES_PER_CONVERSATION = 200;

/**
 * 위젯 Chat API — anon origin 접근 허용 엔드포인트.
 *
 * Phase 1 최소 구현 (Task 1-6-a):
 *   - 응답 방식: JSON 단일 (스트리밍은 1-6-d 또는 Phase 2)
 *   - RAG 없음 (Task 1-6-c 에서 knowledge_chunks 연결)
 *   - Preflight OPTIONS 분기 지원
 *
 * 보안 레이어 (6중):
 *   1. bot 조회 — service_role 경유 + `status='active'` 필터 (RLS 우회 안전, soft-delete 차단)
 *   2. Origin 검증 — `matchAllowedDomain` (Task 1-0-b 유틸 첫 실증)
 *   3. Rate limit — `${botId}:${ip}` 봇당 IP 100/h (Task 1-0-a factory 재사용)
 *   4. conversationId 소유권 — `conversation.bot_id === bot.id` 불일치 시 재생성
 *   5. 응답에 systemPrompt 등 config 원문 미노출 — assistant text 만 반환
 *   6. 에러 메시지 enumeration 방지 — 봇 부존재 / RLS 차단 / 포맷 오류 모두 일반 메시지
 */

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

type ErrorCode =
  | "internal_error"
  | "bot_not_available"
  | "origin_not_allowed"
  | "too_many_requests"
  | "invalid_body"
  | "upstream_error";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  internal_error: "잠시 후 다시 시도해 주세요.",
  bot_not_available: "해당 봇을 찾을 수 없어요.",
  origin_not_allowed: "이 도메인에서는 접근할 수 없어요.",
  too_many_requests: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  invalid_body: "요청 형식이 올바르지 않아요.",
  upstream_error: "응답을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
};

function jsonError(
  code: ErrorCode,
  status: number,
  origin: string | null,
  allowedDomains: readonly string[],
): NextResponse {
  return NextResponse.json(
    { error: ERROR_MESSAGES[code], code },
    { status, headers: buildCorsHeaders(origin, allowedDomains) },
  );
}

type BotContext = { id: string; config: DariConfig };

/**
 * bot 조회 + config parse. 존재·활성·config 유효성 검증 실패 모두 null 반환 (일반화).
 * caller 는 null 이면 `bot_not_available` 404 로 응답.
 */
async function loadActiveBot(botSlug: string): Promise<BotContext | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bots")
    .select("id, config")
    .eq("slug", botSlug)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    logger.error(
      { err: sanitizeLoggableError(error), botSlug },
      "bot 조회 실패",
    );
    return null;
  }
  if (!data) return null;

  const parsed = dariConfigSchema.safeParse(data.config);
  if (!parsed.success) {
    logger.error(
      { botSlug, botId: data.id, issueCount: parsed.error.issues.length },
      "bot config 파싱 실패 — 저장값이 스키마 최신과 불일치",
    );
    return null;
  }
  return { id: data.id, config: parsed.data };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
): Promise<NextResponse> {
  const { botId: botSlug } = await params;
  const origin = req.headers.get("origin");
  const clientIp = resolveClientIp(req.headers);

  const bot = await loadActiveBot(botSlug);
  if (!bot) {
    return jsonError("bot_not_available", 404, origin, []);
  }

  if (!matchAllowedDomain(origin, bot.config.allowedDomains)) {
    return jsonError(
      "origin_not_allowed",
      403,
      origin,
      bot.config.allowedDomains,
    );
  }

  const rl = await checkBotChatRatelimit(bot.id, clientIp);
  if (!rl.ok) {
    return jsonError(
      "too_many_requests",
      429,
      origin,
      bot.config.allowedDomains,
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonError("invalid_body", 400, origin, bot.config.allowedDomains);
  }
  const parsed = requestSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return jsonError("invalid_body", 400, origin, bot.config.allowedDomains);
  }

  const { message, conversationId: requestedConvId } = parsed.data;
  const admin = createAdminClient();

  const conversationId = await resolveConversationId(
    admin,
    bot.id,
    requestedConvId,
  );
  if (!conversationId) {
    return jsonError("internal_error", 500, origin, bot.config.allowedDomains);
  }

  const { error: userMsgError } = await admin.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: message,
  });
  if (userMsgError) {
    logger.error(
      { err: sanitizeLoggableError(userMsgError) },
      "user message insert 실패",
    );
    return jsonError("internal_error", 500, origin, bot.config.allowedDomains);
  }

  const assistantText = await callAnthropic(bot, message);
  if (assistantText === null) {
    return jsonError("upstream_error", 502, origin, bot.config.allowedDomains);
  }

  // assistant 메시지 저장 실패는 사용자에게 에러로 노출하지 않음 (이미 응답 준비됨).
  // 운영 추적용 logger.error 만.
  const { error: assistantMsgError } = await admin.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: assistantText,
  });
  if (assistantMsgError) {
    logger.error(
      { err: sanitizeLoggableError(assistantMsgError) },
      "assistant message insert 실패",
    );
  }

  return NextResponse.json(
    { conversationId, message: assistantText },
    {
      status: 200,
      headers: buildCorsHeaders(origin, bot.config.allowedDomains),
    },
  );
}

/**
 * conversationId 결정 — 요청에 있고 소유권 일치 + 메시지 상한 미초과면 재사용, 아니면 새로 생성.
 * DB 오류 시 null 반환 (caller 는 500 응답).
 *
 * 소유권 검증: `conversation.bot_id !== bot.id` 면 타인 대화를 훔치려는 시도로 간주,
 * 조용히 새 conversation 을 생성해 원본에 영향 없게 하되 `logger.warn` 으로 비정상 신호 기록.
 *
 * 메시지 상한: 한 conversation 에 `MAX_MESSAGES_PER_CONVERSATION` 도달 시에도 새로 생성.
 * 단일 대화에 무한 누적되어 저장 공격으로 전환되는 경로 차단 (security M-2).
 */
async function resolveConversationId(
  admin: ReturnType<typeof createAdminClient>,
  botId: string,
  requestedConvId: string | undefined,
): Promise<string | null> {
  if (requestedConvId) {
    const { data: existing, error: readError } = await admin
      .from("conversations")
      .select("id, bot_id")
      .eq("id", requestedConvId)
      .maybeSingle();
    if (readError) {
      logger.error(
        { err: sanitizeLoggableError(readError) },
        "conversation 조회 실패",
      );
      return null;
    }
    if (!existing) {
      // 존재하지 않는 UUID 는 조용히 새 대화 생성 (공격 벡터로 보기엔 false positive 많음)
    } else if (existing.bot_id !== botId) {
      logger.warn(
        { requestedConvId, actualBotId: existing.bot_id, expectedBotId: botId },
        "conversationId bot_id 불일치 — 새 conversation 생성",
      );
    } else {
      const { count, error: countError } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", existing.id);
      if (countError) {
        logger.error(
          {
            err: sanitizeLoggableError(countError),
            conversationId: existing.id,
          },
          "messages count 실패",
        );
        return null;
      }
      if ((count ?? 0) < MAX_MESSAGES_PER_CONVERSATION) {
        return existing.id;
      }
      logger.warn(
        { conversationId: existing.id, count },
        "conversation 메시지 상한 도달 — 새 conversation 으로 전환",
      );
    }
  }

  const { data: created, error: createError } = await admin
    .from("conversations")
    .insert({ bot_id: botId })
    .select("id")
    .maybeSingle();
  if (createError || !created) {
    logger.error(
      { err: sanitizeLoggableError(createError), botId },
      "conversation 생성 실패",
    );
    return null;
  }
  return created.id;
}

/**
 * Anthropic 호출 — 실패는 null 반환 (caller 는 502). RAG 는 Task 1-6-c 에서 추가.
 *
 * ContentBlock 은 text / tool_use / thinking 등 union. 우리는 text 만 필요하므로
 * 첫 text 블록을 찾아 반환 (도구/사고 블록은 스킵).
 */
async function callAnthropic(
  bot: BotContext,
  message: string,
): Promise<string | null> {
  // Chat API 레이어에서 max_tokens clamp — 소유자 설정값과 무관하게 상한 강제 (security M-3)
  const maxTokens = Math.min(bot.config.ai.maxTokens, CHAT_MAX_OUTPUT_TOKENS);
  try {
    const completion = await getAnthropicClient().messages.create({
      model: bot.config.ai.model,
      max_tokens: maxTokens,
      temperature: bot.config.ai.temperature,
      system: bot.config.ai.systemPrompt,
      messages: [{ role: "user", content: message }],
    });
    for (const block of completion.content) {
      if (block.type === "text") return block.text;
    }
    return "";
  } catch (err) {
    // Anthropic SDK 의 APIError 는 Authorization 헤더·API 키 값을 message 에 포함할 수 있어
    // sanitizeLoggableError 로 URL/토큰 마스킹 후 기록 (security M-1 반영).
    logger.error(
      { err: sanitizeLoggableError(err), botId: bot.id },
      "Anthropic 호출 실패",
    );
    return null;
  }
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
): Promise<NextResponse> {
  const { botId: botSlug } = await params;
  const origin = req.headers.get("origin");

  const bot = await loadActiveBot(botSlug);
  const allowedDomains = bot?.config.allowedDomains ?? [];

  const corsHeaders = buildCorsHeaders(origin, allowedDomains);
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });
}
