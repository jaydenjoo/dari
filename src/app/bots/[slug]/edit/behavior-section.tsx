"use client";

import { useState } from "react";

import type { Behavior, BehaviorMode } from "@/core/config";

import { Field, inputClass, selectClass } from "./field";

const MODE_LABEL: Record<BehaviorMode, string> = {
  support: "고객 지원",
  sales: "영업 안내",
  faq: "FAQ 응답",
  coaching: "코칭",
};

type HandoffChannel = Behavior["handoff"]["channel"];

const CHANNEL_LABEL: Record<HandoffChannel, string> = {
  none: "(연결 없음)",
  kakao: "카카오톡",
  email: "이메일",
  slack: "Slack",
};

export function BehaviorSection({
  initial,
  errors,
}: {
  initial: Behavior;
  errors: Record<string, string>;
}) {
  const [mode, setMode] = useState<BehaviorMode>(initial.mode);
  const [fallbackMessage, setFallbackMessage] = useState(
    initial.fallbackMessage,
  );
  const [collectEmail, setCollectEmail] = useState(initial.collectEmail);
  const [collectEmailPrompt, setCollectEmailPrompt] = useState(
    initial.collectEmailPrompt ?? "",
  );

  const [bhEnabled, setBhEnabled] = useState(initial.businessHours.enabled);
  const [bhTimezone, setBhTimezone] = useState(initial.businessHours.timezone);
  const [bhHours, setBhHours] = useState(initial.businessHours.hours);
  const [bhOffMessage, setBhOffMessage] = useState(
    initial.businessHours.offHoursMessage,
  );

  const [hoEnabled, setHoEnabled] = useState(initial.handoff.enabled);
  const [hoTrigger, setHoTrigger] = useState(initial.handoff.trigger);
  const [hoChannel, setHoChannel] = useState<HandoffChannel>(
    initial.handoff.channel,
  );

  return (
    <div className="space-y-6">
      <Field
        label="대화 모드"
        htmlFor="behavior-mode"
        hint="봇의 기본 응대 성격"
        error={errors["behavior.mode"]}
      >
        <select
          id="behavior-mode"
          data-testid="behavior-mode"
          name="behavior.mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as BehaviorMode)}
          className={selectClass}
        >
          {(Object.keys(MODE_LABEL) as BehaviorMode[]).map((k) => (
            <option key={k} value={k}>
              {MODE_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="답변 못할 때 메시지 (fallback)"
        htmlFor="behavior-fallback"
        hint="모르는 질문에 대신 보여줄 안내 (최대 500자)"
        error={errors["behavior.fallbackMessage"]}
      >
        <input
          id="behavior-fallback"
          data-testid="behavior-fallback"
          name="behavior.fallbackMessage"
          type="text"
          maxLength={500}
          value={fallbackMessage}
          onChange={(e) => setFallbackMessage(e.target.value)}
          className={inputClass}
        />
      </Field>

      {/* ─── 이메일 수집 ─── */}
      <fieldset className="rounded-xl border border-gray-200 p-4">
        <legend className="px-2 text-sm font-medium text-gray-700">
          이메일 수집
        </legend>
        <div className="space-y-4">
          <label
            htmlFor="behavior-collect-email"
            className="flex cursor-pointer items-center gap-3"
          >
            <input
              id="behavior-collect-email"
              data-testid="behavior-collect-email"
              name="behavior.collectEmail"
              type="checkbox"
              checked={collectEmail}
              onChange={(e) => setCollectEmail(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-200"
            />
            <span className="text-sm text-gray-700">방문자 이메일 요청</span>
          </label>

          {collectEmail && (
            <Field
              label="이메일 요청 문구"
              htmlFor="behavior-collect-email-prompt"
              hint="대화 중 이메일을 요청할 때 보여줄 문구 (최대 200자)"
              error={errors["behavior.collectEmailPrompt"]}
            >
              <input
                id="behavior-collect-email-prompt"
                data-testid="behavior-collect-email-prompt"
                name="behavior.collectEmailPrompt"
                type="text"
                maxLength={200}
                value={collectEmailPrompt}
                onChange={(e) => setCollectEmailPrompt(e.target.value)}
                placeholder="예: 답변을 메일로도 받아보시겠어요?"
                className={inputClass}
              />
            </Field>
          )}
        </div>
      </fieldset>

      {/* ─── 업무 시간 ─── */}
      <fieldset className="rounded-xl border border-gray-200 p-4">
        <legend className="px-2 text-sm font-medium text-gray-700">
          업무 시간
        </legend>
        <div className="space-y-4">
          <label
            htmlFor="behavior-bh-enabled"
            className="flex cursor-pointer items-center gap-3"
          >
            <input
              id="behavior-bh-enabled"
              data-testid="behavior-bh-enabled"
              name="behavior.businessHours.enabled"
              type="checkbox"
              checked={bhEnabled}
              onChange={(e) => setBhEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-200"
            />
            <span className="text-sm text-gray-700">업무 시간 적용</span>
          </label>

          {bhEnabled && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="시간대"
                  htmlFor="behavior-bh-timezone"
                  error={errors["behavior.businessHours.timezone"]}
                >
                  <input
                    id="behavior-bh-timezone"
                    data-testid="behavior-bh-timezone"
                    name="behavior.businessHours.timezone"
                    type="text"
                    value={bhTimezone}
                    onChange={(e) => setBhTimezone(e.target.value)}
                    placeholder="Asia/Seoul"
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="업무 시간"
                  htmlFor="behavior-bh-hours"
                  hint="형식: HH:MM-HH:MM"
                  error={errors["behavior.businessHours.hours"]}
                >
                  <input
                    id="behavior-bh-hours"
                    data-testid="behavior-bh-hours"
                    name="behavior.businessHours.hours"
                    type="text"
                    value={bhHours}
                    onChange={(e) => setBhHours(e.target.value)}
                    placeholder="09:00-18:00"
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field
                label="업무 시간 외 메시지"
                htmlFor="behavior-bh-off-message"
                error={errors["behavior.businessHours.offHoursMessage"]}
              >
                <input
                  id="behavior-bh-off-message"
                  data-testid="behavior-bh-off-message"
                  name="behavior.businessHours.offHoursMessage"
                  type="text"
                  maxLength={500}
                  value={bhOffMessage}
                  onChange={(e) => setBhOffMessage(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          )}
        </div>
      </fieldset>

      {/* ─── 상담원 연결 ─── */}
      <fieldset className="rounded-xl border border-gray-200 p-4">
        <legend className="px-2 text-sm font-medium text-gray-700">
          상담원 연결 (Handoff)
        </legend>
        <div className="space-y-4">
          <label
            htmlFor="behavior-handoff-enabled"
            className="flex cursor-pointer items-center gap-3"
          >
            <input
              id="behavior-handoff-enabled"
              data-testid="behavior-handoff-enabled"
              name="behavior.handoff.enabled"
              type="checkbox"
              checked={hoEnabled}
              onChange={(e) => setHoEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-200"
            />
            <span className="text-sm text-gray-700">상담원 연결 허용</span>
          </label>

          {hoEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="트리거 문구"
                htmlFor="behavior-handoff-trigger"
                hint="이 문구를 입력하면 상담원 연결"
                error={errors["behavior.handoff.trigger"]}
              >
                <input
                  id="behavior-handoff-trigger"
                  data-testid="behavior-handoff-trigger"
                  name="behavior.handoff.trigger"
                  type="text"
                  value={hoTrigger}
                  onChange={(e) => setHoTrigger(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field
                label="연결 채널"
                htmlFor="behavior-handoff-channel"
                error={errors["behavior.handoff.channel"]}
              >
                <select
                  id="behavior-handoff-channel"
                  data-testid="behavior-handoff-channel"
                  name="behavior.handoff.channel"
                  value={hoChannel}
                  onChange={(e) =>
                    setHoChannel(e.target.value as HandoffChannel)
                  }
                  className={selectClass}
                >
                  {(Object.keys(CHANNEL_LABEL) as HandoffChannel[]).map((k) => (
                    <option key={k} value={k}>
                      {CHANNEL_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}
