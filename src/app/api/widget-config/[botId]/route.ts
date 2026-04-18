import { type NextRequest, NextResponse } from "next/server";

import { dariConfigSchema, type DariConfig } from "@/core/config";
import { createAdminClient } from "@/core/db/client-admin";
import { logger } from "@/core/logging";
import { checkBotConfigRatelimit } from "@/core/ratelimit/bot-config-limiter";
import { sanitizeLoggableError } from "@/core/ratelimit/factory";
import { resolveClientIp } from "@/core/ratelimit/login-limiter";
import {
  buildCorsHeaders,
  matchAllowedDomain,
} from "@/core/security/origin-check";

/**
 * 위젯 Config API — 위젯 번들이 부팅 시 봇별 UI 설정을 가져오는 anon 엔드포인트. (Task 1-6-d)
 *
 * 보안 레이어:
 *   1. bot 조회 — service_role + `status='active'` 필터
 *   2. Origin 검증 — chat API 와 동일 정책 (`matchAllowedDomain`)
 *   3. Rate limit — botId 기준 1000 req/h (스크래핑 방어, IP 기준 아님)
 *   4. 응답 화이트리스트 — systemPrompt / knowledge / allowedDomains / webhooks 등
 *      민감 필드는 절대 노출하지 않는다. `pickPublicConfig()` 단일 출처.
 *   5. 캐싱 — `public, max-age=60, s-maxage=300` + Vary: Origin (편집 반영은 최대 5분 지연)
 *
 * 실패 경로:
 *   - 봇 부존재 / origin 거부 / rate limit 초과: 모두 404 계열로 위장 (enumeration 방지)
 *   - 서버 오류: 500 (위젯은 silent fail 후 기본 UI 로 구동)
 */

interface WidgetPublicConfig {
  readonly name: string;
  readonly welcomeMessage: string;
  readonly placeholder: string;
  readonly language: "ko" | "en" | "ja" | "zh";
  readonly avatar?: string;
  readonly primaryColor: string;
  readonly position: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  readonly buttonSize: number;
  readonly borderRadius: number;
  readonly fontFamily: string;
}

/** DariConfig 에서 위젯에 노출해도 안전한 필드만 골라낸다 (화이트리스트). */
function pickPublicConfig(config: DariConfig): WidgetPublicConfig {
  return {
    name: config.identity.name,
    welcomeMessage: config.identity.welcomeMessage,
    placeholder: config.identity.placeholder,
    language: config.identity.language,
    ...(config.identity.avatar ? { avatar: config.identity.avatar } : {}),
    primaryColor: config.appearance.primaryColor,
    position: config.appearance.position,
    buttonSize: config.appearance.buttonSize,
    borderRadius: config.appearance.borderRadius,
    fontFamily: config.appearance.fontFamily,
  };
}

type ErrorCode = "internal_error" | "bot_not_available" | "too_many_requests";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  internal_error: "잠시 후 다시 시도해 주세요.",
  bot_not_available: "해당 봇을 찾을 수 없어요.",
  too_many_requests: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
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
      "bot 조회 실패 (widget-config)",
    );
    return null;
  }
  if (!data) return null;

  const parsed = dariConfigSchema.safeParse(data.config);
  if (!parsed.success) {
    logger.error(
      { botSlug, botId: data.id, issueCount: parsed.error.issues.length },
      "bot config 파싱 실패 (widget-config)",
    );
    return null;
  }
  return { id: data.id, config: parsed.data };
}

export async function GET(
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
    // sec H-1: origin 거부도 bot 부존재와 동일 응답으로 위장해 slug enumeration 차단.
    // HTTP status + response code 둘 다 통일 — 공격자가 응답을 파싱해도 구분 불가.
    return jsonError(
      "bot_not_available",
      404,
      origin,
      bot.config.allowedDomains,
    );
  }

  const rl = await checkBotConfigRatelimit(bot.id, clientIp);
  if (!rl.ok) {
    return jsonError(
      "too_many_requests",
      429,
      origin,
      bot.config.allowedDomains,
    );
  }

  const publicConfig = pickPublicConfig(bot.config);

  return NextResponse.json(
    { widget: publicConfig },
    {
      status: 200,
      headers: {
        ...buildCorsHeaders(origin, bot.config.allowedDomains),
        // 편집 UI 업데이트가 사용자에게 반영되는 상한: 5분 (CDN) / 1분 (브라우저).
        // 긴급 롤백은 봇 status 전환 ('active' → 'paused') 으로 응답 자체가 404 로 전환됨.
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    },
  );
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });
}
