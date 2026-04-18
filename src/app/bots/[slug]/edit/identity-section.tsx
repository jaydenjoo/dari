"use client";

import { useState } from "react";

import type { Identity } from "@/core/config";

import { Field, inputClass, selectClass } from "./field";

const LANGUAGE_LABEL: Record<Identity["language"], string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
};

export function IdentitySection({
  initial,
  errors,
}: {
  initial: Identity;
  errors: Record<string, string>;
}) {
  const [name, setName] = useState(initial.name);
  const [avatar, setAvatar] = useState(initial.avatar ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState(initial.welcomeMessage);
  const [placeholder, setPlaceholder] = useState(initial.placeholder);
  const [language, setLanguage] = useState(initial.language);

  return (
    <div className="space-y-6">
      <Field
        label="봇 이름"
        htmlFor="identity-name"
        hint="목록과 대시보드에서 보이는 이름이에요 (1~50자)"
        error={errors["identity.name"]}
      >
        <input
          id="identity-name"
          data-testid="identity-name"
          name="identity.name"
          type="text"
          required
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field
        label="아바타 이미지 URL"
        htmlFor="identity-avatar"
        hint="비워두면 기본 아이콘이 사용돼요"
        error={errors["identity.avatar"]}
      >
        <input
          id="identity-avatar"
          data-testid="identity-avatar"
          name="identity.avatar"
          type="url"
          maxLength={500}
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="https://example.com/avatar.png"
          className={inputClass}
        />
      </Field>

      <Field
        label="첫 인사 메시지"
        htmlFor="identity-welcome"
        hint="방문자가 위젯을 열었을 때 처음 보는 문장 (1~500자)"
        error={errors["identity.welcomeMessage"]}
      >
        <input
          id="identity-welcome"
          data-testid="identity-welcome"
          name="identity.welcomeMessage"
          type="text"
          required
          maxLength={500}
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field
        label="입력창 placeholder"
        htmlFor="identity-placeholder"
        hint="입력 칸에 회색으로 보이는 안내 문구 (최대 100자)"
        error={errors["identity.placeholder"]}
      >
        <input
          id="identity-placeholder"
          data-testid="identity-placeholder"
          name="identity.placeholder"
          type="text"
          maxLength={100}
          value={placeholder}
          onChange={(e) => setPlaceholder(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field
        label="대화 언어"
        htmlFor="identity-language"
        hint="UI 라벨 및 기본 응답 언어"
        error={errors["identity.language"]}
      >
        <select
          id="identity-language"
          data-testid="identity-language"
          name="identity.language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Identity["language"])}
          className={selectClass}
        >
          {(Object.keys(LANGUAGE_LABEL) as Identity["language"][]).map((k) => (
            <option key={k} value={k}>
              {LANGUAGE_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
