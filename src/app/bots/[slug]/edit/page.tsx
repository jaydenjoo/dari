import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageBackground } from "@/components/ui/page-background";
import { dariConfigSchema, type DariConfig } from "@/core/config";
import { createClient } from "@/core/db/client-server";
import type { Database } from "@/core/db/types";
import { logger } from "@/core/logging";

import { isValidSlug } from "../../new/slug-util";
import EditBotForm from "./edit-bot-form";

type BotRow = Database["public"]["Tables"]["bots"]["Row"];
type BotEditRow = Pick<BotRow, "id" | "slug" | "name" | "config">;

export const metadata: Metadata = {
  title: "봇 편집 — Dari",
};

export default async function EditBotPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // slug 형식 선검증 — DB 왕복 없이 즉시 404 (1-5-c 와 동일 hardening).
  if (!isValidSlug(slug)) {
    notFound();
  }

  // 3중 방어: proxy + 여기 getUser() + RLS.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(`/bots/${slug}/edit`);
    redirect(`/login?next=${next}`);
  }

  // RLS bots_select_owner 가 owner_id = auth.uid() 자동 필터.
  // 타인 봇/미존재 = data null → notFound (enumeration 방어).
  const { data, error } = await supabase
    .from("bots")
    .select("id, slug, name, config")
    .eq("slug", slug)
    // Task B-3: soft delete 봇은 편집 불가 (휴지통에서 복구 후 편집).
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logger.error(
      {
        errCode: error.code,
        errMsg: error.message,
        slug,
        userId: user.id,
      },
      "봇 편집 조회 실패",
    );
    // 일반화된 메시지만 throw — Supabase 내부 에러 원문이 error boundary 를 거쳐
    // Sentry 에 그대로 전송되면 DB 스키마/쿼리 힌트가 외부에 노출됨 (security M-3).
    // 원본 상세는 위 structured log 로만 남기고 사용자·Sentry 에는 일반 메시지 전달.
    throw new Error("봇 편집 조회 실패");
  }

  if (!data) {
    notFound();
  }

  // config safeParse — 깨진 jsonb 가 있어도 폼 진입 가능하도록 fallback 제공.
  const parsed = dariConfigSchema.safeParse(data.config);
  let config: DariConfig;
  if (parsed.success) {
    config = parsed.data;
  } else {
    logger.error(
      { err: parsed.error.issues, slug, userId: user.id },
      "DariConfig 파싱 실패 — 기본값으로 폼 초기화",
    );
    // 깨진 config 라도 botId/identity.name/ai.systemPrompt 만 살리고 나머지는 default.
    // (사용자가 다시 저장하면 서버에서 dariConfigSchema.parse 가 정상 검증.)
    config = dariConfigSchema.parse({
      botId: data.slug,
      identity: { name: data.name, welcomeMessage: "안녕하세요!" },
      ai: { systemPrompt: "역할을 알려주세요. (10자 이상)" },
    });
  }

  // Task 1-7-d: 소스별 청크 개수 집계 (SourcesList 표시용).
  //   - RLS knowledge_chunks_select_owner 자동 격리 → 타 owner 봇 chunks 노출 방지.
  //   - 단일 SELECT + 메모리 aggregation (N+1 방지). bot 당 수백 row 수준 MVP 허용.
  //   - 실패 시 빈 Record 로 fallback — 페이지는 표시, 청크 수만 0 으로 노출.
  const chunkCounts: Record<string, number> = {};
  const { data: chunkRows, error: chunksErr } = await supabase
    .from("knowledge_chunks")
    .select("source_type, source_identifier")
    .eq("bot_id", data.id);

  if (chunksErr) {
    // code review L-1: warn 레벨 선택 이유.
    //   - data loss 없음 — 실제 삭제 식별은 identifier 기반이므로 안전.
    //   - 표시 지표만 0 으로 fallback → UX 미세 이슈, 페이지 자체는 정상.
    //   - error 로 올리면 알람 잡음 증가 → 실제 서비스 영향 없는 실패는 warn 유지.
    logger.warn(
      {
        errCode: chunksErr.code,
        errMsg: chunksErr.message,
        slug,
        userId: user.id,
      },
      "knowledge_chunks 집계 실패 — SourcesList 는 청크 수 0 으로 표시",
    );
  } else {
    for (const row of chunkRows ?? []) {
      const key = `${row.source_type}:${row.source_identifier}`;
      chunkCounts[key] = (chunkCounts[key] ?? 0) + 1;
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fafbfc] px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(43,124,255,0.06) 0%, transparent 70%)",
        }}
      />
      <PageBackground />

      <div className="relative mx-auto w-full max-w-3xl">
        <nav className="animate-in fade-in mb-6 duration-500">
          <Link
            href={`/bots/${data.slug}`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
          >
            <span aria-hidden>←</span>
            <span>봇 상세로</span>
          </Link>
        </nav>

        <header
          className="animate-in fade-in slide-in-from-bottom-2 mb-8 duration-500"
          style={{ animationDelay: "80ms", animationFillMode: "both" }}
        >
          <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-blue-600 uppercase">
            봇 편집
          </p>
          <h1
            data-testid="edit-bot-name-heading"
            className="text-4xl leading-tight font-bold tracking-[-0.02em] text-gray-900"
          >
            {data.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>주소</span>
            <code
              data-testid="edit-bot-slug-readonly"
              className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600"
            >
              {data.slug}
            </code>
            <span className="text-gray-400">
              · 주소(slug) 변경은 위젯 마이그레이션이 필요해 별도 메뉴로
              제공돼요
            </span>
          </div>
        </header>

        <div
          className="animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: "160ms", animationFillMode: "both" }}
        >
          <EditBotForm
            slug={data.slug}
            config={config}
            chunkCounts={chunkCounts}
          />
        </div>
      </div>
    </main>
  );
}
