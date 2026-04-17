import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/types";
import { runHealthChecks } from "./health";

type QueryResult = { data: unknown; error: { message: string } | null };

function createMockSupabase(
  finalResult: QueryResult | Promise<QueryResult>,
): SupabaseClient<Database> {
  const chain = {
    select: vi.fn().mockReturnThis(),
    limit: vi
      .fn()
      .mockReturnValue(
        finalResult instanceof Promise
          ? finalResult
          : Promise.resolve(finalResult),
      ),
  };
  const client = {
    from: vi.fn().mockReturnValue(chain),
  };
  return client as unknown as SupabaseClient<Database>;
}

describe("runHealthChecks", () => {
  it("DB 정상 응답 시 status='ok' + latencyMs 기록 + ISO timestamp", async () => {
    const supabase = createMockSupabase({
      data: [{ id: "b-1" }],
      error: null,
    });

    const report = await runHealthChecks(supabase);

    expect(report.status).toBe("ok");
    expect(report.checks.db.status).toBe("ok");
    expect(report.checks.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.checks.db.error).toBeUndefined();
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("DB 에러(PostgrestError) 시 status='fail' + error 메시지 포함", async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: "connection refused" },
    });

    const report = await runHealthChecks(supabase);

    expect(report.status).toBe("fail");
    expect(report.checks.db.status).toBe("fail");
    expect(report.checks.db.error).toBe("connection refused");
    expect(report.checks.db.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("DB 응답이 2초를 초과하면 status='fail' + error='timeout after 2000ms'", async () => {
    // 영원히 resolve 되지 않는 Promise
    const neverResolves = new Promise<QueryResult>(() => {});
    const supabase = createMockSupabase(neverResolves);

    const report = await runHealthChecks(supabase);

    expect(report.status).toBe("fail");
    expect(report.checks.db.status).toBe("fail");
    expect(report.checks.db.error).toMatch(/timeout/);
  }, 4000); // 테스트 타임아웃 > DB 타임아웃(2s)
});
