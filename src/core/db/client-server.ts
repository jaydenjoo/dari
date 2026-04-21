/**
 * Supabase Server Client — Server Component / Route Handler / Server Action 전용
 *
 * Next.js 15+ async cookies API 사용.
 * 세션은 요청 쿠키에서 읽어 RLS에 반영됨 (anon key + 사용자 JWT).
 *
 * 사용 (Server Component):
 *   import { createClient } from "@/core/db/client-server";
 *   const supabase = await createClient();
 *   const { data } = await supabase.from("bots").select("*");
 *
 * 주의: 'server-only' 가드로 클라이언트 번들 유입 차단.
 */

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/shared/config/env.server";
import type { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component 내부에서는 cookie 쓰기 불가.
            // 미들웨어의 session refresh가 대신 처리하므로 무시해도 안전.
          }
        },
      },
    },
  );
}
