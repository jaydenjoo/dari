// 지식 파이프라인 공개 API.
//
// 수집 (Task 1-7-a):
//   - chunkText: 입력 텍스트 → 청크 배열 (500자 + 100 오버랩).
//   - embedBatch: 청크 배열 → Gemini text-embedding-004 벡터 배열 (768차원).
//   - ingestTextKnowledge: 전체 오케스트레이션 (chunk + embed + RPC 원자 저장).
//
// 조회 (Task 1-6-c):
//   - retrieveRelevantChunks: 사용자 질의 → 임베딩 → match_knowledge_chunks → 상위 K.
//   - augmentSystemPromptWithKnowledge: 청크 → XML 구조 주입 + Prompt Injection 방어.
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
export { augmentSystemPromptWithKnowledge } from "./prompt-augment";
export {
  retrieveRelevantChunks,
  RETRIEVAL_MATCH_COUNT,
  RETRIEVAL_MIN_SCORE,
  RETRIEVAL_MAX_QUERY_LENGTH,
} from "./retrieval";
export { sanitizeKnowledgeText } from "./sanitize";
