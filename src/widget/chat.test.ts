import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorLabelFor, sendChatMessage } from "./chat";

/**
 * UIMessageStream SSE 응답을 반환하는 Response fixture.
 * `x-conversation-id` 헤더 + text-delta 이벤트 배열.
 */
function makeStreamResponse(
  events: ReadonlyArray<Record<string, unknown>>,
  init: { conversationId?: string; status?: number } = {},
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      }
      controller.close();
    },
  });
  const headers = new Headers({ "content-type": "text/event-stream" });
  if (init.conversationId !== undefined) {
    headers.set("x-conversation-id", init.conversationId);
  }
  return new Response(body, { status: init.status ?? 200, headers });
}

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

  it("UIMessageStream 을 끝까지 소비해 ok:true + 전체 텍스트를 반환한다", async () => {
    fetchSpy.mockResolvedValue(
      makeStreamResponse(
        [
          { type: "text-delta", delta: "안녕" },
          { type: "text-delta", delta: "하세요" },
          { type: "finish" },
        ],
        { conversationId: "conv-1" },
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

  it("onChunk 콜백으로 점진 렌더 delta 를 전달한다", async () => {
    fetchSpy.mockResolvedValue(
      makeStreamResponse(
        [
          { type: "text-delta", delta: "A" },
          { type: "text-delta", delta: "B" },
          { type: "text-delta", delta: "C" },
        ],
        { conversationId: "conv-2" },
      ),
    );
    const chunks: string[] = [];

    const result = await sendChatMessage({
      ...baseInput,
      onChunk: (d) => chunks.push(d),
    });

    expect(chunks).toEqual(["A", "B", "C"]);
    expect(result).toMatchObject({ ok: true, message: "ABC" });
  });

  it("conversationId 가 있으면 body 에 포함한다", async () => {
    fetchSpy.mockResolvedValue(
      makeStreamResponse([{ type: "text-delta", delta: "hi" }], {
        conversationId: "conv-1",
      }),
    );

    await sendChatMessage({ ...baseInput, conversationId: "existing-id" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      message: "hello",
      conversationId: "existing-id",
    });
  });

  it("x-conversation-id 헤더가 없으면 parse_error 로 정규화한다", async () => {
    // 서버 계약 위반 방어 — 200 + stream 이어도 conversationId 없으면 클라가 봇을
    // 이전 대화로 붙일 수 없으므로 실패 처리.
    fetchSpy.mockResolvedValue(
      makeStreamResponse([{ type: "text-delta", delta: "x" }]),
    );

    const result = await sendChatMessage(baseInput);

    expect(result).toEqual({
      ok: false,
      code: "parse_error",
      status: 200,
    });
  });

  it("스트림 중 error 이벤트가 오면 매핑된 code 로 실패한다", async () => {
    fetchSpy.mockResolvedValue(
      makeStreamResponse(
        [
          { type: "text-delta", delta: "부" },
          { type: "text-delta", delta: "분" },
          { type: "error", errorText: "upstream_error" },
        ],
        { conversationId: "conv-err" },
      ),
    );

    const result = await sendChatMessage(baseInput);

    expect(result).toEqual({
      ok: false,
      code: "upstream_error",
      status: 200,
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

  it("fetch 실패는 network_error 로 변환한다", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await sendChatMessage(baseInput);

    expect(result).toEqual({ ok: false, code: "network_error", status: 0 });
  });

  it("AbortSignal 로 취소된 fetch 는 network_error 로 정규화된다", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("aborted", "AbortError");
    fetchSpy.mockRejectedValue(abortError);

    controller.abort();
    const result = await sendChatMessage({
      ...baseInput,
      signal: controller.signal,
    });

    expect(result).toEqual({ ok: false, code: "network_error", status: 0 });
    expect(controller.signal.aborted).toBe(true);
  });

  it("botId 에 특수문자가 있으면 URL 인코딩한다", async () => {
    fetchSpy.mockResolvedValue(
      makeStreamResponse([{ type: "text-delta", delta: "m" }], {
        conversationId: "c",
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
