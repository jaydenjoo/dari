/**
 * Task 1-8-c: KPI 기간 필터 유틸 + bot_stats RPC 런타임 검증.
 * Task B-4 확장: 일별 차트 RPC 검증 + 원가 환산 (USD cents) 유틸.
 *
 * URL 쿼리 `?range=7d|30d|90d|all` 을 안전하게 파싱하고, RPC `bot_stats(p_since)` 에
 * 넘길 ISO 문자열로 변환한다. 순수 함수 — Server/Client 동일 결과.
 *
 * 보안:
 *   - unknown 입력 수용 + enum 화이트리스트 + 기본값 폴백으로 URL 조작 방어.
 *   - 공백/대소문자/미등록 문자열 모두 기본값으로 매핑 (silent 수용).
 *   - RPC 결과는 Zod 로 런타임 재검증 — DB 함수 수정 ↔ 앱 drift 조기 탐지.
 */

import { z } from "zod";

export type RangeKey = "7d" | "30d" | "90d" | "all";

export const DEFAULT_RANGE: RangeKey = "7d";

// 사용자에게 보여줄 라벨. UI 에서 Link 제목/접근성 라벨로 재사용.
export const RANGE_LABEL: Record<RangeKey, string> = {
  "7d": "최근 7일",
  "30d": "최근 30일",
  "90d": "최근 90일",
  all: "전체",
};

const VALID_RANGES: ReadonlySet<string> = new Set(["7d", "30d", "90d", "all"]);

export function parseRange(raw: unknown): RangeKey {
  if (typeof raw !== "string") return DEFAULT_RANGE;
  return VALID_RANGES.has(raw) ? (raw as RangeKey) : DEFAULT_RANGE;
}

const DAY_MS = 24 * 3600 * 1000;

// 'all' 은 epoch(1970-01-01) 반환 → RPC 의 `>= p_since` 조건이 모든 row 통과.
// timestamptz 최소값 대신 epoch 를 쓰는 이유: Postgres 의 `-infinity` 보다 ISO 호환성이
// 좋고, Supabase JS 직렬화에서 문제없음.
export function rangeToSince(key: RangeKey, now: Date): string {
  if (key === "all") return new Date(0).toISOString();
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

// bot_stats RPC 반환 Zod 스키마. 모든 지표는 비음수 정수.
// finite 체크 없이도 int() 가 NaN/Infinity 를 거부.
export const botStatsSchema = z.object({
  conversationCount: z.number().int().nonnegative(),
  conversationTotal: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export type BotStats = z.infer<typeof botStatsSchema>;

export const EMPTY_STATS: BotStats = {
  conversationCount: 0,
  conversationTotal: 0,
  activeCount: 0,
  messageCount: 0,
  totalTokens: 0,
} as const;

// RPC 반환값을 안전하게 파싱. 스키마 불일치/null/undefined 모두 EMPTY_STATS 로 폴백.
// 호출자는 이 함수의 반환을 그대로 UI 에 건넬 수 있다.
export function parseBotStats(raw: unknown): BotStats {
  const result = botStatsSchema.safeParse(raw);
  return result.success ? result.data : EMPTY_STATS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Task B-4: 일별 차트 (bot_stats_daily RPC) + 원가 환산
// ─────────────────────────────────────────────────────────────────────────────

// 차트 bar 과다 방지 cap. 'all' 기간 선택 시 차트에는 최근 90일만 표시
// (누적 합계는 상단 KPI 참조). KPI 용 `rangeToSince` 와 독립.
const CHART_ALL_CAP_DAYS = 90;

// 차트용 since — KPI 와 달리 'all' 을 90d 로 cap (bar 개수 제한).
// 다른 range 는 `rangeToSince` 와 동일.
export function rangeToChartSince(key: RangeKey, now: Date): string {
  if (key === "all") {
    return new Date(now.getTime() - CHART_ALL_CAP_DAYS * DAY_MS).toISOString();
  }
  return rangeToSince(key, now);
}

// RPC 반환 day row. `YYYY-MM-DD` 문자열 (SQL `to_char(date,'YYYY-MM-DD')`).
// messages/tokens 은 비음수 정수. int() 가 NaN/Infinity 거부.
const dayLabelPattern = /^\d{4}-\d{2}-\d{2}$/;

export const botStatsDailyRowSchema = z.object({
  day: z.string().regex(dayLabelPattern, "YYYY-MM-DD 형식이 아님"),
  messages: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
});

export const botStatsDailySchema = z.array(botStatsDailyRowSchema);

export type BotStatsDailyRow = z.infer<typeof botStatsDailyRowSchema>;

// RPC 반환값을 안전하게 파싱. 실패/null/undefined 는 빈 배열.
// 개별 row 스키마 위반 시 전체 배열 폴백 (부분 수용 금지 — drift 조기 탐지).
export function parseBotStatsDaily(raw: unknown): BotStatsDailyRow[] {
  const result = botStatsDailySchema.safeParse(raw);
  return result.success ? result.data : [];
}

// tokens × (USD per 1M) × 100 cents = cents. 비음수/유한 가드.
// `Math.round` 로 1 cent 단위 반올림. 일별 반올림 누적 오차 ≤ day 수 cents.
// 차트 합계와 KPI 총 원가가 몇 cents 어긋날 수 있음 (허용 범위).
export function computeUsdCents(
  tokens: number,
  usdPerMillionTokens: number,
): number {
  if (!Number.isFinite(tokens) || tokens < 0) return 0;
  if (!Number.isFinite(usdPerMillionTokens) || usdPerMillionTokens < 0)
    return 0;
  return Math.round((tokens * usdPerMillionTokens * 100) / 1_000_000);
}

// 주어진 Date 를 Asia/Seoul 기준 YYYY-MM-DD 라벨로 변환.
// `en-CA` 로케일의 기본 날짜 포맷이 YYYY-MM-DD (ISO 8601) — 실수 방지.
// RPC 의 `to_char(day_bucket,'YYYY-MM-DD')` 와 동일 포맷 → Map 키 매칭 가능.
export function koreanDayLabel(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

// since ~ now 사이 KST 기준 day 라벨 오름차순 배열.
// day 단위 loop — UTC epoch + 24h 가산 (한국은 DST 없음).
// 연속 라벨 생성은 day-only 문자열 변환 후 UTC Date 를 scratch 로 사용
// (타임존 오염 방지 — since/now 의 KST day 만 의미, 시간은 무관).
export function enumerateKoreanDays(since: Date, now: Date): string[] {
  const startLabel = koreanDayLabel(since);
  const endLabel = koreanDayLabel(now);
  const [y1, m1, d1] = startLabel.split("-").map(Number);
  const [y2, m2, d2] = endLabel.split("-").map(Number);
  const startMs = Date.UTC(y1, m1 - 1, d1);
  const endMs = Date.UTC(y2, m2 - 1, d2);
  if (startMs > endMs) return [];
  const labels: string[] = [];
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    const dt = new Date(t);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    labels.push(`${y}-${m}-${d}`);
  }
  return labels;
}

export interface DailyChartPoint {
  day: string;
  messages: number;
  tokens: number;
  usdCents: number;
}

// RPC rows 를 차트용 포인트 배열로 집계 — 누락된 day 는 0 채움 (연속성).
// since/now 는 RPC 호출 시 사용한 경계와 동일해야 day 라벨이 맞아들어감.
export function aggregateDailyWithCost(
  rows: BotStatsDailyRow[],
  usdPerMillionTokens: number,
  since: Date,
  now: Date,
): DailyChartPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days = enumerateKoreanDays(since, now);
  return days.map((day) => {
    const row = byDay.get(day);
    const tokens = row?.tokens ?? 0;
    const messages = row?.messages ?? 0;
    return {
      day,
      messages,
      tokens,
      usdCents: computeUsdCents(tokens, usdPerMillionTokens),
    };
  });
}

// cents → "$1.23" 등 표시 문자열. 0 은 "$0.00".
// `Intl.NumberFormat` 로 ko-KR 천단위 (미국 달러 부호 유지).
export function formatUsdCents(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) return "$0.00";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}
