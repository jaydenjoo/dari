// 서버 전용 — 클라이언트 번들 유입 시 Next.js 빌드 에러로 원천 차단.
// user-scoped SupabaseClient 전달이 전제이며 service_role 혼입·브라우저 직접 호출을 방지한다.
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/core/db/types";
import { logger } from "@/core/logging";
import { redactDeep } from "@/core/observability/redact";

import type { AuditEventInput } from "./types";

/**
 * 감사 이벤트를 `audit_logs` 테이블에 기록한다 — Epic B Task B-2.
 *
 * 계약:
 *   - **throw 금지**: 감사 로그 실패로 주 작업(봇 삭제/대화 삭제 등)을 절대 차단하지 않는다.
 *     실패는 `logger.error` 로만 기록 → Sentry 이관 → 사람이 후속 조치.
 *   - `metadata` 는 `redactDeep` 통과 후 저장 → PII (email/phone 등) 이중 방어
 *     (Phase 0-E-5 공유 로직 재사용).
 *   - `supabase` 는 반드시 **user-scoped** 클라이언트여야 한다. admin/service_role 금지 —
 *     RLS INSERT 정책이 `actor_id = auth.uid()` 에 의존. service_role 은 RLS 우회라 의미 없음.
 *   - `actorId` 는 DB WITH CHECK 가 auth.uid() 와 일치 강제 → 잘못된 값 유입 시 DB 거부.
 *
 * @returns `{ ok: true }` 기록 성공 / `{ ok: false }` 실패 (로깅만, 계속 진행)
 */
export async function logAuditEvent(
  supabase: SupabaseClient<Database>,
  event: AuditEventInput,
): Promise<{ ok: boolean }> {
  try {
    const safeMetadata = redactDeep(event.metadata ?? {}) as Record<
      string,
      unknown
    >;

    const { error } = await supabase.from("audit_logs").insert({
      event_type: event.eventType,
      entity_type: event.entityType,
      entity_id: event.entityId,
      actor_id: event.actorId,
      metadata: safeMetadata,
    });

    if (error) {
      logger.error(
        {
          errCode: error.code,
          errMsg: error.message,
          eventType: event.eventType,
          entityType: event.entityType,
          entityId: event.entityId,
          userId: event.actorId,
        },
        "audit log insert 실패",
      );
      return { ok: false };
    }

    return { ok: true };
  } catch (err) {
    logger.error(
      {
        err,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        userId: event.actorId,
      },
      "audit log insert 예외",
    );
    return { ok: false };
  }
}
