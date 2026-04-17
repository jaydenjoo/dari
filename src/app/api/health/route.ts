import { createClient } from "@/core/db/client-server";
import { runHealthChecks } from "@/core/observability/health";

// 캐시 금지 — 매 요청 시 실제 상태 조회
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * 응답:
 *   200 { status: "ok",   timestamp, checks.db: { status: "ok",   latencyMs } }
 *   503 { status: "fail", timestamp, checks.db: { status: "fail", latencyMs, error? } }
 *
 * 의도적 미포함: version, env, 구성 세부 — 공개 엔드포인트 리콘 가치 최소화.
 */
export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const report = await runHealthChecks(supabase);
  const status = report.status === "ok" ? 200 : 503;
  return Response.json(report, { status });
}
