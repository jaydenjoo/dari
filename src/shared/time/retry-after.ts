/**
 * Rate limit reset 시간 → `Retry-After` 초 계산 (공용 함수).
 *
 * 기원: Task β-4 `with-allowed-origin.ts` 내부 선언. Task β-5 에서 분리.
 *
 * 사용처:
 *   - Route Handler: `Retry-After` 헤더 (RFC 6585 표준, 정확 초)
 *   - Server Action: 사용자 메시지 퍼지 표현 내부 계산 (`withRetryAfter`)
 *
 * 위치 근거:
 *   - 순수 산술 함수. server-only 의존성 없음 → Client/Server 공용.
 *   - `core/security/with-allowed-origin.ts` (server-only) 에 두면 Client Component
 *     체인(`rate-limit.ts` → `withRetryAfter`) 에서 client 빌드 오염 위험.
 *
 * 방어선 (β-5 sec 리뷰):
 *   - NaN / Infinity / -Infinity → 1초 (Upstash 비정상 응답 / 시계 skew 방어).
 *     헤더에 `"NaN"` / `"Infinity"` 문자열 삽입 시 RFC 6585 위반 + 일부 클라이언트
 *     라이브러리 예외 발생.
 *   - 최소 1초: 이미 만료된 reset 이어도 클라이언트 즉시 재시도 폭주 방어.
 *   - 최대 24시간: 비정상적으로 먼 미래 reset 입력 시 헤더 값 제한.
 */

const MAX_RETRY_AFTER_SEC = 86_400; // 24시간 상한

export function computeRetryAfterSeconds(
  resetMs: number,
  now: number = Date.now(),
): number {
  const diff = resetMs - now;
  if (!Number.isFinite(diff)) return 1;
  return Math.min(MAX_RETRY_AFTER_SEC, Math.max(1, Math.ceil(diff / 1000)));
}
