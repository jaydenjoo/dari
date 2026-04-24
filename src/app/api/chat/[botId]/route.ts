import { createHash, randomUUID } from "node:crypto";

import { streamText } from "ai";
import { after, type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAnthropicProvider } from "@/core/ai/anthropic-provider";
import { dariConfigSchema, type DariConfig } from "@/core/config";
import { createAdminClient } from "@/core/db/client-admin";
import {
  augmentSystemPromptWithKnowledge,
  retrieveRelevantChunks,
} from "@/core/knowledge";
import { logger } from "@/core/logging";
import { checkBotChatRatelimit } from "@/core/ratelimit/bot-chat-limiter";
import { sanitizeLoggableError } from "@/core/ratelimit/factory";
import { resolveClientIp } from "@/core/ratelimit/login-limiter";
import {
  buildCorsHeaders,
  matchAllowedDomain,
} from "@/core/security/origin-check";

// Node runtime 명시 — Supabase admin client 이 @supabase/ssr + pg 드라이버 경로
// (Edge 런타임 비호환 가능) 를 경유할 수 있어 안정성 우선. streamText 는 양쪽 호환.
export const runtime = "nodejs";

// streamText + RAG + Anthropic 호출 latency 상한. Vercel Hobby 10s / Pro 60s 기본.
// 응답 생성 중 타임아웃 시 AI SDK 가 stream 을 닫고 클라는 network_error 수신.
export const maxDuration = 30;

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
 * Phase 2 Epic A Task A-4:
 *   - 응답 방식: Vercel AI SDK Data Stream Protocol (UIMessageStream SSE)
 *   - 모델 호출: `streamText()` + `@ai-sdk/anthropic` provider
 *   - RAG: `match_knowledge_chunks` 청크 → XML 태그로 system 프롬프트 증강 (실패 시 빈 배열 fallback)
 *   - conversationId: 응답 `x-conversation-id` 헤더로 전달 (클라가 헤더에서 읽음)
 *   - assistant 저장: `onFinish({ text })` 콜백에서 DB insert
 *   - Preflight OPTIONS 분기 지원
 *
 * 보안 레이어 (6중, streamText 전환 후에도 유지):
 *   1. bot 조회 — service_role 경유 + `status='active'` 필터 (RLS 우회 안전, soft-delete 차단)
 *   2. Origin 검증 — `matchAllowedDomain` (Task 1-0-b 유틸)
 *   3. Rate limit — `${botId}:${ip}` 봇당 IP 100/h (Task 1-0-a factory 재사용)
 *   4. conversationId 소유권 — `conversation.bot_id === bot.id` 불일치 시 재생성
 *   5. 응답에 systemPrompt/config 원문 미노출 — `onError` 로 에러 상세도 차단
 *   6. 에러 메시지 enumeration 방지 — 봇 부존재 / RLS 차단 / 포맷 오류 모두 일반 메시지
 *   7. max_tokens clamp — `CHAT_MAX_OUTPUT_TOKENS` 로 소유자 설정값 상한 강제
 */

const requestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

type ErrorCode =
  | "internal_error"
  | "bot_not_available"
  | "too_many_requests"
  | "invalid_body"
  | "upstream_error";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  internal_error: "잠시 후 다시 시도해 주세요.",
  bot_not_available: "해당 봇을 찾을 수 없어요.",
  too_many_requests: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  invalid_body: "요청 형식이 올바르지 않아요.",
  upstream_error: "응답을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
};

/**
 * IP 해시화 — 로그 컨텍스트에 raw IP 대신 SHA-256 prefix 8자.
 *
 * 🟡 프로젝트는 IP 를 PIPA·GDPR 식별 가능 정보로 다룬다 (sensitiveFields.ts 'ip').
 * 동일 IP 의 반복 시도 추적 가치는 유지하면서 raw 노출을 방어. (security N-4)
 */
function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 8);
}

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
    // Task B-3: soft delete 봇은 공개 채팅 API 에서 404. status='active' 필터만으로는
    // 누락될 수 있어 방어선 추가 (status 와 deleted_at 는 독립 축).
    .is("deleted_at", null)
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
): Promise<Response> {
  const { botId: botSlug } = await params;
  const origin = req.headers.get("origin");
  const clientIp = resolveClientIp(req.headers);

  const bot = await loadActiveBot(botSlug);
  if (!bot) {
    return jsonError("bot_not_available", 404, origin, []);
  }

  if (!matchAllowedDomain(origin, bot.config.allowedDomains)) {
    // origin 거부도 bot 부존재와 동일 응답으로 위장 — widget-config API (sec H-1) 와
    // 정합성 통일. HTTP status + response code 둘 다 통일해 공격자가 응답을 파싱해도
    // "slug 존재 하지만 origin 차단" vs "slug 부존재" 를 구분 불가 (enumeration 방지).
    return jsonError(
      "bot_not_available",
      404,
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
    hashClientIp(clientIp),
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

  // RAG: 사용자 메시지 → 임베딩 → 상위 K 청크. 실패 시 빈 배열 반환(내부 warn 로깅)
  // → 기존 systemPrompt 로 fallback. chat 자체는 중단되지 않는다.
  const chunks = await retrieveRelevantChunks(bot.id, message);
  logger.debug(
    { botId: bot.id, chunkCount: chunks.length },
    "RAG chunks retrieved",
  );

  // Chat API 레이어에서 max_tokens clamp — 소유자 설정값과 무관하게 상한 강제 (security M-3)
  const maxOutputTokens = Math.min(
    bot.config.ai.maxTokens,
    CHAT_MAX_OUTPUT_TOKENS,
  );
  // RAG 청크 비어있으면 원본 systemPrompt 반환 (augment 내부 분기)
  const system = augmentSystemPromptWithKnowledge(
    bot.config.ai.systemPrompt,
    chunks,
  );

  const result = streamText({
    model: getAnthropicProvider()(bot.config.ai.model),
    system,
    messages: [{ role: "user", content: message }],
    maxOutputTokens,
    temperature: bot.config.ai.temperature,
  });

  // assistant 메시지 DB insert — Vercel 서버리스 lifecycle 보장을 위해 `after()` 사용.
  // streamText 의 `onFinish` 콜백은 응답 flush 이후 실행이 보장 안 될 수 있어
  // (Vercel 문서 `waitUntil` 없는 Promise), Next 16 의 `after()` API 로 인프라 레벨 보장.
  // `result.text` 는 스트림 소비 완료 후 resolve (에러 발생 시 reject → try/catch 로 흡수).
  // 클라가 스트림 중간에 abort 해도 AI SDK 는 서버 측 파이프를 유지하므로 partial 이라도 저장.
  // (리뷰 code H-1 / sec M-2 반영)
  after(async () => {
    try {
      const finalText = await result.text;
      // 새 admin 인스턴스 — 기존 `admin` 이 응답 flush 시점에 이미 HTTP 연결 정리됐을 수 있음
      // (리뷰 code M-1 반영)
      const adminForAfter = createAdminClient();
      const { error: assistantMsgError } = await adminForAfter
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role: "assistant",
          content: finalText,
        });
      if (assistantMsgError) {
        logger.error(
          { err: sanitizeLoggableError(assistantMsgError) },
          "assistant message insert 실패 (after)",
        );
      }
    } catch (err) {
      // streamText 가 throw 하거나 Anthropic APIError 등 — stream `onError` 에서도
      // 이미 logger.error 로 기록됐지만 여기선 after() 콘텍스트 추적용.
      logger.error(
        { err: sanitizeLoggableError(err), botId: bot.id },
        "after() 중 assistant 저장 실패 (stream 에러 경로)",
      );
    }
  });

  return result.toUIMessageStreamResponse({
    headers: {
      ...buildCorsHeaders(origin, bot.config.allowedDomains),
      "x-conversation-id": conversationId,
      // cross-origin 에서 JS 가 custom 헤더를 읽으려면 필수 (브라우저 CORS 정책)
      "Access-Control-Expose-Headers": "x-conversation-id",
    },
    // Anthropic SDK APIError 등 stream 중 에러는 Authorization 헤더·API 키·쿼리 파편을
    // message 에 포함할 수 있어, 클라에 내려보내는 에러 payload 는 정적 문자열로 통일.
    // (security N-7 — 에러 enumeration 방지) logger.error 에서만 sanitize 후 전체 기록.
    onError: (err) => {
      logger.error(
        { err: sanitizeLoggableError(err), botId: bot.id },
        "stream 중 upstream 에러",
      );
      // 클라 파서는 이 문자열을 `upstream_error` 코드로 매핑 (chat.ts 의 화이트리스트)
      return "upstream_error";
    },
  });
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
  clientIpHash: string,
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
        {
          requestedConvId,
          actualBotId: existing.bot_id,
          expectedBotId: botId,
          ipHash: clientIpHash,
        },
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

  // visitor_id 필수 — conversations 테이블의 has_identity 제약 (visitor_id IS NOT NULL
  // OR user_id IS NOT NULL) 충족. anon 위젯은 user_id 없음 → 서버 생성 UUID. (M-1)
  const { data: created, error: createError } = await admin
    .from("conversations")
    .insert({ bot_id: botId, visitor_id: randomUUID() })
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

// Preflight 는 DB 조회 없이 수용 — 실 access control 은 actual POST 에서 수행한다.
// 의도: preflight + actual 의 DB 2회 히트 제거. non-allowed origin 의 preflight 도 통과
// 시키지만, actual POST 에서 `matchAllowedDomain` 으로 404 차단되므로 정보 유출 없음.
// `null` / 파싱 실패 origin 은 `buildCorsHeaders` 내부에서 `Allow-Origin` 헤더 미반환 →
// 브라우저가 preflight 거부 (non-browser curl 은 서버 검증 없이 지나가도 actual POST 가 차단).
export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin, []);
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
