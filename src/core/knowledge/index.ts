// 지식 파이프라인 공개 API.
//
// 수집:
//   - chunkText: 입력 텍스트 → 청크 배열 (500자 + 100 오버랩).
//   - embedBatch: 청크 배열 → Gemini text-embedding-004 벡터 배열 (768차원).
//   - ingestTextKnowledge (Task 1-7-a): text 덩어리 오케스트레이션 (chunk + embed + RPC).
//   - ingestUrlKnowledge (Task 1-7-b): URL → Firecrawl scrape → sanitize → chunk + embed + 일반화 RPC.
//   - ingestFileKnowledge (Task 1-7-c): PDF/TXT/MD → extract → sanitize → chunk + embed + Storage + 일반화 RPC.
//   - fetchUrlAsMarkdown + knowledgeUrlSchema (Task 1-7-b): URL 수집 프리미티브.
//   - extractTextFromFile + sanitizeFilename (Task 1-7-c): 파일 수집 프리미티브.
//
// 조회 (Task 1-6-c):
//   - retrieveRelevantChunks: 사용자 질의 → 임베딩 → match_knowledge_chunks → 상위 K.
//   - augmentSystemPromptWithKnowledge: 청크 → XML 구조 주입 + Prompt Injection 방어.

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
export {
  extractTextFromFile,
  getExtension as getFileExtension,
  sanitizeFilename,
  MAX_FILE_BYTES,
  MAX_FILENAME_LENGTH,
  SUPPORTED_FILE_EXTENSIONS,
  type ExtractedFile,
  type SupportedFileExtension,
  ALLOWED_MIME_TYPES,
  detectFileType,
} from "./file-extract";
export { ingestTextKnowledge } from "./ingest";
export { ingestUrlKnowledge, type IngestUrlResult } from "./ingest-url";
export { ingestFileKnowledge, type IngestFileResult } from "./ingest-file";
export {
  KNOWLEDGE_FILES_BUCKET,
  buildKnowledgeFilePath,
  contentTypeForExtension,
  removeKnowledgeFile,
  uploadKnowledgeFile,
  type KnowledgeFileObject,
} from "./storage";
export { augmentSystemPromptWithKnowledge } from "./prompt-augment";
export {
  retrieveRelevantChunks,
  RETRIEVAL_MATCH_COUNT,
  RETRIEVAL_MIN_SCORE,
  RETRIEVAL_MAX_QUERY_LENGTH,
} from "./retrieval";
export { sanitizeKnowledgeText } from "./sanitize";
export {
  fetchUrlAsMarkdown,
  knowledgeUrlSchema,
  MAX_MARKDOWN_BYTES,
  MAX_URL_LENGTH,
  type FetchUrlResult,
} from "./url-fetch";
