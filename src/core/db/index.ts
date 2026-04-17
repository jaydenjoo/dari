/**
 * @module core/db
 *
 * Supabase 클라이언트 Public API.
 *
 * 실행 환경별로 **직접 import** 하여 실수 방지:
 *   - 브라우저: `@/core/db/client-browser`
 *   - 서버(SSR/RH/SA): `@/core/db/client-server`
 *   - 관리 (service_role): `@/core/db/client-admin`
 *
 * 이 index는 **타입만 re-export** — 런타임 클라이언트는 환경별 import 강제.
 */

export type {
  Database,
  BotStatus,
  KnowledgeSourceType,
  KnowledgeChunkMatch,
} from "./types";
