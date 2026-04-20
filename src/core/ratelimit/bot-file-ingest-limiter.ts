import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

/**
 * 파일 지식 업로드(`addFileSourceAction`) 남용 방어 — owner(user) 키 sliding window.
 *
 * 방어 대상:
 *   - 인증된 bot owner 한 명이 반복 업로드 → Gemini 임베딩 비용 + Storage 용량 폭주.
 *   - 한 파일당 업로드+임베딩+RPC 비용 ≈ $0.0001 Gemini 호출 + Storage 저장.
 *     MVP 무료 tier 에선 큰 영향 없으나 악의적 루프는 차단.
 *   - Phase 2 과금 모델 도입 시 fail-closed 로 전환 검토 (factory.ts 참조).
 *
 * 한도 설계 근거:
 *   - 정상 UX: 편집 페이지에서 파일 1개씩 업로드 (10MB 기준 수 초~수십 초 소요).
 *   - 20 req / 10 min: 브라우저 재시도·연쇄 업로드 수용. bot-url-ingest-limiter 와 동일.
 *   - 키: `user.id` (owner). IP 키는 shared NAT 오차단 위험.
 */
export const getBotFileIngestLimiter = createMemoizedLimiter({
  prefix: "rl:bot-file-ingest",
  limiter: Ratelimit.slidingWindow(20, "10 m"),
});

export async function checkBotFileIngestRatelimit(
  userId: string,
): Promise<RatelimitCheck> {
  return checkRatelimit(getBotFileIngestLimiter(), userId, {
    name: "bot-file-ingest",
  });
}
