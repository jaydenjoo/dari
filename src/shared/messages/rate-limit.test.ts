import { describe, expect, it } from "vitest";

import { RATE_LIMIT_MESSAGES, withRetryAfter } from "./rate-limit";

describe("RATE_LIMIT_MESSAGES", () => {
  it("11 지점 키 전부 정의됨", () => {
    expect(RATE_LIMIT_MESSAGES.bot_create).toBeTruthy();
    expect(RATE_LIMIT_MESSAGES.bot_delete).toBeTruthy();
    expect(RATE_LIMIT_MESSAGES.bot_url_ingest).toBeTruthy();
    expect(RATE_LIMIT_MESSAGES.bot_file_ingest).toBeTruthy();
    expect(RATE_LIMIT_MESSAGES.bot_source_remove).toBeTruthy();
    expect(RATE_LIMIT_MESSAGES.conversation_delete).toBeTruthy();
    expect(RATE_LIMIT_MESSAGES.conversation_export).toBeTruthy();
  });
});

describe("withRetryAfter (퍼지 표현 — sec M-1)", () => {
  it("60초 미만 → '(잠시 후 1분 이내 재시도 가능)' (정확한 초 미노출)", () => {
    expect(withRetryAfter("X", 1_000, 0)).toBe(
      "X (잠시 후 1분 이내 재시도 가능)",
    );
    expect(withRetryAfter("X", 30_000, 0)).toBe(
      "X (잠시 후 1분 이내 재시도 가능)",
    );
    expect(withRetryAfter("X", 59_000, 0)).toBe(
      "X (잠시 후 1분 이내 재시도 가능)",
    );
  });

  it("60초~1시간 → '(약 N분 후 재시도 가능)'", () => {
    expect(withRetryAfter("X", 60_000, 0)).toBe("X (약 1분 후 재시도 가능)");
    expect(withRetryAfter("X", 90_000, 0)).toBe("X (약 2분 후 재시도 가능)");
    expect(withRetryAfter("X", 3_540_000, 0)).toBe(
      "X (약 59분 후 재시도 가능)",
    );
  });

  it("1시간 이상 → '(약 N시간 후 재시도 가능)'", () => {
    expect(withRetryAfter("X", 3_600_000, 0)).toBe(
      "X (약 1시간 후 재시도 가능)",
    );
    expect(withRetryAfter("X", 7_200_000, 0)).toBe(
      "X (약 2시간 후 재시도 가능)",
    );
  });

  it("이미 지나간 reset — 최소 1초 (퍼지 적용)", () => {
    expect(withRetryAfter("X", 0, 5_000)).toBe(
      "X (잠시 후 1분 이내 재시도 가능)",
    );
    expect(withRetryAfter("X", -100, 0)).toBe(
      "X (잠시 후 1분 이내 재시도 가능)",
    );
  });
});
