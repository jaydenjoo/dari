import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import type { DariConfig } from "@/core/config";
import { resolveClientIp } from "@/core/ratelimit/login-limiter";
import type { RatelimitCheck } from "@/core/ratelimit/factory";
import { computeRetryAfterSeconds } from "@/shared/time/retry-after";

import { buildCorsHeaders, matchAllowedDomain } from "./origin-check";

// 선제 안전망 re-export (β-5): 현재 외부 소비자 0. 신규 코드는 `@/shared/time/retry-after` 직접 import 권장.
// Phase 3 정리 시점에 제거 후보 (code LOW 이월).
export { computeRetryAfterSeconds };

/**
 * 위젯 엔드포인트 공통 가드 (Task β-4).
 *
 * Chat / widget-config 두 라우트가 동일하게 수행하던 4단 (bot 조회 → origin 검증 →
 * rate limit → CORS 헤더 빌드) 을 HOC 로 일원화. handler 는 검증 통과 후 호출되며
 * `bot` / `origin` / `clientIp` / `corsHeaders` 컨텍스트를 인자로 받는다.
 *
 * 일관성:
 *   - 봇 부존재 / origin 거부 모두 `bot_not_available` 404 (enumeration 방지)
 *   - 429 응답에 `Retry-After` 헤더 자동 주입 (RFC 6585, Upstash reset 활용)
 *   - CORS 헤더는 거부/허용 모두 `Vary: Origin` 포함
 *
 * 호출자가 주입:
 *   - `loadBot(slug)` — DB 조회 + config parse + soft-delete 필터. null = 부존재.
 *   - `rateLimit(botId, ip)` — limiter 함수. `RatelimitCheck` 반환.
 *   - `errorMessages` — 라우트별 노출 문구. 정적 메시지 (i18n 시드).
 *
 * 적용 안 함 (라우트 자체 책임):
 *   - body parsing / Zod 검증 (chat 만 해당)
 *   - conversationId 결정 / DB insert / streamText 호출 등 비즈니스 로직
 *   - 응답 본문 (handler 가 NextResponse 직접 반환)
 */

export type AllowedOriginErrorCode =
  | "bot_not_available"
  | "too_many_requests"
  | "internal_error";

export type AllowedOriginErrorMessages = Readonly<
  Record<AllowedOriginErrorCode, string>
>;

export type AllowedOriginContext<TBot> = Readonly<{
  bot: TBot;
  origin: string | null;
  clientIp: string;
  corsHeaders: Record<string, string>;
}>;

export type AllowedOriginHandler<TBot> = (
  ctx: AllowedOriginContext<TBot>,
  req: NextRequest,
) => Promise<Response> | Response;

export type AllowedOriginOptions<
  TBot extends { id: string; config: DariConfig },
> = Readonly<{
  loadBot: (slug: string) => Promise<TBot | null>;
  rateLimit: (botId: string, ip: string) => Promise<RatelimitCheck>;
  errorMessages: AllowedOriginErrorMessages;
}>;

type RouteContext = { params: Promise<{ botId: string }> };

function jsonError(
  code: AllowedOriginErrorCode,
  status: number,
  origin: string | null,
  allowedDomains: readonly string[],
  messages: AllowedOriginErrorMessages,
  retryAfterSec?: number,
): NextResponse {
  const headers: Record<string, string> = {
    ...buildCorsHeaders(origin, allowedDomains),
  };
  if (retryAfterSec !== undefined) {
    headers["Retry-After"] = String(retryAfterSec);
  }
  return NextResponse.json(
    { error: messages[code], code },
    { status, headers },
  );
}

export function withAllowedOrigin<
  TBot extends { id: string; config: DariConfig },
>(
  options: AllowedOriginOptions<TBot>,
  handler: AllowedOriginHandler<TBot>,
): (req: NextRequest, ctx: RouteContext) => Promise<Response> {
  return async (req, { params }) => {
    const { botId: botSlug } = await params;
    const origin = req.headers.get("origin");
    const clientIp = resolveClientIp(req.headers);

    // code M-1 (β-4 리뷰): loadBot throw 시 500 internal_error 반환.
    // 기존엔 throw 가 라우트 핸들러를 그대로 빠져나가 Next.js 500 페이지 (HTML)
    // 가 위젯 클라이언트에 전달될 수 있었음. 정형 JSON 응답으로 일관 처리.
    let bot: TBot | null;
    try {
      bot = await options.loadBot(botSlug);
    } catch {
      return jsonError(
        "internal_error",
        500,
        origin,
        [],
        options.errorMessages,
      );
    }
    if (!bot) {
      return jsonError(
        "bot_not_available",
        404,
        origin,
        [],
        options.errorMessages,
      );
    }

    if (!matchAllowedDomain(origin, bot.config.allowedDomains)) {
      return jsonError(
        "bot_not_available",
        404,
        origin,
        bot.config.allowedDomains,
        options.errorMessages,
      );
    }

    const rl = await options.rateLimit(bot.id, clientIp);
    if (!rl.ok) {
      return jsonError(
        "too_many_requests",
        429,
        origin,
        bot.config.allowedDomains,
        options.errorMessages,
        computeRetryAfterSeconds(rl.reset),
      );
    }

    // 성공 경로 CORS 헤더. 실패 경로는 `jsonError` 가 자체 호출 — 두 경로는 상호
    // 배타 (런타임 중복 0). 실패 경로별 allowedDomains 인자가 달라 (bot load 실패=`[]` /
    // 그 외=`bot.config.allowedDomains`) 통합 시 정확성 손실 위험 → 분기 유지 (β-5 code L-1).
    const corsHeaders = buildCorsHeaders(origin, bot.config.allowedDomains);
    return handler({ bot, origin, clientIp, corsHeaders }, req);
  };
}
