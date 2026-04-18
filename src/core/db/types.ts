/**
 * Database 타입 — DB 스키마 → TypeScript 타입 매핑
 *
 * 현재: bots / conversations / messages / knowledge_chunks 수동 정의.
 *
 * 수동 유지 결정 (2026-04-17, Epic 0-B 완결 시점):
 *   자동 생성(`supabase gen types typescript`)은 DariConfig·MessageSource 같은
 *   Zod 기반 구조 타입을 `Json` 으로 평탄화 → 정확도 손실.
 *   Epic 1 이후 정확도 유지 가능한 생성 파이프라인 마련 시 재평가.
 *
 * `__InternalSupabase` 슬롯 (2026-04-18, Task 1-5-d 후속):
 *   postgrest-js v1.x 가 Database 타입에서 `__InternalSupabase` 와 각 테이블의
 *   `Relationships` 필드를 인식해 Insert/Update payload 추론을 활성화한다.
 *   이 슬롯이 없으면 `.insert()` / `.update()` 의 values 가 `never` 로 좁혀져
 *   `as never` 어셔션이 강제됐다. 슬롯 추가 후 `.returns<T[]>()` 와 `as never`
 *   회피 코드를 모두 제거할 수 있다.
 *
 *   PostgrestVersion="12" 선택: postgrest-js feature-flags 의 spread/maxAffected
 *   같은 v13+ 전용 기능을 우리는 사용하지 않으므로 12 가 가장 보수적·안전.
 */

import type { DariConfig } from "@/core/config";

// ─── Enum-like ───
export type BotStatus = "active" | "paused" | "deleted";
export type ConversationStatus = "active" | "closed" | "handed_off";
export type MessageRole = "user" | "assistant" | "system";
export type KnowledgeSourceType = "url" | "pdf" | "manual" | "markdown";

// ─── Sub-structures ───
export type MessageSource = {
  chunk_id: string;
  score: number;
  excerpt: string;
};

// RPC match_knowledge_chunks 결과. score = 1 - cosine_distance (1.0 = 완벽 일치).
export type KnowledgeChunkMatch = {
  id: string;
  content: string;
  score: number;
  source_type: KnowledgeSourceType;
  source_identifier: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
};

// ─── Database ───
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      bots: {
        Row: {
          id: string;
          slug: string;
          owner_id: string | null;
          name: string;
          config: DariConfig;
          config_version: string;
          status: BotStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          owner_id?: string | null;
          name: string;
          config: DariConfig;
          config_version?: string;
          status?: BotStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          owner_id?: string | null;
          name?: string;
          config?: DariConfig;
          config_version?: string;
          status?: BotStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          bot_id: string;
          visitor_id: string | null;
          user_id: string | null;
          email: string | null;
          status: ConversationStatus;
          ended_at: string | null;
          last_message_at: string;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          bot_id: string;
          visitor_id?: string | null;
          user_id?: string | null;
          email?: string | null;
          status?: ConversationStatus;
          ended_at?: string | null;
          last_message_at?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          bot_id?: string;
          visitor_id?: string | null;
          user_id?: string | null;
          email?: string | null;
          status?: ConversationStatus;
          ended_at?: string | null;
          last_message_at?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: MessageRole;
          content: string;
          tokens_used: number | null;
          sources: MessageSource[] | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: MessageRole;
          content: string;
          tokens_used?: number | null;
          sources?: MessageSource[] | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: MessageRole;
          content?: string;
          tokens_used?: number | null;
          sources?: MessageSource[] | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [];
      };
      knowledge_chunks: {
        Row: {
          id: string;
          bot_id: string;
          source_type: KnowledgeSourceType;
          source_identifier: string;
          content: string;
          chunk_index: number;
          embedding: number[];
          tokens: number | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          bot_id: string;
          source_type?: KnowledgeSourceType;
          source_identifier: string;
          content: string;
          chunk_index?: number;
          embedding: number[];
          tokens?: number | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          bot_id?: string;
          source_type?: KnowledgeSourceType;
          source_identifier?: string;
          content?: string;
          chunk_index?: number;
          embedding?: number[];
          tokens?: number | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_knowledge_chunks: {
        Args: {
          p_bot_id: string;
          p_query_embedding: number[];
          p_match_count?: number;
          p_min_score?: number;
        };
        Returns: KnowledgeChunkMatch[];
      };
    };
    Enums: Record<string, never>;
  };
};
