/**
 * Supabase Admin Client — service_role 키 사용 (RLS 우회)
 *
 * ⚠️ RLS를 우회하므로 **관리 작업 전용**:
 *   - Webhook 수신 (사용자 세션 없는 상황)
 *   - 배치 작업 / 크론
 *   - 초기 seed
 *   - 시스템 레벨 통계 집계
 *
 * 🔒 절대 금지:
 *   - 클라이언트 컴포넌트에서 import 금지 (번들에 service_role 키 노출 위험)
 *   - 사용자 요청을 그대로 이 클라이언트로 처리 금지 (권한 우회 공격 경로)
 *
 * 'server-only' 가드로 클라이언트 번들 유입을 빌드 타임에 차단.
 */

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/shared/config/env.server";
import type { Database } from "./types";

export function createAdminClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
