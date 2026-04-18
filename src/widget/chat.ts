/**
 * Chat API 클라이언트 — 위젯 번들 전용.
 *
 * 서버 계약 (src/app/api/chat/[botId]/route.ts):
 *   POST /api/chat/{botSlug}
 *   요청:  { message: string (1-4000), conversationId?: uuid }
 *   성공:  200 { conversationId: string, message: string }
 *   실패:  4xx/5xx { error: string, code: ErrorCode }
 *
 * 에러 코드는 서버와 클라이언트가 공유하는 화이트리스트 union.
 * 서버가 알 수 없는 code 를 반환하거나 body 가 누락되면 internal_error 로 정규화 (sec M-6/A09).
 */

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

  const body = await safeJson(response);

  if (!response.ok) {
    return {
      ok: false,
      code: extractKnownCode(body) ?? "internal_error",
      status: response.status,
    };
  }

  if (!isSuccessBody(body)) {
    return { ok: false, code: "parse_error", status: response.status };
  }

  return {
    ok: true,
    conversationId: body.conversationId,
    message: body.message,
  };
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

function isSuccessBody(
  body: unknown,
): body is { conversationId: string; message: string } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return typeof b.conversationId === "string" && typeof b.message === "string";
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
