import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageBackground } from "@/components/ui/page-background";
import { createClient } from "@/core/db/client-server";
import type { ConversationStatus, Database } from "@/core/db/types";
import { logger } from "@/core/logging";

import { isValidSlug } from "../../../new/slug-util";
import { MessageTimeline, type TimelineMessage } from "./message-timeline";
import {
  formatDuration,
  formatFullTime,
  formatMessageTime,
  isValidUuid,
  sumTokens,
} from "./meta-util";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];

export const metadata: Metadata = {
  title: "대화 상세 — Dari",
};

// 단일 대화 메시지 fetch 상한. 목록의 1000 대비 절반 — 단일 대화 500 메시지는
// 250 왕복(수 시간 인터랙션) 에 해당하며 실 운영 거의 도달 X. 초과 시 logger.warn
// 으로 모니터링 + UI 배너 표시. 정확도가 중요한 분석은 1-8-c KPI 에서 별도 처리.
const MESSAGES_FETCH_LIMIT = 500;

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

// 1-8-a 와 동일 로직. 공통화는 Task 1-8-d 에서 conversations/ 공유 유틸로
// 이관 판단 (현재는 성급한 추상화 회피 — 내부 상태 동기화 부담 대비 이득 작음).
// NOTE: 이 함수 / `visitorLabelOf` / `STATUS_LABEL` / `STATUS_CLASS` 를 수정할
// 때는 `src/app/bots/[slug]/conversations/page.tsx` 의 동일 로직도 함께
// 업데이트할 것 — silent divergence 방지.
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

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ slug: string; conversationId: string }>;
}) {
  const { slug, conversationId } = await params;

  // DB 왕복 없이 형식 이상은 즉시 404 — slug 는 1-8-a 와 동일 검증자, uuid 는
  // 이번 Task 의 `isValidUuid`. 공백/개행/대소문자 전부 엄격 체크.
  if (!isValidSlug(slug)) notFound();
  if (!isValidUuid(conversationId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // isValidSlug + isValidUuid 가 위에서 검증되었으므로 nextPath 는 내부
    // 경로임이 보장된다 (sec H-2). 이 패턴을 복사할 때 user-controlled 값을
    // 그대로 인코딩하지 말 것 — 반드시 `isSafeNextPath` 를 먼저 통과시켜야 한다.
    const next = encodeURIComponent(
      `/bots/${slug}/conversations/${conversationId}`,
    );
    redirect(`/login?next=${next}`);
  }

  // 1. bot 소유 검증 (RLS bots_select_owner). 타인봇/미존재 동일하게 404.
  const { data: bot, error: botErr } = await supabase
    .from("bots")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (botErr) {
    // Supabase error 를 raw 로 로깅하지 않는다 — `details`/`hint` 에 row
    // 파편/PII 가 섞일 수 있어 redact 만으로 불충분 (sec H-1).
    logger.error(
      {
        errCode: botErr.code,
        errMsg: botErr.message,
        slug,
        userId: user.id,
      },
      "bot 조회 실패 — conversation 상세",
    );
    throw new Error("internal_error");
  }
  if (!bot) notFound();

  // 2. conversation 단건. RLS 2-hop (conversations → bots.owner_id) 가 자동
  // 적용되나, URL 조작 방어로 bot_id 일치도 명시 재검증:
  //   - 악의적 시나리오: /bots/{my-slug}/conversations/{other-bot-conv-id}
  //   - RLS 만으로도 owner 다르면 차단되지만, owner 는 같고 bot 만 다른 경우
  //     (한 사용자의 bot A/B 교차) 는 RLS 통과 → 명시 체크 필수.
  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select(
      "id, bot_id, visitor_id, user_id, email, status, last_message_at, created_at",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) {
    logger.error(
      {
        errCode: convErr.code,
        errMsg: convErr.message,
        conversationId,
        userId: user.id,
      },
      "conversation 조회 실패",
    );
    throw new Error("internal_error");
  }
  if (!conversation) notFound();
  if (conversation.bot_id !== bot.id) notFound();

  // 3. messages (시간순 asc). RLS messages_select_owner 가 2-hop EXISTS 로
  // 자동 owner 격리. `.limit(500)` DoS 가드 — 도달 시 warn 로그 + UI 배너.
  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, role, content, tokens_used, sources, created_at",
    )
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(MESSAGES_FETCH_LIMIT);
  if (msgErr) {
    logger.error(
      {
        errCode: msgErr.code,
        errMsg: msgErr.message,
        conversationId,
        userId: user.id,
      },
      "messages 조회 실패",
    );
    throw new Error("internal_error");
  }
  const messages = msgs ?? [];
  const reachedLimit = messages.length >= MESSAGES_FETCH_LIMIT;
  if (reachedLimit) {
    logger.warn(
      {
        conversationId,
        userId: user.id,
        fetched: messages.length,
        limit: MESSAGES_FETCH_LIMIT,
      },
      "messages fetch 상한 도달 — 타임라인이 일부 누락될 수 있음",
    );
  }

  // 메타 계산
  const totalTokens = sumTokens(messages);
  const messageCount = messages.length;
  const firstMessageISO = messages[0]?.created_at ?? conversation.created_at;
  const lastMessageISO = conversation.last_message_at;
  const duration = formatDuration(firstMessageISO, lastMessageISO);
  const visitor = visitorLabelOf(conversation);
  const statusLabel = STATUS_LABEL[conversation.status];
  const statusClass = STATUS_CLASS[conversation.status];

  // Client Component 로 전달할 메시지는 KST 로 이미 포맷된 timeLabel 을 포함.
  // Server 에서 미리 계산 → hydration mismatch 차단. `isoTime` 은 `<time
  // dateTime>` 속성에 쓰여 스크린리더/파서가 기계 판독 가능하게 한다 (code M-2).
  const timelineMessages: TimelineMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timeLabel: formatMessageTime(m.created_at),
    isoTime: m.created_at,
    tokensUsed: m.tokens_used,
    sources: m.sources,
  }));

  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative mx-auto w-full max-w-4xl">
        <nav
          className="animate-in fade-in mb-6 duration-500"
          style={{ animationFillMode: "both" }}
        >
          <Link
            href={`/bots/${bot.slug}/conversations`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
          >
            <span aria-hidden>←</span>
            <span>대화 로그로</span>
          </Link>
        </nav>

        <header
          className="animate-in fade-in slide-in-from-bottom-2 mb-8 duration-500"
          style={{ animationDelay: "80ms", animationFillMode: "both" }}
        >
          <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-blue-600 uppercase">
            대화 상세
          </p>
          <h1
            data-testid="conversation-detail-title"
            className="mb-2 text-3xl leading-tight font-bold tracking-[-0.02em] text-gray-900"
          >
            {bot.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
            <span
              data-testid="conversation-status-badge"
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.05em] ring-1 ring-inset ${statusClass}`}
            >
              {statusLabel}
            </span>
            <span data-testid="conversation-visitor">{visitor}</span>
          </div>
        </header>

        <section
          aria-label="대화 요약"
          data-testid="conversation-meta"
          className="animate-in fade-in slide-in-from-bottom-2 mb-8 grid grid-cols-2 gap-3 duration-500 sm:grid-cols-4"
          style={{ animationDelay: "160ms", animationFillMode: "both" }}
        >
          <MetaCard
            label="메시지"
            value={messageCount.toLocaleString("ko-KR")}
            suffix="개"
          />
          <MetaCard
            label="총 토큰"
            value={totalTokens.toLocaleString("ko-KR")}
            muted={totalTokens === 0}
          />
          <MetaCard label="기간" value={duration} />
          <MetaCard
            label="마지막 활동"
            value={formatFullTime(lastMessageISO)}
            small
          />
        </section>

        <section
          aria-label="시각 정보"
          className="animate-in fade-in mb-6 rounded-xl border border-gray-200/80 bg-white px-4 py-3 text-xs text-gray-500 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] duration-500"
          style={{ animationDelay: "220ms", animationFillMode: "both" }}
        >
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <dt className="font-semibold text-gray-600">첫 메시지</dt>
              <dd>{formatFullTime(firstMessageISO)} KST</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="font-semibold text-gray-600">대화 시작</dt>
              <dd>{formatFullTime(conversation.created_at)} KST</dd>
            </div>
          </dl>
        </section>

        {reachedLimit && (
          <div
            role="status"
            data-testid="messages-limit-banner"
            className="animate-in fade-in mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 duration-500"
          >
            이 대화는 {MESSAGES_FETCH_LIMIT.toLocaleString("ko-KR")}개 메시지
            상한에 도달했습니다. 일부 메시지는 화면에 표시되지 않을 수 있습니다.
          </div>
        )}

        {messageCount === 0 ? (
          <EmptyTimeline />
        ) : (
          <MessageTimeline messages={timelineMessages} />
        )}
      </div>
    </main>
  );
}

function MetaCard({
  label,
  value,
  suffix,
  muted,
  small,
}: {
  label: string;
  value: string;
  suffix?: string;
  muted?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)]">
      <p className="mb-1 text-[11px] font-semibold tracking-[0.05em] text-gray-400 uppercase">
        {label}
      </p>
      <p
        className={`${
          small ? "text-sm" : "text-2xl"
        } font-bold tracking-[-0.02em] ${muted ? "text-gray-400" : "text-gray-900"}`}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-sm font-semibold text-gray-400">
            {suffix}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function EmptyTimeline() {
  return (
    <div
      data-testid="conversation-empty-timeline"
      className="animate-in fade-in mx-auto max-w-xl rounded-2xl border border-gray-200/80 bg-white p-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)] duration-500"
      style={{ animationFillMode: "both" }}
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
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
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="text-base leading-relaxed text-gray-600">
        이 대화에는 아직 메시지가 없습니다.
      </p>
    </div>
  );
}
