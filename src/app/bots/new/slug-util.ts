/**
 * slug 유틸 — 봇 생성 폼에서 name → slug 자동 생성 및 패턴 검증.
 *
 * bots 테이블 CHECK 제약(0001 마이그레이션)과 DariConfig.botId 정규식이
 * 동일하므로, 여기서 단일 진실 공급원으로 관리한다.
 */

// SLUG_PATTERN 자체가 "앞 1자 + 중간 1~62자 + 뒤 1자" = 최소 3자를 내포한다.
// SLUG_MIN_LENGTH / SLUG_MAX_LENGTH 상수는 Zod 메시지 우선순위 및 가독성을 위해
// 분리했을 뿐이며, SLUG_PATTERN 변경 시 두 상수도 함께 갱신해야 한다.
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 64;

/**
 * 주어진 name 을 slug 후보로 변환한다.
 *
 * 한글·일본어 등 비라틴 문자는 모두 제거되므로 빈 문자열을 반환할 수 있다.
 * 이 경우 호출측에서 사용자에게 직접 입력을 요구한다.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
