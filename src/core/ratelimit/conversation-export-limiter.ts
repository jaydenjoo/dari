import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

/**
 * 대화 CSV export(`GET /api/conversations/:id/export`) 남용 방어 — owner 키 sliding window.
 *
 * 방어 대상:
 *   - 자동화 스크립트로 CSV 대량 다운로드 → messages 조회 + CSV 직렬화 비용 누적.
 *   - 각 export 는 최대 5000 메시지 조회 + UTF-8 직렬화. 10회/분 반복 시 서버 CPU 부담.
 *   - 공격 벡터: 경쟁사/스크래퍼가 봇 대화 로그를 덤프 — owner 는 정당 접근이지만 남용 차단.
 *
 * 한도 설계 근거:
 *   - 20 req / 10 min: 삭제(10/5m) 보다 느슨 — export 는 읽기 전용이라 복구 불가 피해가 없음.
 *     실제 owner 가 여러 대화를 순차 export 하는 정상 UX(예: 분석용 배치 다운로드) 고려.
 *   - 키: `user.id` (세션 필수). 미로그인은 401 로 먼저 차단되므로 여기 도달 안 함.
 *   - fail-open: factory.ts 기본 정책 계승.
 */
export const getConversationExportLimiter = createMemoizedLimiter({
  prefix: "rl:conversation-export",
  limiter: Ratelimit.slidingWindow(20, "10 m"),
});

export async function checkConversationExportRatelimit(
  userId: string,
): Promise<RatelimitCheck> {
  return checkRatelimit(getConversationExportLimiter(), userId, {
    name: "conversation-export",
  });
}
