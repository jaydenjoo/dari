/**
 * 위젯 번들 엔트리 — IIFE 로 빌드되어 즉시 실행.
 *
 * 호스트 페이지 삽입 방식 (호스트는 서버의 `NEXT_PUBLIC_WIDGET_CDN_URL` 기반 — ADR-009 §9-1 γ):
 *   <script src="<CDN_URL>/widget.js" data-bot-id="my-slug" async></script>
 *
 * 현재 기본 호스트: `dari-theta.vercel.app` (테스트 단계). 커스텀 도메인(`dairect.kr`) 은
 * 10곳 업체 테스트 완료 후 Vercel env 교체로 스위치.
 *
 * 부팅 절차 (Task 1-6-d):
 *   1. 자기 자신 <script> 태그 탐색 (currentScript 우선, fallback 은 data-bot-id 마지막 요소)
 *   2. dataset + src 로부터 WidgetConfig 파싱 (필수값 누락이면 조용히 종료)
 *   3. DOM ready 대기 + 브랜드 config 로드를 **병렬로** 기다린 뒤 `startWidget` 호출
 *   4. 브랜드 로드 실패 시에도 `DEFAULT_BRAND` 로 위젯 표시는 보장 (widget-config-client.ts)
 *
 * 중복 주입 / DOM 미가용 환경 / parse 실패는 silent fail — 호스트 페이지 오염 금지.
 */

import { parseConfig } from "./config";
import { startWidget } from "./widget";
import { loadWidgetBrand } from "./widget-config-client";

async function boot(): Promise<void> {
  if (typeof document === "undefined") return;

  const script = findSelfScript();
  const dataset = script?.dataset ?? {};
  const src = script?.src ?? null;

  const config = parseConfig(dataset as DOMStringMap, src);
  if (!config) return;

  const [brand] = await Promise.all([
    loadWidgetBrand(config.botId, config.apiUrl),
    waitForDomReady(),
  ]);

  startWidget(config, brand);
}

function waitForDomReady(): Promise<void> {
  // boot() 가 `typeof document === "undefined"` 을 이미 걸러냈으므로 여기선 readyState 만 검사.
  return new Promise<void>((resolve) => {
    if (document.readyState !== "loading") {
      resolve();
      return;
    }
    document.addEventListener("DOMContentLoaded", () => resolve(), {
      once: true,
    });
  });
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

void boot();
