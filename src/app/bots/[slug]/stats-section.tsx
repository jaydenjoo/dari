import Link from "next/link";

import {
  DEFAULT_RANGE,
  RANGE_LABEL,
  type BotStats,
  type RangeKey,
} from "./stats-util";

interface Props {
  slug: string;
  range: RangeKey;
  stats: BotStats;
  // RPC 실패로 0 폴백된 경우 true — 배너 표시 (sec L-1: 무음 실패 가시화).
  // "실제 0" 과 "집계 실패" 를 UI 가 구분하여 운영자가 알림.
  statsError?: boolean;
}

const RANGE_KEYS: readonly RangeKey[] = ["7d", "30d", "90d", "all"] as const;

// default range 일 때는 canonical URL 에서 쿼리 생략. 그 외만 `?range=` 추가.
function hrefFor(slug: string, key: RangeKey): string {
  return key === DEFAULT_RANGE ? `/bots/${slug}` : `/bots/${slug}?range=${key}`;
}

export function StatsSection({ slug, range, stats, statsError }: Props) {
  const rangeLabel = RANGE_LABEL[range];

  return (
    <section
      aria-label="봇 사용 통계"
      data-testid="bot-stats-section"
      className="animate-in fade-in slide-in-from-bottom-2 mb-6 rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] duration-500"
      style={{ animationDelay: "200ms", animationFillMode: "both" }}
    >
      {statsError ? (
        <div
          role="status"
          data-testid="stats-error-banner"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          통계를 불러오지 못했습니다. 아래 수치는 실제 값과 다를 수 있으며, 잠시
          후 새로고침해주세요.
        </div>
      ) : null}

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-[-0.01em] text-gray-900">
          사용 통계
        </h2>
        <nav
          aria-label="기간 필터"
          data-testid="stats-range-nav"
          className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50/60 p-0.5"
        >
          {RANGE_KEYS.map((key) => {
            const isActive = key === range;
            return (
              <Link
                key={key}
                href={hrefFor(slug, key)}
                data-testid={`stats-range-${key}`}
                aria-current={isActive ? "page" : undefined}
                prefetch={false}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold tracking-[-0.01em] transition ${
                  isActive
                    ? "bg-white text-blue-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {RANGE_LABEL[key]}
              </Link>
            );
          })}
        </nav>
      </header>

      <div
        data-testid="stats-kpi-grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-5"
      >
        <KpiCard
          testId="stats-kpi-conversations"
          label={`${rangeLabel} 대화`}
          value={stats.conversationCount}
        />
        <KpiCard
          testId="stats-kpi-messages"
          label={`${rangeLabel} 메시지`}
          value={stats.messageCount}
        />
        <KpiCard
          testId="stats-kpi-tokens"
          label={`${rangeLabel} 토큰`}
          value={stats.totalTokens}
        />
        <KpiCard
          testId="stats-kpi-active"
          label="진행 중"
          value={stats.activeCount}
          highlight={stats.activeCount > 0}
          title="기간 필터와 무관한 실시간 스냅샷 — status='active' 인 대화 수"
        />
        <KpiCard
          testId="stats-kpi-total"
          label="누적 대화"
          value={stats.conversationTotal}
          muted
        />
      </div>
    </section>
  );
}

function KpiCard({
  testId,
  label,
  value,
  highlight,
  muted,
  title,
}: {
  testId: string;
  label: string;
  value: number;
  highlight?: boolean;
  muted?: boolean;
  // hover tooltip — 카드 의미 보조 설명 (특히 기간 필터 영향 여부).
  title?: string;
}) {
  // `Number.isFinite` 가드 — jsonb 로부터 NaN/Infinity 가 직렬화 오류 등으로
  // 들어올 경우 UI 붕괴 방지 (1-8-b sec M-2 학습 재적용).
  const display = Number.isFinite(value) ? value.toLocaleString("ko-KR") : "—";

  const color = highlight
    ? "text-blue-600"
    : muted
      ? "text-gray-400"
      : "text-gray-900";

  return (
    <div
      data-testid={testId}
      title={title}
      className="rounded-xl border border-gray-200/80 bg-gray-50/30 p-4"
    >
      <p className="mb-1 text-[11px] font-semibold tracking-[0.05em] text-gray-400 uppercase">
        {label}
      </p>
      <p
        data-testid={`${testId}-value`}
        className={`text-2xl font-bold tracking-[-0.02em] ${color}`}
      >
        {display}
      </p>
    </div>
  );
}
