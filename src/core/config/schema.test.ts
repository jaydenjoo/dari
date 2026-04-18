import { describe, it, expect } from "vitest";
import {
  analyticsSchema,
  businessHoursSchema,
  CURRENT_CONFIG_VERSION,
  dariConfigSchema,
} from "./schema";

describe("dariConfigSchema", () => {
  const minimalValidInput = {
    botId: "test-bot",
    identity: {
      name: "테스트 봇",
      welcomeMessage: "안녕하세요",
    },
    ai: {
      systemPrompt: "당신은 테스트용 봇입니다. 친절하게 답변해 주세요.",
    },
  };

  it("최소 입력으로 파싱 성공 + 모든 default 주입", () => {
    const result = dariConfigSchema.parse(minimalValidInput);

    expect(result.version).toBe(CURRENT_CONFIG_VERSION);
    expect(result.identity.language).toBe("ko");
    expect(result.identity.placeholder).toBe("질문을 입력하세요...");
    expect(result.ai.model).toBe("claude-sonnet-4-6");
    expect(result.ai.temperature).toBe(0.7);
    expect(result.ai.maxTokens).toBe(1024);
    expect(result.ai.ragEnabled).toBe(true);
    expect(result.appearance.theme).toBe("light");
    expect(result.appearance.primaryColor).toBe("#2b7cff");
    expect(result.appearance.position).toBe("bottom-right");
    expect(result.analytics.enabled).toBe(true);
    expect(result.knowledge.sources).toEqual([]);
    expect(result.allowedDomains).toEqual([]);
  });

  it("botId가 규칙 위반이면 실패한다", () => {
    const invalidBotIds = [
      "-starts-with-hyphen",
      "ends-with-hyphen-",
      "UPPER",
      "ab",
      "spaces not allowed",
      "special@chars",
    ];
    for (const botId of invalidBotIds) {
      expect(() =>
        dariConfigSchema.parse({ ...minimalValidInput, botId }),
      ).toThrow();
    }
  });

  it("필수 필드(ai.systemPrompt) 누락 시 실패한다", () => {
    expect(() =>
      dariConfigSchema.parse({
        botId: "test-bot",
        identity: { name: "테스트", welcomeMessage: "안녕" },
        ai: {},
      }),
    ).toThrow();
  });

  it("nested default 패턴: behavior.businessHours/handoff 하위까지 default 주입", () => {
    const result = dariConfigSchema.parse(minimalValidInput);

    expect(result.behavior.mode).toBe("support");
    expect(result.behavior.collectEmail).toBe(false);
    expect(result.behavior.businessHours.enabled).toBe(false);
    expect(result.behavior.businessHours.timezone).toBe("Asia/Seoul");
    expect(result.behavior.businessHours.hours).toBe("09:00-18:00");
    expect(result.behavior.handoff.enabled).toBe(false);
    expect(result.behavior.handoff.channel).toBe("none");
    expect(result.behavior.handoff.trigger).toBe("상담원 연결");
  });

  it("businessHours.hours 형식 위반 시 실패한다", () => {
    const invalidHoursFormats = ["9-18", "09:00 - 18:00", "0900-1800", "abc"];
    for (const hours of invalidHoursFormats) {
      expect(() =>
        dariConfigSchema.parse({
          ...minimalValidInput,
          behavior: { businessHours: { hours } },
        }),
      ).toThrow();
    }
  });

  // ─── SSRF 방어 (security M-1, 재리뷰 CRITICAL 반영) ───
  describe("analyticsSchema.webhookUrl SSRF 방어", () => {
    it("정상 외부 https URL 은 통과", () => {
      const ok = analyticsSchema.parse({
        webhookUrl: "https://api.example.com/webhook",
      });
      expect(ok.webhookUrl).toBe("https://api.example.com/webhook");
    });

    it("http / file / ftp 스킴은 거부", () => {
      for (const url of [
        "http://example.com/x",
        "ftp://example.com/x",
        "file:///etc/passwd",
      ]) {
        expect(() => analyticsSchema.parse({ webhookUrl: url })).toThrow();
      }
    });

    it("IPv4 사설/loopback 대역은 거부", () => {
      for (const host of [
        "127.0.0.1",
        "10.0.0.1",
        "192.168.1.1",
        "172.16.0.1",
        "172.31.255.255",
        "169.254.169.254", // AWS IMDS
        "0.0.0.0",
        "localhost",
      ]) {
        expect(() =>
          analyticsSchema.parse({ webhookUrl: `https://${host}/x` }),
        ).toThrow();
      }
    });

    it("IPv6 loopback / ULA / link-local / IPv4-mapped 는 거부", () => {
      for (const host of [
        "[::1]",
        "[::]",
        "[fc00::1]", // ULA
        "[fd12::1]", // ULA
        "[fe80::1]", // link-local
        "[::ffff:127.0.0.1]", // IPv4-mapped loopback
        "[::ffff:10.0.0.1]", // IPv4-mapped 사설
        "[::ffff:7f00:1]", // 16진 IPv4-mapped
      ]) {
        expect(() =>
          analyticsSchema.parse({ webhookUrl: `https://${host}/x` }),
        ).toThrow();
      }
    });

    it("정상 IPv6 (예: GitHub) 는 통과", () => {
      // 2606:50c0::/32 = GitHub Pages, 외부 공인 IPv6.
      const ok = analyticsSchema.parse({
        webhookUrl: "https://[2606:50c0::1]/x",
      });
      expect(ok.webhookUrl).toBe("https://[2606:50c0::1]/x");
    });

    it("undefined (미설정) 은 통과", () => {
      const ok = analyticsSchema.parse({});
      expect(ok.webhookUrl).toBeUndefined();
    });
  });

  // ─── timezone IANA 허용 범위 (security L-2 + 재리뷰 LOW) ───
  describe("businessHoursSchema.timezone", () => {
    it("일반 IANA + Etc/GMT+9 같은 +/- 표기 통과", () => {
      for (const tz of [
        "Asia/Seoul",
        "America/Argentina/Buenos_Aires",
        "Etc/GMT+9",
        "Etc/GMT-3",
      ]) {
        expect(() =>
          businessHoursSchema.parse({ enabled: true, timezone: tz }),
        ).not.toThrow();
      }
    });

    it("의도적으로 비정상인 값은 거부", () => {
      for (const tz of ["Asia/Seoul; DROP", "../etc/passwd", "한국"]) {
        expect(() =>
          businessHoursSchema.parse({ enabled: true, timezone: tz }),
        ).toThrow();
      }
    });
  });

  it("discriminated union: text source 파싱", () => {
    const result = dariConfigSchema.parse({
      ...minimalValidInput,
      knowledge: {
        sources: [
          {
            type: "text",
            title: "공지사항",
            content: "운영시간 안내: 평일 9시-18시".padEnd(30, "."),
          },
        ],
      },
    });

    expect(result.knowledge.sources).toHaveLength(1);
    const source = result.knowledge.sources[0];
    expect(source.type).toBe("text");
    if (source.type === "text") {
      expect(source.title).toBe("공지사항");
      expect(source.content.length).toBeGreaterThanOrEqual(10);
    }
  });
});
