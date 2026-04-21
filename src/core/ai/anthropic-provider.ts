import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";

import { env } from "@/shared/config/env";

/**
 * Vercel AI SDK Anthropic Provider 싱글턴.
 *
 * `@anthropic-ai/sdk` 기반 `getAnthropicClient()` 와 병존한다 — 스트리밍 경로
 * (`streamText`) 는 이 Provider 를 쓰고, 비 스트리밍 잔여 경로가 있으면
 * 기존 Client 를 유지. Task A-4 (스트리밍 전환) 범위에선 `/api/chat/[botId]`
 * POST 만 이 Provider 를 사용한다.
 *
 * 싱글턴 이유: serverless cold-start 마다 Provider 인스턴스 재생성 시 내부
 * HTTP keep-alive / retry 구성을 재설정하므로 latency 불리.
 *
 * TODO(post-A-4 sweep Task): `anthropic-client.ts` 잔여 비 스트리밍 호출처를 식별 후
 * 둘 중 하나를 제거. 현재 `/api/chat/[botId]` 만 streamText 를 쓰므로 client 는
 * 여전히 사용 중 (있다면 knowledge/* 또는 기타 경로). 완전 마이그레이션 시 이 파일만 남김.
 * (리뷰 code L-3 반영)
 */
let provider: ReturnType<typeof createAnthropic> | null = null;

export function getAnthropicProvider(): ReturnType<typeof createAnthropic> {
  if (!provider) {
    provider = createAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }
  return provider;
}
