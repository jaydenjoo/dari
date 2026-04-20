import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

/**
 * URL 지식 크롤링(`addUrlSourceAction`) 남용 방어 — owner(user) 키 sliding window.
 *
 * 방어 대상:
 *   - 인증된 bot owner 한 명이 동일/다수 URL 을 빠르게 N회 submit → 동시 Firecrawl scrape N개 발생.
 *   - `FIRECRAWL_API_KEY` 는 **앱 공용 키** 이므로 한 owner 의 남용이 다른 owner 의 크롤링 실패(402/429)
 *     로 이어진다 (security review MEDIUM, 2026-04-20).
 *
 * 한도 설계 근거:
 *   - 정상 UX: 편집 페이지에서 URL 1개씩 수동 추가 (간격 수초~분 단위).
 *   - 20 req / 10 min: 브라우저 재시도·오탈자 수정·연쇄 입력 수용. 악의적 루프는 차단.
 *   - 키: `user.id` (owner 기준). IP 키는 shared NAT 오차단 위험.
 *   - Upstash 단일 인프라 재사용으로 운영 간단성 유지.
 */
export const getBotUrlIngestLimiter = createMemoizedLimiter({
  prefix: "rl:bot-url-ingest",
  limiter: Ratelimit.slidingWindow(20, "10 m"),
});

export async function checkBotUrlIngestRatelimit(
  userId: string,
): Promise<RatelimitCheck> {
  return checkRatelimit(getBotUrlIngestLimiter(), userId, {
    name: "bot-url-ingest",
  });
}
