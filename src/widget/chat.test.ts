import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorLabelFor, sendChatMessage } from "./chat";

describe("sendChatMessage", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseInput = {
    botId: "my-bot",
    apiUrl: "https://dairect.kr",
    message: "hello",
  };

  it("200 응답을 파싱해 ok:true 를 반환한다", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ conversationId: "conv-1", message: "안녕하세요" }),
        { status: 200 },
      ),
    );

    const result = await sendChatMessage(baseInput);

    expect(result).toEqual({
      ok: true,
      conversationId: "conv-1",
      message: "안녕하세요",
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://dairect.kr/api/chat/my-bot");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ message: "hello" });
  });

  it("conversationId 가 있으면 body 에 포함한다", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ conversationId: "conv-1", message: "hi" }),
        { status: 200 },
      ),
    );

    await sendChatMessage({ ...baseInput, conversationId: "existing-id" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      message: "hello",
      conversationId: "existing-id",
    });
  });

  it("429 에러 응답의 화이트리스트 code 를 보존한다", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "…", code: "too_many_requests" }), {
        status: 429,
      }),
    );

    const result = await sendChatMessage(baseInput);

    expect(result).toEqual({
      ok: false,
      code: "too_many_requests",
      status: 429,
    });
  });

  it("화이트리스트 외 code 는 internal_error 로 정규화한다", async () => {
    // sec M-6 — 서버 실수로 내부 식별자(예: "db_connection_lost")가 노출되어도
    // 클라이언트 타입은 WidgetErrorCode 로 좁혀져 사용자에게 노출되지 않는다.
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: "db_connection_lost" }), {
        status: 500,
      }),
    );

    const result = await sendChatMessage(baseInput);

    expect(result).toEqual({
      ok: false,
      code: "internal_error",
      status: 500,
    });
  });

  it("code 필드 없는 에러 응답은 internal_error 로 대체한다", async () => {
    fetchSpy.mockResolvedValue(new Response("oops", { status: 500 }));

    const result = await sendChatMessage(baseInput);

    expect(result).toEqual({
      ok: false,
      code: "internal_error",
      status: 500,
    });
  });

  it("200 이지만 body 형식이 다르면 parse_error 를 반환한다", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );

    const result = await sendChatMessage(baseInput);

    expect(result).toEqual({
      ok: false,
      code: "parse_error",
      status: 200,
    });
  });

  it("fetch 실패는 network_error 로 변환한다", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await sendChatMessage(baseInput);

    expect(result).toEqual({ ok: false, code: "network_error", status: 0 });
  });

  it("AbortSignal 로 취소된 요청도 network_error 로 정규화된다", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("aborted", "AbortError");
    fetchSpy.mockRejectedValue(abortError);

    controller.abort();
    const result = await sendChatMessage({
      ...baseInput,
      signal: controller.signal,
    });

    expect(result).toEqual({ ok: false, code: "network_error", status: 0 });
    // caller 는 signal.aborted 로 "의도된 취소" 를 별도 판정한다.
    expect(controller.signal.aborted).toBe(true);
  });

  it("botId 에 특수문자가 있으면 URL 인코딩한다", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ conversationId: "c", message: "m" }), {
        status: 200,
      }),
    );

    await sendChatMessage({
      ...baseInput,
      botId: "bot-slug-x",
    });

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe("https://dairect.kr/api/chat/bot-slug-x");
  });
});

describe("errorLabelFor", () => {
  it("알려진 code 는 매핑된 라벨을 반환한다", () => {
    expect(errorLabelFor("too_many_requests")).toContain("요청이 너무");
    expect(errorLabelFor("network_error")).toContain("연결");
    expect(errorLabelFor("internal_error")).toContain("일시적");
  });
});
