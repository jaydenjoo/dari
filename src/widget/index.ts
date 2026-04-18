/**
 * 위젯 번들 엔트리 — IIFE 로 빌드되어 즉시 실행.
 *
 * 호스트 페이지 삽입 방식:
 *   <script src="https://dairect.kr/widget.js" data-bot-id="my-slug" async></script>
 *
 * 부팅 절차:
 *   1. 자기 자신 <script> 태그 탐색 (currentScript 우선, fallback 은 data-bot-id 마지막 요소)
 *   2. dataset + src 로부터 WidgetConfig 파싱 (필수값 누락이면 조용히 종료)
 *   3. DOM ready 대기 후 startWidget 호출
 *
 * 중복 주입 / DOM 미가용 환경 / parse 실패는 silent fail — 호스트 페이지 오염 금지.
 */

import { parseConfig } from "./config";
import { startWidget } from "./widget";

function boot(): void {
  if (typeof document === "undefined") return;

  const script = findSelfScript();
  const dataset = script?.dataset ?? {};
  const src = script?.src ?? null;

  const config = parseConfig(dataset as DOMStringMap, src);
  if (!config) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => startWidget(config), {
      once: true,
    });
  } else {
    startWidget(config);
  }
}

function findSelfScript(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }
  const candidates = document.querySelectorAll<HTMLScriptElement>(
    "script[data-bot-id]",
  );
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

boot();
