// Server + Client 공통 헬퍼 — UI 소스 표현(type/identifier) 을 DB 의
// (source_type, source_identifier) 로 매핑하고, 청크 집계용 조합 키를 생성한다.
//
// 왜 별도 파일인가:
//   - `remove-source.ts` 는 "server-only" 로 선언 → client 컴포넌트(sources-list.tsx)
//     에서 import 불가.
//   - 동일 매핑 규칙이 server(remove-source) + client(sources-list) 양쪽에 필요.
//     중복 구현은 silent 동기화 실패 위험(code review M-1).
//   - 이 파일은 server-only 선언 없이 순수 함수만 export → 양쪽에서 재사용.
//
// 가정 (code review M-4):
//   - identifier 는 상위 파이프라인(1-7-a/b/c) 에서 이미 검증·정규화된 값.
//   - `.pdf` / `.txt` / `.md` 외 확장자는 sanitizeFilename + detectFileType 가 걸러냄.
//   - 따라서 `mapUiToDb` 는 "정규화된 입력만 받는다" 는 전제 하에 단순 분기만 수행.

export type UiSourceType = "text" | "url" | "file";
export type DbSourceType = "url" | "pdf" | "manual" | "markdown";

/**
 * UI(타입·식별자) → DB(source_type·source_identifier) 매핑.
 *
 * 매핑 규칙:
 *   - text → ('manual', 'manual:inline')  — text 소스는 단일 슬롯 (1-7-a)
 *   - url  → ('url', URL 원본)            — identifier = URL
 *   - file → (ext==='pdf' ? 'pdf' : 'markdown', `file:{filename}`)
 *
 * 에러:
 *   - uiType 이 화이트리스트 밖 → 호출자가 사전 검증 (TypeScript 타입으로 차단).
 *   - url/file 의 identifier 가 빈 문자열 → "invalid source identifier" throw.
 */
export function mapUiToDb(
  uiType: UiSourceType,
  identifier: string,
): { sourceType: DbSourceType; sourceIdentifier: string } {
  if (uiType === "text") {
    return { sourceType: "manual", sourceIdentifier: "manual:inline" };
  }
  if (identifier.length === 0) {
    throw new Error("invalid source identifier");
  }
  if (uiType === "url") {
    return { sourceType: "url", sourceIdentifier: identifier };
  }
  // file — 확장자로 pdf/markdown 분기 (1-7-c SOURCE_TYPE_BY_EXT 와 정합).
  const ext = identifier.split(".").pop()?.toLowerCase() ?? "";
  const dbType: DbSourceType = ext === "pdf" ? "pdf" : "markdown";
  return { sourceType: dbType, sourceIdentifier: `file:${identifier}` };
}

/**
 * chunks 집계 Map 에서 사용하는 조합 키: `${source_type}:${source_identifier}`.
 *
 * page.tsx 의 `knowledge_chunks` SELECT 결과를 groupBy 할 때 같은 key 스킴 사용 →
 * sources-list 가 각 row 의 청크 수를 정확히 lookup.
 */
export function chunkKey(uiType: UiSourceType, identifier: string): string {
  const { sourceType, sourceIdentifier } = mapUiToDb(uiType, identifier);
  return `${sourceType}:${sourceIdentifier}`;
}
