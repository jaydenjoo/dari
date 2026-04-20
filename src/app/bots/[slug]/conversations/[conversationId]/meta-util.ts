/**
 * Task 1-8-b: 대화 상세 페이지 메타 유틸.
 *
 * 순수 함수만 배치하여 Server/Client 어디서든 동일 결과를 보장한다.
 * 시각 관련 유틸은 Asia/Seoul 고정 (KST=UTC+9, DST 없음) — 서버/클라 타임존
 * 차이로 인한 hydration mismatch 를 차단. Server Component 에서 미리 포맷한
 * 문자열을 Client Component prop 으로 전달하는 패턴을 권장한다.
 */

// Postgres uuid 타입의 형식을 8-4-4-4-12 16진수로 검증. 공백/개행/부가 문자를
// 허용하지 않아 DB 왕복 없이 즉시 notFound 처리한다. v4 제약은 두지 않음
// (DB 는 v1~v8 모두 uuid 타입으로 수용).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(s: string): boolean {
  return typeof s === "string" && UUID_RE.test(s);
}

export function sumTokens(
  rows: ReadonlyArray<{ tokens_used: number | null }>,
): number {
  let total = 0;
  for (const r of rows) {
    if (r.tokens_used != null) total += r.tokens_used;
  }
  return total;
}

// KST 고정 오프셋 변환. UTC 시각에 +9h 를 더한 뒤 UTC 필드를 읽어 "로컬 KST"
// 값을 얻는다. `toLocaleString` 과 달리 서버 TZ/로케일 설정에 무관.
function toKstParts(date: Date): {
  y: number;
  mo: number;
  da: number;
  ho: number;
  mi: number;
} {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  return {
    y: k.getUTCFullYear(),
    mo: k.getUTCMonth() + 1,
    da: k.getUTCDate(),
    ho: k.getUTCHours(),
    mi: k.getUTCMinutes(),
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// invalid ISO 는 정적 "—" 로 대체한다. 원본 반환 시 DB 파편/내부 에러 문자열이
// 관리자 UI 에 그대로 렌더될 가능성을 차단 (독립 리뷰 sec M-3).
const INVALID_TIME_PLACEHOLDER = "—";

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return INVALID_TIME_PLACEHOLDER;
  const p = toKstParts(d);
  return `${pad2(p.ho)}:${pad2(p.mi)}`;
}

export function formatFullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return INVALID_TIME_PLACEHOLDER;
  const p = toKstParts(d);
  return `${p.y}-${pad2(p.mo)}-${pad2(p.da)} ${pad2(p.ho)}:${pad2(p.mi)}`;
}

export function formatDuration(startISO: string, endISO: string): string {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";

  const diffSec = Math.floor((end - start) / 1000);
  if (diffSec < 60) return `${diffSec}초`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    const restMin = diffMin % 60;
    return restMin > 0 ? `${diffHour}시간 ${restMin}분` : `${diffHour}시간`;
  }

  const diffDay = Math.floor(diffHour / 24);
  const restHour = diffHour % 24;
  return restHour > 0 ? `${diffDay}일 ${restHour}시간` : `${diffDay}일`;
}
