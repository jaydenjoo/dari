/**
 * Task 1-8-c: KPI 기간 필터 유틸 + bot_stats RPC 런타임 검증.
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
