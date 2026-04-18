"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSafeNextPath } from "@/core/auth/route-policy";
import { createClient } from "@/core/db/client-server";
import { logger } from "@/core/logging";

// 이메일/비밀번호 로그인 입력 스키마.
// 비밀번호 최소 길이는 Supabase 기본 정책(6) 과 정합.
const passwordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

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

/**
 * 이메일/비밀번호 로그인 — Server Action.
 *
 * 관리자 초대 모델: 회원가입 플로우 없음. `auth.admin.createUser` 로 생성된
 * 계정만 로그인 가능. 실패 메시지는 "이메일/비밀번호 일치 여부"를 구분하지 않아
 * 계정 열거(enumeration) 공격을 차단한다.
 *
 * `next` 파라미터는 로그인 후 복귀 경로. `isSafeNextPath` 단일 출처로 검증.
 */
export async function signInWithPassword(formData: FormData): Promise<void> {
  const parsed = passwordLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const nextRaw = formData.get("next");
  const safeNext = isSafeNextPath(nextRaw) ? nextRaw : null;
  const nextQuery = safeNext ? `&next=${encodeURIComponent(safeNext)}` : "";

  if (!parsed.success) {
    redirect(`/login?error=invalid_input${nextQuery}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // 원문 노출 금지. 로그만 남기고 사용자에게는 일반화 메시지.
    logger.warn(
      { err: error, email: parsed.data.email },
      "이메일/비밀번호 로그인 실패",
    );
    redirect(`/login?error=invalid_credentials${nextQuery}`);
  }

  redirect(safeNext ?? "/");
}
