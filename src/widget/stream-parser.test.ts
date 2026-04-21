import { describe, expect, it } from "vitest";

import { consumeUIMessageStream, StreamError } from "./stream-parser";

/**
 * AI SDK UIMessageStream SSE 포맷 fixture 생성.
 * 각 이벤트는 `data: {...}\n\n` 으로 serialize, 문자열이면 그대로 `data: ...\n\n`.
 */
function makeSseStream(
  events: ReadonlyArray<Record<string, unknown> | string>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        const data = typeof event === "string" ? event : JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }
      controller.close();
    },
  });
}

/** 미리 인코딩한 문자열을 임의 경계로 분할해 여러 chunk 로 흘려보내는 stream. */
function makeChunkedStream(
  raw: string,
  boundary: number,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const a = raw.slice(0, boundary);
  const b = raw.slice(boundary);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(a));
      controller.enqueue(encoder.encode(b));
      controller.close();
    },
  });
}

describe("consumeUIMessageStream", () => {
  it("text-delta 이벤트를 모두 연결해 전체 텍스트를 반환한다", async () => {
    const stream = makeSseStream([
      { type: "start", messageId: "msg_1" },
      { type: "text-start", id: "txt_1" },
      { type: "text-delta", id: "txt_1", delta: "Hello" },
      { type: "text-delta", id: "txt_1", delta: ", " },
      { type: "text-delta", id: "txt_1", delta: "world" },
      { type: "text-end", id: "txt_1" },
      { type: "finish", finishReason: "stop" },
    ]);

    const result = await consumeUIMessageStream(stream);
    expect(result).toBe("Hello, world");
  });

  it("onChunk 콜백이 각 delta 순서대로 호출된다", async () => {
    const stream = makeSseStream([
      { type: "text-delta", delta: "A" },
      { type: "text-delta", delta: "B" },
      { type: "text-delta", delta: "C" },
    ]);
    const chunks: string[] = [];

    await consumeUIMessageStream(stream, {
      onChunk: (delta) => chunks.push(delta),
    });

    expect(chunks).toEqual(["A", "B", "C"]);
  });

  it("화이트리스트 외 이벤트(start/finish/tool-call/reasoning)는 무시한다", async () => {
    const stream = makeSseStream([
      { type: "start" },
      { type: "text-delta", delta: "ok" },
      { type: "tool-call", toolCallId: "t1", toolName: "search" },
      { type: "reasoning-start" },
      { type: "reasoning-end" },
      { type: "finish" },
    ]);

    const result = await consumeUIMessageStream(stream);
    expect(result).toBe("ok");
  });

  it("SSE 주석(`:` 시작) 과 빈 줄은 무시한다", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(":heartbeat\n\n"));
        controller.enqueue(encoder.encode("\n\n"));
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "text-delta", delta: "hi" })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    const result = await consumeUIMessageStream(stream);
    expect(result).toBe("hi");
  });

  it("v1 잔여 [DONE] 신호는 종료로 해석하지 않고 넘긴다(finish 이벤트 또는 EOF 가 종료)", async () => {
    const stream = makeSseStream([
      { type: "text-delta", delta: "ok" },
      "[DONE]",
    ]);

    const result = await consumeUIMessageStream(stream);
    expect(result).toBe("ok");
  });

  it("이벤트 한 개가 chunk 경계에 걸쳐 와도 buffer 에서 이어붙여 해석한다", async () => {
    const raw = `data: ${JSON.stringify({ type: "text-delta", delta: "split-event" })}\n\n`;
    // JSON 중간에서 경계 끊어지도록 의도적 offset
    const stream = makeChunkedStream(raw, 12);

    const result = await consumeUIMessageStream(stream);
    expect(result).toBe("split-event");
  });

  it("깨진 JSON 을 만나면 StreamError('parse_error') 로 throw 한다", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: {not-valid-json\n\n"));
        controller.close();
      },
    });

    await expect(consumeUIMessageStream(stream)).rejects.toMatchObject({
      name: "StreamError",
      code: "parse_error",
    });
  });

  it("`type: error` 이벤트의 errorText 가 화이트리스트면 그 code 로 throw", async () => {
    const stream = makeSseStream([
      { type: "text-delta", delta: "partial" },
      { type: "error", errorText: "upstream_error" },
    ]);

    await expect(consumeUIMessageStream(stream)).rejects.toMatchObject({
      name: "StreamError",
      code: "upstream_error",
    });
  });

  it("`type: error` 이벤트의 errorText 가 화이트리스트 밖이면 upstream_error 로 정규화", async () => {
    const stream = makeSseStream([
      { type: "error", errorText: "Some internal detail that leaked" },
    ]);

    await expect(consumeUIMessageStream(stream)).rejects.toMatchObject({
      code: "upstream_error",
    });
  });

  it("미리 abort 된 signal 이면 StreamError('network_error') 로 즉시 throw", async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = makeSseStream([{ type: "text-delta", delta: "x" }]);

    await expect(
      consumeUIMessageStream(stream, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(StreamError);
  });

  it("소비 중간(onChunk 수신 후)에 abort 되면 network_error 로 즉시 종료", async () => {
    // 사후 abort — 위젯 실사용: 패널 닫기 / 재submit 시 inflight.abort() 시나리오
    // (리뷰 code L-2 반영)
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        const msg = (d: string) =>
          encoder.encode(
            `data: ${JSON.stringify({ type: "text-delta", delta: d })}\n\n`,
          );
        ctrl.enqueue(msg("A"));
        ctrl.enqueue(msg("B"));
        ctrl.close();
      },
    });
    const chunks: string[] = [];

    await expect(
      consumeUIMessageStream(stream, {
        signal: controller.signal,
        onChunk: (d) => {
          chunks.push(d);
          if (chunks.length === 1) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: "StreamError", code: "network_error" });

    expect(chunks).toEqual(["A"]);
  });

  it("buffer 가 MAX_BUFFER_BYTES(64KB) 넘어가는 악성 단일 라인이면 parse_error 중단", async () => {
    // 악성 프록시가 `\n` 없는 거대 페이로드 주입 시 클라 탭 메모리 소진 방지 (sec M-1)
    const huge = "x".repeat(64 * 1024 + 10);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(encoder.encode(huge));
        ctrl.close();
      },
    });

    await expect(consumeUIMessageStream(stream)).rejects.toMatchObject({
      code: "parse_error",
    });
  });

  it("전체 응답이 MAX_FULL_CHARS(32K) 넘으면 upstream_error 로 중단", async () => {
    // 서버 CHAT_MAX_OUTPUT_TOKENS 가 2048(≈8K chars) 이므로 32K 초과는 비정상 (sec M-1)
    const block = "y".repeat(16 * 1024);
    const stream = makeSseStream([
      { type: "text-delta", delta: block },
      { type: "text-delta", delta: block },
      { type: "text-delta", delta: block },
    ]);

    await expect(consumeUIMessageStream(stream)).rejects.toMatchObject({
      code: "upstream_error",
    });
  });
});
