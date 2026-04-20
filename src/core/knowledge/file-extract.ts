import "server-only";

/**
 * 파일 지식 소스 텍스트 추출 (Task 1-7-c).
 *
 * 지원 형식 (MVP): PDF / TXT / MD.
 *
 * 흐름:
 *   1. 파일명 sanitize (경로 traversal / NULL byte / Trojan Source / Tag chars / 길이).
 *   2. 확장자 기반 유형 판정 (.pdf / .txt / .md).
 *   3. 크기 재확인 (client FormData 위조 방어 — 서버도 10MB 이중 검증).
 *   4. magic bytes 검증 — Content-Type 헤더 신뢰 금지. 업로드된 실제 바이트로 재확인.
 *   5. 텍스트 추출:
 *      - PDF: unpdf extractText()
 *      - TXT/MD: UTF-8 디코딩 + BOM 제거
 *
 * 보안:
 *   - throw 는 정적 identifier 로만 ("파일 처리 실패"). 내부 상세는 호출자 logger.
 *   - magic bytes 불일치 = MIME 헤더 위조 또는 악성 업로드 → 즉시 거부.
 *   - TXT/MD 는 NULL byte 비율로 바이너리 탐지 (PDF 를 .txt 로 위장한 경우).
 *
 * 1-7-a 의 sanitizeKnowledgeText 는 추출된 **본문 텍스트** 에 적용 (호출자 책임).
 * 여기서는 파일 **메타/구조** 수준 sanitize 만 수행한다.
 */

import { extractText, getDocumentProxy } from "unpdf";

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// 파일명 길이 상한 — knowledge_chunks.source_identifier CHECK (1~500자) 여유분.
// `file:` prefix(5자) + 확장자(.pdf/.txt/.md 최대 4자) 포함 시에도 ≪ 500자.
export const MAX_FILENAME_LENGTH = 200;

export const SUPPORTED_FILE_EXTENSIONS = ["pdf", "txt", "md"] as const;
export type SupportedFileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number];

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
] as const;

// 파일명 sanitize 시 제거 대상:
// - 경로 구분자: `/` `\`  → path traversal 방어.
// - NULL byte: Postgres 22021 회피 + 파일시스템 문자열 조기 종결 방어.
// - 제어문자 U+0001~U+001F (tab 포함) + U+007F: 제어문자/DEL.
// - Unicode 방향 제어 + zero-width + BOM (sanitize.ts 와 동일 범위).
// - Tag Characters (invisible unicode block).
// - Windows drive letter `C:` 잔재 (sec LOW-2, 2026-04-20). 경로 구분자 제거 후
//   basename 강제 과정에서 `C:\Users\file.pdf` → `C:Usersfile.pdf` 로 남는 것을
//   추가 정리 — drive letter 는 원래 파일명의 일부가 아니다.
const PATH_SEPARATORS_RE = /[/\\]/g;
const NULL_BYTE_RE = /\u0000/g;
const CONTROL_CHARS_RE = /[\u0001-\u001F\u007F]/g;
const UNICODE_CONTROL_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const TAG_CHARS_RE = /[\u{E0000}-\u{E007F}]/gu;
const WINDOWS_DRIVE_LETTER_RE = /^[A-Za-z]:/;

/**
 * 파일명 sanitize — 저장 경로·source_identifier·UI 렌더링에 안전한 형태로.
 *
 * 처리 순서 (order-dependent):
 *   1. 경로 구분자 `/` `\` 제거 → basename 강제 (경로 traversal `../` 패턴 차단).
 *   2. 제어문자 / NULL byte / Unicode 방향 제어 / Tag chars 제거.
 *   3. Windows drive letter `^[A-Za-z]:` 제거 — 1번 후 남는 `C:...` 잔재 정리.
 *   4. 공백 trim → 양끝 마침표 제거 (Windows "file." 이슈).
 *   5. 길이 상한 200자 (확장자 보존 위해 끝부분부터 자름).
 *
 * 빈 문자열 반환 시 호출자는 "파일명 유효하지 않음" 으로 거부해야 한다.
 */
export function sanitizeFilename(raw: string): string {
  if (typeof raw !== "string") return "";

  let s = raw
    .replace(PATH_SEPARATORS_RE, "")
    .replace(NULL_BYTE_RE, "")
    .replace(CONTROL_CHARS_RE, "")
    .replace(UNICODE_CONTROL_RE, "")
    .replace(TAG_CHARS_RE, "")
    .replace(WINDOWS_DRIVE_LETTER_RE, "")
    .trim();

  // 양끝 마침표 제거 — ".htaccess" 의도 차단 + Windows 파일시스템 오류 회피.
  s = s.replace(/^\.+|\.+$/g, "");

  if (s.length === 0) return "";

  if (s.length > MAX_FILENAME_LENGTH) {
    // 확장자 보존: 마지막 `.` 뒤 ≤ 10자면 살리고 앞부분을 자른다.
    const dotIdx = s.lastIndexOf(".");
    if (dotIdx > 0 && s.length - dotIdx <= 11) {
      const ext = s.slice(dotIdx);
      s = s.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
    } else {
      s = s.slice(0, MAX_FILENAME_LENGTH);
    }
  }

  return s;
}

/**
 * 파일명에서 확장자 추출 (소문자 normalized). 지원하지 않는 확장자는 null.
 */
export function getExtension(
  sanitizedFilename: string,
): SupportedFileExtension | null {
  const dotIdx = sanitizedFilename.lastIndexOf(".");
  if (dotIdx <= 0) return null;
  const ext = sanitizedFilename.slice(dotIdx + 1).toLowerCase();
  return (SUPPORTED_FILE_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as SupportedFileExtension)
    : null;
}

/**
 * magic bytes 기반 유형 판별. Content-Type 헤더 위조 방어의 이중 방어선.
 *
 * 정책:
 *   - PDF: 첫 **32바이트** 안에 `%PDF-` (0x25 0x50 0x44 0x46 0x2D) 시그니처 존재.
 *     - 32바이트 허용은 UTF-8 BOM 3바이트 등 극히 짧은 앞부분 여유분 수용 목적.
 *     - 이전에는 1024바이트 관용이었으나 security review MEDIUM-1 (2026-04-20):
 *       `%PDF-` + (패딩) + `<svg onload=...>` 폴리글롯이 통과할 수 있어 축소.
 *       방어 깊이(Defense in Depth) 원칙 — 2차 방어선(unpdf 파싱)이 실패해도
 *       1차에서 명백한 이상치를 거부.
 *   - TXT/MD: ASCII/UTF-8 텍스트. 이중 휴리스틱:
 *     1) 첫 8KB 안에 NULL byte 가 1회라도 있으면 false (명백 바이너리).
 *     2) 비-텍스트 제어문자 (0x01~0x08, 0x0B, 0x0C, 0x0E~0x1F, 0x7F DEL) 비율
 *        5% 초과면 false. 허용: tab(0x09) / LF(0x0A) / CR(0x0D) / printable.
 *     - 한국어/일본어/중국어 UTF-8 은 고바이트 비율이 높지만(~100%) 제어문자는
 *       없으므로 통과. (sec MEDIUM-2 원안의 "고바이트 비율" 은 한글 false
 *       positive 가 명확해서 "제어문자 비율" 로 대체. 2026-04-20.)
 */
export function detectFileType(
  buffer: Buffer,
  ext: SupportedFileExtension,
): boolean {
  if (buffer.length === 0) return false;

  if (ext === "pdf") {
    const head = buffer.subarray(0, Math.min(32, buffer.length));
    return head.indexOf("%PDF-") !== -1;
  }

  const sample = buffer.subarray(0, Math.min(8192, buffer.length));
  if (sample.indexOf(0x00) !== -1) return false;

  // 비-텍스트 제어문자 비율.
  let nonTextControl = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i] ?? 0;
    const isAllowedWhitespace = b === 0x09 || b === 0x0a || b === 0x0d;
    const isControlRange = b < 0x20 && !isAllowedWhitespace;
    const isDel = b === 0x7f;
    if (isControlRange || isDel) nonTextControl++;
  }
  return nonTextControl / sample.length < 0.05;
}

/**
 * UTF-8 BOM 제거 + UTF-8 디코딩 (BOM 없는 파일은 그대로).
 */
function decodeTextBuffer(buffer: Buffer): string {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.subarray(3).toString("utf8");
  }
  return buffer.toString("utf8");
}

export type ExtractedFile = Readonly<{
  text: string;
  sanitizedFilename: string;
  ext: SupportedFileExtension;
  bytes: number;
}>;

/**
 * PDF / TXT / MD → 본문 텍스트 추출.
 *
 * 호출자 기대 에러 계약:
 *   - 모든 실패 경로는 `new Error("파일 처리 실패")` 로 통일.
 *   - 상세는 호출자(ingest-file.ts) 의 logger.error 메타에 기록.
 *
 * MIME 은 신뢰 안 함 — magic bytes 로 재판정.
 */
export async function extractTextFromFile(
  rawBuffer: Buffer,
  rawFilename: string,
): Promise<ExtractedFile> {
  // 1. 크기 재확인 (10MB 이중 방어).
  if (rawBuffer.length === 0) {
    throw new Error("파일 처리 실패");
  }
  if (rawBuffer.length > MAX_FILE_BYTES) {
    throw new Error("파일 처리 실패");
  }

  // 2. 파일명 sanitize.
  const sanitizedFilename = sanitizeFilename(rawFilename);
  if (sanitizedFilename.length === 0) {
    throw new Error("파일 처리 실패");
  }

  // 3. 확장자 판정.
  const ext = getExtension(sanitizedFilename);
  if (ext === null) {
    throw new Error("파일 처리 실패");
  }

  // 4. magic bytes 검증 (MIME 헤더 위조 방어).
  if (!detectFileType(rawBuffer, ext)) {
    throw new Error("파일 처리 실패");
  }

  // 5. 유형별 추출.
  let text: string;
  if (ext === "pdf") {
    try {
      // unpdf 는 Uint8Array 입력을 받는다. Buffer 는 Uint8Array 의 subclass.
      const pdf = await getDocumentProxy(new Uint8Array(rawBuffer));
      const { text: extracted } = await extractText(pdf, { mergePages: true });
      text = Array.isArray(extracted) ? extracted.join("\n\n") : extracted;
    } catch {
      // 암호화 PDF, 손상된 구조, 지원되지 않는 버전 등.
      throw new Error("파일 처리 실패");
    }
  } else {
    // TXT / MD
    text = decodeTextBuffer(rawBuffer);
  }

  // 추출 결과가 공백-only 면 저장 가치 없음 (스캔본 PDF 등).
  // 호출자(ingest-file.ts) 가 이 분기를 "내용 없음" 으로 매핑한다.
  if (text.trim().length === 0) {
    throw new Error("파일 처리 실패");
  }

  return {
    text,
    sanitizedFilename,
    ext,
    bytes: rawBuffer.length,
  };
}
