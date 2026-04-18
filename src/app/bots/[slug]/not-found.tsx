import Link from "next/link";

import { PageBackground } from "@/components/ui/page-background";

export default function BotNotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 4.6 1.3c-.4.6-1.1.9-1.6 1.2-.5.3-1 .7-1 1.5" />
            <circle cx="12" cy="17" r="0.5" fill="currentColor" />
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold tracking-[-0.02em] text-gray-900">
          봇을 찾을 수 없어요
        </h1>
        <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-gray-500">
          주소가 정확한지 확인하거나, 목록에서 봇을 선택해 주세요.
        </p>
        <Link
          href="/bots"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.12)]"
        >
          <span aria-hidden>←</span>내 봇 목록으로
        </Link>
      </div>
    </main>
  );
}
