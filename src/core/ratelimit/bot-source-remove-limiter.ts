import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

/**
 * 지식 소스 삭제(`removeSourceAction`) 남용 방어 — owner(user) 키 sliding window.
 *
 * 방어 대상:
 *   - 인증된 bot owner 한 명이 반복 삭제 호출 → DB DELETE + Storage .remove() 부하.
 *   - 정상 UX: 사용자가 수십 번씩 삭제하는 경우는 실수/실험 외엔 드묾.
 *   - 공격 벡터: 자동화 스크립트로 대량 삭제 호출 → chunks 삭제 RPC 반복 + Storage API quota.
 *
 * 한도 설계 근거:
 *   - 10 req / 5 min: ingest(20req/10m) 대비 보수적 — 삭제는 취소 불가 UX 라 느슨할 필요 없음.
 *   - 키: `user.id` (owner). IP 키는 shared NAT 오차단 위험.
 *   - fail-open: Upstash 장애 시 통과 (factory.ts 기본 정책) — rate limit 장애로
 *     삭제 서비스 전체 막히는 것이 더 나쁨.
 */
export const getBotSourceRemoveLimiter = createMemoizedLimiter({
  prefix: "rl:bot-source-remove",
  limiter: Ratelimit.slidingWindow(10, "5 m"),
});

export async function checkBotSourceRemoveRatelimit(
  userId: string,
): Promise<RatelimitCheck> {
  return checkRatelimit(getBotSourceRemoveLimiter(), userId, {
    name: "bot-source-remove",
  });
}
