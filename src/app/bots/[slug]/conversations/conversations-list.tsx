import Link from "next/link";

export interface ConversationListItem {
  id: string;
  preview: string;
  messageCount: number;
  visitorLabel: string;
  statusLabel: string;
  statusClass: string;
  lastActivityRelative: string;
  lastActivityISO: string;
}

interface Props {
  botSlug: string;
  items: readonly ConversationListItem[];
}

export function ConversationsList({ botSlug, items }: Props) {
  return (
    <ul data-testid="conversations-list" className="space-y-3">
      {items.map((item, idx) => (
        <li
          key={item.id}
          className="animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{
            animationDelay: `${Math.min(idx, 10) * 40}ms`,
            animationFillMode: "both",
          }}
        >
          <Link
            href={`/bots/${botSlug}/conversations/${item.id}`}
            className="group block rounded-xl border border-gray-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.05em] ring-1 ring-inset ${item.statusClass}`}
              >
                {item.statusLabel}
              </span>
              <span className="text-xs text-gray-500">{item.visitorLabel}</span>
              <span aria-hidden className="text-xs text-gray-300">
                ·
              </span>
              <span className="text-xs text-gray-500">
                메시지 {item.messageCount}개
              </span>
              <time
                dateTime={item.lastActivityISO}
                className="ml-auto text-xs text-gray-400"
              >
                {item.lastActivityRelative}
              </time>
            </div>
            <p className="line-clamp-2 text-sm leading-relaxed text-gray-700">
              {item.preview}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
