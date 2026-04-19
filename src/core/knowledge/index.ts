// Task 1-7-a: 지식 수집 파이프라인 공개 API.
//
// 범위:
//   - chunkText: 입력 텍스트 → 청크 배열 (500자 + 100 오버랩).
//   - embedBatch: 청크 배열 → Gemini text-embedding-004 벡터 배열 (768차원).
//   - ingestTextKnowledge: 전체 오케스트레이션 (chunk + embed + RPC 원자 저장).
//
// Phase 2+ 추가 예정: ingestUrlKnowledge(Task 1-7-b), ingestFileKnowledge(1-7-c).

export {
  chunkText,
  DEFAULT_CHUNK_OPTIONS,
  type ChunkOptions,
} from "./chunking";
export {
  embedBatch,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MAX_BATCH,
} from "./embedding";
export { ingestTextKnowledge } from "./ingest";
export { sanitizeKnowledgeText } from "./sanitize";
