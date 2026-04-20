"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  deleteConversationAction,
  type DeleteConversationState,
} from "./actions";

interface Props {
  slug: string;
  conversationId: string;
}

export function DeleteConversationButton({ slug, conversationId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState<DeleteConversationState, FormData>(
    deleteConversationAction,
    {},
  );

  // WAI-ARIA Modal Dialog Pattern — ESC 로 닫기 (code M-2). focus trap 은 후속.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        data-testid="delete-conversation-open"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] transition hover:-translate-y-0.5 hover:border-red-200 hover:text-red-700 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]"
      >
        삭제
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-conv-title"
          data-testid="delete-conversation-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-6 shadow-[0_8px_16px_rgba(0,0,0,0.04),0_20px_48px_rgba(0,0,0,0.10)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-conv-title"
              className="mb-2 text-lg font-bold tracking-[-0.01em] text-gray-900"
            >
              대화를 삭제할까요?
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-gray-500">
              이 대화와 모든 메시지가 영구 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            {state.error ? (
              <div
                role="alert"
                data-testid="delete-conversation-error"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {state.error}
              </div>
            ) : null}
            <form
              action={formAction}
              className="flex items-center justify-end gap-2"
            >
              <input type="hidden" name="slug" value={slug} />
              <input
                type="hidden"
                name="conversationId"
                value={conversationId}
              />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300"
              >
                취소
              </button>
              <ConfirmButton />
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="delete-conversation-confirm"
      disabled={pending}
      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(220,53,69,0.15),0_4px_12px_rgba(220,53,69,0.18)] transition hover:-translate-y-0.5 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "삭제 중..." : "삭제"}
    </button>
  );
}
