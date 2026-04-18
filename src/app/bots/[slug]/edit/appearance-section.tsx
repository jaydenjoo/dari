"use client";

import { useState } from "react";

import type { Appearance } from "@/core/config";

import { Field, inputClass, selectClass } from "./field";

const THEME_LABEL: Record<Appearance["theme"], string> = {
  light: "라이트",
  dark: "다크",
  auto: "시스템 설정 따름",
};

const POSITION_LABEL: Record<Appearance["position"], string> = {
  "bottom-right": "오른쪽 아래",
  "bottom-left": "왼쪽 아래",
  "top-right": "오른쪽 위",
  "top-left": "왼쪽 위",
};

export function AppearanceSection({
  initial,
  errors,
}: {
  initial: Appearance;
  errors: Record<string, string>;
}) {
  const [theme, setTheme] = useState<Appearance["theme"]>(initial.theme);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [position, setPosition] = useState<Appearance["position"]>(
    initial.position,
  );
  const [buttonSize, setButtonSize] = useState(String(initial.buttonSize));
  const [borderRadius, setBorderRadius] = useState(
    String(initial.borderRadius),
  );
  const [fontFamily, setFontFamily] = useState(initial.fontFamily);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="테마"
          htmlFor="appearance-theme"
          error={errors["appearance.theme"]}
        >
          <select
            id="appearance-theme"
            data-testid="appearance-theme"
            name="appearance.theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Appearance["theme"])}
            className={selectClass}
          >
            {(Object.keys(THEME_LABEL) as Appearance["theme"][]).map((k) => (
              <option key={k} value={k}>
                {THEME_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="위젯 위치"
          htmlFor="appearance-position"
          error={errors["appearance.position"]}
        >
          <select
            id="appearance-position"
            data-testid="appearance-position"
            name="appearance.position"
            value={position}
            onChange={(e) =>
              setPosition(e.target.value as Appearance["position"])
            }
            className={selectClass}
          >
            {(Object.keys(POSITION_LABEL) as Appearance["position"][]).map(
              (k) => (
                <option key={k} value={k}>
                  {POSITION_LABEL[k]}
                </option>
              ),
            )}
          </select>
        </Field>
      </div>

      <Field
        label="포인트 색상"
        htmlFor="appearance-primary-color"
        hint="Hex 코드 (예: #2b7cff)"
        error={errors["appearance.primaryColor"]}
      >
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="색상 선택기"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="h-12 w-16 cursor-pointer rounded-lg border border-gray-200 bg-white"
          />
          <input
            id="appearance-primary-color"
            data-testid="appearance-primary-color"
            name="appearance.primaryColor"
            type="text"
            required
            pattern="^#[0-9a-fA-F]{6}$"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            placeholder="#2b7cff"
            className={`${inputClass} font-mono`}
          />
        </div>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="버튼 크기 (px)"
          htmlFor="appearance-button-size"
          hint="40~80, 기본 56"
          error={errors["appearance.buttonSize"]}
        >
          <input
            id="appearance-button-size"
            data-testid="appearance-button-size"
            name="appearance.buttonSize"
            type="number"
            min={40}
            max={80}
            step={1}
            required
            value={buttonSize}
            onChange={(e) => setButtonSize(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          label="모서리 둥근 정도 (px)"
          htmlFor="appearance-border-radius"
          hint="0~32, 기본 16"
          error={errors["appearance.borderRadius"]}
        >
          <input
            id="appearance-border-radius"
            data-testid="appearance-border-radius"
            name="appearance.borderRadius"
            type="number"
            min={0}
            max={32}
            step={1}
            required
            value={borderRadius}
            onChange={(e) => setBorderRadius(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="폰트 패밀리"
        htmlFor="appearance-font-family"
        hint="시스템에 설치된 글꼴 또는 웹폰트 이름"
        error={errors["appearance.fontFamily"]}
      >
        <input
          id="appearance-font-family"
          data-testid="appearance-font-family"
          name="appearance.fontFamily"
          type="text"
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          placeholder="Pretendard"
          className={inputClass}
        />
      </Field>
    </div>
  );
}
