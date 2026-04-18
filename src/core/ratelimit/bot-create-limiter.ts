import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

// 사용자당 하루 20개 봇 생성 허용 (sliding window).
// - 🟡 DoS / AI API 원가 악용 방어
// - 인증 사용자 대상이므로 key 는 userId (CGN/VPN 로 인한 IP 기반 오탐 회피)
// - 실사용자 일일 생성량은 1~2개가 상식적 → 20 은 충분한 여유 버퍼
export const getBotCreateLimiter = createMemoizedLimiter({
  prefix: "rl:bot-create",
  limiter: Ratelimit.slidingWindow(20, "1 d"),
});

export async function checkBotCreateRatelimit(
  userId: string,
): Promise<RatelimitCheck> {
  return checkRatelimit(getBotCreateLimiter(), userId, { name: "bot-create" });
}
