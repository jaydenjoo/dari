import { describe, expect, it } from "vitest";

import { sanitizeUserInput } from "./widget";

describe("sanitizeUserInput", () => {
  describe("정상 입력 보존", () => {
    it("평범한 한글/영문 메시지는 변형되지 않는다", () => {
      expect(sanitizeUserInput("안녕하세요 hello!")).toBe("안녕하세요 hello!");
    });

    it("개행·탭은 보존된다", () => {
      expect(sanitizeUserInput("line1\nline2\tindented")).toBe(
        "line1\nline2\tindented",
      );
    });

    it("이모지와 ZWJ 결합은 보존된다 (가족 이모지 등)", () => {
      const family = "👨\u200D👩\u200D👧";
      expect(sanitizeUserInput(family)).toBe(family);
    });
  });

  describe("C0 제어문자 제거 (0x00-0x1F, 0x7F)", () => {
    it("null byte 제거", () => {
      expect(sanitizeUserInput("hello\x00world")).toBe("helloworld");
    });

    it("DEL(0x7F) 제거", () => {
      expect(sanitizeUserInput("a\x7Fb")).toBe("ab");
    });

    it("BELL(0x07)·ESC(0x1B) 제거", () => {
      expect(sanitizeUserInput("a\x07b\x1Bc")).toBe("abc");
    });
  });

  describe("C1 제어문자 제거 (0x80-0x9F) — 재리뷰 sec M-α", () => {
    it("C1 범위 바이트 제거", () => {
      expect(sanitizeUserInput("a\x80b\x9Fc")).toBe("abc");
    });
  });

  describe("Unicode 방향 제어 제거 — 재리뷰 sec M-β", () => {
    it("RTL Override(U+202E) 제거 — 렌더 공격 방어", () => {
      expect(sanitizeUserInput("file\u202Etxt.exe")).toBe("filetxt.exe");
    });

    it("LRE/RLE/PDF(U+202A-U+202C) 제거", () => {
      expect(sanitizeUserInput("a\u202Ab\u202Bc\u202Cd")).toBe("abcd");
    });

    it("isolate 시퀀스(U+2066-U+2069) 제거", () => {
      expect(sanitizeUserInput("a\u2066b\u2069c")).toBe("abc");
    });

    it("BOM(U+FEFF) 제거", () => {
      expect(sanitizeUserInput("\uFEFFhello")).toBe("hello");
    });
  });

  describe("Tag characters 제거 (U+E0000-U+E007F) — LLM 인젝션 벡터", () => {
    it("Language Tag 범위 제거", () => {
      const tagged = "question\u{E0065}\u{E006E}"; // invisible "en" tag
      expect(sanitizeUserInput(tagged)).toBe("question");
    });
  });

  describe("조합 시나리오", () => {
    it("C0 + C1 + Unicode 제어가 한 문자열에 섞여도 전부 제거", () => {
      const malicious = "admin\x00\x9F\u202Eroot";
      expect(sanitizeUserInput(malicious)).toBe("adminroot");
    });

    it("빈 문자열은 그대로 빈 문자열을 반환한다", () => {
      expect(sanitizeUserInput("")).toBe("");
    });

    it("제어문자만 들어오면 빈 문자열이 된다", () => {
      expect(sanitizeUserInput("\x00\u202E\uFEFF")).toBe("");
    });
  });
});
