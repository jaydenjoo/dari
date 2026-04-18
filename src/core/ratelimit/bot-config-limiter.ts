import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

// 봇 config GET 스크래핑 방어 — `${botId}:${ip}` 복합키 sliding window.
// - 정상 트래픽: 위젯 부팅 시 1회 호출. Cache-Control(s-maxage=300) 로 CDN 레이어에서 대부분 흡수.
// - 공격 시나리오: 공격자가 한 봇 슬러그로 반복 스크래핑 / 슬러그 enumeration.
// - 복합키는 chat-limiter 와 일관. 단일 IP 반복 시도는 1000 req/h 로 차단.
// - 분산 IP 로 다수 봇 스크래핑은 리뷰 후 backlog — Phase 2 에 글로벌 IP limiter 병행 검토.
export const getBotConfigLimiter = createMemoizedLimiter({
  prefix: "rl:bot-config",
  limiter: Ratelimit.slidingWindow(1000, "1 h"),
});

export async function checkBotConfigRatelimit(
  botId: string,
  ip: string,
): Promise<RatelimitCheck> {
  return checkRatelimit(getBotConfigLimiter(), `${botId}:${ip}`, {
    name: "bot-config",
  });
}
