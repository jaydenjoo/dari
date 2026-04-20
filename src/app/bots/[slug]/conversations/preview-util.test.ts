import { describe, expect, it } from "vitest";

import { pickFirstUserMessage, truncatePreview } from "./preview-util";

describe("pickFirstUserMessage", () => {
  it("여러 user 메시지 중 가장 이른 created_at 반환", () => {
    const msgs = [
      {
        role: "assistant",
        content: "a",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        role: "user",
        content: "두번째",
        created_at: "2026-01-01T00:01:00Z",
      },
      {
        role: "user",
        content: "첫번째",
        created_at: "2026-01-01T00:00:30Z",
      },
    ];
    expect(pickFirstUserMessage(msgs)?.content).toBe("첫번째");
  });

  it("user 메시지가 없으면 null", () => {
    const msgs = [
      {
        role: "assistant",
        content: "a",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        role: "system",
        content: "b",
        created_at: "2026-01-01T00:01:00Z",
      },
    ];
    expect(pickFirstUserMessage(msgs)).toBeNull();
  });

  it("빈 배열이면 null", () => {
    expect(pickFirstUserMessage([])).toBeNull();
  });

  it("입력 순서가 역순이어도 최초 user 메시지 선택", () => {
    const msgs = [
      {
        role: "user",
        content: "최신",
        created_at: "2026-01-01T10:00:00Z",
      },
      {
        role: "user",
        content: "최초",
        created_at: "2026-01-01T01:00:00Z",
      },
    ];
    expect(pickFirstUserMessage(msgs)?.content).toBe("최초");
  });
});

describe("truncatePreview", () => {
  it("max 이하면 원본 반환", () => {
    expect(truncatePreview("안녕", 10)).toBe("안녕");
  });

  it("max 초과면 절단 후 말줄임표", () => {
    expect(truncatePreview("0123456789012", 10)).toBe("0123456789…");
  });

  it("기본 max=80 적용", () => {
    const s = "a".repeat(81);
    expect(truncatePreview(s)).toBe("a".repeat(80) + "…");
  });

  it("정확히 max 길이면 원본", () => {
    const s = "a".repeat(80);
    expect(truncatePreview(s)).toBe(s);
  });

  it("빈 문자열은 빈 문자열", () => {
    expect(truncatePreview("", 10)).toBe("");
  });
});
