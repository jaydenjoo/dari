import { describe, expect, it } from "vitest";

import { parseConfig } from "./config";

describe("parseConfig", () => {
  const SRC = "https://dairect.kr/widget.js";

  describe("유효한 설정", () => {
    it("botId 와 script.src origin 으로 설정을 구성한다", () => {
      const result = parseConfig(
        { botId: "my-bot" } as DOMStringMap,
        "https://dairect.kr/widget.js",
      );

      expect(result).toEqual({ botId: "my-bot", apiUrl: "https://dairect.kr" });
    });

    it("포트가 있는 origin 도 보존한다", () => {
      const result = parseConfig(
        { botId: "my-bot" } as DOMStringMap,
        "http://localhost:4000/widget.js",
      );

      expect(result).toEqual({
        botId: "my-bot",
        apiUrl: "http://localhost:4000",
      });
    });

    it("대문자 botId 는 소문자로 정규화한다", () => {
      const result = parseConfig({ botId: "MyBot" } as DOMStringMap, SRC);
      expect(result?.botId).toBe("mybot");
    });

    it("주변 공백은 trim 한다", () => {
      const result = parseConfig({ botId: "  my-bot  " } as DOMStringMap, SRC);
      expect(result?.botId).toBe("my-bot");
    });

    it("단일 문자 slug 도 허용한다", () => {
      const result = parseConfig({ botId: "a" } as DOMStringMap, SRC);
      expect(result?.botId).toBe("a");
    });

    it("영숫자·하이픈 혼합 slug 를 허용한다", () => {
      const result = parseConfig({ botId: "abc-123-xyz" } as DOMStringMap, SRC);
      expect(result?.botId).toBe("abc-123-xyz");
    });
  });

  describe("무효한 설정 → null", () => {
    it.each([
      ["botId 누락", {}],
      ["botId 빈 문자열", { botId: "" }],
      ["botId 공백만", { botId: "   " }],
      ["하이픈 시작", { botId: "-mybot" }],
      ["하이픈 끝", { botId: "mybot-" }],
      ["공백 포함", { botId: "my bot" }],
      ["언더스코어 포함", { botId: "my_bot" }],
      ["점 포함", { botId: "my.bot" }],
      ["슬래시 포함", { botId: "my/bot" }],
      ["한글 포함", { botId: "my봇" }],
      ["특수문자", { botId: "my<script>" }],
      ["64자 초과", { botId: "a".repeat(65) }],
    ])("%s 는 거부된다", (_label, dataset) => {
      expect(parseConfig(dataset as DOMStringMap, SRC)).toBeNull();
    });

    it("scriptSrc 가 null 이면 거부한다", () => {
      expect(parseConfig({ botId: "my-bot" } as DOMStringMap, null)).toBeNull();
    });

    it("scriptSrc 가 URL 로 파싱 불가하면 거부한다", () => {
      expect(
        parseConfig({ botId: "my-bot" } as DOMStringMap, "not-a-url"),
      ).toBeNull();
    });

    it("data-api-url 속성은 무시된다 (공격자 서버 redirect 방어)", () => {
      // sec H-1 — data-api-url 을 설정해도 script.src origin 만 사용한다.
      const result = parseConfig(
        {
          botId: "my-bot",
          apiUrl: "https://evil.attacker.example",
        } as DOMStringMap,
        SRC,
      );
      expect(result?.apiUrl).toBe("https://dairect.kr");
    });
  });

  describe("비ASCII 공백 정규화 (재리뷰 sec M-γ)", () => {
    it("BOM(U+FEFF) 으로 시작해도 trim 후 정상 파싱", () => {
      const result = parseConfig(
        { botId: "\uFEFFmy-bot" } as DOMStringMap,
        SRC,
      );
      expect(result?.botId).toBe("my-bot");
    });

    it("NBSP(U+00A0) 로 감싸도 trim 후 정상 파싱", () => {
      const result = parseConfig(
        { botId: "\u00A0my-bot\u00A0" } as DOMStringMap,
        SRC,
      );
      expect(result?.botId).toBe("my-bot");
    });

    it("라인구분자(U+2028/2029) 끝부분은 제거", () => {
      const result = parseConfig(
        { botId: "my-bot\u2028\u2029" } as DOMStringMap,
        SRC,
      );
      expect(result?.botId).toBe("my-bot");
    });

    it("방향 제어(U+202E) 포함은 정규식에서 거부 (ASCII 외)", () => {
      const result = parseConfig({ botId: "my\u202Ebot" } as DOMStringMap, SRC);
      expect(result).toBeNull();
    });
  });
});
