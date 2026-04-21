import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageBackground } from "@/components/ui/page-background";
import { createClient } from "@/core/db/client-server";
import { logger } from "@/core/logging";
import { formatRelative } from "@/shared/time/relative";

import { restoreBotAction } from "./actions";
import PermanentDeleteDialog from "./permanent-delete-dialog";

export const metadata = {
  title: "휴지통 — Dari",
};

export default async function BotsTrashPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/bots/trash")}`);
  }

  // RLS `bots_select_owner` 가 owner_id = auth.uid() 자동 필터하지만, 쿼리에 명시적으로
  // `.eq("owner_id", user.id)` 추가 — RLS 의존 여부가 코드에서 바로 읽히고 정책 변경 시
  // silent 노출 방지 (code review LOW).
  const { data: bots, error } = await supabase
    .from("bots")
    .select("id, slug, name, deleted_at, updated_at")
    .eq("owner_id", user.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    logger.error(
      { errCode: error.code, errMsg: error.message },
      "휴지통 목록 조회 실패",
    );
    throw new Error("internal_error");
  }

  const hasBots = bots && bots.length > 0;

  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative mx-auto w-full max-w-5xl">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-blue-600 uppercase">
              대시보드
            </p>
            <h1 className="text-4xl leading-tight font-bold tracking-[-0.02em] text-gray-900">
              휴지통
            </h1>
          </div>
          <Link
            href="/bots"
            className="text-sm font-semibold text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline"
          >
            ← 내 봇으로 돌아가기
          </Link>
        </header>

        <p className="mb-10 max-w-2xl text-sm leading-relaxed text-gray-500">
          삭제된 봇은 30일 동안 여기에 보관되고, 그 안에 복구할 수 있어요. 영구
          삭제하면 지식 파일과 대화 기록까지 함께 사라지고 되돌릴 수 없어요.
        </p>

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
                <div className="flex h-full flex-col rounded-2xl border border-gray-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)]">
                  <h2 className="mb-3 text-lg leading-snug font-bold tracking-[-0.01em] text-gray-900">
                    {bot.name}
                  </h2>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.05em] text-red-700 ring-1 ring-red-200 ring-inset">
                      휴지통
                    </span>
                    <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
                      {bot.slug}
                    </code>
                  </div>
                  <p className="mb-5 text-xs text-gray-500">
                    삭제됨 {formatRelative(bot.deleted_at ?? bot.updated_at)}
                  </p>

                  <div className="mt-auto flex flex-wrap gap-2">
                    <form
                      action={restoreBotAction.bind(null, bot.slug)}
                      className="contents"
                    >
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        data-testid="restore-bot-submit"
                      >
                        복구
                      </Button>
                    </form>
                    <PermanentDeleteDialog slug={bot.slug} name={bot.name} />
                  </div>
                </div>
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
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 text-gray-500">
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
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </div>
      <h2 className="mb-2 text-2xl font-bold tracking-[-0.02em] text-gray-900">
        휴지통이 비어 있어요
      </h2>
      <p className="mx-auto mb-7 max-w-sm text-base leading-relaxed text-gray-500">
        삭제한 봇은 30일 동안 여기에 보관돼요. 아직 삭제한 봇이 없네요.
      </p>
      <Link
        href="/bots"
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.12)]"
      >
        내 봇으로 돌아가기
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
