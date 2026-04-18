import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

// 봇별 IP 당 시간당 100 요청 (sliding window).
// - 🟡 Chat API 비용 악용 / DoS 방어
// - key = `${botId}:${ip}` 복합키로 봇 간 쿼터 격리 (한 봇이 다른 봇 쿼터 소진 불가)
// - IP 기준: 위젯은 anon 방문자이므로 userId 사용 불가. Vercel 뒤 x-forwarded-for 기준
// - 100 req/h 는 실사용자 대화 80~150턴 규모를 커버하면서 봇 기반 자동화 호출은 차단
export const getBotChatLimiter = createMemoizedLimiter({
  prefix: "rl:bot-chat",
  limiter: Ratelimit.slidingWindow(100, "1 h"),
});

export async function checkBotChatRatelimit(
  botId: string,
  ip: string,
): Promise<RatelimitCheck> {
  return checkRatelimit(getBotChatLimiter(), `${botId}:${ip}`, {
    name: "bot-chat",
  });
}
