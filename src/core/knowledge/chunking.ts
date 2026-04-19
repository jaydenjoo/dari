/**
 * 텍스트 청킹 — RAG 인덱싱 전처리.
 *
 * 설계:
 *   - 고정 크기 + 오버랩 (PRD M2 명시: 500자 + 100자 오버랩).
 *   - 문자 단위(코드포인트 아님). MVP 는 한글/영문 혼재 시에도 충분히 작동.
 *   - 문장 경계 인식 / semantic chunking 은 Phase 2 승격 여지.
 *
 * 엣지 케이스:
 *   - 빈/공백-only 입력 → [] 반환 (DB 삽입 생략).
 *   - 입력 ≤ chunkSize → 그대로 단일 청크.
 *   - overlap >= chunkSize → 무한 루프 위험 → throw (호출자 실수 방어).
 *
 * 결정 근거:
 *   - 오버랩의 이유: 문장 중간에서 잘리는 경우 이전 청크의 꼬리가 다음 청크의 머리에
 *     남아 벡터 검색 recall 을 높임. 100/500 = 20% 오버랩.
 */

export type ChunkOptions = Readonly<{
  chunkSize: number;
  overlap: number;
}>;

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  chunkSize: 500,
  overlap: 100,
};

export function chunkText(
  raw: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): string[] {
  const { chunkSize, overlap } = options;

  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`chunkSize must be a positive integer (got ${chunkSize})`);
  }
  if (!Number.isInteger(overlap) || overlap < 0) {
    throw new Error(`overlap must be a non-negative integer (got ${overlap})`);
  }
  if (overlap >= chunkSize) {
    throw new Error(
      `overlap (${overlap}) must be strictly less than chunkSize (${chunkSize})`,
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= chunkSize) return [trimmed];

  const chunks: string[] = [];
  const step = chunkSize - overlap;
  let pos = 0;
  while (pos < trimmed.length) {
    const end = Math.min(pos + chunkSize, trimmed.length);
    chunks.push(trimmed.slice(pos, end));
    if (end >= trimmed.length) break;
    pos += step;
  }
  return chunks;
}
