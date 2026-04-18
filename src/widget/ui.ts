/**
 * Shadow DOM 루트 + 라이브 스타일시트 + 봇별 브랜드 변수 주입.
 *
 * 호스트 사이트 CSS 오염 차단을 위해 closed Shadow DOM 사용.
 * Tailwind 런타임 주입 불가 → 디자인 시스템 v2 토큰을 raw CSS 로 수동 이식.
 *
 * Task 1-6-d: brand 로 `--dari-brand` / 폰트 / 버튼 크기 / panel radius / position 오버라이드.
 * 호버 효과는 `filter: brightness(0.88)` 로 통일 — brand hover 색을 별도 계산할 필요 없음.
 *
 * 접근성 기본:
 *   - 버튼: aria-label, role="button"
 *   - 패널: role="dialog", aria-modal="true", aria-labelledby
 *   - 메시지 영역: role="log", aria-live="polite"
 */

import type { WidgetBrand } from "./widget-config-client";

export interface ShadowRootRefs {
  readonly shadow: ShadowRoot;
  readonly launcher: HTMLButtonElement;
  readonly panel: HTMLDivElement;
  readonly messages: HTMLDivElement;
  readonly form: HTMLFormElement;
  readonly input: HTMLTextAreaElement;
  readonly submit: HTMLButtonElement;
  readonly closeButton: HTMLButtonElement;
  readonly titleEl: HTMLHeadingElement;
  readonly avatarEl: HTMLImageElement;
  readonly errorBar: HTMLDivElement;
}

export function mountShadowRoot(
  host: HTMLElement,
  brand: WidgetBrand,
): ShadowRootRefs {
  const shadow = host.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = WIDGET_CSS;
  shadow.appendChild(styleEl);

  const container = document.createElement("div");
  container.className = "dari-root";
  container.dataset.position = brand.position;

  // 브랜드 변수 주입 — CSS 변수로 격리. 값은 widget-config-client.ts 에서 정규식 검증 후라
  // CSS injection 경로 없음. 폰트는 사용자 정의 가능하므로 따옴표 포장 (스페이스·다국어 대응).
  container.style.setProperty("--dari-brand", brand.primaryColor);
  container.style.setProperty("--dari-button-size", `${brand.buttonSize}px`);
  container.style.setProperty("--dari-panel-radius", `${brand.borderRadius}px`);
  container.style.setProperty(
    "--dari-font",
    `"${brand.fontFamily}", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif`,
  );

  container.innerHTML = TEMPLATE;
  shadow.appendChild(container);

  const titleEl = container.querySelector<HTMLHeadingElement>(".dari-title");
  const avatarEl = container.querySelector<HTMLImageElement>(".dari-avatar");
  const launcher = container.querySelector<HTMLButtonElement>(".dari-launcher");
  const panel = container.querySelector<HTMLDivElement>(".dari-panel");
  const messages = container.querySelector<HTMLDivElement>(".dari-messages");
  const form = container.querySelector<HTMLFormElement>(".dari-form");
  const input = container.querySelector<HTMLTextAreaElement>(".dari-input");
  const submit = container.querySelector<HTMLButtonElement>(".dari-submit");
  const closeButton = container.querySelector<HTMLButtonElement>(".dari-close");
  const errorBar = container.querySelector<HTMLDivElement>(".dari-error");

  if (
    !titleEl ||
    !avatarEl ||
    !launcher ||
    !panel ||
    !messages ||
    !form ||
    !input ||
    !submit ||
    !closeButton ||
    !errorBar
  ) {
    throw new Error("dari widget: template 요소를 찾을 수 없어요.");
  }

  titleEl.textContent = brand.name;
  input.placeholder = brand.placeholder;

  if (brand.avatar) {
    avatarEl.src = brand.avatar;
    avatarEl.alt = brand.name;
    avatarEl.hidden = false;
  }

  return {
    shadow,
    launcher,
    panel,
    messages,
    form,
    input,
    submit,
    closeButton,
    titleEl,
    avatarEl,
    errorBar,
  };
}

const TEMPLATE = `
  <button type="button" class="dari-launcher" aria-label="대화 시작하기">
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="currentColor" d="M12 3C6.48 3 2 7.03 2 12c0 1.74.56 3.36 1.52 4.72L2 21l4.47-1.42A10.54 10.54 0 0 0 12 21c5.52 0 10-4.03 10-9s-4.48-9-10-9zm-4 10a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
    </svg>
  </button>
  <div class="dari-panel" role="dialog" aria-modal="true" aria-labelledby="dari-title" hidden>
    <header class="dari-header">
      <img class="dari-avatar" alt="" hidden referrerpolicy="no-referrer" />
      <h2 class="dari-title" id="dari-title"></h2>
      <button type="button" class="dari-close" aria-label="대화 닫기">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M18.3 5.71L12 12.01l-6.3-6.3-1.4 1.4 6.3 6.3-6.3 6.3 1.4 1.4 6.3-6.3 6.3 6.3 1.4-1.4-6.3-6.3 6.3-6.3z"/>
        </svg>
      </button>
    </header>
    <div class="dari-messages" role="log" aria-live="polite"></div>
    <div class="dari-error" role="alert" hidden></div>
    <form class="dari-form">
      <textarea
        class="dari-input"
        rows="1"
        placeholder="메시지를 입력하세요"
        aria-label="메시지"
        maxlength="4000"
        required
      ></textarea>
      <button type="submit" class="dari-submit" aria-label="보내기">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    </form>
  </div>
`;

const WIDGET_CSS = `
  :host,
  .dari-root {
    --dari-brand: #2b7cff;
    --dari-button-size: 56px;
    --dari-panel-radius: 16px;
    --dari-gray-50: #fafbfc;
    --dari-gray-100: #f1f3f5;
    --dari-gray-200: #e2e6ea;
    --dari-gray-500: #6c757d;
    --dari-gray-700: #3d4551;
    --dari-gray-900: #1a1e24;
    --dari-shadow-md:
      0 2px 8px rgba(0, 0, 0, 0.04),
      0 4px 16px rgba(0, 0, 0, 0.06);
    --dari-shadow-lg:
      0 4px 12px rgba(0, 0, 0, 0.05),
      0 12px 32px rgba(0, 0, 0, 0.12);
    --dari-font:
      "Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
      "Segoe UI", Roboto, sans-serif;
    all: initial;
    font-family: var(--dari-font);
    color: var(--dari-gray-900);
  }
  * {
    box-sizing: border-box;
  }
  .dari-root {
    position: fixed;
    z-index: 2147483000;
  }
  /* position variants */
  .dari-root[data-position="bottom-right"] { right: 20px; bottom: 20px; }
  .dari-root[data-position="bottom-left"]  { left: 20px;  bottom: 20px; }
  .dari-root[data-position="top-right"]    { right: 20px; top: 20px; }
  .dari-root[data-position="top-left"]     { left: 20px;  top: 20px; }

  .dari-launcher {
    width: var(--dari-button-size);
    height: var(--dari-button-size);
    border: 0;
    border-radius: 50%;
    background: var(--dari-brand);
    color: #fff;
    box-shadow: var(--dari-shadow-lg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
  }
  .dari-launcher:hover {
    filter: brightness(0.88);
    transform: translateY(-2px);
  }
  .dari-launcher:focus-visible {
    outline: 2px solid var(--dari-brand);
    outline-offset: 3px;
  }
  .dari-launcher[aria-expanded="true"] {
    transform: scale(0.92);
  }

  .dari-panel {
    position: absolute;
    width: 360px;
    max-width: calc(100vw - 32px);
    height: 520px;
    max-height: calc(100vh - 120px);
    background: #ffffff;
    border-radius: calc(var(--dari-panel-radius) + 4px);
    box-shadow: var(--dari-shadow-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: dari-rise 220ms ease-out;
  }
  .dari-panel[hidden] {
    display: none;
  }
  /* panel 위치 — launcher 기준 반대쪽 오프셋 */
  .dari-root[data-position^="bottom-"] .dari-panel {
    bottom: calc(var(--dari-button-size) + 16px);
  }
  .dari-root[data-position^="top-"] .dari-panel {
    top: calc(var(--dari-button-size) + 16px);
  }
  .dari-root[data-position$="-right"] .dari-panel { right: 0; }
  .dari-root[data-position$="-left"] .dari-panel  { left: 0; }

  @keyframes dari-rise {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .dari-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--dari-gray-100);
  }
  .dari-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .dari-avatar[hidden] {
    display: none;
  }
  .dari-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--dari-gray-900);
    flex: 1;
  }
  .dari-close {
    border: 0;
    background: transparent;
    color: var(--dari-gray-500);
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dari-close:hover {
    background: var(--dari-gray-100);
    color: var(--dari-gray-900);
  }
  .dari-close:focus-visible {
    outline: 2px solid var(--dari-brand);
    outline-offset: 2px;
  }

  .dari-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--dari-gray-50);
    scrollbar-width: thin;
  }
  .dari-msg {
    max-width: 80%;
    padding: 10px 14px;
    font-size: 14px;
    line-height: 1.5;
    border-radius: 14px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .dari-msg--assistant {
    align-self: flex-start;
    background: #ffffff;
    color: var(--dari-gray-900);
    border: 1px solid var(--dari-gray-100);
    border-bottom-left-radius: 4px;
  }
  .dari-msg--user {
    align-self: flex-end;
    background: var(--dari-brand);
    color: #ffffff;
    border-bottom-right-radius: 4px;
  }
  .dari-msg--pending {
    opacity: 0.7;
  }

  .dari-error {
    padding: 10px 20px;
    background: #fef2f2;
    color: #b42318;
    font-size: 13px;
    border-top: 1px solid #fecaca;
  }

  .dari-form {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px 14px;
    background: #ffffff;
    border-top: 1px solid var(--dari-gray-100);
  }
  .dari-input {
    flex: 1;
    resize: none;
    border: 0;
    outline: 0;
    background: var(--dari-gray-50);
    border-radius: 12px;
    padding: 10px 14px;
    font: inherit;
    font-size: 14px;
    line-height: 1.5;
    max-height: 120px;
    color: var(--dari-gray-900);
    transition: background 160ms ease, box-shadow 160ms ease;
  }
  .dari-input:focus {
    background: #ffffff;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--dari-brand) 18%, transparent);
  }
  .dari-input::placeholder {
    color: var(--dari-gray-500);
  }
  .dari-submit {
    border: 0;
    border-radius: 10px;
    width: 40px;
    height: 40px;
    background: var(--dari-brand);
    color: #ffffff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: filter 160ms ease, transform 160ms ease;
  }
  .dari-submit:hover:not(:disabled) {
    filter: brightness(0.88);
  }
  .dari-submit:disabled {
    background: var(--dari-gray-200);
    color: var(--dari-gray-500);
    cursor: not-allowed;
  }
  .dari-submit:focus-visible {
    outline: 2px solid var(--dari-brand);
    outline-offset: 2px;
  }

  @media (max-width: 480px) {
    .dari-root[data-position^="bottom-"] { bottom: 12px; }
    .dari-root[data-position^="top-"]    { top: 12px; }
    .dari-root[data-position$="-right"]  { right: 12px; }
    .dari-root[data-position$="-left"]   { left: 12px; }
    .dari-panel {
      width: calc(100vw - 24px);
      height: calc(100vh - 100px);
    }
  }
`;
