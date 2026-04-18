"use client";

import { useState } from "react";

import type { Analytics } from "@/core/config";

import { Field, inputClass } from "./field";

export function AnalyticsSection({
  initial,
  errors,
}: {
  initial: Analytics;
  errors: Record<string, string>;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [webhookUrl, setWebhookUrl] = useState(initial.webhookUrl ?? "");

  return (
    <div className="space-y-6">
      <Field
        label="대화 분석 수집"
        htmlFor="analytics-enabled"
        hint="대화 횟수·세션 시간 등 익명 통계를 수집합니다"
        error={errors["analytics.enabled"]}
      >
        <label
          htmlFor="analytics-enabled"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 transition hover:border-blue-200 hover:bg-white"
        >
          <input
            id="analytics-enabled"
            data-testid="analytics-enabled"
            name="analytics.enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-200"
          />
          <span className="text-sm text-gray-700">분석 데이터 수집 활성화</span>
        </label>
      </Field>

      <Field
        label="Webhook URL"
        htmlFor="analytics-webhook-url"
        hint="대화가 끝날 때 외부 서버로 알림을 보낼 URL (선택)"
        error={errors["analytics.webhookUrl"]}
      >
        <input
          id="analytics-webhook-url"
          data-testid="analytics-webhook-url"
          name="analytics.webhookUrl"
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className={inputClass}
        />
      </Field>
    </div>
  );
}
