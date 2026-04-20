"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import { PageBackground } from "@/components/ui/page-background";

export default function ConversationDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry SDK (browser) 는 error boundary 진입을 자동 캡처하지 않으므로
    // 명시 호출. Pino logger 는 서버 전용이라 Client Component 에서 import 금지.
    Sentry.captureException(error, {
      tags: {
        route: "/bots/[slug]/conversations/[conversationId]",
        scope: "conversation-detail-page",
      },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold tracking-[-0.02em] text-gray-900">
          대화를 불러오지 못했습니다
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-gray-500">
          잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.12)]"
          >
            다시 시도
          </button>
          {/* error boundary 는 URL segment 를 props 로 받지 않아 현재 slug 를
              알 수 없다. 최상위 `/bots` 로 fallback — 의도적 안전 경로 선택
              (독립 리뷰 code M-3 반박 채택). */}
          <Link
            href="/bots"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:border-gray-300"
          >
            봇 목록
          </Link>
        </div>
      </div>
    </main>
  );
}
