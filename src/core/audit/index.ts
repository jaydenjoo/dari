/**
 * @module core/audit
 *
 * 감사 로그 Public API — Epic B Task B-2.
 *
 * 사용:
 *   import { logAuditEvent, AUDIT_EVENTS } from "@/core/audit";
 *
 *   await logAuditEvent(supabase, {
 *     eventType: AUDIT_EVENTS.BOT_DELETE,
 *     entityType: "bot",
 *     entityId: bot.id,
 *     actorId: user.id,
 *     metadata: { slug, deleteMode: "permanent" },
 *   });
 */

export { logAuditEvent } from "./log";
export { AUDIT_EVENTS } from "./types";
export type { AuditEntityType, AuditEventInput, AuditEventType } from "./types";
