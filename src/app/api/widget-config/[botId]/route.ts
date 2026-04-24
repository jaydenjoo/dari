import { type NextRequest, NextResponse } from "next/server";

import { dariConfigSchema, type DariConfig } from "@/core/config";
import { createAdminClient } from "@/core/db/client-admin";
import { logger } from "@/core/logging";
import { checkBotConfigRatelimit } from "@/core/ratelimit/bot-config-limiter";
import { sanitizeLoggableError } from "@/core/ratelimit/factory";
import { buildCorsHeaders } from "@/core/security/origin-check";
import { withAllowedOrigin } from "@/core/security/with-allowed-origin";

/**
 * 위젯 Config API — 위젯 번들이 부팅 시 봇별 UI 설정을 가져오는 anon 엔드포인트. (Task 1-6-d)
 *
 * Task β-4: bot 조회 + origin 검증 + rate limit + Retry-After 가 `withAllowedOrigin`
 * HOC 로 일원화. 본 라우트는 정상 통과 후 publicConfig 반환만 책임.
 *
 * 보안 레이어 (HOC + handler 합산):
 *   1. bot 조회 — service_role + `status='active'` 필터 + soft-delete 제외
 *   2. Origin 검증 — chat API 와 동일 정책
 *   3. Rate limit — botId 기준 1000 req/h (스크래핑 방어)
 *   4. 응답 화이트리스트 — `pickPublicConfig()` 단일 출처
 *   5. 캐싱 — `public, max-age=60, s-maxage=300` + Vary: Origin
 *   6. enumeration 방지 — bot 부존재 / origin 거부 모두 404 bot_not_available
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

const ERROR_MESSAGES = {
  internal_error: "잠시 후 다시 시도해 주세요.",
  bot_not_available: "해당 봇을 찾을 수 없어요.",
  too_many_requests: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
} as const;

type BotContext = { id: string; config: DariConfig };

async function loadActiveBot(botSlug: string): Promise<BotContext | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bots")
    .select("id, config")
    .eq("slug", botSlug)
    .eq("status", "active")
    // Task B-3: soft delete 봇은 위젯 설정 반환 안 함 (공개 API 404 → 위젯 비활성).
    .is("deleted_at", null)
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

export const GET = withAllowedOrigin<BotContext>(
  {
    loadBot: loadActiveBot,
    rateLimit: checkBotConfigRatelimit,
    errorMessages: ERROR_MESSAGES,
  },
  ({ bot, corsHeaders }) =>
    NextResponse.json(
      { widget: pickPublicConfig(bot.config) },
      {
        status: 200,
        headers: {
          ...corsHeaders,
          // 편집 UI 업데이트가 사용자에게 반영되는 상한: 5분 (CDN) / 1분 (브라우저).
          // 긴급 롤백은 봇 status 전환 ('active' → 'paused') 으로 응답 자체가 404 로 전환됨.
          "Cache-Control": "public, max-age=60, s-maxage=300",
        },
      },
    ),
);

// Preflight 는 DB 조회 없이 수용 — 실 access control 은 actual GET 에서 수행한다.
// 의도: preflight + actual 의 DB 2회 히트 제거. non-allowed origin 의 preflight 도 통과
// 시키지만, actual GET 이 `bot_not_available` (404) 로 일관 응답하므로 정보 유출 없음.
// `null` / 파싱 실패 origin 은 `buildCorsHeaders` 내부에서 `Allow-Origin` 미반환 → 브라우저 차단.
export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin, []);
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
