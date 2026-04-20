import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageBackground } from "@/components/ui/page-background";
import { dariConfigSchema, type DariConfig } from "@/core/config";
import { createClient } from "@/core/db/client-server";
import type { Database } from "@/core/db/types";
import { logger } from "@/core/logging";
import { BOT_STATUS_CLASS, BOT_STATUS_LABEL } from "@/shared/bots/status";

import { isValidSlug } from "../new/slug-util";
import CopySnippet from "./copy-snippet";
import { StatsSection } from "./stats-section";
import {
  EMPTY_STATS,
  parseBotStats,
  parseRange,
  rangeToSince,
  type BotStats,
} from "./stats-util";

type BotRow = Database["public"]["Tables"]["bots"]["Row"];
type BotDetail = Pick<
  BotRow,
  "id" | "slug" | "name" | "status" | "config" | "created_at" | "updated_at"
>;

export const metadata: Metadata = {
  title: "봇 상세 — Dari",
};

// 위젯 런타임 URL — Phase 2 에서 실제 배포 URL 확정.
// 현재는 베타 미리보기. 사용자가 자신의 사이트에 "복사해둘" 수 있는 형태만 제공.
const WIDGET_URL = "https://dari.kr/widget.js";

// systemPrompt 는 10~8000자 허용. 상세 페이지에서는 개요만 보이고, 전체 편집은 Task 1-5-d.
const SYSTEM_PROMPT_PREVIEW_MAX = 400;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export default async function BotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const { range: rangeParam } = await searchParams;
  const range = parseRange(rangeParam);

  // DB CHECK(`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`) / DariConfig.botId 정규식과
  // 일치하지 않는 slug 는 DB 왕복 없이 즉시 404. (매우 긴/유니코드 slug 로 리소스
  // 낭비 유발 경로 차단 — security L-2)
  if (!isValidSlug(slug)) {
    notFound();
  }

  // 3중 방어: proxy(route guard) + 여기 getUser() + RLS. proxy 가 이미 리디렉트하지만
  // 안전망으로 페이지 레벨에서도 세션 검증. RLS 가 최종 owner 필터.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(`/bots/${slug}`);
    redirect(`/login?next=${next}`);
  }

  // RLS bots_select_owner 가 owner_id = auth.uid() 로 자동 필터.
  // 타인 봇이거나 존재하지 않는 slug 는 모두 row 0개 → maybeSingle() 로 data=null 수신.
  // → notFound() 로 404. 에러 메시지에 "타인 봇" 여부 노출 안 됨 (enumeration 방어).
  const { data, error } = await supabase
    .from("bots")
    .select("id, slug, name, status, config, created_at, updated_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    logger.error(
      {
        errCode: error.code,
        errMsg: error.message,
        slug,
        userId: user.id,
      },
      "봇 상세 조회 실패",
    );
    throw new Error("internal_error");
  }

  if (!data) {
    notFound();
  }

  // config 는 DB JSONB. 스키마 마이그레이션/외부 삽입으로 깨진 config 가 있어도
  // 페이지가 크래시하지 않도록 safeParse. 실패 시 메타 정보만 표시.
  const parsed = dariConfigSchema.safeParse(data.config);
  const config: DariConfig | null = parsed.success ? parsed.data : null;
  if (!parsed.success) {
    logger.error(
      { err: parsed.error.issues, slug, userId: user.id },
      "DariConfig 파싱 실패 — 최소 정보만 표시",
    );
  }

  // Task 1-8-c: 기간별 KPI. RPC 실패 시 페이지 렌더가 무너지지 않도록 0 지표로
  // 폴백하고 warn 로그만 남긴다 (지식 retrieval 과 동일 철학). Postgres 에러
  // 메시지는 구조적 필드만 로깅 (sec H-1 학습 재적용).
  const since = rangeToSince(range, new Date());
  const { data: statsRaw, error: statsErr } = await supabase.rpc("bot_stats", {
    p_bot_id: data.id,
    p_since: since,
  });
  let stats: BotStats = EMPTY_STATS;
  let statsError = false;
  if (statsErr) {
    statsError = true;
    logger.warn(
      {
        errCode: statsErr.code,
        errMsg: statsErr.message,
        slug,
        userId: user.id,
        range,
      },
      "bot_stats RPC 실패 — 0 지표 폴백",
    );
  } else {
    stats = parseBotStats(statsRaw);
  }

  const snippet = `<script src="${WIDGET_URL}" data-bot-slug="${data.slug}" defer></script>`;

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

      <div className="relative mx-auto w-full max-w-4xl">
        <nav className="animate-in fade-in mb-6 duration-500">
          <Link
            href="/bots"
            className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
          >
            <span aria-hidden>←</span>
            <span>내 봇 목록</span>
          </Link>
        </nav>

        <header
          className="animate-in fade-in slide-in-from-bottom-2 mb-10 flex flex-wrap items-start justify-between gap-4 duration-500"
          style={{ animationDelay: "80ms", animationFillMode: "both" }}
        >
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-blue-600 uppercase">
              봇 상세
            </p>
            <h1
              data-testid="bot-detail-name"
              className="text-4xl leading-tight font-bold tracking-[-0.02em] text-gray-900"
            >
              {data.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.05em] ring-1 ring-inset ${BOT_STATUS_CLASS[data.status]}`}
              >
                {BOT_STATUS_LABEL[data.status]}
              </span>
              <code
                data-testid="bot-detail-slug"
                className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600"
              >
                {data.slug}
              </code>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/bots/${data.slug}/conversations`}
              data-testid="bot-detail-conversations"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]"
            >
              대화 로그
              <span aria-hidden>→</span>
            </Link>
            <Link
              href={`/bots/${data.slug}/edit`}
              data-testid="bot-detail-edit"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]"
            >
              편집
              <span aria-hidden>→</span>
            </Link>
          </div>
        </header>

        <StatsSection
          slug={data.slug}
          range={range}
          stats={stats}
          statsError={statsError}
        />

        <section
          className="animate-in fade-in slide-in-from-bottom-2 mb-6 rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] duration-500"
          style={{ animationDelay: "280ms", animationFillMode: "both" }}
        >
          <h2 className="mb-5 text-lg font-bold tracking-[-0.01em] text-gray-900">
            기본 정보
          </h2>

          <dl className="grid gap-5 sm:grid-cols-2">
            <InfoRow label="첫 인사 메시지">
              <p
                data-testid="bot-detail-welcome"
                className="text-sm leading-relaxed text-gray-700"
              >
                {config?.identity.welcomeMessage ?? "—"}
              </p>
            </InfoRow>
            <InfoRow label="AI 모델">
              <p className="font-mono text-sm text-gray-700">
                {config?.ai.model ?? "—"}
              </p>
            </InfoRow>
            <InfoRow label="생성일">
              <p className="text-sm text-gray-700">
                {formatDate(data.created_at)}
              </p>
            </InfoRow>
            <InfoRow label="마지막 수정">
              <p className="text-sm text-gray-700">
                {formatDateTime(data.updated_at)}
              </p>
            </InfoRow>
          </dl>

          <div className="mt-6 border-t border-gray-100 pt-5">
            <dt className="mb-1.5 text-xs font-semibold tracking-[0.05em] text-gray-500 uppercase">
              AI 지시사항 (system prompt)
            </dt>
            <dd
              data-testid="bot-detail-system-prompt"
              className="rounded-xl bg-gray-50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-gray-700"
            >
              {config
                ? truncate(config.ai.systemPrompt, SYSTEM_PROMPT_PREVIEW_MAX)
                : "—"}
            </dd>
          </div>
        </section>

        <section
          className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] duration-500"
          style={{ animationDelay: "240ms", animationFillMode: "both" }}
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-[-0.01em] text-gray-900">
              위젯 설치 코드
            </h2>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.05em] text-amber-700 ring-1 ring-amber-200 ring-inset">
              베타 — Phase 2 출시 예정
            </span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-gray-500">
            사이트의{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
              &lt;/body&gt;
            </code>{" "}
            태그 직전에 아래 스크립트를 붙여넣으면 위젯이 나타납니다. 현재는
            미리보기이며 실제 위젯 런타임은 Phase 2 에서 배포됩니다.
          </p>

          <CopySnippet snippet={snippet} />
        </section>
      </div>
    </main>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="mb-1 text-xs font-semibold tracking-[0.05em] text-gray-500 uppercase">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
