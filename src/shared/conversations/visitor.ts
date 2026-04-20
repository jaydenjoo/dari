import { maskEmail } from "./mask-email";

/**
 * 대화의 방문자 표시명 헬퍼 (단일 출처).
 *
 * 우선순위: 이메일 마스킹 → "로그인 방문자" → "익명 방문자".
 * `visitor_id` 는 현재 분류에 쓰지 않지만, 향후 쿠키/세션 식별 확장 여지가
 * 있어 호출 측 타입에 포함된 경우에도 구조적 typing 으로 수용되도록 최소
 * 필드만 명시한다.
 *
 * 사용처: 대화 목록 / 상세 / CSV export.
 */
export interface VisitorLikeRow {
  user_id: string | null;
  email: string | null;
}

export function visitorLabelOf(row: VisitorLikeRow): string {
  if (row.email) return maskEmail(row.email);
  if (row.user_id) return "로그인 방문자";
  return "익명 방문자";
}
