import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatFullTime,
  formatMessageTime,
  isValidUuid,
  sumTokens,
} from "./meta-util";

describe("isValidUuid", () => {
  it("정상 UUID 형식은 true", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUuid("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(true);
  });

  it("대문자 허용 (Postgres uuid 타입과 호환)", () => {
    expect(isValidUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("빈 문자열 / 하이픈 누락 / 길이 틀림은 false", () => {
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid("550e8400e29b41d4a716446655440000")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-a716-4466554400000")).toBe(false);
  });

  it("16진수 외 문자 포함 시 false", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-44665544000g")).toBe(false);
    expect(isValidUuid("zzzzzzzz-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("공백/개행 섞인 경우 false (DB 왕복 회피)", () => {
    expect(isValidUuid(" 550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000 ")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000\n")).toBe(false);
  });
});

describe("sumTokens", () => {
  it("빈 배열은 0", () => {
    expect(sumTokens([])).toBe(0);
  });

  it("모두 null 이면 0", () => {
    expect(sumTokens([{ tokens_used: null }, { tokens_used: null }])).toBe(0);
  });

  it("일부 null 이면 숫자 합만 반환", () => {
    expect(
      sumTokens([
        { tokens_used: 10 },
        { tokens_used: null },
        { tokens_used: 5 },
      ]),
    ).toBe(15);
  });

  it("모두 숫자면 전체 합산", () => {
    expect(
      sumTokens([
        { tokens_used: 100 },
        { tokens_used: 250 },
        { tokens_used: 50 },
      ]),
    ).toBe(400);
  });

  it("0 은 정상 처리 (null 과 구분)", () => {
    expect(sumTokens([{ tokens_used: 0 }, { tokens_used: 10 }])).toBe(10);
  });
});

describe("formatMessageTime (Asia/Seoul)", () => {
  it("UTC 05:30 → KST 14:30", () => {
    // 2026-04-20T05:30:00Z → 2026-04-20T14:30:00+09:00
    expect(formatMessageTime("2026-04-20T05:30:00.000Z")).toBe("14:30");
  });

  it("자정 경계 (UTC 15:00 → KST 00:00 다음날)", () => {
    expect(formatMessageTime("2026-04-20T15:00:00.000Z")).toBe("00:00");
  });

  it("invalid ISO 는 정적 `—` 반환 (내부 문자열 노출 차단)", () => {
    expect(formatMessageTime("not-a-date")).toBe("—");
    expect(formatMessageTime("")).toBe("—");
  });
});

describe("formatFullTime (Asia/Seoul)", () => {
  it("UTC → KST 연월일+시각", () => {
    expect(formatFullTime("2026-04-20T05:30:00.000Z")).toBe("2026-04-20 14:30");
  });

  it("연도 경계 (UTC 12-31 15:00 → KST 01-01 00:00 다음해)", () => {
    expect(formatFullTime("2026-12-31T15:00:00.000Z")).toBe("2027-01-01 00:00");
  });

  it("invalid ISO 는 정적 `—` 반환", () => {
    expect(formatFullTime("invalid")).toBe("—");
    expect(formatFullTime("")).toBe("—");
  });
});

describe("formatDuration", () => {
  it("0초", () => {
    expect(formatDuration("2026-04-20T10:00:00Z", "2026-04-20T10:00:00Z")).toBe(
      "0초",
    );
  });

  it("초 단위 (60초 미만)", () => {
    expect(formatDuration("2026-04-20T10:00:00Z", "2026-04-20T10:00:30Z")).toBe(
      "30초",
    );
  });

  it("분 단위 (60분 미만)", () => {
    expect(formatDuration("2026-04-20T10:00:00Z", "2026-04-20T10:05:00Z")).toBe(
      "5분",
    );
  });

  it("시간+분", () => {
    expect(formatDuration("2026-04-20T10:00:00Z", "2026-04-20T11:30:00Z")).toBe(
      "1시간 30분",
    );
  });

  it("정각 시간만 (나머지 분 0)", () => {
    expect(formatDuration("2026-04-20T10:00:00Z", "2026-04-20T12:00:00Z")).toBe(
      "2시간",
    );
  });

  it("일+시간", () => {
    expect(formatDuration("2026-04-20T10:00:00Z", "2026-04-22T15:00:00Z")).toBe(
      "2일 5시간",
    );
  });

  it("정각 일만 (나머지 시간 0)", () => {
    expect(formatDuration("2026-04-20T10:00:00Z", "2026-04-23T10:00:00Z")).toBe(
      "3일",
    );
  });

  it("end < start 는 `—` fallback (데이터 이상 방어)", () => {
    expect(formatDuration("2026-04-20T11:00:00Z", "2026-04-20T10:00:00Z")).toBe(
      "—",
    );
  });

  it("invalid ISO 는 `—` fallback", () => {
    expect(formatDuration("invalid", "2026-04-20T10:00:00Z")).toBe("—");
    expect(formatDuration("2026-04-20T10:00:00Z", "invalid")).toBe("—");
  });
});
