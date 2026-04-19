import { describe, it, expect } from "vitest";

import { sanitizeKnowledgeText } from "./sanitize";

describe("sanitizeKnowledgeText", () => {
  it("일반 텍스트 + 줄바꿈/탭 보존", () => {
    const input = "라인1\n라인2\t탭\n\n빈 줄 뒤 이모지 🎉";
    expect(sanitizeKnowledgeText(input)).toBe(input);
  });

  it("NULL byte 제거 (Postgres text 22021 방어)", () => {
    expect(sanitizeKnowledgeText("foo\u0000bar\u0000\u0000baz")).toBe(
      "foobarbaz",
    );
  });

  it("Unicode RLO/LRO/PDF (방향 override) 제거 — Trojan Source 변형 방어", () => {
    // U+202E RLO + U+202D LRO + U+202C PDF
    const input = "정상\u202E역방향\u202D가짜\u202C끝";
    expect(sanitizeKnowledgeText(input)).toBe("정상역방향가짜끝");
  });

  it("제로폭 계열(ZWSP, ZWNJ, ZWJ) 제거", () => {
    // U+200B ZWSP + U+200C ZWNJ + U+200D ZWJ + U+200E LRM
    const input = "a\u200Bb\u200Cc\u200Dd\u200Ee";
    expect(sanitizeKnowledgeText(input)).toBe("abcde");
  });

  it("BOM(U+FEFF) 제거", () => {
    expect(sanitizeKnowledgeText("\uFEFF내용\uFEFF")).toBe("내용");
  });

  it("Tag Characters(U+E0000-U+E007F) 제거 — 은닉 명령어 주입 방어", () => {
    const input = `정상${String.fromCodePoint(0xe0041)}${String.fromCodePoint(0xe007f)}끝`;
    expect(sanitizeKnowledgeText(input)).toBe("정상끝");
  });

  it("빈 문자열 → 빈 문자열", () => {
    expect(sanitizeKnowledgeText("")).toBe("");
  });

  it("복합: NULL + 방향제어 + BOM 전부 섞인 경우", () => {
    const input = "\uFEFFok\u0000text\u202Ereverse\u200B!";
    expect(sanitizeKnowledgeText(input)).toBe("oktextreverse!");
  });
});
