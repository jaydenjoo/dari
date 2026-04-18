import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { env } from "@/shared/config/env";
import { logger } from "@/core/logging";
import { getRedisClient } from "./redis-client";

// IP 당 15분 슬라이딩 윈도우 10회 허용.
// 관리자 초대 모델: 실 사용자는 로그인 실패가 드물어 상한을 낮게 유지.
// analytics=false: Upstash 분석 쓰기(추가 SET) 절감 — 비용/지연 모두 감소.
let limiter: Ratelimit | null = null;

export function getLoginLimiter(): Ratelimit {
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedisClient(),
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      prefix: "rl:login",
      analytics: false,
    });
  }
  return limiter;
}

/**
 * Vercel 뒤에서는 `x-forwarded-for` 첫 값이 정제된 실 클라이언트 IP.
 * 로컬/비-Vercel 환경에서는 헤더 자체가 없을 수 있어 `unknown` 버킷 공유.
 *
 * 보안 주의: 비-Vercel 배포라면 프록시가 이 헤더를 덮어쓰지 않는 한 클라이언트가
 * 스푸핑 가능. Dari 는 Vercel 전제이므로 현재 구조에서 신뢰 가능.
 */
export function resolveClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : "unknown";
}

export type RatelimitCheck = { ok: true } | { ok: false; reset: number };

/**
 * 로그인 시도 rate limit 체크.
 *
 * fail-open 정책 — Upstash 호출 실패(네트워크/placeholder URL 등) 시
 * 로그인 자체는 차단하지 않고 통과시킨다. 이유:
 *   - 가용성 > 완결성 (Upstash 장애로 로그인 전원 차단은 과잉 피해)
 *   - 차단 실패는 `logger.error` → Sentry bridge 로 운영자 알림
 *
 * dev/test 에서는 항상 skip:
 *   - 로컬은 x-forwarded-for 가 없어 모든 요청이 "unknown" 버킷에 몰려 오차단 위험
 *   - E2E 테스트 반복 실행으로 카운터가 빠르게 소진
 *   - 로컬 개발자 DX 보호
 *
 * 차단 시 `reset` 은 epoch ms. 호출부에서 UX 메시지로 변환 가능하나
 * 현재는 수치 미노출 정책 (공격자에게 힌트 제공 방지).
 */
export async function checkLoginRatelimit(ip: string): Promise<RatelimitCheck> {
  if (env.NODE_ENV !== "production") {
    return { ok: true };
  }
  try {
    const result = await getLoginLimiter().limit(ip);
    if (result.success) {
      return { ok: true };
    }
    return { ok: false, reset: result.reset };
  } catch (err) {
    // fail-open. 무음 장애 방지 위해 error 레벨로 로깅 → Sentry 자동 캡처.
    logger.error({ err }, "Upstash rate limit 호출 실패 — fail-open");
    return { ok: true };
  }
}
