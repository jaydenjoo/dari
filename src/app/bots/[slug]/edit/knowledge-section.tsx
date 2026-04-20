"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { Knowledge } from "@/core/config";

import { addUrlSourceAction, type AddUrlFormState } from "./actions";
import { Field, inputClass, textareaClass } from "./field";

// textSourceSchema.content = z.string().min(10).max(100_000)
// UI 는 빈 문자열(삭제 의도) 도 허용 → min 검증은 action 에서 조건부.
const MAX_TEXT_LENGTH = 100_000;
const MIN_TEXT_LENGTH = 10;

// Task 1-7-b: URL 길이 상한 (url-fetch.ts::MAX_URL_LENGTH 와 일치).
const MAX_URL_LENGTH = 500;

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

/**
 * Task 1-7-b: URL 지식 소스 편집 (단일 URL 추가).
 *
 * 왜 별도 컴포넌트 + 별도 form 인가:
 *   - 편집 폼(updateBot)은 "변경사항 저장" 버튼을 눌러야 적용되는 일괄 제출 모델.
 *   - URL 크롤링은 수 초~수십 초 걸리며 즉시 적용되는 비동기 작업 → 별도 action.
 *   - HTML `<form>` 중첩 금지이므로 EditBotForm 의 메인 `<form>` **밖**에 SectionCard 로 배치.
 *
 * 설계:
 *   - MVP: 한 번에 URL 1개 추가. 같은 URL 재추가 시 idempotent replace (actions.ts).
 *   - 기존 URL 목록은 읽기 전용 표시 (삭제 UI 는 Task 1-7-d).
 *   - 성공/실패/진행 상태 뱃지로 즉시 피드백.
 */
export function KnowledgeUrlSection({
  slug,
  initial,
}: {
  slug: string;
  initial: Knowledge;
}) {
  const boundAction = addUrlSourceAction.bind(null, slug);
  const [state, formAction] = useActionState<AddUrlFormState, FormData>(
    boundAction,
    {},
  );

  // 기존 URL 소스 목록 (초기 값 + 성공 응답에서 동적 누적은 revalidatePath 후 새로고침 경로).
  const existingUrls = initial.sources
    .filter(
      (s): s is Extract<Knowledge["sources"][number], { type: "url" }> =>
        s.type === "url",
    )
    .flatMap((s) => s.urls);

  return (
    <div className="space-y-5">
      <div
        data-testid="knowledge-url-meta"
        className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3"
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600"
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
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-emerald-900">
            웹페이지 주소를 입력하면 본문을 자동 추출해요
          </p>
          <p className="text-xs leading-relaxed text-emerald-800/80">
            Firecrawl 이 JS 렌더링·안티봇 회피까지 처리해 markdown 으로 변환 →
            Gemini 임베딩으로 색인. 한 페이지 기준 5~30초 소요. (여러 URL 일괄
            추가는 Phase 2)
          </p>
        </div>
      </div>

      {state.success && (
        <div
          role="status"
          data-testid="knowledge-url-success"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-800"
        >
          <p className="font-medium">URL 지식이 추가됐어요.</p>
          <p className="mt-1 text-emerald-700/80">
            {state.success.url} — 청크 {state.success.chunkCount}개
            {state.success.truncated && " (200KB 초과 분량은 절단됨)"}
          </p>
        </div>
      )}

      {state.error && (
        <div
          role="alert"
          data-testid="knowledge-url-error"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700"
        >
          {state.error}
        </div>
      )}

      {/*
        code review M-1 (2026-04-20): 성공 직후 form 을 remount 하여 input 을 초기화.
        defaultValue="" uncontrolled input 은 브라우저가 이전 값을 유지하므로 사용자가
        연쇄 입력 시 오탈자 반복 유발. state.success.url 이 키로 쓰이면 값이 바뀔 때
        form 이 재생성되어 비워진다.
      */}
      <form
        key={state.success?.url ?? "knowledge-url-form"}
        action={formAction}
        className="space-y-3"
      >
        <Field
          label="URL 추가"
          htmlFor="knowledge-url-input"
          hint="http / https 주소 (최대 500자). 추가 시 본문이 크롤링되어 색인됩니다."
          error={state.fieldErrors?.["knowledge.url"]}
        >
          <div className="flex gap-2">
            <input
              id="knowledge-url-input"
              data-testid="knowledge-url-input"
              name="knowledge.url"
              type="url"
              required
              maxLength={MAX_URL_LENGTH}
              placeholder="https://example.com/docs/pricing"
              className={inputClass}
              defaultValue=""
            />
            <UrlSubmitButton />
          </div>
        </Field>
      </form>

      {existingUrls.length > 0 && (
        <div
          data-testid="knowledge-url-list"
          className="rounded-xl border border-gray-200/80 bg-gray-50/60 px-4 py-3"
        >
          <p className="mb-2 text-xs font-medium text-gray-600">
            이미 추가된 URL ({existingUrls.length}개)
          </p>
          <ul className="space-y-1 text-xs text-gray-700">
            {existingUrls.map((url) => (
              <li
                key={url}
                className="truncate rounded bg-white px-2 py-1 font-mono"
                title={url}
              >
                {url}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-gray-400">
            삭제·재크롤링 UI 는 Phase 2 에서 제공됩니다. 같은 URL 을 다시
            추가하면 기존 청크가 교체돼요.
          </p>
        </div>
      )}
    </div>
  );
}

function UrlSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="knowledge-url-submit"
      disabled={pending}
      className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(16,128,96,0.18)] transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_8px_20px_rgba(16,128,96,0.22)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-emerald-600"
    >
      {pending ? "크롤링 중..." : "추가"}
    </button>
  );
}
