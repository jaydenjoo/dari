"use client";

import { useState } from "react";

import type { AIConfig, AIModel } from "@/core/config";

import { Field, inputClass, selectClass, textareaClass } from "./field";

const MODEL_LABEL: Record<AIModel, string> = {
  "claude-sonnet-4-6": "Claude Sonnet 4.6 — 균형 (권장)",
  "claude-opus-4-7": "Claude Opus 4.7 — 최고 품질",
  "claude-haiku-4-5": "Claude Haiku 4.5 — 빠름·저비용",
};

export function AiSection({
  initial,
  errors,
}: {
  initial: AIConfig;
  errors: Record<string, string>;
}) {
  const [model, setModel] = useState<AIModel>(initial.model);
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt);
  const [temperature, setTemperature] = useState(String(initial.temperature));
  const [maxTokens, setMaxTokens] = useState(String(initial.maxTokens));
  const [ragEnabled, setRagEnabled] = useState(initial.ragEnabled);

  return (
    <div className="space-y-6">
      <Field
        label="AI 모델"
        htmlFor="ai-model"
        hint="기본 Sonnet 권장. Opus 는 더 똑똑하지만 느리고 비싸요."
        error={errors["ai.model"]}
      >
        <select
          id="ai-model"
          data-testid="ai-model"
          name="ai.model"
          value={model}
          onChange={(e) => setModel(e.target.value as AIModel)}
          className={selectClass}
        >
          {(Object.keys(MODEL_LABEL) as AIModel[]).map((k) => (
            <option key={k} value={k}>
              {MODEL_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="AI 지시사항 (system prompt)"
        htmlFor="ai-system-prompt"
        hint="봇의 역할·말투·범위를 구체적으로 적어 주세요 (10~8000자)"
        error={errors["ai.systemPrompt"]}
      >
        <textarea
          id="ai-system-prompt"
          data-testid="ai-system-prompt"
          name="ai.systemPrompt"
          required
          minLength={10}
          maxLength={8000}
          rows={8}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className={textareaClass}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="응답 다양성 (temperature)"
          htmlFor="ai-temperature"
          hint="0 = 일관성 있는 답, 2 = 자유로운 답 (기본 0.7)"
          error={errors["ai.temperature"]}
        >
          <input
            id="ai-temperature"
            data-testid="ai-temperature"
            name="ai.temperature"
            type="number"
            min={0}
            max={2}
            step={0.1}
            required
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          label="최대 응답 길이 (tokens)"
          htmlFor="ai-max-tokens"
          hint="64~8192 (기본 1024). 1 토큰 ≈ 한국어 1~2자"
          error={errors["ai.maxTokens"]}
        >
          <input
            id="ai-max-tokens"
            data-testid="ai-max-tokens"
            name="ai.maxTokens"
            type="number"
            min={64}
            max={8192}
            step={1}
            required
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="지식 베이스 검색 (RAG)"
        htmlFor="ai-rag-enabled"
        hint="활성화 시 답변 전에 등록된 지식에서 관련 내용을 찾아 활용합니다"
        error={errors["ai.ragEnabled"]}
      >
        <label
          htmlFor="ai-rag-enabled"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 transition hover:border-blue-200 hover:bg-white"
        >
          <input
            id="ai-rag-enabled"
            data-testid="ai-rag-enabled"
            name="ai.ragEnabled"
            type="checkbox"
            checked={ragEnabled}
            onChange={(e) => setRagEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-200"
          />
          <span className="text-sm text-gray-700">RAG 검색 활성화</span>
        </label>
      </Field>
    </div>
  );
}
