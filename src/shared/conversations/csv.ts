/**
 * 대화 CSV export 유틸.
 *
 * 순수 함수로 대화 메타 + 메시지 타임라인을 CSV 문자열로 변환한다.
 * Excel/Sheets 호환 (UTF-8 BOM + "" escape).
 *
 * 보안:
 *   - OWASP CSV Injection 방어 — `=`, `+`, `-`, `@`, Tab, CR 로 시작하는 셀에
 *     `'` prefix 추가. 이후 쉼표/개행/따옴표가 있으면 `"..."` wrap + `""` escape.
 *   - content 는 messages.content 원문 — React escape 없이 그대로 CSV 셀로 감싸
 *     Excel/Sheets 로 이동 시 실행되지 않도록 방어.
 */

export interface CsvMessageRow {
  role: string;
  content: string;
  tokens_used: number | null;
  created_at: string;
}

export interface CsvMeta {
  botName: string;
  conversationId: string;
  visitorLabel: string;
  statusLabel: string;
  // ISO 8601 문자열. UI 포맷팅과 분리 — raw 시각 보존이 원본성 측면 유리.
  startedAt: string;
  // 메시지 상한 도달 시 메타 섹션에 알림 행 추가 (code M-3). 호출자가 truncation
  // 을 판단해 자유 문자열을 건네고, 이 유틸은 CSV 한 셀로 안전하게 감싼다.
  truncationNotice?: string;
}

// CSV Injection — 셀 첫 글자가 이 중 하나면 수식으로 해석될 수 있음.
// `\t` 는 Tab Separated 환경 오인 방어 (wrap 대상 아님 — needsQuoting 미포함),
// `\r` / `\n` 은 레코드 분리자이자 Excel 에서 셀 경계 오인 유발 → prefix + wrap
// 이중 방어 (sec MEDIUM-3).
const INJECTION_PREFIX_CHARS = new Set(["=", "+", "-", "@", "\t", "\r", "\n"]);

// `"..."` wrap 이 필요한 특수 문자.
function needsQuoting(s: string): boolean {
  return (
    s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")
  );
}

export function escapeCsvCell(raw: string): string {
  if (raw.length === 0) return "";

  // 1) injection prefix 방어. 선행 문자만 검사.
  let value = INJECTION_PREFIX_CHARS.has(raw[0]) ? `'${raw}` : raw;

  // 2) quoting 필요 시 `"..."` wrap + 내부 `"` → `""`.
  if (needsQuoting(value)) {
    value = `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cell(v: string): string {
  return escapeCsvCell(v);
}

function toCsvRow(cells: readonly string[]): string {
  return cells.map(cell).join(",");
}

const BOM = "\uFEFF";
const EOL = "\n";

export function buildConversationCsv(
  messages: readonly CsvMessageRow[],
  meta: CsvMeta,
): string {
  const metaLines = [
    toCsvRow(["봇 이름", meta.botName]),
    toCsvRow(["대화 ID", meta.conversationId]),
    toCsvRow(["방문자", meta.visitorLabel]),
    toCsvRow(["상태", meta.statusLabel]),
    toCsvRow(["시작 시각", meta.startedAt]),
  ];
  if (meta.truncationNotice) {
    metaLines.push(toCsvRow(["알림", meta.truncationNotice]));
  }

  // 헤더: 컬럼명은 안전한 문자만 사용하므로 escape 무관, 가독성 위해 그대로.
  const header = "role,content,tokens_used,created_at";

  const dataRows = messages.map((m) =>
    toCsvRow([
      m.role,
      m.content,
      m.tokens_used == null ? "" : String(m.tokens_used),
      m.created_at,
    ]),
  );

  return (
    BOM +
    metaLines.join(EOL) +
    EOL +
    EOL + // 메타 ↔ 데이터 구분 빈 줄
    header +
    EOL +
    (dataRows.length > 0 ? dataRows.join(EOL) + EOL : "")
  );
}
