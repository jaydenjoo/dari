import type { BotStatus } from "@/core/db/types";

/**
 * 봇 상태별 UI 레이블 (단일 출처).
 *
 * 레이블 변경 시 모든 봇 뷰(목록·상세) 에 자동 반영.
 */
export const BOT_STATUS_LABEL: Record<BotStatus, string> = {
  active: "운영 중",
  paused: "일시정지",
  deleted: "삭제됨",
};

/**
 * 봇 상태별 Tailwind 뱃지 클래스 (배경/텍스트/링).
 *
 * `ring-1 ring-inset` 은 호출 측에서 조합한다 (뱃지 컨텍스트별 크기/모서리 달라짐).
 */
export const BOT_STATUS_CLASS: Record<BotStatus, string> = {
  active: "bg-blue-50 text-blue-700 ring-blue-200",
  paused: "bg-amber-50 text-amber-700 ring-amber-200",
  deleted: "bg-gray-100 text-gray-500 ring-gray-200",
};
