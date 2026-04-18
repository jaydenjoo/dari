import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import { logger } from "@/core/logging";
import { env } from "@/shared/config/env";

import { getRedisClient } from "./redis-client";

export type RatelimitCheck = { ok: true } | { ok: false; reset: number };

// Upstash Ratelimit 의 slidingWindow / fixedWindow / tokenBucket / cachedFixedWindow 는
// 모두 동일한 Algorithm 타입을 반환한다. 따라서 slidingWindow 기준으로 타입을 뽑으면
// 다른 알고리즘으로 바꿔 끼워도 그대로 할당 가능하다 — union 확장 불필요.
type LimiterAlgorithm = ReturnType<typeof Ratelimit.slidingWindow>;

export type LimiterSpec = {
  prefix: string;
  limiter: LimiterAlgorithm;
};

/**
 * Upstash Ratelimit 싱글턴 메모이저 팩토리.
 *
 * 용도별 모듈(login / bot-create / chat …)이 각자 싱글턴 limiter 를 보유할 때 사용한다.
 * Ratelimit 인스턴스는 내부에 Redis 커넥션·캐시를 들고 있으므로 요청마다 새로 만들지 않는다.
 *
 * `analytics: false` — Upstash 분석용 추가 SET 쓰기 생략 (비용·지연 최소화).
 */
export function createMemoizedLimiter(spec: LimiterSpec): () => Ratelimit {
  let cached: Ratelimit | null = null;
  return () => {
    if (!cached) {
      cached = new Ratelimit({
        redis: getRedisClient(),
        limiter: spec.limiter,
        prefix: spec.prefix,
        analytics: false,
      });
    }
    return cached;
  };
}

/**
 * Error 객체에서 name/message 만 추출하고 message 내부의 외부 노출 위험값
 * (전체 URL · Bearer 토큰 · `token=` 쿼리 파라미터) 을 마스킹해 반환한다.
 *
 * Pino redact 는 객체 필드명 기반이라 `Error.message` 안에 inline 된 문자열은
 * 걸러내지 못한다. Upstash / Anthropic SDK / Supabase 드라이버가 REST URL·토큰·
 * API 키를 포함한 메시지를 throw 할 수 있어 외부 서비스 catch 경로에서 이 함수로
 * 한 번 더 정제한다. (security M-1 반영)
 *
 * export 이유: Chat API 등 외부 SDK 호출 경로에서 재사용. 여러 catch 블록에서
 * 동일한 마스킹 규칙을 공유해야 로그 정책이 일관된다.
 */
export function sanitizeLoggableError(err: unknown): {
  name: string;
  message: string;
} {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: redactSecretsInMessage(err.message),
    };
  }
  return { name: "UnknownError", message: redactSecretsInMessage(String(err)) };
}

function redactSecretsInMessage(msg: string): string {
  return msg
    .replace(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/bearer\s+[\w.\-]+/gi, "Bearer [REDACTED]")
    .replace(/token=[^\s&]+/gi, "token=[REDACTED]");
}

/**
 * 공통 rate limit 체크.
 *
 * dev/test skip 정책:
 *   - `NODE_ENV !== "production"` 이면 항상 통과
 *   - 로컬/E2E 반복 실행의 자가 차단 방지
 *   - 프로덕션 진입점에서만 실제 Upstash 호출
 *   - `env.ts` 는 `NODE_ENV` default 를 두지 않아 플랫폼 주입 실패 시 부팅이 실패
 *     (fail-fast) → 무음 비활성화 리스크 차단. (security M-2 반영)
 *
 * fail-open 정책:
 *   - Upstash 호출 실패(네트워크/쿼터/placeholder URL 등) 시 통과
 *   - 가용성 > 완결성 (rate limit 장애로 정상 요청 전원 차단은 과잉 피해)
 *   - `logger.error` → Sentry bridge 로 운영자 알림. `err` 는 `sanitizeLoggableError`
 *     로 URL/토큰을 마스킹한 뒤 기록한다.
 *
 * 차단 시 `reset` 은 epoch ms. 호출부가 UX 메시지로 변환.
 * 차단 이벤트는 observability 목적으로 debug 레벨 로그를 함께 남긴다.
 */
export async function checkRatelimit(
  limiter: Ratelimit,
  key: string,
  options: { name: string },
): Promise<RatelimitCheck> {
  if (env.NODE_ENV !== "production") {
    return { ok: true };
  }
  try {
    const result = await limiter.limit(key);
    if (result.success) {
      return { ok: true };
    }
    logger.debug(
      { limiter: options.name, resetIn: result.reset },
      "rate limit 차단",
    );
    return { ok: false, reset: result.reset };
  } catch (err) {
    logger.error(
      { err: sanitizeLoggableError(err), limiter: options.name },
      "Upstash rate limit 호출 실패 — fail-open",
    );
    return { ok: true };
  }
}
