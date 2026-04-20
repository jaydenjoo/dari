import { describe, expect, it } from "vitest";

import { BOT_STATUS_CLASS, BOT_STATUS_LABEL } from "./status";

describe("BOT_STATUS_LABEL", () => {
  it("BotStatus 3종(active/paused/deleted) 전부 매핑", () => {
    expect(BOT_STATUS_LABEL.active).toBe("운영 중");
    expect(BOT_STATUS_LABEL.paused).toBe("일시정지");
    expect(BOT_STATUS_LABEL.deleted).toBe("삭제됨");
  });
});

describe("BOT_STATUS_CLASS", () => {
  it("BotStatus 3종 전부 클래스 매핑", () => {
    expect(BOT_STATUS_CLASS.active).toContain("bg-blue-50");
    expect(BOT_STATUS_CLASS.paused).toContain("bg-amber-50");
    expect(BOT_STATUS_CLASS.deleted).toContain("bg-gray-100");
  });

  it("모든 클래스에 `ring-<color>-<n>` 유틸 포함 (뱃지 외곽선 일관)", () => {
    for (const cls of Object.values(BOT_STATUS_CLASS)) {
      expect(cls).toMatch(/ring-\S+-\d+/);
    }
  });

  it("모든 클래스에 `text-<color>-<n>` 유틸 포함 (텍스트 톤 일관)", () => {
    for (const cls of Object.values(BOT_STATUS_CLASS)) {
      expect(cls).toMatch(/text-\S+-\d+/);
    }
  });
});
