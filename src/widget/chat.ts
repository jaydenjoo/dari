/**
 * Chat API 클라이언트 — 위젯 번들 전용.
 *
 * 서버 계약 (Task A-4, Vercel AI SDK Data Stream Protocol):
 *   POST /api/chat/{botSlug}
 *   요청:  { message: string (1-4000), conversationId?: uuid }
 *   성공:  200 + `x-conversation-id` 응답 헤더 + UIMessageStream SSE body
 *          (chunk 별 `text-delta` 이벤트 → 최종 전체 텍스트는 누적)
 *   실패:  4xx/5xx { error: string, code: ErrorCode }  (JSON 단일 응답 유지)
 *
 * 에러 코드는 서버와 클라이언트가 공유하는 화이트리스트 union.
 * 서버가 알 수 없는 code 를 반환하거나 body 가 누락되면 internal_error 로 정규화 (sec M-6).
 * 스트림 중 에러 이벤트의 errorText 도 동일 화이트리스트로 normalize.
 */

import {
  consumeUIMessageStream,
  StreamError,
  type ConsumeStreamOptions,
} from "./stream-parser";

export type WidgetErrorCode =
  | "network_error"
  | "parse_error"
  | "too_many_requests"
  | "bot_not_available"
  | "origin_not_allowed"
  | "invalid_body"
  | "upstream_error"
  | "internal_error";

const KNOWN_ERROR_CODES: ReadonlySet<WidgetErrorCode> =
  new Set<WidgetErrorCode>([
    "network_error",
    "parse_error",
    "too_many_requests",
    "bot_not_available",
    "origin_not_allowed",
    "invalid_body",
    "upstream_error",
    "internal_error",
  ]);

export interface SendMessageInput {
  readonly botId: string;
  readonly apiUrl: string;
  readonly message: string;
  readonly conversationId?: string;
  readonly signal?: AbortSignal;
  /** 스트림 chunk 도착 시마다 호출 — UI 에 점진 렌더용. */
  readonly onChunk?: ConsumeStreamOptions["onChunk"];
}

export type SendMessageResult =
  | { ok: true; conversationId: string; message: string }
  | { ok: false; code: WidgetErrorCode; status: number };

export async function sendChatMessage(
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const url = `${input.apiUrl}/api/chat/${encodeURIComponent(input.botId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input.message,
        ...(input.conversationId
          ? { conversationId: input.conversationId }
          : {}),
      }),
      signal: input.signal,
    });
  } catch {
    // AbortError 도 이 분기로 들어오며, caller 는 signal.aborted 로 구분 가능.
    return { ok: false, code: "network_error", status: 0 };
  }

  // 에러 응답은 스트림이 아니라 JSON 단일 — 기존 경로 유지
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      code: extractKnownCode(body) ?? "internal_error",
      status: response.status,
    };
  }

  // 성공 경로: UIMessageStream 소비
  const conversationId = response.headers.get("x-conversation-id");
  if (!conversationId) {
    // 서버 계약 위반 — 헤더 없이 200 오는 경우. 정적 에러 코드로 정규화.
    return { ok: false, code: "parse_error", status: response.status };
  }
  if (!response.body) {
    return { ok: false, code: "parse_error", status: response.status };
  }

  try {
    const message = await consumeUIMessageStream(response.body, {
      onChunk: input.onChunk,
      signal: input.signal,
    });
    return { ok: true, conversationId, message };
  } catch (err) {
    if (err instanceof StreamError) {
      return { ok: false, code: err.code, status: response.status };
    }
    // fetch 이미 성공한 뒤 중간 중단 — AbortError 는 caller signal.aborted 로 구분
    if (input.signal?.aborted) {
      return { ok: false, code: "network_error", status: response.status };
    }
    return { ok: false, code: "parse_error", status: response.status };
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractKnownCode(body: unknown): WidgetErrorCode | null {
  if (!body || typeof body !== "object" || !("code" in body)) return null;
  const code = (body as { code: unknown }).code;
  if (typeof code !== "string") return null;
  // 화이트리스트 외 code 는 거부 — 서버 실수로 내부 식별자가 새어도 사용자에 노출되지 않음.
  return (KNOWN_ERROR_CODES as ReadonlySet<string>).has(code)
    ? (code as WidgetErrorCode)
    : null;
}

export const ERROR_LABELS: Record<WidgetErrorCode, string> = {
  network_error: "연결이 끊어졌어요. 인터넷 상태를 확인해 주세요.",
  parse_error: "응답을 이해하지 못했어요. 잠시 후 다시 시도해 주세요.",
  too_many_requests: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  bot_not_available: "지금은 답변할 수 없어요.",
  origin_not_allowed: "이 페이지에서는 사용할 수 없어요.",
  invalid_body: "메시지 형식을 확인해 주세요.",
  upstream_error: "답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  internal_error: "일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
};

export function errorLabelFor(code: WidgetErrorCode): string {
  return ERROR_LABELS[code];
}
