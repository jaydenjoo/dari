import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY ??= "sk-fake-anthropic-test-placeholder";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fake-supabase-service-role-test-key";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= "fake-google-genai-test-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fake-supabase-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    "fake-supabase-anon-test-placeholder";
});

const { mockExtractText, mockGetDocumentProxy } = vi.hoisted(() => ({
  mockExtractText: vi.fn(),
  mockGetDocumentProxy: vi.fn(),
}));

vi.mock("unpdf", () => ({
  extractText: mockExtractText,
  getDocumentProxy: mockGetDocumentProxy,
}));

import {
  detectFileType,
  extractTextFromFile,
  getExtension,
  MAX_FILE_BYTES,
  MAX_FILENAME_LENGTH,
  sanitizeFilename,
} from "./file-extract";

describe("sanitizeFilename", () => {
  it("일반 파일명 그대로", () => {
    expect(sanitizeFilename("hello.pdf")).toBe("hello.pdf");
  });

  it("경로 traversal `../../etc/passwd` → basename 강제", () => {
    // "/" + "\\" 제거. `.` 은 이후 trim 단계에서 양끝만 제거 → 중간 `..etc..passwd` 형태는
    // getExtension 단계에서 거부 (확장자가 passwd 로 판정 → null).
    const out = sanitizeFilename("../../etc/passwd");
    expect(out).not.toContain("/");
    expect(out).not.toContain("\\");
  });

  it("Windows 경로 `C:\\...\\file.pdf` → basename + drive letter 제거 (sec LOW-2)", () => {
    const out = sanitizeFilename("C:\\Users\\Jayden\\file.pdf");
    expect(out).toBe("UsersJaydenfile.pdf");
    expect(out).not.toContain("\\");
    expect(out).not.toMatch(/^[A-Za-z]:/);
  });

  it("Windows drive letter 단독 (`D:file.pdf`) 도 제거", () => {
    expect(sanitizeFilename("D:file.pdf")).toBe("file.pdf");
    expect(sanitizeFilename("z:note.txt")).toBe("note.txt");
  });

  it("파일명 중간의 `:` 는 보존 (drive letter 아님)", () => {
    // colon 은 Windows 파일명에 금지문자이지만, Unix/macOS 는 허용.
    // 현재 정책은 "맨 앞" 에 있는 경우만 drive letter 로 간주 → 가운데 colon 은 유지.
    expect(sanitizeFilename("meeting-2pm:notes.pdf")).toBe(
      "meeting-2pm:notes.pdf",
    );
  });

  it("NULL byte 제거", () => {
    expect(sanitizeFilename("foo\u0000bar.pdf")).toBe("foobar.pdf");
  });

  it("Unicode RLO/LRO/제로폭 제거 (파일명 위장 방어)", () => {
    expect(sanitizeFilename("report\u202Efdp.pdf")).toBe("reportfdp.pdf");
  });

  it("Tag Characters 제거", () => {
    const input = `doc${String.fromCodePoint(0xe0041)}.pdf`;
    expect(sanitizeFilename(input)).toBe("doc.pdf");
  });

  it("제어문자(탭/LF/CR/DEL) 제거", () => {
    expect(sanitizeFilename("file\tname\n.pdf")).toBe("filename.pdf");
  });

  it("양끝 마침표 제거 (`.htaccess`, `file.` Windows 회피)", () => {
    expect(sanitizeFilename(".htaccess")).toBe("htaccess");
    expect(sanitizeFilename("file.")).toBe("file");
    expect(sanitizeFilename("...")).toBe("");
  });

  it("공백 trim", () => {
    expect(sanitizeFilename("   doc.pdf   ")).toBe("doc.pdf");
  });

  it("길이 상한 200자 — 확장자 보존", () => {
    const longName = "a".repeat(250) + ".pdf";
    const out = sanitizeFilename(longName);
    expect(out.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("길이 상한 — 확장자 없거나 과도하게 긴 경우 단순 cut", () => {
    const longNoExt = "a".repeat(250);
    const out = sanitizeFilename(longNoExt);
    expect(out.length).toBe(MAX_FILENAME_LENGTH);
  });

  it("빈 문자열/공백-only → 빈 문자열", () => {
    expect(sanitizeFilename("")).toBe("");
    expect(sanitizeFilename("   ")).toBe("");
  });

  it("null/undefined-ish (타입 유연) → 빈 문자열", () => {
    expect(sanitizeFilename(undefined as unknown as string)).toBe("");
    expect(sanitizeFilename(null as unknown as string)).toBe("");
  });
});

describe("getExtension", () => {
  it("지원 확장자 소문자 normalize", () => {
    expect(getExtension("doc.PDF")).toBe("pdf");
    expect(getExtension("note.TXT")).toBe("txt");
    expect(getExtension("README.MD")).toBe("md");
  });

  it("미지원 확장자 → null", () => {
    expect(getExtension("data.csv")).toBe(null);
    expect(getExtension("archive.zip")).toBe(null);
    expect(getExtension("script.js")).toBe(null);
  });

  it("점이 없거나 맨 앞만 있는 경우 → null", () => {
    expect(getExtension("noext")).toBe(null);
    expect(getExtension(".hiddenpdf")).toBe(null);
  });

  it("복수 점 — 마지막 것만", () => {
    expect(getExtension("archive.tar.pdf")).toBe("pdf");
  });
});

describe("detectFileType (magic bytes)", () => {
  it("PDF 시작 바이트 `%PDF-` 인식 (표준 offset 0)", () => {
    const buf = Buffer.from("%PDF-1.7\nsome content");
    expect(detectFileType(buf, "pdf")).toBe(true);
  });

  it("PDF UTF-8 BOM (3바이트) 앞에 있으면 허용 (짧은 prefix 수용)", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const body = Buffer.from("%PDF-1.5\n" + "x".repeat(50));
    const buf = Buffer.concat([bom, body]);
    expect(detectFileType(buf, "pdf")).toBe(true);
  });

  it("PDF 첫 32바이트 이후 offset 은 거부 — 폴리글롯 방어 (sec MEDIUM-1)", () => {
    // %PDF- 가 50바이트 공백 뒤에 위치 → 32바이트 허용 범위 밖 → false.
    // 이전엔 1024바이트 관용이었으나, `%PDF-` + (1000바이트 패딩) + `<svg onload=...>`
    // 같은 폴리글롯이 1차 magic bytes 를 통과할 수 있어 축소.
    const prefix = Buffer.alloc(50, 0x20);
    const body = Buffer.from("%PDF-1.5");
    const buf = Buffer.concat([prefix, body]);
    expect(detectFileType(buf, "pdf")).toBe(false);
  });

  it("PDF 매직 없으면 false (확장자 pdf 인데 내용은 다른 바이너리)", () => {
    const buf = Buffer.from("PK\x03\x04"); // ZIP magic
    expect(detectFileType(buf, "pdf")).toBe(false);
  });

  it("TXT/MD — 영문 ASCII 통과", () => {
    const txt = Buffer.from("Hello, world! This is plain ASCII text.");
    expect(detectFileType(txt, "txt")).toBe(true);
    expect(detectFileType(txt, "md")).toBe(true);
  });

  it("TXT/MD — 한국어 UTF-8 통과 (고바이트 비율 ~100% 여도 제어문자 0)", () => {
    // 한글 UTF-8 은 글자당 3바이트 모두 0x80+ → 고바이트 비율 거의 100%.
    // sec MEDIUM-2 원안의 "고바이트 비율" 검사는 한글 false positive 발생.
    // 대신 제어문자 비율로 판별 → 한글 통과.
    const korean = Buffer.from(
      "한국어로 작성된 긴 텍스트 문서입니다. FAQ · 가격 · 환불 정책 등을 포함한 자유 서식.",
      "utf8",
    );
    expect(detectFileType(korean, "txt")).toBe(true);
    expect(detectFileType(korean, "md")).toBe(true);
  });

  it("TXT/MD — 일본어·중국어 UTF-8 통과", () => {
    const jp = Buffer.from(
      "こんにちは、世界。これは日本語のテキストです。",
      "utf8",
    );
    const cn = Buffer.from("你好,世界。这是中文文本。", "utf8");
    expect(detectFileType(jp, "txt")).toBe(true);
    expect(detectFileType(cn, "md")).toBe(true);
  });

  it("TXT/MD — NULL byte 1회만 있어도 false (명백 바이너리)", () => {
    const binary = Buffer.from([0x89, 0x50, 0x00, 0x01]); // PNG-ish with NULL
    expect(detectFileType(binary, "txt")).toBe(false);
    expect(detectFileType(binary, "md")).toBe(false);
  });

  it("TXT/MD — 제어문자 비율 5% 초과 → false (NULL 없는 바이너리)", () => {
    // 80바이트 중 10바이트가 비-텍스트 제어문자 (0x01, 0x02) = 12.5% → false.
    const suspicious = Buffer.concat([
      Buffer.from("some text here ok "),
      Buffer.alloc(10, 0x01), // 제어문자 10바이트
      Buffer.from(" more text more text more text continues now"),
    ]);
    expect(detectFileType(suspicious, "txt")).toBe(false);
  });

  it("TXT/MD — tab(\\t) / LF(\\n) / CR(\\r) 는 제어문자로 카운트 안 함", () => {
    // 일반 서식 문자는 허용.
    const withWhitespace = Buffer.from(
      "line1\tcolumn2\nline3\r\nline4\t\ttabbed",
      "utf8",
    );
    expect(detectFileType(withWhitespace, "txt")).toBe(true);
  });

  it("빈 버퍼 → false", () => {
    expect(detectFileType(Buffer.alloc(0), "pdf")).toBe(false);
    expect(detectFileType(Buffer.alloc(0), "txt")).toBe(false);
  });
});

describe("extractTextFromFile", () => {
  beforeEach(() => {
    mockExtractText.mockReset();
    mockGetDocumentProxy.mockReset();
  });

  it("PDF: unpdf 추출 + 결과 반환", async () => {
    mockGetDocumentProxy.mockResolvedValueOnce({ fake: "pdf-proxy" });
    mockExtractText.mockResolvedValueOnce({
      text: "첫 페이지 본문\n\n두번째 문단.",
      totalPages: 1,
    });

    const buf = Buffer.from("%PDF-1.5\n" + "x".repeat(100));
    const out = await extractTextFromFile(buf, "report.pdf");

    expect(out.sanitizedFilename).toBe("report.pdf");
    expect(out.ext).toBe("pdf");
    expect(out.bytes).toBe(buf.length);
    expect(out.text).toBe("첫 페이지 본문\n\n두번째 문단.");
  });

  it("PDF: unpdf text 가 배열인 케이스 (mergePages=true 일반 문서) → join", async () => {
    mockGetDocumentProxy.mockResolvedValueOnce({ fake: "pdf-proxy" });
    mockExtractText.mockResolvedValueOnce({
      text: ["페이지1", "페이지2"],
      totalPages: 2,
    });

    const buf = Buffer.from("%PDF-1.5\n" + "x".repeat(100));
    const out = await extractTextFromFile(buf, "multi.pdf");

    expect(out.text).toBe("페이지1\n\n페이지2");
  });

  it("TXT: UTF-8 + BOM 제거", async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const body = Buffer.from("안녕하세요. 텍스트입니다.", "utf8");
    const buf = Buffer.concat([bom, body]);

    const out = await extractTextFromFile(buf, "note.txt");

    expect(out.ext).toBe("txt");
    expect(out.text).toBe("안녕하세요. 텍스트입니다.");
  });

  it("MD: UTF-8 그대로", async () => {
    const buf = Buffer.from("# Title\n\n본문.", "utf8");
    const out = await extractTextFromFile(buf, "README.md");
    expect(out.ext).toBe("md");
    expect(out.text).toContain("# Title");
  });

  it("빈 버퍼 → throw '파일 처리 실패'", async () => {
    await expect(
      extractTextFromFile(Buffer.alloc(0), "empty.pdf"),
    ).rejects.toThrow(/^파일 처리 실패$/);
  });

  it("크기 초과(10MB+) → throw '파일 처리 실패'", async () => {
    const big = Buffer.alloc(MAX_FILE_BYTES + 1, 0x20);
    await expect(extractTextFromFile(big, "big.txt")).rejects.toThrow(
      /^파일 처리 실패$/,
    );
  });

  it("sanitize 후 빈 파일명 → throw", async () => {
    await expect(
      extractTextFromFile(Buffer.from("hello"), "///..."),
    ).rejects.toThrow(/^파일 처리 실패$/);
  });

  it("미지원 확장자 (.zip) → throw", async () => {
    await expect(
      extractTextFromFile(Buffer.from("PK\x03\x04"), "archive.zip"),
    ).rejects.toThrow(/^파일 처리 실패$/);
  });

  it("PDF 확장자인데 magic bytes 불일치 → throw (MIME 위조 방어)", async () => {
    // Content-Type 을 application/pdf 로 위조해도 실제 바이트는 다름
    const fake = Buffer.from("Not a PDF, just text.");
    await expect(extractTextFromFile(fake, "fake.pdf")).rejects.toThrow(
      /^파일 처리 실패$/,
    );
    expect(mockGetDocumentProxy).not.toHaveBeenCalled();
  });

  it("TXT 인데 NULL byte 포함 (바이너리 위장) → throw", async () => {
    const binary = Buffer.from([0x89, 0x50, 0x00, 0x01, 0xff]);
    await expect(extractTextFromFile(binary, "fake.txt")).rejects.toThrow(
      /^파일 처리 실패$/,
    );
  });

  it("PDF 파싱 실패 (암호화/손상) → throw", async () => {
    mockGetDocumentProxy.mockRejectedValueOnce(new Error("Encrypted PDF"));
    const buf = Buffer.from("%PDF-1.5\n" + "x".repeat(100));
    await expect(extractTextFromFile(buf, "locked.pdf")).rejects.toThrow(
      /^파일 처리 실패$/,
    );
  });

  it("추출 결과가 공백-only (스캔본 PDF) → throw", async () => {
    mockGetDocumentProxy.mockResolvedValueOnce({ fake: "pdf-proxy" });
    mockExtractText.mockResolvedValueOnce({ text: "   \n\n  \t  " });
    const buf = Buffer.from("%PDF-1.5\n" + "x".repeat(100));
    await expect(extractTextFromFile(buf, "scan.pdf")).rejects.toThrow(
      /^파일 처리 실패$/,
    );
  });

  it("파일명에 Trojan Source 포함 → sanitize 후 재검증", async () => {
    mockGetDocumentProxy.mockResolvedValueOnce({ fake: "pdf-proxy" });
    mockExtractText.mockResolvedValueOnce({ text: "ok content" });
    const buf = Buffer.from("%PDF-1.5\n" + "x".repeat(100));

    // 파일명에 RLO 포함 ("report<RLO>fdp.pdf" = 화면에는 "reportdpf.pdf" 로 보일 수 있음)
    const out = await extractTextFromFile(buf, "report\u202Efdp.pdf");
    expect(out.sanitizedFilename).toBe("reportfdp.pdf");
  });
});
