"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { PageBackground } from "@/components/ui/page-background";

export default function EditBotError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { route: "/bots/[slug]/edit", scope: "edit-page" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]">
        <h2 className="mb-2 text-xl font-bold tracking-[-0.02em] text-gray-900">
          봇 편집 화면을 불러오지 못했어요
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-gray-500">
          잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 알려주세요.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.12)]"
        >
          다시 시도
        </button>
      </div>
    </main>
  );
}
