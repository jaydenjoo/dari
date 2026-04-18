import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/shared/config/env";

// Anthropic SDK 싱글턴.
// serverless cold-start 마다 새 HTTP client 를 만들지 않도록 모듈 스코프 캐시.
let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}
