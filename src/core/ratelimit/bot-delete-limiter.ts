import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

/**
 * 봇 영구 삭제(`deleteBotAction`) 남용 방어 — owner(user) 키 sliding window.
 *
 * 방어 대상:
 *   - 인증된 owner 가 봇을 반복 생성-삭제 루프 → DB DELETE + FK cascade 대량 발생.
 *   - 봇 삭제는 정당한 UX 에선 극히 드문 동작 (월 수 회 수준). 시간당 5회면 충분.
 *   - 공격 벡터: 자동화 스크립트로 타인 봇 ID 조작 시 DB 부하 (RLS 로 0-row 거부되지만
 *     조회 왕복 + cascade 트리거 실행 비용은 누적 가능).
 *
 * 한도 설계 근거:
 *   - 5 req / 1 h: source-remove(10/5m), chat(여러 회/m) 등 어떤 limiter 보다도 엄격.
 *     "실수로 만든 봇 즉시 삭제 + 재시도" 같은 한두 번 루프는 허용.
 *   - 키: `user.id` (owner). IP 는 NAT 공유 환경에서 오차단 위험.
 *   - fail-open: Upstash 장애 시 통과 (factory.ts 기본 정책).
 *
 * 주의: 이 limiter 는 Phase 2 B-3 soft delete 도입 후에도 유효.
 *   soft delete 는 UPDATE deleted_at=now() 라 cascade 가 지연되지만,
 *   "삭제 요청" 자체의 레이트 리밋 의미는 동일.
 */
export const getBotDeleteLimiter = createMemoizedLimiter({
  prefix: "rl:bot-delete",
  limiter: Ratelimit.slidingWindow(5, "1 h"),
});

export async function checkBotDeleteRatelimit(
  userId: string,
): Promise<RatelimitCheck> {
  return checkRatelimit(getBotDeleteLimiter(), userId, {
    name: "bot-delete",
  });
}
