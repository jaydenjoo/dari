"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { DariConfig } from "@/core/config";

import { updateBot, type UpdateBotFormState } from "./actions";
import { AiSection } from "./ai-section";
import { AnalyticsSection } from "./analytics-section";
import { AppearanceSection } from "./appearance-section";
import { BehaviorSection } from "./behavior-section";
import { IdentitySection } from "./identity-section";
import {
  KnowledgeFileSection,
  KnowledgeSection,
  KnowledgeUrlSection,
} from "./knowledge-section";

const initialState: UpdateBotFormState = {};

const SECTIONS = [
  { id: "identity", label: "정체성" },
  { id: "ai", label: "AI" },
  { id: "behavior", label: "행동" },
  { id: "appearance", label: "외관" },
  { id: "analytics", label: "분석" },
  { id: "knowledge", label: "지식 · 텍스트" },
  { id: "knowledge-url", label: "지식 · URL" },
  { id: "knowledge-file", label: "지식 · 파일" },
] as const;

export default function EditBotForm({
  slug,
  config,
}: {
  slug: string;
  config: DariConfig;
}) {
  // slug 는 client bind 인자. 보안 핵심은 RLS — slug 조작해도 owner 미일치 시 0-row.
  const boundUpdate = updateBot.bind(null, slug);
  const [state, formAction] = useActionState(boundUpdate, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <div className="space-y-6">
      <SectionNav />

      {state.error && (
        <div
          role="alert"
          data-testid="edit-bot-error"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700"
        >
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-6">
        <SectionCard
          id="identity"
          title="정체성"
          description="봇 이름·인사말·언어"
        >
          <IdentitySection initial={config.identity} errors={errors} />
        </SectionCard>

        <SectionCard
          id="ai"
          title="AI 설정"
          description="모델·지시사항·생성 옵션"
        >
          <AiSection initial={config.ai} errors={errors} />
        </SectionCard>

        <SectionCard
          id="behavior"
          title="행동 모드"
          description="응대 모드·이메일 수집·업무 시간·상담원 연결"
        >
          <BehaviorSection initial={config.behavior} errors={errors} />
        </SectionCard>

        <SectionCard
          id="appearance"
          title="외관"
          description="테마·색상·위젯 위치"
        >
          <AppearanceSection initial={config.appearance} errors={errors} />
        </SectionCard>

        <SectionCard
          id="analytics"
          title="분석"
          description="대화 통계 수집·웹훅"
        >
          <AnalyticsSection initial={config.analytics} errors={errors} />
        </SectionCard>

        <SectionCard
          id="knowledge"
          title="지식 · 텍스트"
          description="봇이 답변 근거로 사용할 텍스트 (변경 시 저장 버튼 필요)"
        >
          <KnowledgeSection initial={config.knowledge} errors={errors} />
        </SectionCard>

        <SubmitBar />
      </form>

      {/*
        URL 지식 추가는 메인 편집 폼과 **독립된 form**.
        - 이유 1: HTML `<form>` 중첩 금지 → 메인 폼 밖 DOM 위치 필요.
        - 이유 2: URL 크롤링은 수 초~수십 초 걸리는 비동기 작업이라, "저장" 버튼 없이
          추가 즉시 적용되는 UX 가 자연스러움 (메인 폼은 일괄 제출 모델).
      */}
      <SectionCard
        id="knowledge-url"
        title="지식 · URL 크롤링"
        description="웹페이지 본문을 크롤링·임베딩 (Firecrawl) — 추가 즉시 적용"
      >
        <KnowledgeUrlSection slug={slug} initial={config.knowledge} />
      </SectionCard>

      {/*
        Task 1-7-c: 파일 업로드 — URL 섹션과 동일한 이유로 메인 form 밖 별도 SectionCard.
        (HTML <form> 중첩 금지 + 비동기 처리 UX 분리)
      */}
      <SectionCard
        id="knowledge-file"
        title="지식 · 파일 업로드"
        description="PDF · TXT · MD 문서의 본문을 추출·임베딩 — 업로드 즉시 적용"
      >
        <KnowledgeFileSection slug={slug} initial={config.knowledge} />
      </SectionCard>
    </div>
  );
}

function SectionNav() {
  return (
    <nav
      aria-label="편집 섹션"
      className="sticky top-0 z-10 -mx-2 flex gap-1 overflow-x-auto rounded-xl border border-gray-200/80 bg-white/85 px-2 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur"
    >
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition hover:bg-blue-50 hover:text-blue-700"
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}

function SectionCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-margin: sticky nav 높이만큼 점프 위치 보정.
      className="scroll-mt-20 space-y-5 rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)]"
    >
      <header>
        <h2 className="text-lg font-bold tracking-[-0.01em] text-gray-900">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            {description}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

function SubmitBar() {
  const { pending } = useFormStatus();

  return (
    <div className="sticky bottom-4 z-10 flex justify-end">
      <button
        type="submit"
        data-testid="edit-bot-submit"
        disabled={pending}
        className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-[15px] font-semibold text-white shadow-[0_2px_8px_rgba(43,124,255,0.15),0_8px_24px_rgba(43,124,255,0.18)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(43,124,255,0.2),0_12px_32px_rgba(43,124,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-blue-600"
      >
        <span>{pending ? "저장 중..." : "변경사항 저장"}</span>
        {!pending && (
          <span className="text-blue-200 transition-colors group-hover:text-white">
            →
          </span>
        )}
      </button>
    </div>
  );
}
