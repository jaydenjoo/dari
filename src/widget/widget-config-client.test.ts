import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_BRAND,
  loadWidgetBrand,
  normalizeBrand,
} from "./widget-config-client";

describe("normalizeBrand", () => {
  const VALID = {
    widget: {
      name: "Chatsio 도우미",
      welcomeMessage: "안녕하세요! 무엇을 도와드릴까요?",
      placeholder: "메시지를 입력해주세요",
      language: "ja",
      avatar: "https://cdn.example/avatar.png",
      primaryColor: "#1a5eb8",
      position: "bottom-right",
      buttonSize: 60,
      borderRadius: 20,
      fontFamily: "Pretendard, sans-serif",
    },
  };

  it("정상 응답을 모두 보존한다", () => {
    const brand = normalizeBrand(VALID);
    expect(brand.name).toBe("Chatsio 도우미");
    expect(brand.primaryColor).toBe("#1a5eb8");
    expect(brand.position).toBe("bottom-right");
    expect(brand.buttonSize).toBe(60);
    expect(brand.avatar).toBe("https://cdn.example/avatar.png");
    expect(brand.language).toBe("ja");
  });

  it("language 가 화이트리스트 외 값이면 기본값 ko 사용", () => {
    const tainted = { widget: { ...VALID.widget, language: "fr" } };
    expect(normalizeBrand(tainted).language).toBe("ko");
  });

  it("language 필드 누락 시 기본값 ko", () => {
    const { language: _removed, ...rest } = VALID.widget;
    void _removed;
    expect(normalizeBrand({ widget: rest }).language).toBe("ko");
  });

  it("widget 필드 자체가 없으면 DEFAULT_BRAND 로 폴백", () => {
    expect(normalizeBrand({})).toEqual(DEFAULT_BRAND);
    expect(normalizeBrand(null)).toEqual(DEFAULT_BRAND);
    expect(normalizeBrand("string")).toEqual(DEFAULT_BRAND);
  });

  it("primaryColor 가 hex 형식이 아니면 기본값 사용 (CSS injection 방어)", () => {
    const tainted = {
      widget: { ...VALID.widget, primaryColor: "red; } body{display:none" },
    };
    expect(normalizeBrand(tainted).primaryColor).toBe(
      DEFAULT_BRAND.primaryColor,
    );
  });

  it("position 이 화이트리스트 외 값이면 기본값 사용", () => {
    const tainted = { widget: { ...VALID.widget, position: "center" } };
    expect(normalizeBrand(tainted).position).toBe(DEFAULT_BRAND.position);
  });

  it("buttonSize 가 범위 밖(40~80)이면 기본값 사용", () => {
    const tooBig = { widget: { ...VALID.widget, buttonSize: 200 } };
    expect(normalizeBrand(tooBig).buttonSize).toBe(DEFAULT_BRAND.buttonSize);
    const tooSmall = { widget: { ...VALID.widget, buttonSize: 10 } };
    expect(normalizeBrand(tooSmall).buttonSize).toBe(DEFAULT_BRAND.buttonSize);
  });

  it("avatar 가 javascript: 스킴이면 무시", () => {
    const evil = {
      widget: { ...VALID.widget, avatar: "javascript:alert(1)" },
    };
    expect(normalizeBrand(evil).avatar).toBeUndefined();
  });

  it("fontFamily 가 특수문자(`expression(`) 를 포함하면 기본값 사용", () => {
    const evil = {
      widget: {
        ...VALID.widget,
        fontFamily: "expression(alert(1))",
      },
    };
    expect(normalizeBrand(evil).fontFamily).toBe(DEFAULT_BRAND.fontFamily);
  });

  it("fontFamily 에 작은따옴표가 포함되면 기본값 사용 (재리뷰 sec M-3)", () => {
    // `Pretendard', 'Arial` 같은 입력은 `"..."` 포장 시 단일 폰트로 잘못 해석됨.
    const tainted = {
      widget: { ...VALID.widget, fontFamily: "Pretendard', 'Arial" },
    };
    expect(normalizeBrand(tainted).fontFamily).toBe(DEFAULT_BRAND.fontFamily);
  });

  it("welcomeMessage 가 500 자 초과면 기본값 사용", () => {
    const tooLong = {
      widget: { ...VALID.widget, welcomeMessage: "a".repeat(501) },
    };
    expect(normalizeBrand(tooLong).welcomeMessage).toBe(
      DEFAULT_BRAND.welcomeMessage,
    );
  });

  it("타입이 다른 필드는 기본값으로 폴백 (예: buttonSize 문자열)", () => {
    const mistyped = {
      widget: { ...VALID.widget, buttonSize: "56" },
    };
    expect(normalizeBrand(mistyped).buttonSize).toBe(DEFAULT_BRAND.buttonSize);
  });
});

describe("loadWidgetBrand", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("200 + 정상 body 를 정규화해 반환한다", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          widget: {
            name: "Chatsio 도우미",
            welcomeMessage: "반갑습니다",
            placeholder: "입력",
            language: "ko",
            primaryColor: "#1a5eb8",
            position: "top-left",
            buttonSize: 48,
            borderRadius: 12,
            fontFamily: "Pretendard",
          },
        }),
        { status: 200 },
      ),
    );

    const brand = await loadWidgetBrand("my-bot", "https://dairect.kr");

    expect(brand.name).toBe("Chatsio 도우미");
    expect(brand.position).toBe("top-left");
    expect(brand.primaryColor).toBe("#1a5eb8");

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://dairect.kr/api/widget-config/my-bot");
  });

  it("fetch 실패는 DEFAULT_BRAND 로 폴백 (silent)", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    const brand = await loadWidgetBrand("my-bot", "https://dairect.kr");

    expect(brand).toEqual(DEFAULT_BRAND);
  });

  it("4xx/5xx 응답은 DEFAULT_BRAND 로 폴백", async () => {
    fetchSpy.mockResolvedValue(new Response("not found", { status: 404 }));

    const brand = await loadWidgetBrand("my-bot", "https://dairect.kr");

    expect(brand).toEqual(DEFAULT_BRAND);
  });

  it("JSON 파싱 실패는 DEFAULT_BRAND 로 폴백", async () => {
    fetchSpy.mockResolvedValue(
      new Response("not a json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const brand = await loadWidgetBrand("my-bot", "https://dairect.kr");

    expect(brand).toEqual(DEFAULT_BRAND);
  });

  it("botId 에 특수문자가 있으면 URL 인코딩한다", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ widget: {} }), { status: 200 }),
    );

    await loadWidgetBrand("bot slug", "https://dairect.kr");

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe("https://dairect.kr/api/widget-config/bot%20slug");
  });
});
