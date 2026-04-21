import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "@/shared/config/env.server";

// Upstash Redis REST 클라이언트 싱글턴.
// `@upstash/ratelimit` 가 이 인스턴스를 공유해 Ratelimiter 를 초기화한다.
let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return client;
}
