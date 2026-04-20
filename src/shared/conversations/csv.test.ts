import { describe, expect, it } from "vitest";

import { buildConversationCsv, escapeCsvCell, type CsvMessageRow } from "./csv";

describe("escapeCsvCell", () => {
  it("평범한 텍스트는 그대로 wrap 없이 반환", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell("안녕하세요")).toBe("안녕하세요");
  });

  it('쉼표 / 개행 / 따옴표 포함 시 `"..."` wrap + 내부 `"` → `""`', () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
    expect(escapeCsvCell("a\r\nb")).toBe('"a\r\nb"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("수식 injection 문자로 시작 → `'` prefix (OWASP CSV Injection)", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    // single quote 는 CSV 에서 특수문자 아니므로 wrap 불필요.
    expect(escapeCsvCell("+CMD|'/c calc'!A0")).toBe("'+CMD|'/c calc'!A0");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("@example.com")).toBe("'@example.com");
    // \t 는 INJECTION_PREFIX_CHARS 에만 포함, needsQuoting 에는 미포함 → prefix 만.
    expect(escapeCsvCell("\tSUM(A1)")).toBe("'\tSUM(A1)");
    // \r / \n 은 INJECTION_PREFIX_CHARS + needsQuoting 양쪽 포함 → prefix + wrap.
    expect(escapeCsvCell("\rSUM(A1)")).toBe('"\'\rSUM(A1)"');
    expect(escapeCsvCell("\nSUM(A1)")).toBe('"\'\nSUM(A1)"');
  });

  it("빈 문자열은 빈 문자열", () => {
    expect(escapeCsvCell("")).toBe("");
  });

  it("injection 문자가 중간에 있는 건 prefix 안 붙임 (시작만 위험)", () => {
    expect(escapeCsvCell("a=b")).toBe("a=b");
    expect(escapeCsvCell("a+b")).toBe("a+b");
  });
});

const META = {
  botName: "테스트 봇",
  conversationId: "550e8400-e29b-41d4-a716-446655440000",
  visitorLabel: "익명 방문자",
  statusLabel: "진행 중",
  startedAt: "2026-04-20T10:00:00.000Z",
};

describe("buildConversationCsv", () => {
  it("UTF-8 BOM 으로 시작 (Excel 한글 호환)", () => {
    const csv = buildConversationCsv([], META);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("메타 섹션 + 빈 줄 + 헤더 + 0개 row (셀에 특수문자 없어 wrap 없음)", () => {
    const csv = buildConversationCsv([], META);
    // BOM 제거 후 행 분리
    const rows = csv.slice(1).split("\n");
    expect(rows[0]).toBe("봇 이름,테스트 봇");
    expect(rows[1]).toBe("대화 ID,550e8400-e29b-41d4-a716-446655440000");
    expect(rows[2]).toBe("방문자,익명 방문자");
    expect(rows[3]).toBe("상태,진행 중");
    expect(rows[4]).toBe("시작 시각,2026-04-20T10:00:00.000Z");
    expect(rows[5]).toBe(""); // 빈 줄 구분
    expect(rows[6]).toBe("role,content,tokens_used,created_at");
    // 7번째는 ""(EOL 뒤 trailing). 길이 = 8.
    expect(rows.length).toBe(8);
  });

  it("3종 role 모두 포함, tokens_used null 은 빈 문자열", () => {
    const messages: CsvMessageRow[] = [
      {
        role: "user",
        content: "안녕하세요",
        tokens_used: null,
        created_at: "2026-04-20T10:00:00Z",
      },
      {
        role: "assistant",
        content: "반갑습니다",
        tokens_used: 42,
        created_at: "2026-04-20T10:00:05Z",
      },
      {
        role: "system",
        content: "대화 시작",
        tokens_used: null,
        created_at: "2026-04-20T10:00:00Z",
      },
    ];
    const csv = buildConversationCsv(messages, META);
    const rows = csv.slice(1).split("\n");
    // 헤더 row 이후가 데이터
    const headerIdx = rows.indexOf("role,content,tokens_used,created_at");
    expect(rows[headerIdx + 1]).toBe("user,안녕하세요,,2026-04-20T10:00:00Z");
    expect(rows[headerIdx + 2]).toBe(
      "assistant,반갑습니다,42,2026-04-20T10:00:05Z",
    );
    expect(rows[headerIdx + 3]).toBe("system,대화 시작,,2026-04-20T10:00:00Z");
  });

  it("CSV injection 페이로드가 content 에 들어와도 안전하게 escape", () => {
    const messages: CsvMessageRow[] = [
      {
        role: "user",
        content: '=HYPERLINK("http://evil.com","click")',
        tokens_used: null,
        created_at: "2026-04-20T10:00:00Z",
      },
    ];
    const csv = buildConversationCsv(messages, META);
    // `=` prefix 가 `'` prefix 로 변환되고 wrap 포함 ("" escape)
    expect(csv).toContain('"\'=HYPERLINK(""http://evil.com"",""click"")"');
  });

  it("쉼표 / 개행 / 따옴표가 content 에 섞여도 행 깨지지 않음", () => {
    const messages: CsvMessageRow[] = [
      {
        role: "user",
        content: 'first line,with comma\nsecond line with "quote"',
        tokens_used: 10,
        created_at: "2026-04-20T10:00:00Z",
      },
    ];
    const csv = buildConversationCsv(messages, META);
    expect(csv).toContain(
      '"first line,with comma\nsecond line with ""quote"""',
    );
    // 행 파싱 시 데이터 row 는 wrap 덕에 파싱기 기준 1 row.
  });

  it("meta 의 봇 이름에도 injection 문자 방어 (prefix `'` 적용, wrap 불필요)", () => {
    const csv = buildConversationCsv([], {
      ...META,
      botName: "=EVIL",
    });
    expect(csv).toContain("봇 이름,'=EVIL");
  });

  it("truncationNotice 가 있으면 메타 섹션에 `알림` 행이 추가됨 (code M-3)", () => {
    const csv = buildConversationCsv([], {
      ...META,
      truncationNotice: "메시지 5000개 상한 도달 — 일부 누락",
    });
    expect(csv).toContain("알림,메시지 5000개 상한 도달 — 일부 누락");
  });

  it("truncationNotice 가 없으면 `알림` 행이 없음", () => {
    const csv = buildConversationCsv([], META);
    expect(csv).not.toContain("알림,");
  });
});
