"use client";

import { useState } from "react";

import type { Knowledge } from "@/core/config";

import { Field, textareaClass } from "./field";

// textSourceSchema.content = z.string().min(10).max(100_000)
// UI 는 빈 문자열(삭제 의도) 도 허용 → min 검증은 action 에서 조건부.
const MAX_TEXT_LENGTH = 100_000;
const MIN_TEXT_LENGTH = 10;

/**
 * Task 1-7-a: text 지식 소스 편집 (단일 textarea).
 *
 * 설계:
 *   - MVP 는 한 봇당 text 지식 1개(덩어리) 편집. 다중 text/url/file 은 Task 1-7-b/c/d.
 *   - 저장 시 server action 이 old vs new content 비교 → 변경된 경우에만 재임베딩.
 *   - 빈 문자열 저장 = "text 지식 삭제" 의도 → chunks 전체 삭제.
 *   - url/file 타입 sources 는 action 에서 보존 (type==="text" 항목만 교체).
 */
export function KnowledgeSection({
  initial,
  errors,
}: {
  initial: Knowledge;
  errors: Record<string, string>;
}) {
  const initialText =
    initial.sources.find((s) => s.type === "text")?.content ?? "";

  const [text, setText] = useState(initialText);
  const length = text.length;
  // textarea maxLength 가 브라우저 입력을 MAX_TEXT_LENGTH 로 제한하므로 length >
  // MAX_TEXT_LENGTH 분기는 dead code (code M-3). 복사 붙여넣기로 초과되는 극단
  // 케이스는 서버 액션(actions.ts MAX_KNOWLEDGE_TEXT_LENGTH) 가 fieldError 로 응답.
  const tooShort = length > 0 && length < MIN_TEXT_LENGTH;

  const hint = tooShort
    ? `${MIN_TEXT_LENGTH}자 이상 입력하거나 비워두세요 (현재 ${length}자)`
    : length === 0
      ? "비워두면 저장된 지식이 삭제돼요. 채우면 자동으로 500자 단위로 분석·저장됩니다."
      : `${length.toLocaleString()} / ${MAX_TEXT_LENGTH.toLocaleString()}자 — 저장하면 자동으로 500자 단위 청크로 분석돼요.`;

  return (
    <div className="space-y-5">
      <div
        data-testid="knowledge-meta"
        className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3"
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-blue-900">
            봇이 답변 근거로 사용할 텍스트를 붙여넣어요
          </p>
          <p className="text-xs leading-relaxed text-blue-800/80">
            FAQ, 가격표, 정책, 매뉴얼 요약 등 자유 서식으로 입력. 저장 시 Gemini
            임베딩으로 변환돼 질문과 관련된 부분만 자동 추출됩니다. (URL/파일
            업로드는 Phase 2)
          </p>
        </div>
      </div>

      <Field
        label="텍스트 지식"
        htmlFor="knowledge-text-content"
        hint={hint}
        error={errors["knowledge.text.content"] ?? errors["knowledge"]}
      >
        <textarea
          id="knowledge-text-content"
          data-testid="knowledge-text-content"
          name="knowledge.text.content"
          rows={12}
          maxLength={MAX_TEXT_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`예) 챗시오 요금 안내
- Basic: 월 49,000원, 대화 1000건
- Pro: 월 99,000원, 대화 5000건
- Enterprise: 별도 문의

환불 정책
- 결제 후 7일 이내 미사용 건 전액 환불
- 8~30일: 50% 환불
- 30일 이후: 환불 불가`}
          className={textareaClass}
        />
      </Field>
    </div>
  );
}
