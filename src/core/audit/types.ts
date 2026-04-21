/**
 * Audit Log 타입 정의 — Epic B Task B-2.
 *
 * 이벤트 네임스페이스 규칙: `entity.action`
 *   - entity: 'bot' | 'conversation' (DB CHECK `audit_entity_type_valid` 와 일치)
 *   - action: 짧은 동사 (create / update / delete / export)
 *
 * DB CHECK `audit_event_type_fmt` = `^[a-z_]+\.[a-z_]+$` — 소문자·밑줄·정확히 하나의 dot.
 *
 * 새 이벤트 추가 절차:
 *   1. `AUDIT_EVENTS` 상수에 추가 (앱 레이어 자동완성).
 *   2. 필요하면 DB CHECK `audit_entity_type_valid` 확장 마이그레이션.
 *   3. 호출 지점에서 `logAuditEvent()` 추가.
 */

export const AUDIT_EVENTS = {
  BOT_CREATE: "bot.create",
  BOT_UPDATE: "bot.update",
  // BOT_DELETE 의 metadata.deleteMode: 'soft' | 'permanent' 로 구분 (Task B-3).
  //   - soft:      UPDATE deleted_at = now() (휴지통 이동, 30일 복구 가능)
  //   - permanent: DB DELETE + Storage cleanup (되돌릴 수 없음, 휴지통 경로 전용)
  BOT_DELETE: "bot.delete",
  // Task B-3: 휴지통에서 복구 (deleted_at = NULL).
  BOT_RESTORE: "bot.restore",
  CONVERSATION_DELETE: "conversation.delete",
  CONVERSATION_EXPORT: "conversation.export",
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];

export type AuditEntityType = "bot" | "conversation";

export interface AuditEventInput {
  eventType: AuditEventType;
  entityType: AuditEntityType;
  // 대상 엔티티 UUID. 봇이면 bots.id, 대화면 conversations.id.
  entityId: string;
  // 행위자 user.id. RLS WITH CHECK 가 auth.uid() 와 일치 강제 — 이 값이 실제 세션과
  // 다르면 DB 에서 거부된다 (impersonation 방어 DB 이중).
  actorId: string;
  // 부수 정보. `redactDeep` 통과 후 저장 → PII (email/phone 등) 자동 마스킹.
  // 변경 전·후 값 같은 민감 페이로드는 담지 않는다 (MVP — 변경 이력은 Phase 3 bot_versions).
  metadata?: Record<string, unknown>;
}
