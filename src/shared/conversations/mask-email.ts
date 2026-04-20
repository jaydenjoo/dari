/**
 * 이메일 마스킹: `ab***@domain.com`.
 *
 * 본인 owner 만 볼 수 있으나 로그·스크린샷 공유 시 식별자 노출을 최소화한다.
 * local 길이별 분기로 원자(1자 이름) 미노출까지 보장한다:
 *   0자 (atIdx<=0, 비정상 입력) → "***"
 *   1자                        → "***@domain" (원자 미노출)
 *   2자+                       → "ab***@domain"
 */
export function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx <= 0) return "***";
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  if (local.length === 1) return `***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}
