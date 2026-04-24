/**
 * Vercel AI SDK UIMessageStream SSE 파서 — 위젯 번들 전용 (브라우저 환경).
 *
 * 서버 계약: `toUIMessageStreamResponse()` 가 내려주는 SSE 포맷.
 *   data: {"type":"text-delta","id":"...","delta":"Hello"}
 *   data: {"type":"text-delta","id":"...","delta":" world"}
 *   data: {"type":"finish", ...}
 *   data: [DONE]            ← v1 Data Stream 잔여 종료 신호 (대응만, 필수 아님)
 *
 * 화이트리스트 이벤트 타입만 해석하고 나머지 (start / text-start / text-end / finish
 * / tool-call / reasoning 등) 는 조용히 스킵 — 서버가 새 타입 추가해도 클라는 무시.
 *
 * 에러 경로:
 *   - JSON 파싱 실패 → StreamError("parse_error")
 *   - `type: "error"` 이벤트의 errorText 가 화이트리스트 code 면 그 code, 아니면 upstream_error
 *   - ReadableStream abort 는 caller 가 signal.aborted 로 판단해 network_error 로 정규화
 *
 * 모듈은 pure 함수(`consumeUIMessageStream`)만 export — caller 가 전체 텍스트를
 * 받거나, `onChunk` 로 점진 수신. DOM·XHR 의존성 0 이라 단위 테스트 fixture 용이.
 */

import type { WidgetErrorCode } from "./chat";

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<WidgetErrorCode>([
  "network_error",
  "parse_error",
  "too_many_requests",
  "bot_not_available",
  "invalid_body",
  "upstream_error",
  "internal_error",
]);

// 클라 버퍼 DoS 방어 — 서버가 `\n` 없이 무한 바이트를 보내면 buffer 가 탭 메모리를
// 소진할 수 있다. 정상 SSE 이벤트 1 건이 64 KB 를 넘을 수는 없으므로 상한 충분. (sec M-1)
const MAX_BUFFER_BYTES = 64 * 1024;
// assistant 응답 전체 길이 상한. 서버 `CHAT_MAX_OUTPUT_TOKENS=2048` ≈ 영어 8K chars 여유.
// 32K 초과면 악성 서버 / 프록시 주입으로 간주, upstream_error 로 종료.
const MAX_FULL_CHARS = 32 * 1024;
// error 이벤트의 errorText 는 화이트리스트 정규화 후 버려지지만 대형 문자열로 메모리 소비
// 가능. 화이트리스트 최장 코드(`too_many_requests` / `bot_not_available` 17자)도 64자 이하. (sec L-1)
const MAX_ERROR_TEXT_CHARS = 64;

export class StreamError extends Error {
  readonly code: WidgetErrorCode;
  constructor(code: WidgetErrorCode) {
    super(code);
    this.name = "StreamError";
    this.code = code;
  }
}

export interface ConsumeStreamOptions {
  readonly onChunk?: (delta: string) => void;
  readonly signal?: AbortSignal;
}

/**
 * UIMessageStream SSE 를 끝까지 소비하고 전체 텍스트를 반환.
 *
 * 소비 중 `onChunk(delta)` 가 호출되므로 caller 는 DOM 에 점진 렌더 가능.
 * 서버가 보낸 `error` 이벤트는 throw `StreamError` 로 승격 — caller 가 HTTP 상태
 * 와 조합해 화이트리스트 코드로 normalize 한다.
 */
export async function consumeUIMessageStream(
  body: ReadableStream<Uint8Array>,
  options: ConsumeStreamOptions = {},
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  try {
    while (true) {
      if (options.signal?.aborted) throw new StreamError("network_error");

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_BUFFER_BYTES) {
        // 악성 스트림 — 단일 라인이 비정상적으로 크면 파싱 포기
        throw new StreamError("parse_error");
      }

      // SSE 이벤트 경계는 `\n\n` — 하지만 서버에 따라 `\n` 단일 라인일 수도 있어
      // 라인 단위 split 후 `data:` prefix 만 해석. 마지막 불완전 라인은 다음 chunk 와 이어붙임.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        full += handleLine(line, options.onChunk);
        if (full.length > MAX_FULL_CHARS) {
          throw new StreamError("upstream_error");
        }
      }
    }

    // 스트림 flush — 마지막 남은 buffer 가 이벤트 한 줄이면 처리
    buffer += decoder.decode();
    if (buffer.length > 0) {
      full += handleLine(buffer, options.onChunk);
      if (full.length > MAX_FULL_CHARS) {
        throw new StreamError("upstream_error");
      }
    }

    return full;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 이미 stream 이 cancel 된 경우 releaseLock 이 예외를 던질 수 있음 — 무시
    }
  }
}

/**
 * 한 줄 파싱 + onChunk 호출. text-delta 의 delta 값만 반환 (caller 가 full 텍스트 누적).
 * 나머지 이벤트는 빈 문자열 반환.
 */
function handleLine(
  line: string,
  onChunk: ((delta: string) => void) | undefined,
): string {
  const trimmed = line.trim();
  if (trimmed.length === 0) return "";

  // SSE 주석(`:` 로 시작) 은 무시
  if (trimmed.startsWith(":")) return "";

  // `data:` 외 필드(event:, id:, retry:) 는 현재 사용하지 않음
  if (!trimmed.startsWith("data:")) return "";

  const data = trimmed.slice("data:".length).trim();

  // v1 Data Stream 잔여 종료 신호. UIMessageStream v2 는 finish 이벤트 + EOF 로 종료.
  if (data === "[DONE]") return "";

  let event: unknown;
  try {
    event = JSON.parse(data);
  } catch {
    throw new StreamError("parse_error");
  }

  if (!isEventObject(event)) return "";

  switch (event.type) {
    case "text-delta": {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (delta.length > 0 && onChunk) {
        // 외부 콜백 예외가 전파되면 caller 의 `err instanceof StreamError` 분기를 벗어나
        // parse_error 로 오정규화된다. UI 렌더 예외는 내부에서 흡수. (code M-2)
        try {
          onChunk(delta);
        } catch {
          // 조용한 삼킴 — 현재 widget.ts 의 onChunk 는 DOM 연산만으로 throw 불가능하나
          // 방어적 프로그래밍 + 향후 콜백 계약 변경 시 안전 유지.
        }
      }
      return delta;
    }
    case "error": {
      // 서버 onError 반환 문자열 (우리 서버 계약: `upstream_error` 같은 화이트리스트 code)
      // 또는 AI SDK 기본 포맷 { type: "error", errorText: "..." }
      // 대형 문자열은 화이트리스트 조회에 쓸모 없으므로 slice 로 메모리 방어. (sec L-1)
      const raw =
        typeof event.errorText === "string"
          ? event.errorText
          : typeof event.message === "string"
            ? event.message
            : "";
      const errorText = raw.slice(0, MAX_ERROR_TEXT_CHARS);
      const code = KNOWN_ERROR_CODES.has(errorText)
        ? (errorText as WidgetErrorCode)
        : "upstream_error";
      throw new StreamError(code);
    }
    default:
      // start / text-start / text-end / finish / tool-* / reasoning-* 등은 현 위젯 미사용
      return "";
  }
}

function isEventObject(
  value: unknown,
): value is { type: string; [key: string]: unknown } {
  if (value === null || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string";
}
