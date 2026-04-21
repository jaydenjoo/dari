/**
 * Supabase Browser Client — 클라이언트 컴포넌트 전용
 *
 * 세션은 브라우저 쿠키에서 자동 관리.
 * RLS는 NEXT_PUBLIC_SUPABASE_ANON_KEY + 현재 사용자 JWT로 자동 적용.
 *
 * 사용:
 *   "use client";
 *   import { createClient } from "@/core/db/client-browser";
 *   const supabase = createClient();
 *   const { data, error } = await supabase.from("bots").select("id, name");
 */

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/shared/config/env.client";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
