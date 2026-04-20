"use client";

import type { ReactNode } from "react";

/**
 * Task 1-7-d: 삭제 전 native confirm() 래퍼.
 *
 * 이유:
 *   - `<form action={serverAction}>` 구조에서 삭제 전 확인 UX 필요.
 *   - shadcn Dialog 는 현재 미사용 + 추가 종속성 회피.
 *   - `window.confirm` 은 접근성·키보드 호환 양호. form submit 을 가로채 취소.
 *
 * 주의:
 *   - AGENTS.md Chrome browser 자동화 가이드: 테스트 환경에서 confirm 은 세션을 block
 *     → E2E 에서는 `page.on("dialog", (d) => d.accept())` 로 자동 수락 필요.
 *   - 실패 시 `e.preventDefault()` 로 submit 중단 — form 자체의 Server Action 호출 안 됨.
 *
 * 한계 (code review M-3):
 *   - 최신 브라우저는 form 내부 단일 submit button 에 대해 Enter 키 → click 이벤트 발화 →
 *     onClick 정상 호출. 그러나 `form.requestSubmit()` 같은 프로그래밍 경로는 onClick
 *     미호출 → confirm 우회. 현재 sources-list 에는 그런 경로 없음 (MVP 수용).
 *   - JS 비활성 환경에서는 onClick 전체가 발동하지 않음 → 무확인 삭제. 인증된 owner 만
 *     접근하는 편집 페이지 특성상 MVP 허용 (sec review LOW-3).
 */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  className,
  disabled,
  "data-testid": testId,
}: {
  confirmMessage: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      data-testid={testId}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}
