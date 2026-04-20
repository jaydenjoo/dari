/**
 * ISO 시각 문자열을 한국어 상대 표현으로 변환 (단일 출처).
 *
 * - 60초 미만: `방금 전`
 * - 60분 미만: `N분 전`
 * - 24시간 미만: `N시간 전`
 * - 30일 미만: `N일 전`
 * - 그 외: ko-KR 로캘 날짜
 *
 * `now` 인자는 기본값이 `new Date()` 로, 테스트에서 특정 시각 주입 가능.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}일 전`;
  return d.toLocaleDateString("ko-KR");
}
