import Link from "next/link";
import { PageBackground } from "@/components/ui/page-background";
import { createClient } from "@/core/db/client-server";
import type { BotStatus } from "@/core/db/types";
import { logger } from "@/core/logging";
import { BOT_STATUS_CLASS, BOT_STATUS_LABEL } from "@/shared/bots/status";
import { formatRelative } from "@/shared/time/relative";

export const metadata = {
  title: "내 봇 — Dari",
};

type BotListItem = {
  id: string;
  slug: string;
  name: string;
  status: BotStatus;
  updated_at: string;
};

export default async function BotsListPage() {
  const supabase = await createClient();

  const { data: bots, error } = await supabase
    .from("bots")
    .select("id, slug, name, status, updated_at")
    // Task B-3: soft delete 기본 숨김. 휴지통 전용 경로는 /bots/trash.
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error(
      { errCode: error.code, errMsg: error.message },
      "봇 목록 조회 실패",
    );
    throw new Error("internal_error");
  }

  const hasBots = bots && bots.length > 0;

  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative mx-auto w-full max-w-5xl">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-blue-600 uppercase">
              대시보드
            </p>
            <h1 className="text-4xl leading-tight font-bold tracking-[-0.02em] text-gray-900">
              내 봇
            </h1>
          </div>

          {hasBots ? (
            <Link
              href="/bots/new"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.12)]"
            >
              새 봇 만들기
              <span aria-hidden>→</span>
            </Link>
          ) : null}
        </header>

        {hasBots ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {bots.map((bot, idx) => (
              <li
                key={bot.id}
                className="animate-in fade-in slide-in-from-bottom-2 duration-500"
                style={{
                  animationDelay: `${idx * 80}ms`,
                  animationFillMode: "both",
                }}
              >
                <Link
                  href={`/bots/${bot.slug}`}
                  className="group block rounded-2xl border border-gray-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] transition hover:-translate-y-1 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05),0_20px_48px_rgba(0,0,0,0.10)]"
                >
                  <h2 className="mb-3 text-lg leading-snug font-bold tracking-[-0.01em] text-gray-900">
                    {bot.name}
                  </h2>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.05em] ring-1 ring-inset ${BOT_STATUS_CLASS[bot.status]}`}
                    >
                      {BOT_STATUS_LABEL[bot.status]}
                    </span>
                    <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
                      {bot.slug}
                    </code>
                  </div>
                  <p className="text-xs text-gray-500">
                    업데이트 {formatRelative(bot.updated_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState />
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 mx-auto max-w-xl rounded-2xl border border-gray-200/80 bg-white p-12 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)] duration-500"
      style={{ animationFillMode: "both" }}
    >
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
          <rect x="3" y="8" width="18" height="12" rx="2" />
          <circle cx="9" cy="14" r="1" />
          <circle cx="15" cy="14" r="1" />
          <path d="M12 4v4" />
          <path d="M10 4h4" />
        </svg>
      </div>
      <h2 className="mb-2 text-2xl font-bold tracking-[-0.02em] text-gray-900">
        아직 봇이 없어요
      </h2>
      <p className="mx-auto mb-7 max-w-sm text-base leading-relaxed text-gray-500">
        첫 번째 봇을 만들어 Dari 를 시작해 보세요. DariConfig 하나로 정체성부터
        대화 스타일까지 결정됩니다.
      </p>
      <Link
        href="/bots/new"
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.12)]"
      >
        새 봇 만들기
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
