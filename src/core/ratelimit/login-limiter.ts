import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import {
  checkRatelimit,
  createMemoizedLimiter,
  type RatelimitCheck,
} from "./factory";

// IP 당 15분 슬라이딩 윈도우 10회 허용.
// 관리자 초대 모델: 실 사용자는 로그인 실패가 드물어 상한을 낮게 유지.
export const getLoginLimiter = createMemoizedLimiter({
  prefix: "rl:login",
  limiter: Ratelimit.slidingWindow(10, "15 m"),
});

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

export type { RatelimitCheck };

export async function checkLoginRatelimit(ip: string): Promise<RatelimitCheck> {
  return checkRatelimit(getLoginLimiter(), ip, { name: "login" });
}
