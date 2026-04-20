import { describe, expect, it } from "vitest";

import { formatRelative } from "./relative";

const NOW = new Date("2026-04-20T10:00:00Z");
const minuteAgo = (n: number) =>
  new Date(NOW.getTime() - n * 60 * 1000).toISOString();
const hourAgo = (n: number) => minuteAgo(n * 60);
const dayAgo = (n: number) => hourAgo(n * 24);

describe("formatRelative", () => {
  it("1분 미만 → `방금 전`", () => {
    expect(formatRelative(minuteAgo(0), NOW)).toBe("방금 전");
    // 30초 전도 1분 미만으로 "방금 전"
    const thirtySecAgo = new Date(NOW.getTime() - 30 * 1000).toISOString();
    expect(formatRelative(thirtySecAgo, NOW)).toBe("방금 전");
  });

  it("1~59분 → `N분 전` (경계 포함)", () => {
    expect(formatRelative(minuteAgo(1), NOW)).toBe("1분 전");
    expect(formatRelative(minuteAgo(5), NOW)).toBe("5분 전");
    expect(formatRelative(minuteAgo(59), NOW)).toBe("59분 전");
  });

  it("60분 → `1시간 전` (경계 넘어감)", () => {
    expect(formatRelative(minuteAgo(60), NOW)).toBe("1시간 전");
  });

  it("1~23시간 → `N시간 전`", () => {
    expect(formatRelative(hourAgo(1), NOW)).toBe("1시간 전");
    expect(formatRelative(hourAgo(23), NOW)).toBe("23시간 전");
  });

  it("24시간 → `1일 전`", () => {
    expect(formatRelative(hourAgo(24), NOW)).toBe("1일 전");
  });

  it("1~29일 → `N일 전`", () => {
    expect(formatRelative(dayAgo(1), NOW)).toBe("1일 전");
    expect(formatRelative(dayAgo(29), NOW)).toBe("29일 전");
  });

  it("30일 이상 → ko-KR 날짜 형식", () => {
    const result = formatRelative(dayAgo(30), NOW);
    // toLocaleDateString("ko-KR") 포맷은 Node 버전별 약간 차이 → 숫자/연도만 검증.
    expect(result).toMatch(/\d+/);
    expect(result).not.toBe("30일 전");
  });

  it("default now (두 번째 인자 생략) 로도 동작", () => {
    // 현재 시각 → 1분 미만이므로 `방금 전`.
    expect(formatRelative(new Date().toISOString())).toBe("방금 전");
  });
});
