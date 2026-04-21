import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

/**
 * 대화 단건 삭제(`deleteConversationAction`) 남용 방어 — owner(user) 키 sliding window.
 *
 * 방어 대상:
 *   - owner 가 대화 로그를 반복 삭제 → DB DELETE + messages FK cascade 누적.
 *   - 정상 UX: 불필요 대화 정리. 수 분 사이 10건 이상은 스크립트 가능성.
 *   - 공격 벡터: 특정 대화 감추기 위한 엔터프라이즈 공격 드물지만, 대량 삭제 자체가 RLS
 *     trigger 비용 누적 → 성능 영향.
 *
 * 한도 설계 근거:
 *   - 10 req / 5 min: `bot-source-remove-limiter` 와 동일 수치 — "파괴적 작업" 공통 규준.
 *     봇 삭제(5/1h) 만큼 엄격하지 않은 건 개별 대화 피해가 작기 때문.
 *   - 키: `user.id`. IP 는 NAT 오차단 위험.
 *   - fail-open: factory.ts 기본 정책 계승.
 */
export const getConversationDeleteLimiter = createMemoizedLimiter({
  prefix: "rl:conversation-delete",
  limiter: Ratelimit.slidingWindow(10, "5 m"),
});

export async function checkConversationDeleteRatelimit(
  userId: string,
): Promise<RatelimitCheck> {
  return checkRatelimit(getConversationDeleteLimiter(), userId, {
    name: "conversation-delete",
  });
}
