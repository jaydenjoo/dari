import { describe, expect, it } from "vitest";

import { computeRetryAfterSeconds } from "./retry-after";

describe("computeRetryAfterSeconds", () => {
  it("미래 reset → 양수 초", () => {
    expect(computeRetryAfterSeconds(10_000, 0)).toBe(10);
    expect(computeRetryAfterSeconds(1_500, 0)).toBe(2);
  });

  it("지나간 reset → 최소 1초", () => {
    expect(computeRetryAfterSeconds(0, 5_000)).toBe(1);
    expect(computeRetryAfterSeconds(-9999, 0)).toBe(1);
  });

  it("NaN / Infinity 입력 → 1초 (β-5 sec fix)", () => {
    // Upstash 비정상 응답 / 시계 skew 방어 — RFC 6585 위반 헤더 차단
    expect(computeRetryAfterSeconds(NaN, 0)).toBe(1);
    expect(computeRetryAfterSeconds(0, NaN)).toBe(1);
    expect(computeRetryAfterSeconds(Infinity, 0)).toBe(1);
    expect(computeRetryAfterSeconds(-Infinity, 0)).toBe(1);
  });

  it("비정상적으로 먼 미래 reset → 24시간 상한", () => {
    // year 2099 수준 (≈ 70년 후) 입력 시 헤더에 23억 초 삽입 방어
    const farFuture = 2_300_000_000_000; // 약 73년
    expect(computeRetryAfterSeconds(farFuture, 0)).toBe(86_400);
  });
});
