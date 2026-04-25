import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";

// 매 호출이 새 Sentry 이벤트 — 캐시 금지
export const dynamic = "force-dynamic";

/**
 * GET /api/sentry-trigger?token=<SENTRY_TEST_TOKEN>
 *
 * Stage 1 출시 직전 prod Sentry "production" environment 이벤트 수집 검증용 임시 라우트.
 *  - `SENTRY_TEST_TOKEN` env 미설정 → 404 (라우트 존재 자체 은폐)
 *  - 토큰 불일치 → 404 (timing-safe 비교)
 *  - 토큰 일치 → Sentry 에 의도적 에러 1건 송신 + flush + 200 + eventId
 *
 * ⚠️ 검증 완료 후 즉시 삭제 — 라우트 + Vercel env 둘 다 제거 (이중 차단).
 *    동시에 Sentry Issues 에서 해당 이벤트 Resolve + Delete.
 */
export async function GET(request: Request): Promise<Response> {
  const expected = process.env.SENTRY_TEST_TOKEN?.trim();
  if (!expected) return notFound();

  const provided = new URL(request.url).searchParams.get("token") ?? "";
  if (!safeEqual(provided, expected)) return notFound();

  const eventId = Sentry.captureMessage(
    "[Stage 1 smoke] Intentional Sentry test event — safe to delete",
    {
      level: "error",
      tags: { source: "stage-1-smoke", intentional: "true" },
    },
  );

  // Vercel serverless 함수 종료 전 Sentry 송신 보장 (5s 상한)
  await Sentry.flush(5000);

  return Response.json({ ok: true, eventId: eventId ?? null });
}

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  // timingSafeEqual 은 길이 동일 Buffer 만 허용 — 길이 다르면 즉시 false (32자 hex 토큰 고정 사용 가정)
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
