"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/core/db/client-server";
import { logger } from "@/core/logging";

/**
 * 로그아웃 — Server Action.
 * Supabase `signOut()` 이 쿠키에서 세션을 제거하고 `/login` 으로 이동.
 * 실패해도 사용자 관점에서는 로그인 페이지로 보내는 것이 일관된 UX.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    logger.error({ err: error }, "로그아웃 실패");
  }

  redirect("/login");
}
