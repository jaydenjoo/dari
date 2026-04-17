"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSafeNextPath } from "@/core/auth/route-policy";
import { createClient } from "@/core/db/client-server";
import { logger } from "@/core/logging";

/**
 * Google OAuth 로그인 시작 — Server Action.
 *
 * 흐름:
 *   1. Supabase `signInWithOAuth({ provider: "google" })` 로 PKCE 플로우 초기화
 *   2. 반환된 `data.url` (Google 인증 화면) 로 브라우저 리디렉트
 *   3. Google 인증 완료 → Supabase → 우리 앱 `/auth/callback?code=...`
 *
 * `next` 파라미터는 로그인 후 복귀 경로. open redirect 방지를 위해
 * `/` 로 시작하고 `//` 로 시작하지 않는 경로만 허용.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") ??
    headersList.get("host") ??
    "localhost:4000";
  const proto =
    headersList.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  // open redirect / path traversal 방어는 `isSafeNextPath` 단일 출처 사용.
  const nextRaw = formData.get("next");
  const safeNext = isSafeNextPath(nextRaw) ? nextRaw : null;
  const nextQuery = safeNext ? `?next=${encodeURIComponent(safeNext)}` : "";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback${nextQuery}`,
    },
  });

  if (error || !data.url) {
    logger.error({ err: error, origin }, "Google OAuth 초기화 실패");
    redirect("/login?error=oauth_init_failed");
  }

  redirect(data.url);
}
