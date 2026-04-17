/**
 * Database 타입 — DB 스키마 → TypeScript 타입 매핑
 *
 * 현재: bots / conversations / messages 수동 정의 (Epic 0-B 진행 중).
 *
 * 모든 테이블 완성 후 자동 생성으로 전환:
 *   npx supabase gen types typescript --project-id pxdopzlaffjcxqfrqidq \
 *     --schema public > src/core/db/types.ts
 *
 * 전환 시점: knowledge_chunks 추가 완료 시.
 */

import type { DariConfig } from "@/core/config";

// ─── Enum-like ───
export type BotStatus = "active" | "paused" | "deleted";
export type ConversationStatus = "active" | "closed" | "handed_off";
export type MessageRole = "user" | "assistant" | "system";

// ─── Sub-structures ───
export type MessageSource = {
  chunk_id: string;
  score: number;
  excerpt: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
