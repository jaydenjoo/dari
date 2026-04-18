"use client";

import { useState } from "react";

const COPY_RESET_MS = 2_000;

type CopyState = "idle" | "copied" | "failed";

const BUTTON_LABEL: Record<CopyState, string> = {
  idle: "복사",
  copied: "복사됨",
  failed: "직접 선택 필요",
};

const LIVE_MESSAGE: Record<CopyState, string> = {
  idle: "",
  copied: "스니펫이 클립보드에 복사되었습니다.",
  failed: "자동 복사에 실패했어요. 스니펫을 직접 선택해서 복사해 주세요.",
};

export default function CopySnippet({ snippet }: { snippet: string }) {
  const [state, setState] = useState<CopyState>("idle");

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippet);
      setState("copied");
      setTimeout(() => setState("idle"), COPY_RESET_MS);
    } catch {
      // clipboard API 미지원 환경 (iframe sandbox, 구형 브라우저) — 사용자가 수동
      // 선택하도록 "직접 선택 필요" 상태로 명시 피드백. (code-reviewer H-1)
      setState("failed");
      setTimeout(() => setState("idle"), COPY_RESET_MS);
    }
  }

  return (
    <div className="relative">
      <pre
        data-testid="widget-snippet"
        className="overflow-x-auto rounded-xl bg-gray-900 p-4 pr-28 font-mono text-xs leading-relaxed text-gray-100"
      >
        {snippet}
      </pre>
      {/*
        스크린리더 전용 live region — WAI-ARIA 1.2 §6.6:
        aria-live 는 인터랙티브 요소(button)가 아닌 별도 영역에 둬야 변경이
        올바른 시점에 읽힌다. (code-reviewer M-2)
      */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {LIVE_MESSAGE[state]}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        data-testid="widget-snippet-copy"
        className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-gray-100 ring-1 ring-white/20 transition ring-inset hover:bg-white/20"
      >
        {BUTTON_LABEL[state]}
      </button>
    </div>
  );
}
