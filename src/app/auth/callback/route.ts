import { NextResponse } from "next/server";
import { isSafeNextPath } from "@/core/auth/route-policy";
import { createClient } from "@/core/db/client-server";
import { logger } from "@/core/logging";

/**
 * Google OAuth 리디렉션 수신 엔드포인트.
 *
 * Supabase PKCE 플로우의 최종 단계:
 *   Google → Supabase → **여기(/auth/callback?code=...)** → 세션 교환 → 복귀
 *
 * 성공 시 `?next=` 쿼리가 있으면 그 경로로, 없으면 `/` 로 리디렉트.
 * 실패 시 `/login?error=<code>` 로 리디렉트하고 logger.error 로 기록 —
 * 0-E-5 의 bridge 가 자동으로 Sentry 에 캡처.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  if (!code) {
    logger.warn({ path: "/auth/callback" }, "OAuth callback: code 누락");
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.error(
      {
        errCode: error?.code,
        errMsg: error?.message,
        path: "/auth/callback",
      },
      "OAuth code exchange 실패",
    );
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Open redirect / path traversal 방어 — `isSafeNextPath` 단일 출처 사용.
  // 유효하지 않거나 누락된 경우 홈 `/` 로 fallback.
  const safeNext = isSafeNextPath(rawNext) ? rawNext : "/";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
