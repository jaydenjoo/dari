"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { createBot, type CreateBotFormState } from "./actions";
import { slugify } from "./slug-util";

const initialState: CreateBotFormState = {};

const DEFAULT_WELCOME = "안녕하세요! 무엇을 도와드릴까요?";
const SYSTEM_PROMPT_PLACEHOLDER =
  "예: 당신은 '다리(Dari)' 고객지원 챗봇입니다. 친절하고 간결하게 답변하며, 모르는 내용은 담당자 연결을 안내하세요. 서비스 범위는 ...";

export default function CreateBotForm() {
  const [state, formAction] = useActionState(createBot, initialState);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  // welcomeMessage / systemPrompt 도 controlled 로 관리 — 서버 에러 후 폼이
  // 리렌더링될 때 사용자 입력이 초기화되지 않도록 (code-reviewer MEDIUM 반영).
  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_WELCOME);
  const [systemPrompt, setSystemPrompt] = useState("");

  // React 19 권장: 파생 상태는 이벤트 핸들러에서 동기화 (useEffect 금지).
  function handleNameChange(next: string): void {
    setName(next);
    if (!slugEdited) {
      setSlug(slugify(next));
    }
  }

  function handleSlugChange(next: string): void {
    setSlug(next);
    setSlugEdited(true);
  }

  const slugAutoHint =
    !slugEdited && name.trim().length > 0 && slug.length > 0
      ? "이름에서 자동으로 만들었어요. 직접 바꿀 수도 있어요."
      : null;

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_4px_12px_rgba(0,0,0,0.03),0_20px_48px_rgba(0,0,0,0.08)]"
    >
      {state.error && (
        <div
          role="alert"
          data-testid="create-bot-error"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700"
        >
          {state.error}
        </div>
      )}

      <Field
        label="봇 이름"
        htmlFor="bot-name"
        hint="목록과 대시보드에서 보이는 이름이에요 (1~50자)"
        error={state.fieldErrors?.name}
      >
        <input
          id="bot-name"
          data-testid="bot-name"
          name="name"
          type="text"
          required
          maxLength={50}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="예: 내 가게 상담 봇"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] text-gray-900 placeholder-gray-400 transition outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </Field>

      <Field
        label="주소 (slug)"
        htmlFor="bot-slug"
        hint={slugAutoHint ?? "소문자·숫자·하이픈만, 3~64자"}
        error={state.fieldErrors?.slug}
      >
        <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition focus-within:border-blue-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
          <span className="border-r border-gray-200 bg-gray-100/70 px-3 py-3 font-mono text-sm text-gray-500 select-none">
            /bots/
          </span>
          <input
            id="bot-slug"
            data-testid="bot-slug"
            name="slug"
            type="text"
            required
            minLength={3}
            maxLength={64}
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="my-shop-bot"
            className="flex-1 bg-transparent px-3 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
        </div>
      </Field>

      <Field
        label="첫 인사 메시지"
        htmlFor="bot-welcome"
        hint="방문자가 위젯을 열었을 때 처음 보는 문장이에요 (1~500자)"
        error={state.fieldErrors?.welcomeMessage}
      >
        <input
          id="bot-welcome"
          data-testid="bot-welcome"
          name="welcomeMessage"
          type="text"
          required
          maxLength={500}
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] text-gray-900 placeholder-gray-400 transition outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </Field>

      <Field
        label="AI 지시사항 (system prompt)"
        htmlFor="bot-system-prompt"
        hint="봇의 역할·말투·범위를 구체적으로 적어 주세요 (10~8000자)"
        error={state.fieldErrors?.systemPrompt}
      >
        <textarea
          id="bot-system-prompt"
          data-testid="bot-system-prompt"
          name="systemPrompt"
          required
          minLength={10}
          maxLength={8000}
          rows={8}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={SYSTEM_PROMPT_PLACEHOLDER}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm leading-relaxed text-gray-900 placeholder-gray-400 transition outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </Field>

      <SubmitButton />

      <p className="text-center text-xs leading-relaxed text-gray-400">
        지식 베이스·외관·행동 모드 등 상세 설정은 생성 후에 편집할 수 있어요.
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string | null;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p
          data-testid={`${htmlFor}-error`}
          role="alert"
          className="text-xs text-red-600"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid="create-bot-submit"
      disabled={pending}
      className="group flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[15px] font-semibold text-white shadow-[0_2px_8px_rgba(43,124,255,0.15),0_8px_24px_rgba(43,124,255,0.18)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(43,124,255,0.2),0_12px_32px_rgba(43,124,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-blue-600"
    >
      <span>{pending ? "만드는 중..." : "봇 만들기"}</span>
      {!pending && (
        <span className="text-blue-200 transition-colors group-hover:text-white">
          →
        </span>
      )}
    </button>
  );
}
