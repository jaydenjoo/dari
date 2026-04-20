import { describe, expect, it } from "vitest";

import {
  DEFAULT_RANGE,
  EMPTY_STATS,
  parseBotStats,
  parseRange,
  rangeToSince,
  type RangeKey,
} from "./stats-util";

describe("parseRange", () => {
  it("유효한 값은 그대로 반환", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("90d")).toBe("90d");
    expect(parseRange("all")).toBe("all");
  });

  it("문자열 외 타입 (undefined/null/number) 은 기본값", () => {
    expect(parseRange(undefined)).toBe(DEFAULT_RANGE);
    expect(parseRange(null)).toBe(DEFAULT_RANGE);
    expect(parseRange(7)).toBe(DEFAULT_RANGE);
  });

  it("미등록 문자열 (조작 시도 포함) 은 기본값으로 폴백", () => {
    expect(parseRange("365d")).toBe(DEFAULT_RANGE);
    expect(parseRange("")).toBe(DEFAULT_RANGE);
    expect(parseRange("<script>")).toBe(DEFAULT_RANGE);
    expect(parseRange("7D")).toBe(DEFAULT_RANGE); // case-sensitive
    expect(parseRange(" 7d")).toBe(DEFAULT_RANGE); // 공백 차단
  });

  it("기본값은 '7d'", () => {
    expect(DEFAULT_RANGE).toBe<RangeKey>("7d");
  });
});

describe("rangeToSince", () => {
  // 기준 시각 고정 — 타임존 무관. 계산은 UTC 기준 ms diff.
  const NOW = new Date("2026-04-20T12:00:00.000Z");

  it("'7d' 는 정확히 7일 전", () => {
    expect(rangeToSince("7d", NOW)).toBe("2026-04-13T12:00:00.000Z");
  });

  it("'30d' 는 정확히 30일 전", () => {
    expect(rangeToSince("30d", NOW)).toBe("2026-03-21T12:00:00.000Z");
  });

  it("'90d' 는 정확히 90일 전", () => {
    expect(rangeToSince("90d", NOW)).toBe("2026-01-20T12:00:00.000Z");
  });

  it("'all' 은 epoch (1970-01-01) 반환 — RPC 에서 >= 조건 전통과", () => {
    expect(rangeToSince("all", NOW)).toBe("1970-01-01T00:00:00.000Z");
  });

  it("반환 문자열은 RPC 호출 가능한 ISO 8601 UTC 형식 (Z 종결)", () => {
    const out = rangeToSince("30d", NOW);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("parseBotStats", () => {
  it("정상 RPC 결과는 그대로 반환", () => {
    const raw = {
      conversationCount: 12,
      conversationTotal: 50,
      activeCount: 3,
      messageCount: 200,
      totalTokens: 45000,
    };
    expect(parseBotStats(raw)).toEqual(raw);
  });

  it("null / undefined 는 EMPTY_STATS 폴백", () => {
    expect(parseBotStats(null)).toEqual(EMPTY_STATS);
    expect(parseBotStats(undefined)).toEqual(EMPTY_STATS);
  });

  it("필드 누락은 EMPTY_STATS (부분 반영 금지 — 전부 또는 무)", () => {
    expect(parseBotStats({ conversationCount: 5 })).toEqual(EMPTY_STATS);
  });

  it("음수 / 소수 / NaN / Infinity 는 EMPTY_STATS (int/nonnegative 검증)", () => {
    expect(
      parseBotStats({
        conversationCount: -1,
        conversationTotal: 0,
        activeCount: 0,
        messageCount: 0,
        totalTokens: 0,
      }),
    ).toEqual(EMPTY_STATS);
    expect(
      parseBotStats({
        conversationCount: 1.5,
        conversationTotal: 0,
        activeCount: 0,
        messageCount: 0,
        totalTokens: 0,
      }),
    ).toEqual(EMPTY_STATS);
    expect(
      parseBotStats({
        conversationCount: Number.NaN,
        conversationTotal: 0,
        activeCount: 0,
        messageCount: 0,
        totalTokens: 0,
      }),
    ).toEqual(EMPTY_STATS);
    expect(
      parseBotStats({
        conversationCount: Number.POSITIVE_INFINITY,
        conversationTotal: 0,
        activeCount: 0,
        messageCount: 0,
        totalTokens: 0,
      }),
    ).toEqual(EMPTY_STATS);
  });

  it("문자열 / 숫자 자체 / 배열 등 구조 불일치는 EMPTY_STATS", () => {
    expect(parseBotStats("1")).toEqual(EMPTY_STATS);
    expect(parseBotStats(42)).toEqual(EMPTY_STATS);
    expect(parseBotStats([])).toEqual(EMPTY_STATS);
  });

  it("추가 필드는 무시하고 알려진 5 필드만 추출", () => {
    const raw = {
      conversationCount: 1,
      conversationTotal: 2,
      activeCount: 3,
      messageCount: 4,
      totalTokens: 5,
      extraEvilField: "<script>alert(1)</script>",
    };
    expect(parseBotStats(raw)).toEqual({
      conversationCount: 1,
      conversationTotal: 2,
      activeCount: 3,
      messageCount: 4,
      totalTokens: 5,
    });
  });
});
