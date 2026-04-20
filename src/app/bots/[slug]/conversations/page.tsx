import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { PageBackground } from "@/components/ui/page-background";
import { createClient } from "@/core/db/client-server";
import type { ConversationStatus, Database } from "@/core/db/types";
import { logger } from "@/core/logging";

import { isValidSlug } from "../../new/slug-util";
import {
  ConversationsList,
  type ConversationListItem,
} from "./conversations-list";
import { pickFirstUserMessage, truncatePreview } from "./preview-util";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export const metadata: Metadata = {
  title: "대화 로그 — Dari",
};

const PAGE_SIZE = 50;

const PREVIEW_MAX = 80;

// 한 페이지에 fetch 할 messages 전체 row 상한 (sec M-1: DoS 방어).
// 50 대화 × 평균 20 메시지 = 1000 이 통상. 상한 도달 시 프리뷰/카운트 정확도가
// 일부 하락할 수 있으나, RLS/보안 경계와 무관하고 상세 페이지(Task 1-8-b)에서
// 정확 fetch 되므로 목록 MVP 에서 수용. 도달 시 logger.warn 으로 모니터링.
const MESSAGES_FETCH_LIMIT = 1000;

const pageParamSchema = z.coerce.number().int().min(1).catch(1);

const STATUS_LABEL: Record<ConversationStatus, string> = {
  active: "진행 중",
  closed: "종료",
  handed_off: "담당자 이관",
};

const STATUS_CLASS: Record<ConversationStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-gray-50 text-gray-600 ring-gray-200",
  handed_off: "bg-amber-50 text-amber-700 ring-amber-200",
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}일 전`;
  return d.toLocaleDateString("ko-KR");
}

// email 마스킹: `ab***@domain.com` — 본인 owner 만 볼 수 있으나 로그·스크린샷 공유 시
// 식별자 노출 최소화. local 길이별 처리:
//   0자 (atIdx<=0, 비정상 입력) → "***"
//   1자 → "***@domain" (원자 미노출)
//   2자+ → "ab***@domain" (앞 2자 + 나머지 마스킹)
function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx <= 0) return "***";
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  if (local.length === 1) return `***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}

function visitorLabelOf(
  row: Pick<ConversationRow, "user_id" | "email" | "visitor_id">,
): string {
  if (row.email) return maskEmail(row.email);
  if (row.user_id) return "로그인 방문자";
  return "익명 방문자";
}

export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;

  // slug 형식 검증 (DB 왕복 없이 즉시 404) — /bots/[slug]/page.tsx 와 동일 패턴.
  if (!isValidSlug(slug)) {
    notFound();
  }

  const page = pageParamSchema.parse(pageParam);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // page=1 은 기본값이므로 canonical URL 에서 생략 (로그인 후 돌아올 때 동일 동작).
    const suffix = page > 1 ? `?page=${page}` : "";
    const next = encodeURIComponent(`/bots/${slug}/conversations${suffix}`);
    redirect(`/login?next=${next}`);
  }

  // 1. bot 소유 검증 (RLS bots_select_owner 자동). 타인봇/미존재 동일하게 404.
  const { data: bot, error: botErr } = await supabase
    .from("bots")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();

  if (botErr) {
    logger.error(
      { err: botErr, slug, userId: user.id },
      "bot 조회 실패 — conversations 목록",
    );
    // 정적 메시지로 throw — Postgres 내부 메시지가 error boundary 경로로 노출되지 않도록.
    throw new Error("internal_error");
  }
  if (!bot) {
    notFound();
  }

  // 2. 전체 건수 (head 쿼리로 가볍게). RLS 2-hop 자동 적용 (conversations → bots.owner).
  const { count: totalCount, error: countErr } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("bot_id", bot.id);

  if (countErr) {
    logger.error(
      { err: countErr, botId: bot.id, userId: user.id },
      "conversations count 실패",
    );
    throw new Error("internal_error");
  }
  const total = totalCount ?? 0;

  // 3. 현재 페이지의 conversations (최근 활동 순). RLS 자동.
  const { data: conversations, error: convErr } = await supabase
    .from("conversations")
    .select(
      "id, bot_id, visitor_id, user_id, email, status, last_message_at, created_at",
    )
    .eq("bot_id", bot.id)
    .order("last_message_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (convErr) {
    logger.error(
      { err: convErr, botId: bot.id, userId: user.id, page },
      "conversations 조회 실패",
    );
    throw new Error("internal_error");
  }
  const conversationRows = conversations ?? [];

  // 4. 프리뷰 + 메시지 수 계산용: 현재 페이지 conversations 의 messages 일괄 조회.
  //    RLS messages_select_owner 가 2-hop EXISTS 로 자동 owner 격리.
  //    크기 가드: 50 대화 × 평균 메시지 수 → 상한 보수 추정 ~1000 row.
  const conversationIds = conversationRows.map((c) => c.id);
  let messages: Pick<
    MessageRow,
    "id" | "conversation_id" | "role" | "content" | "created_at"
  >[] = [];
  if (conversationIds.length > 0) {
    const { data: msgs, error: msgErr } = await supabase
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .in("conversation_id", conversationIds)
      .limit(MESSAGES_FETCH_LIMIT);

    if (msgErr) {
      logger.error(
        { err: msgErr, botId: bot.id, userId: user.id },
        "messages 조회 실패 — conversations 목록",
      );
      throw new Error("internal_error");
    }
    messages = msgs ?? [];

    if (messages.length >= MESSAGES_FETCH_LIMIT) {
      logger.warn(
        {
          botId: bot.id,
          userId: user.id,
          page,
          fetched: messages.length,
          limit: MESSAGES_FETCH_LIMIT,
        },
        "messages fetch 상한 도달 — 프리뷰/카운트 정확도 하락 가능",
      );
    }
  }

  // 5. 메모리 join (conversation_id → messages[]). N+1 회피.
  const byConv = new Map<string, typeof messages>();
  for (const m of messages) {
    const bucket = byConv.get(m.conversation_id);
    if (bucket) bucket.push(m);
    else byConv.set(m.conversation_id, [m]);
  }

  const items: ConversationListItem[] = conversationRows.map((c) => {
    const bucket = byConv.get(c.id) ?? [];
    const firstUser = pickFirstUserMessage(bucket);
    const rawPreview = firstUser?.content.trim() ?? "";
    return {
      id: c.id,
      preview:
        rawPreview.length > 0
          ? truncatePreview(rawPreview, PREVIEW_MAX)
          : "(프리뷰 없음)",
      messageCount: bucket.length,
      visitorLabel: visitorLabelOf(c),
      statusLabel: STATUS_LABEL[c.status],
      statusClass: STATUS_CLASS[c.status],
      lastActivityRelative: formatRelative(c.last_message_at),
      lastActivityISO: c.last_message_at,
    };
  });

  const hasPrev = page > 1;
  const hasNext = offset + conversationRows.length < total;
  const rangeFrom = total === 0 ? 0 : offset + 1;
  const rangeTo = offset + conversationRows.length;

  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative mx-auto w-full max-w-4xl">
        <nav
          className="animate-in fade-in mb-6 duration-500"
          style={{ animationFillMode: "both" }}
        >
          <Link
            href={`/bots/${bot.slug}`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
          >
            <span aria-hidden>←</span>
            <span>봇 상세로</span>
          </Link>
        </nav>

        <header
          className="animate-in fade-in slide-in-from-bottom-2 mb-8 duration-500"
          style={{ animationDelay: "80ms", animationFillMode: "both" }}
        >
          <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-blue-600 uppercase">
            대화 로그
          </p>
          <h1
            data-testid="conversations-page-title"
            className="mb-2 text-4xl leading-tight font-bold tracking-[-0.02em] text-gray-900"
          >
            {bot.name}
          </h1>
          <p
            data-testid="conversations-total"
            className="text-sm text-gray-500"
          >
            총 {total.toLocaleString("ko-KR")}건의 대화
            {total > 0 ? ` · ${rangeFrom}~${rangeTo} 표시 중` : ""}
          </p>
        </header>

        {items.length > 0 ? (
          <>
            <ConversationsList botSlug={bot.slug} items={items} />
            <nav
              aria-label="페이지 이동"
              className="mt-8 flex items-center justify-between"
            >
              {hasPrev ? (
                <Link
                  href={`/bots/${bot.slug}/conversations${page - 1 > 1 ? `?page=${page - 1}` : ""}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700"
                >
                  <span aria-hidden>←</span>
                  이전
                </Link>
              ) : (
                <span
                  aria-disabled
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-300"
                >
                  <span aria-hidden>←</span>
                  이전
                </span>
              )}

              <span className="text-xs text-gray-400">
                페이지 {page.toLocaleString("ko-KR")}
              </span>

              {hasNext ? (
                <Link
                  href={`/bots/${bot.slug}/conversations?page=${page + 1}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700"
                >
                  다음
                  <span aria-hidden>→</span>
                </Link>
              ) : (
                <span
                  aria-disabled
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-300"
                >
                  다음
                  <span aria-hidden>→</span>
                </span>
              )}
            </nav>
          </>
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
      data-testid="conversations-empty"
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
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h2 className="mb-2 text-2xl font-bold tracking-[-0.02em] text-gray-900">
        아직 대화가 없어요
      </h2>
      <p className="mx-auto max-w-sm text-base leading-relaxed text-gray-500">
        봇이 처음 메시지를 받으면 이 페이지에 나타나요. 위젯을 사이트에 설치한
        뒤, 직접 대화를 시작해 보세요.
      </p>
    </div>
  );
}
