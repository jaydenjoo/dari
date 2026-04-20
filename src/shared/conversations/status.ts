import type { ConversationStatus } from "@/core/db/types";

/**
 * 대화 상태별 UI 레이블 (단일 출처).
 *
 * 레이블 변경 시 모든 대화 뷰(목록·상세·CSV export) 에 자동 반영.
 */
export const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  active: "진행 중",
  closed: "종료",
  handed_off: "담당자 이관",
};

/**
 * 대화 상태별 Tailwind 뱃지 클래스 (배경/텍스트/링).
 *
 * `ring-1 ring-inset` 은 호출 측에서 조합한다.
 */
export const CONVERSATION_STATUS_CLASS: Record<ConversationStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-gray-50 text-gray-600 ring-gray-200",
  handed_off: "bg-amber-50 text-amber-700 ring-amber-200",
};
