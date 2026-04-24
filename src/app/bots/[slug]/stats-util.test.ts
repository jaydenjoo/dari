import { describe, expect, it } from "vitest";

import {
  DEFAULT_RANGE,
  EMPTY_STATS,
  aggregateDailyWithCost,
  computeUsdCents,
  enumerateKoreanDays,
  formatUsdCents,
  koreanDayLabel,
  parseBotStats,
  parseBotStatsDaily,
  parseRange,
  rangeToChartSince,
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

// ─────────────────────────────────────────────────────────────────────────────
// Task B-4: 일별 차트 + 원가 환산
// ─────────────────────────────────────────────────────────────────────────────

describe("rangeToChartSince", () => {
  const NOW = new Date("2026-04-20T12:00:00.000Z");

  it("'7d' / '30d' / '90d' 는 rangeToSince 와 동일", () => {
    expect(rangeToChartSince("7d", NOW)).toBe(rangeToSince("7d", NOW));
    expect(rangeToChartSince("30d", NOW)).toBe(rangeToSince("30d", NOW));
    expect(rangeToChartSince("90d", NOW)).toBe(rangeToSince("90d", NOW));
  });

  it("'all' 은 90d 로 cap (bar 과다 방지) — rangeToSince('all') 과 다름", () => {
    const chart = rangeToChartSince("all", NOW);
    const kpi = rangeToSince("all", NOW);
    expect(chart).toBe("2026-01-20T12:00:00.000Z"); // now - 90d
    expect(kpi).toBe("1970-01-01T00:00:00.000Z"); // epoch
    expect(chart).not.toBe(kpi);
  });
});

describe("parseBotStatsDaily", () => {
  it("빈 배열 → 빈 배열", () => {
    expect(parseBotStatsDaily([])).toEqual([]);
  });

  it("유효한 row 배열은 그대로 반환", () => {
    const raw = [
      { day: "2026-04-20", messages: 5, tokens: 100 },
      { day: "2026-04-21", messages: 3, tokens: 50 },
    ];
    expect(parseBotStatsDaily(raw)).toEqual(raw);
  });

  it("null / undefined / 비배열 은 빈 배열 폴백", () => {
    expect(parseBotStatsDaily(null)).toEqual([]);
    expect(parseBotStatsDaily(undefined)).toEqual([]);
    expect(parseBotStatsDaily("garbage")).toEqual([]);
    expect(parseBotStatsDaily({ day: "2026-04-20" })).toEqual([]);
  });

  it("day 가 YYYY-MM-DD regex 미일치면 전체 배열 폴백 (부분 수용 금지)", () => {
    expect(
      parseBotStatsDaily([
        { day: "2026-04-20", messages: 5, tokens: 100 },
        { day: "2026/04/21", messages: 3, tokens: 50 }, // invalid
      ]),
    ).toEqual([]);
  });

  it("messages / tokens 음수 / 소수 / NaN 은 전체 배열 폴백", () => {
    expect(
      parseBotStatsDaily([{ day: "2026-04-20", messages: -1, tokens: 100 }]),
    ).toEqual([]);
    expect(
      parseBotStatsDaily([{ day: "2026-04-20", messages: 1.5, tokens: 100 }]),
    ).toEqual([]);
    expect(
      parseBotStatsDaily([
        { day: "2026-04-20", messages: Number.NaN, tokens: 100 },
      ]),
    ).toEqual([]);
  });
});

describe("computeUsdCents", () => {
  it("1M tokens × $1.00/1M = $1.00 = 100 cents", () => {
    expect(computeUsdCents(1_000_000, 1.0)).toBe(100);
  });

  it("500K tokens × $2.00/1M = $1.00 = 100 cents", () => {
    expect(computeUsdCents(500_000, 2.0)).toBe(100);
  });

  it("100K tokens × $3.50/1M = 35 cents (Haiku 4.5 blended)", () => {
    expect(computeUsdCents(100_000, 3.5)).toBe(35);
  });

  it("0 tokens 는 0 cents", () => {
    expect(computeUsdCents(0, 3.5)).toBe(0);
  });

  it("음수 / NaN / Infinity 는 0 (silent 폴백)", () => {
    expect(computeUsdCents(-100, 3.5)).toBe(0);
    expect(computeUsdCents(Number.NaN, 3.5)).toBe(0);
    expect(computeUsdCents(Number.POSITIVE_INFINITY, 3.5)).toBe(0);
  });

  it("음수 단가 / NaN 단가 도 0 (운영 실수 방어)", () => {
    expect(computeUsdCents(1_000_000, -1.0)).toBe(0);
    expect(computeUsdCents(1_000_000, Number.NaN)).toBe(0);
  });

  it("반올림: 4.5 cents → 5 cents (Math.round 절반 올림)", () => {
    // 45 tokens × $1/1M × 100 cents = 0.0045 cents → 반올림 0
    expect(computeUsdCents(45, 1.0)).toBe(0);
    // 12857 tokens × $3.5/1M × 100 cents = 4.4999 cents → 반올림 4
    expect(computeUsdCents(12857, 3.5)).toBe(4);
    // 12858 tokens × $3.5/1M × 100 cents ≈ 4.5003 cents → 반올림 5
    expect(computeUsdCents(12858, 3.5)).toBe(5);
  });
});

describe("koreanDayLabel", () => {
  it("UTC 자정은 KST 09:00 → 같은 날짜 라벨", () => {
    expect(koreanDayLabel(new Date("2026-04-20T00:00:00Z"))).toBe("2026-04-20");
  });

  it("UTC 14:00 은 KST 23:00 → 같은 날짜", () => {
    expect(koreanDayLabel(new Date("2026-04-20T14:00:00Z"))).toBe("2026-04-20");
  });

  it("UTC 15:00 은 KST 다음날 00:00 → 다음 날짜", () => {
    expect(koreanDayLabel(new Date("2026-04-20T15:00:00Z"))).toBe("2026-04-21");
  });

  it("UTC 23:59 는 KST 다음날 08:59 → 다음 날짜", () => {
    expect(koreanDayLabel(new Date("2026-04-20T23:59:00Z"))).toBe("2026-04-21");
  });

  it("반환 포맷은 YYYY-MM-DD (en-CA 로케일 기본)", () => {
    expect(koreanDayLabel(new Date("2026-01-05T00:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("enumerateKoreanDays", () => {
  it("since 와 now 가 같은 KST day 면 1개 라벨", () => {
    const d = new Date("2026-04-20T12:00:00Z"); // KST 21:00
    expect(enumerateKoreanDays(d, d)).toEqual(["2026-04-20"]);
  });

  it("3일 범위 (KST 기준) 는 3개 라벨 오름차순", () => {
    const since = new Date("2026-04-20T00:00:00Z"); // KST 04-20 09:00
    const now = new Date("2026-04-22T00:00:00Z"); // KST 04-22 09:00
    expect(enumerateKoreanDays(since, now)).toEqual([
      "2026-04-20",
      "2026-04-21",
      "2026-04-22",
    ]);
  });

  it("since > now 는 빈 배열 (역전 방어)", () => {
    const since = new Date("2026-04-25T00:00:00Z");
    const now = new Date("2026-04-20T00:00:00Z");
    expect(enumerateKoreanDays(since, now)).toEqual([]);
  });

  it("월 경계 넘기: 4-30 → 5-1 → 5-2", () => {
    const since = new Date("2026-04-30T00:00:00Z");
    const now = new Date("2026-05-02T00:00:00Z");
    expect(enumerateKoreanDays(since, now)).toEqual([
      "2026-04-30",
      "2026-05-01",
      "2026-05-02",
    ]);
  });

  it("7d range 는 8개 라벨 (경계 포함)", () => {
    const now = new Date("2026-04-20T00:00:00Z");
    const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    expect(enumerateKoreanDays(since, now)).toHaveLength(8);
  });
});

describe("aggregateDailyWithCost", () => {
  const RATE = 3.5; // USD per 1M tokens
  const SINCE = new Date("2026-04-18T00:00:00Z"); // KST 04-18 09:00
  const NOW = new Date("2026-04-20T00:00:00Z"); // KST 04-20 09:00

  it("빈 rows + 3일 범위 → 3일 모두 0", () => {
    const result = aggregateDailyWithCost([], RATE, SINCE, NOW);
    expect(result).toEqual([
      { day: "2026-04-18", messages: 0, tokens: 0, usdCents: 0 },
      { day: "2026-04-19", messages: 0, tokens: 0, usdCents: 0 },
      { day: "2026-04-20", messages: 0, tokens: 0, usdCents: 0 },
    ]);
  });

  it("누락된 day 는 0 채움 + usdCents 계산", () => {
    const rows = [
      { day: "2026-04-19", messages: 10, tokens: 1_000_000 },
      // 2026-04-18, 2026-04-20 누락
    ];
    const result = aggregateDailyWithCost(rows, RATE, SINCE, NOW);
    expect(result).toEqual([
      { day: "2026-04-18", messages: 0, tokens: 0, usdCents: 0 },
      { day: "2026-04-19", messages: 10, tokens: 1_000_000, usdCents: 350 }, // $3.50
      { day: "2026-04-20", messages: 0, tokens: 0, usdCents: 0 },
    ]);
  });

  it("rows 는 enumeratedDays 와 day 단위로 매칭 (Map 기반)", () => {
    const rows = [
      { day: "2026-04-18", messages: 1, tokens: 100 },
      { day: "2026-04-20", messages: 3, tokens: 300 },
    ];
    const result = aggregateDailyWithCost(rows, RATE, SINCE, NOW);
    expect(result[0]).toEqual({
      day: "2026-04-18",
      messages: 1,
      tokens: 100,
      usdCents: 0, // 100 × 3.5 / 1M × 100 = 0.035 → 반올림 0
    });
    expect(result[1]).toEqual({
      day: "2026-04-19",
      messages: 0,
      tokens: 0,
      usdCents: 0,
    });
    expect(result[2]).toEqual({
      day: "2026-04-20",
      messages: 3,
      tokens: 300,
      usdCents: 0,
    });
  });

  it("range 바깥의 row 는 무시 (enumerateDays 가 범위 제한)", () => {
    const rows = [
      { day: "2026-04-15", messages: 999, tokens: 999 }, // range 이전
      { day: "2026-04-19", messages: 1, tokens: 1_000_000 },
    ];
    const result = aggregateDailyWithCost(rows, RATE, SINCE, NOW);
    expect(result).toHaveLength(3);
    const april15 = result.find((r) => r.day === "2026-04-15");
    expect(april15).toBeUndefined();
  });
});

describe("formatUsdCents", () => {
  it("0 cents → '$0.00'", () => {
    expect(formatUsdCents(0)).toBe("$0.00");
  });

  it("100 cents → '$1.00'", () => {
    expect(formatUsdCents(100)).toBe("$1.00");
  });

  it("12345 cents → '$123.45'", () => {
    expect(formatUsdCents(12345)).toBe("$123.45");
  });

  it("1000000 cents → '$10,000.00' (천단위 구분)", () => {
    expect(formatUsdCents(1_000_000)).toBe("$10,000.00");
  });

  it("음수 / NaN 은 '$0.00' (silent 폴백)", () => {
    expect(formatUsdCents(-100)).toBe("$0.00");
    expect(formatUsdCents(Number.NaN)).toBe("$0.00");
  });
});
