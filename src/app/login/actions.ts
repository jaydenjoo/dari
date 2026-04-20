"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSafeNextPath } from "@/core/auth/route-policy";
import { createClient } from "@/core/db/client-server";
import { logger } from "@/core/logging";
import {
  checkLoginRatelimit,
  resolveClientIp,
} from "@/core/ratelimit/login-limiter";

// 이메일/비밀번호 로그인 입력 스키마.
// 비밀번호 최소 길이 8자 — OWASP 2025 권장 + 🟡 PII 프로젝트 기준.
// Supabase Dashboard (Auth → Password Settings) 와 반드시 동기화.
const passwordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
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
    logger.error(
      { errCode: error?.code, errMsg: error?.message, origin },
      "Google OAuth 초기화 실패",
    );
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
 * 무차별 대입 방어: IP 기반 슬라이딩 윈도우 10회/15분. Upstash 장애 시 fail-open.
 *
 * `next` 파라미터는 로그인 후 복귀 경로. `isSafeNextPath` 단일 출처로 검증.
 */
export async function signInWithPassword(formData: FormData): Promise<void> {
  const nextRaw = formData.get("next");
  const safeNext = isSafeNextPath(nextRaw) ? nextRaw : null;
  const nextQuery = safeNext ? `&next=${encodeURIComponent(safeNext)}` : "";

  // 1. 입력 형식 검증이 먼저 — 잘못된 입력은 rate limit 카운터를 소모하지 않음.
  //    (정상 사용자가 실수로 반복 제출해도 rate limit 이 깎이지 않게 한다)
  const parsed = passwordLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(`/login?error=invalid_input${nextQuery}`);
  }

  // 2. Rate limit pre-check — 형식이 올바른 시도만 카운트.
  //    상한 도달 IP 는 비밀번호가 맞더라도 인증 시도 자체 차단.
  const headersList = await headers();
  const ip = resolveClientIp(headersList);
  const rl = await checkLoginRatelimit(ip);
  if (!rl.ok) {
    logger.warn({ ip }, "로그인 차단 (rate limit 초과)");
    redirect(`/login?error=too_many_attempts${nextQuery}`);
  }

  // 3. Supabase 인증.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // 원문 노출 금지. 로그만 남기고 사용자에게는 일반화 메시지.
    logger.warn(
      {
        errCode: error.code,
        errMsg: error.message,
        email: parsed.data.email,
        ip,
      },
      "이메일/비밀번호 로그인 실패",
    );
    redirect(`/login?error=invalid_credentials${nextQuery}`);
  }

  redirect(safeNext ?? "/");
}
