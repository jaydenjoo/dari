/**
 * 위젯 런타임 — Shadow DOM 루트 + 대화 상태 + Chat API 송수신.
 *
 * Task 1-6-d: `startWidget(config, brand)` 로 봇별 브랜드(이름·인사말·색상·위치·폰트) 주입.
 * brand 로드 실패는 `DEFAULT_BRAND` 로 폴백 — 위젯 자체는 반드시 표시.
 *
 * 설계 결정:
 *   - try/finally 로 input lock 영구 고착 방지 (code H-3)
 *   - AbortController 로 패널 닫기 / 중복 submit 시 요청 취소 (code M-2)
 *   - 사용자 입력 제어문자 사전 제거 — Prompt Injection 선제 완화 (sec M-4, M-α, M-β)
 *   - 완전한 인젝션 방어는 서버 Task 1-0-c 에서 수행
 */

import { errorLabelFor, sendChatMessage, type SendMessageResult } from "./chat";
import type { WidgetConfig } from "./config";
import { mountShadowRoot, type ShadowRootRefs } from "./ui";
import type { WidgetBrand } from "./widget-config-client";

const STORAGE_PREFIX = "dari.widget.cid.";

// 제어문자 차단 — C0 (0x00-0x1F) + DEL (0x7F) + C1 (0x80-0x9F).
// tab(0x09)·개행(0x0A)·CR(0x0D) 은 정상 입력으로 보존. (재리뷰 sec M-α)
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

// Unicode 방향 제어 + isolate + BOM + Tag characters 차단.
// ZWSP(U+200B)/ZWNJ(U+200C)/ZWJ(U+200D) 는 이모지 결합 등 정상 입력에 쓰여 제외. (재리뷰 sec M-β)
const UNICODE_CONTROL_RE =
  /[\u202A-\u202E\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;

interface WidgetState {
  config: WidgetConfig;
  brand: WidgetBrand;
  refs: ShadowRootRefs;
  conversationId: string | null;
  panelOpen: boolean;
  sending: boolean;
  inflight: AbortController | null;
}

export function startWidget(config: WidgetConfig, brand: WidgetBrand): void {
  if (document.getElementById("dari-widget-host")) {
    // 중복 주입 방어 — 같은 페이지에 스크립트가 두 번 로드돼도 단일 위젯 유지.
    return;
  }

  const host = document.createElement("div");
  host.id = "dari-widget-host";
  document.body.appendChild(host);

  const refs = mountShadowRoot(host, brand);
  const state: WidgetState = {
    config,
    brand,
    refs,
    conversationId: readStoredConversation(config.botId),
    panelOpen: false,
    sending: false,
    inflight: null,
  };

  refs.launcher.addEventListener("click", () => togglePanel(state));
  refs.closeButton.addEventListener("click", () => setPanelOpen(state, false));

  refs.input.addEventListener("input", () => autoResize(refs.input));
  refs.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submit(state);
    }
  });

  refs.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit(state);
  });

  appendAssistant(state, brand.welcomeMessage);
}

function togglePanel(state: WidgetState): void {
  setPanelOpen(state, !state.panelOpen);
}

function setPanelOpen(state: WidgetState, open: boolean): void {
  state.panelOpen = open;
  state.refs.panel.hidden = !open;
  state.refs.launcher.setAttribute("aria-expanded", open ? "true" : "false");

  // 닫기 시 inflight 요청 취소 — 닫힌 패널 위에 응답이 도달해 상태 꼬임 방지.
  if (!open && state.inflight) {
    state.inflight.abort();
    state.inflight = null;
  }

  if (open) {
    // 포커스 이동은 다음 프레임에 (hidden 해제 직후 focus 는 브라우저에 따라 취소됨)
    requestAnimationFrame(() => state.refs.input.focus());
  }
}

async function submit(state: WidgetState): Promise<void> {
  if (state.sending) return;
  const raw = state.refs.input.value.trim();
  if (raw.length === 0) return;
  const text = sanitizeUserInput(raw);
  if (text.length === 0) return;

  clearError(state);
  appendUser(state, text);
  state.refs.input.value = "";
  autoResize(state.refs.input);

  const pending = appendAssistantPending(state);

  // 중복 submit 방지: sending 가드가 먼저지만, 혹시라도 남은 inflight 는 취소.
  state.inflight?.abort();
  const controller = new AbortController();
  state.inflight = controller;

  setSending(state, true);

  let result: SendMessageResult;
  try {
    result = await sendChatMessage({
      botId: state.config.botId,
      apiUrl: state.config.apiUrl,
      message: text,
      conversationId: state.conversationId ?? undefined,
      signal: controller.signal,
    });
  } finally {
    if (state.inflight === controller) state.inflight = null;
    setSending(state, false);
  }

  if (!result.ok) {
    pending.remove();
    // 사용자가 의도적으로 취소(패널 닫기·재submit)한 경우 에러 표시 안 함.
    if (controller.signal.aborted) return;
    showError(state, errorLabelFor(result.code));
    return;
  }

  pending.classList.remove("dari-msg--pending");
  pending.textContent = result.message;

  if (result.conversationId !== state.conversationId) {
    state.conversationId = result.conversationId;
    writeStoredConversation(state.config.botId, result.conversationId);
  }
}

function setSending(state: WidgetState, sending: boolean): void {
  state.sending = sending;
  state.refs.submit.disabled = sending;
  state.refs.input.disabled = sending;
}

function appendUser(state: WidgetState, text: string): HTMLDivElement {
  return appendMessage(state, "user", text, false);
}

function appendAssistant(state: WidgetState, text: string): HTMLDivElement {
  return appendMessage(state, "assistant", text, false);
}

function appendAssistantPending(state: WidgetState): HTMLDivElement {
  return appendMessage(state, "assistant", "…", true);
}

function appendMessage(
  state: WidgetState,
  role: "user" | "assistant",
  text: string,
  pending: boolean,
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `dari-msg dari-msg--${role}${
    pending ? " dari-msg--pending" : ""
  }`;
  // textContent — HTML 렌더 금지 (XSS 방어). 마크다운은 Phase 2 에 DOMPurify 도입 시 허용.
  el.textContent = text;
  state.refs.messages.appendChild(el);
  state.refs.messages.scrollTop = state.refs.messages.scrollHeight;
  return el;
}

function showError(state: WidgetState, label: string): void {
  state.refs.errorBar.textContent = label;
  state.refs.errorBar.hidden = false;
}

function clearError(state: WidgetState): void {
  state.refs.errorBar.textContent = "";
  state.refs.errorBar.hidden = true;
}

function autoResize(input: HTMLTextAreaElement): void {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}

/**
 * 제어문자 + Unicode 방향/Tag 문자 제거 — Prompt Injection 선제 방어의 얕은 층.
 * 완전 방어는 서버측 Task 1-0-c 에서 수행 (이 함수는 서버 통과율 향상과 운영 위생 용도).
 */
export function sanitizeUserInput(text: string): string {
  return text.replace(CONTROL_CHAR_RE, "").replace(UNICODE_CONTROL_RE, "");
}

function readStoredConversation(botId: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + botId);
  } catch {
    // localStorage 비활성 (private mode, 쿠키 차단) 에서는 조용히 무시 — 세션 내 대화만 유지
    return null;
  }
}

function writeStoredConversation(botId: string, value: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + botId, value);
  } catch {
    // 쓰기 실패 시에도 진행 — 다음 요청에서 서버가 새 conversationId 를 재발급함
  }
}
