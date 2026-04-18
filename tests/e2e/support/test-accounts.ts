/**
 * Playwright 테스트 계정 수명주기 헬퍼
 *
 * Supabase admin API 로 e2e 전용 계정을 생성/삭제한다.
 * 운영 DB 와 동일한 Supabase 프로젝트를 사용하는 점에 주의:
 *   - email 은 `@dari.test` 가짜 도메인 (실 메일 발송 없음)
 *   - uid 는 state 파일에 기록 후 teardown 에서 삭제
 *   - 이메일 컨펌 자동 (`email_confirm: true`) — 로그인 즉시 가능
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "[e2e] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락. .env.local 확인 필요.",
  );
}

let adminClient: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // admin API 는 Authorization 헤더로 service_role 을 명시해야 권한 인식.
        // supabase-js v2 일부 버전은 apikey 만 자동 설정하고 Authorization 은 세션 기반.
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      },
    });
  }
  return adminClient;
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

export async function createTestUser(
  email: string,
  password: string,
): Promise<TestUser> {
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw new Error(`[e2e] createTestUser 실패 (${email}): ${error.message}`);
  }

  return { id: data.user.id, email, password };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(userId);
  if (error) {
    console.error(
      `[e2e] deleteTestUser 실패 (${userId}): ${error.message} — 수동 정리 필요`,
    );
  }
}

export async function deleteTestUserByEmail(email: string): Promise<void> {
  const { data, error } = await admin().auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error(`[e2e] listUsers 실패: ${error.message}`);
    return;
  }
  const match = data.users.find((u) => u.email === email);
  if (match) {
    await deleteTestUser(match.id);
  }
}
