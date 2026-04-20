import { describe, expect, it } from "vitest";

import { CONVERSATION_STATUS_CLASS, CONVERSATION_STATUS_LABEL } from "./status";

describe("CONVERSATION_STATUS_LABEL", () => {
  it("ConversationStatus 3종(active/closed/handed_off) 전부 매핑", () => {
    expect(CONVERSATION_STATUS_LABEL.active).toBe("진행 중");
    expect(CONVERSATION_STATUS_LABEL.closed).toBe("종료");
    expect(CONVERSATION_STATUS_LABEL.handed_off).toBe("담당자 이관");
  });
});

describe("CONVERSATION_STATUS_CLASS", () => {
  it("ConversationStatus 3종 전부 클래스 매핑", () => {
    expect(CONVERSATION_STATUS_CLASS.active).toContain("bg-emerald-50");
    expect(CONVERSATION_STATUS_CLASS.closed).toContain("bg-gray-50");
    expect(CONVERSATION_STATUS_CLASS.handed_off).toContain("bg-amber-50");
  });

  it("모든 클래스에 `ring-<color>-<n>` 유틸 포함 (외곽선 일관)", () => {
    for (const cls of Object.values(CONVERSATION_STATUS_CLASS)) {
      expect(cls).toMatch(/ring-\S+-\d+/);
    }
  });

  it("모든 클래스에 `text-<color>-<n>` 유틸 포함 (텍스트 톤 일관)", () => {
    for (const cls of Object.values(CONVERSATION_STATUS_CLASS)) {
      expect(cls).toMatch(/text-\S+-\d+/);
    }
  });
});
