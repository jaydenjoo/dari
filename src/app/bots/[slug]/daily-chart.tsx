"use client";

/**
 * Task B-4: 일별 메시지 막대 + 원가 라인 이중축 차트 (Recharts).
 *
 * 설계:
 *   - `ResponsiveContainer` 는 브라우저 DOM 측정이 필요 → `'use client'` 필수.
 *   - 이중축: 좌축 = 메시지 수 (bar), 우축 = 원가 cents (line).
 *   - 빈 데이터 (모든 day 메시지 0) 는 `<EmptyChart>` fallback — bar height 0
 *     이면 y축 눈금만 보이고 내용 없어 혼란스러움.
 *   - 디자인 시스템 v2: bar=brand blue (#2b7cff), line=emerald, 배경 gray-50/30.
 *   - day 축 tick: 'MM/DD' 짧게 (연 생략 — 같은 연 가정, 연말 경계 재평가 필요).
 *   - Tooltip: day 전체 + 원가 $X.XX + 메시지 N + 토큰 N.
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatUsdCents, type DailyChartPoint } from "./stats-util";

interface Props {
  data: ReadonlyArray<DailyChartPoint>;
  // 상단 KPI RPC (`bot_stats`) 가 실패했거나 이 차트 RPC 가 실패한 경우 true.
  // 이때도 배열이 올 수 있어 (day enumerate 는 수행됨) 명시 배너 필요.
  error?: boolean;
}

// Recharts XAxis tick formatter — 'YYYY-MM-DD' → 'MM/DD'.
function formatDayTick(day: string): string {
  // 간단 파싱 — 스키마에서 이미 YYYY-MM-DD regex 검증됨.
  return day.slice(5).replace("-", "/");
}

export function DailyChart({ data, error }: Props) {
  const hasMessages = data.some((d) => d.messages > 0);

  return (
    <section
      aria-label="일별 사용량 차트"
      data-testid="bot-daily-chart-section"
      className="animate-in fade-in slide-in-from-bottom-2 mb-6 rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] duration-500"
      style={{ animationDelay: "240ms", animationFillMode: "both" }}
    >
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-[-0.01em] text-gray-900">
          일별 사용량
        </h2>
        <p className="text-xs text-gray-500">
          Asia/Seoul 기준 · 원가는{" "}
          <span title="토큰 기반 혼합 평균 단가 근사">±15~20% 근사치</span>
        </p>
      </header>

      {error ? (
        <div
          role="status"
          data-testid="chart-error-banner"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          일별 데이터를 불러오지 못했습니다. 잠시 후 새로고침해주세요.
        </div>
      ) : null}

      {!hasMessages ? (
        <EmptyChart />
      ) : (
        <div
          data-testid="bot-daily-chart"
          className="h-[280px] w-full"
          // Recharts ResponsiveContainer 는 부모 크기 필요.
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={[...data]}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid stroke="#e2e6ea" strokeDasharray="3 3" />
              <XAxis
                dataKey="day"
                tickFormatter={formatDayTick}
                tick={{ fontSize: 11, fill: "#6c757d" }}
                axisLine={{ stroke: "#e2e6ea" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: "#6c757d" }}
                axisLine={{ stroke: "#e2e6ea" }}
                tickLine={false}
                allowDecimals={false}
                width={40}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: "#6c757d" }}
                axisLine={{ stroke: "#e2e6ea" }}
                tickLine={false}
                tickFormatter={(cents: number) =>
                  `$${(cents / 100).toFixed(2)}`
                }
                width={56}
              />
              <Tooltip content={<DailyTooltip />} cursor={{ opacity: 0.06 }} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                iconType="circle"
              />
              <Bar
                yAxisId="left"
                dataKey="messages"
                name="메시지"
                fill="#2b7cff"
                radius={[6, 6, 0, 0]}
                maxBarSize={40}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="usdCents"
                name="원가 (USD)"
                stroke="#2a9d5c"
                strokeWidth={2}
                dot={{ r: 3, fill: "#2a9d5c" }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function EmptyChart() {
  return (
    <div
      data-testid="bot-daily-chart-empty"
      className="flex h-[280px] w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/30"
    >
      <div className="text-center">
        <p className="mb-1 text-sm font-semibold text-gray-700">
          아직 기록된 대화가 없습니다
        </p>
        <p className="text-xs text-gray-500">
          봇이 메시지를 주고받으면 이곳에 일별 추이가 표시됩니다
        </p>
      </div>
    </div>
  );
}

// Recharts 3.x 의 공개 `TooltipProps` 타입이 런타임 주입 속성(active/payload/label)
// 을 드러내지 않는다 (내부 구현 변경). `content` 에 element 를 넘기면 Recharts 가
// `cloneElement` 로 이 속성들을 주입한다 — 그래서 컴포넌트 시그니처를 커스텀
// interface 로 받는다. any 금지 → 구조만 좁게 선언.
interface DailyTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DailyChartPoint }>;
  label?: string | number;
}

function DailyTooltip({ active, payload, label }: DailyTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // payload 에서 원본 DailyChartPoint 복원 (첫 entry 의 payload 속성).
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div
      role="tooltip"
      className="rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.08)]"
    >
      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.05em] text-gray-400 uppercase">
        {label ?? point.day}
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-gray-700">
        <dt>메시지</dt>
        <dd className="text-right font-semibold text-blue-600">
          {point.messages.toLocaleString("ko-KR")}
        </dd>
        <dt>토큰</dt>
        <dd className="text-right font-semibold text-gray-700">
          {point.tokens.toLocaleString("ko-KR")}
        </dd>
        <dt>원가</dt>
        <dd className="text-right font-semibold text-emerald-600">
          {formatUsdCents(point.usdCents)}
        </dd>
      </dl>
    </div>
  );
}
