/**
 * Database 타입 — DB 스키마 → TypeScript 타입 매핑
 *
 * 현재: bots 테이블만 수동 정의 (Epic 0-B 시작 단계).
 *
 * 테이블 완성 후 자동 생성으로 전환:
 *   npx supabase gen types typescript --project-id pxdopzlaffjcxqfrqidq \
 *     --schema public > src/core/db/types.ts
 *
 * 전환 시점: knowledge_chunks / conversations / messages 테이블 완성 직후.
 */

import type { DariConfig } from "@/core/config";

export type BotStatus = "active" | "paused" | "deleted";

export type Database = {
  public: {
    Tables: {
      bots: {
        Row: {
          id: string;
          bot_id: string;
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
          bot_id: string;
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
          bot_id?: string;
          owner_id?: string | null;
          name?: string;
          config?: DariConfig;
          config_version?: string;
          status?: BotStatus;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
