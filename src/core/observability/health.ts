import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/types";
import { logger } from "@/core/logging";

/**
 * Health check 코어.
 *
 * 설계:
 * - 순수 함수: Supabase client 를 주입받음 → Next.js 런타임 의존 없이 테스트 가능
 * - 타임아웃 내장: 느린 DB 가 서비스 가용성 판정을 오래 막지 않음
 * - 로깅 정책: 성공은 조용, 실패만 error — 고빈도 호출 시 로그 노이즈 방지
 */

export interface HealthCheckResult {
  status: "ok" | "fail";
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: "ok" | "fail";
  timestamp: string;
  checks: {
    db: HealthCheckResult;
  };
}

const DB_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

async function pingDatabase(
  supabase: SupabaseClient<Database>,
): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const { error } = await withTimeout(
      supabase.from("bots").select("id").limit(1),
      DB_TIMEOUT_MS,
    );
    const latencyMs = Date.now() - start;
    if (error) {
      return { status: "fail", latencyMs, error: error.message };
    }
    return { status: "ok", latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return { status: "fail", latencyMs, error: message };
  }
}

export async function runHealthChecks(
  supabase: SupabaseClient<Database>,
): Promise<HealthReport> {
  const db = await pingDatabase(supabase);
  const overall: "ok" | "fail" = db.status === "ok" ? "ok" : "fail";

  if (db.status === "fail") {
    logger.error(
      { check: "db", latencyMs: db.latencyMs, error: db.error },
      "health check failed",
    );
  }

  return {
    status: overall,
    timestamp: new Date().toISOString(),
    checks: { db },
  };
}
