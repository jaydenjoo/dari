/**
 * Rate limit 사용자 노출 메시지 상수 (Task β-4).
 *
 * 목적:
 *   - 11 지점 (route 3 + Server Action 7+) 의 한국어 메시지 단일 출처
 *   - 미래 i18n 라이브러리 도입 시 키 → locale 매핑 시드
 *
 * 정책:
 *   - 메시지는 정적 (사용자 입력 / DB 값 보간 금지) — XSS 방어
 *   - "잠시 후 다시 시도" 같은 보편 표현 우선 (사용자 인지 부담 최소)
 *   - `withRetryAfter()` 로 reset 시간 동적 부착 (Upstash reset → 초)
 *
 * server-only 불필요 — 순수 상수 + 함수. Client Component 에서도 import 가능.
 */

export const RATE_LIMIT_MESSAGES = {
  bot_create: "봇 생성 한도에 도달했어요. 잠시 후 다시 시도해 주세요.",
  bot_delete: "삭제 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  bot_url_ingest: "URL 등록 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  bot_file_ingest:
    "파일 업로드 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  bot_source_remove:
    "지식 소스 삭제 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  conversation_delete:
    "대화 삭제 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  conversation_export:
    "다운로드 요청이 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.",
} as const;

export type RateLimitMessageKey = keyof typeof RATE_LIMIT_MESSAGES;

/**
 * Upstash reset (unix timestamp ms) → 사용자 노출 메시지에 재시도 시점 부착.
 *
 * 최소 1초 보장 (이미 만료됐어도 즉시 재시도 안 하게 hint).
 *
 * **퍼지 표현 정책 (sec M-1, β-4 리뷰)**:
 *   - 60초 미만 → `(잠시 후 1분 이내 재시도 가능)` — 정확한 초 노출하지 않음
 *   - 60초~1시간 → `(약 N분 후 재시도 가능)` — 이미 분 단위로 모호
 *   - 1시간 이상 → `(약 N시간 후 재시도 가능)` — 시간 단위 모호화
 *
 * **이유**: 정확한 초 노출은 공격자에게 rate limit 윈도우/한도 추정 단서 제공
 * (예: "30초 후 재시도" → 슬라이딩 윈도우 크기 역산). 인증된 dashboard 사용자
 * 전용이라도 정보 최소화 원칙 적용. 정확한 초가 필요한 곳은 Route Handler 의
 * `Retry-After` 헤더 사용 (RFC 6585 표준 준수).
 */
export function withRetryAfter(
  message: string,
  resetMs: number,
  now: number = Date.now(),
): string {
  const retryAfterSec = Math.max(1, Math.ceil((resetMs - now) / 1000));
  if (retryAfterSec < 60) {
    return `${message} (잠시 후 1분 이내 재시도 가능)`;
  }
  if (retryAfterSec < 3600) {
    const minutes = Math.ceil(retryAfterSec / 60);
    return `${message} (약 ${minutes}분 후 재시도 가능)`;
  }
  const hours = Math.ceil(retryAfterSec / 3600);
  return `${message} (약 ${hours}시간 후 재시도 가능)`;
}
