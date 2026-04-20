"use client";

import type { MessageRole, MessageSource } from "@/core/db/types";

export interface TimelineMessage {
  id: string;
  role: MessageRole;
  content: string;
  // Server 에서 이미 KST 로 포맷된 시각 문자열 (hydration mismatch 방지).
  timeLabel: string;
  // ISO 8601 원본 — <time dateTime> 속성에 쓰여 스크린리더/파서 기계 판독용.
  isoTime: string;
  tokensUsed: number | null;
  sources: MessageSource[] | null;
}

interface Props {
  messages: readonly TimelineMessage[];
}

// RAG 출처 excerpt 는 청크 원문이므로 길 수 있다. UI 밀도 유지 위해 160자 제한.
const EXCERPT_MAX = 160;

function truncateExcerpt(s: string): string {
  return s.length <= EXCERPT_MAX ? s : s.slice(0, EXCERPT_MAX) + "…";
}

export function MessageTimeline({ messages }: Props) {
  return (
    <ul data-testid="message-timeline" className="space-y-4">
      {messages.map((m, idx) => (
        <MessageBubble key={m.id} message={m} index={idx} />
      ))}
    </ul>
  );
}

function MessageBubble({
  message: m,
  index,
}: {
  message: TimelineMessage;
  index: number;
}) {
  // 순차 등장 (상한: 20번째 이후 동일 딜레이) — 초장문 대화에서 애니메이션 과다 방지.
  const delay = Math.min(index, 20) * 30;

  if (m.role === "system") {
    return (
      <li
        data-testid="message-system"
        className="animate-in fade-in flex items-center gap-3 duration-500"
        style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
      >
        <div className="h-px flex-1 bg-gray-200" aria-hidden />
        <p className="max-w-md text-center text-xs text-gray-500 italic">
          <span className="mr-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-gray-500 uppercase not-italic">
            시스템
          </span>
          {m.content}
        </p>
        <div className="h-px flex-1 bg-gray-200" aria-hidden />
      </li>
    );
  }

  const isUser = m.role === "user";

  return (
    <li
      data-testid={isUser ? "message-user" : "message-assistant"}
      className={`animate-in fade-in slide-in-from-bottom-1 flex duration-500 ${
        isUser ? "justify-end" : "justify-start"
      }`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div
        className={`flex max-w-[78%] flex-col ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={
            isUser
              ? "rounded-t-2xl rounded-br-md rounded-bl-2xl bg-blue-600 px-4 py-3 text-white shadow-[0_1px_2px_rgba(43,124,255,0.15),0_2px_8px_rgba(43,124,255,0.12)]"
              : "rounded-t-2xl rounded-br-2xl rounded-bl-md border border-gray-200/80 bg-white px-4 py-3 text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)]"
          }
        >
          {/*
            XSS 방어: React 가 {m.content} 를 자동 escape. `dangerouslySetInnerHTML`
            사용 금지. `whitespace-pre-wrap` 로 개행만 보존, `break-words` 로 긴 URL
            이 레이아웃 깨뜨리지 않게.
          */}
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            {m.content}
          </p>
        </div>

        <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
          <span>{isUser ? "방문자" : "Dari"}</span>
          <span aria-hidden>·</span>
          <time dateTime={m.isoTime}>{m.timeLabel}</time>
          {m.tokensUsed != null ? (
            <>
              <span aria-hidden>·</span>
              <span data-testid="message-tokens">
                {m.tokensUsed.toLocaleString("ko-KR")} tokens
              </span>
            </>
          ) : null}
        </div>

        {!isUser && m.sources && m.sources.length > 0 ? (
          <details
            data-testid="message-sources"
            className="mt-2 max-w-[480px] rounded-lg bg-gray-50/80 px-3 py-2 text-xs text-gray-600"
          >
            <summary className="cursor-pointer font-semibold text-gray-700 select-none">
              참고한 지식 {m.sources.length}개
            </summary>
            <ul className="mt-2 space-y-2">
              {m.sources.map((s) => {
                // score 는 jsonb 필드라 NaN/Infinity 가능 — DB 원본 신뢰 금지
                // (sec M-2). 비정상값은 "—" 로 대체해 렌더 안정성 확보.
                const safeScore = Number.isFinite(s.score)
                  ? s.score.toFixed(2)
                  : "—";
                return (
                  <li
                    key={s.chunk_id}
                    className="rounded border border-gray-200/80 bg-white p-2"
                  >
                    <div className="mb-1 text-[10px] font-semibold tracking-wide text-gray-400">
                      유사도 {safeScore}
                    </div>
                    <p className="text-[11px] leading-relaxed break-words whitespace-pre-wrap text-gray-600">
                      {truncateExcerpt(s.excerpt)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </div>
    </li>
  );
}
