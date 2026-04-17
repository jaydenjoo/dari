/**
 * Database 타입 — DB 스키마 → TypeScript 타입 매핑
 *
 * 현재: bots / conversations / messages / knowledge_chunks 수동 정의.
 *
 * 수동 유지 결정 (2026-04-17, Epic 0-B 완결 시점):
 *   자동 생성(`supabase gen types typescript`)은 DariConfig·MessageSource 같은
 *   Zod 기반 구조 타입을 `Json` 으로 평탄화 → 정확도 손실.
 *   Epic 1 이후 정확도 유지 가능한 생성 파이프라인 마련 시 재평가.
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
