import { describe, expect, it } from "vitest";

import {
  computeOrphans,
  type BotInput,
  type StorageFileInput,
} from "./orphan-cleanup";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function makeBot(
  overrides: Partial<BotInput> & Pick<BotInput, "id">,
): BotInput {
  return {
    deletedAt: null,
    referencedStoragePaths: new Set<string>(),
    hasUntrackedFileSource: false,
    ...overrides,
  };
}

function makeFile(
  botId: string,
  fileName: string,
  createdAt: Date,
): StorageFileInput {
  return { botId, fileName, createdAt };
}

const NOW = new Date("2026-04-24T10:00:00Z");

describe("computeOrphans", () => {
  it("빈 storage → orphan 0 / preserved 0", () => {
    const result = computeOrphans({
      bots: [makeBot({ id: "bot-1" })],
      storageFiles: [],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(0);
    expect(result.preserved).toHaveLength(0);
    expect(result.referencedCount).toBe(0);
    expect(result.stats.totalFiles).toBe(0);
  });

  it("참조된 파일 → referenced (orphan/preserved 모두 아님)", () => {
    const path = "bot-1/file-1.pdf";
    const bot = makeBot({
      id: "bot-1",
      referencedStoragePaths: new Set([path]),
    });

    const result = computeOrphans({
      bots: [bot],
      storageFiles: [
        makeFile("bot-1", "file-1.pdf", new Date(NOW.getTime() - 2 * DAY_MS)),
      ],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(0);
    expect(result.preserved).toHaveLength(0);
    expect(result.referencedCount).toBe(1);
    expect(result.stats.referencedCount).toBe(1);
  });

  it("미참조 + TTL 초과 + 활성 봇 → orphan", () => {
    const result = computeOrphans({
      bots: [makeBot({ id: "bot-1" })],
      storageFiles: [
        makeFile("bot-1", "stale.pdf", new Date(NOW.getTime() - 2 * DAY_MS)),
      ],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0].path).toBe("bot-1/stale.pdf");
    expect(result.orphans[0].reason).toBe("unreferenced");
    expect(result.stats.orphanCount).toBe(1);
  });

  it("미참조 + TTL 미달 → recent_ttl preserve (race window 보호)", () => {
    const result = computeOrphans({
      bots: [makeBot({ id: "bot-1" })],
      storageFiles: [
        // 1시간 전 업로드 → 24h TTL 미달
        makeFile("bot-1", "fresh.pdf", new Date(NOW.getTime() - HOUR_MS)),
      ],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(0);
    expect(result.preserved).toHaveLength(1);
    expect(result.preserved[0].reason).toBe("recent_ttl");
    expect(result.stats.preservedRecentCount).toBe(1);
  });

  it("TTL 정확 경계 (24h 정확) → orphan (>= TTL)", () => {
    const result = computeOrphans({
      bots: [makeBot({ id: "bot-1" })],
      storageFiles: [
        makeFile("bot-1", "edge.pdf", new Date(NOW.getTime() - DAY_MS)),
      ],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(1);
    expect(result.preserved).toHaveLength(0);
  });

  it("soft-deleted 봇 30d 이내 → preserve (B-3 정합)", () => {
    const result = computeOrphans({
      bots: [
        makeBot({
          id: "bot-1",
          deletedAt: new Date(NOW.getTime() - 10 * DAY_MS),
        }),
      ],
      storageFiles: [
        makeFile(
          "bot-1",
          "in-trash.pdf",
          new Date(NOW.getTime() - 60 * DAY_MS),
        ),
      ],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(0);
    expect(result.preserved).toHaveLength(1);
    expect(result.preserved[0].reason).toBe(
      "soft_deleted_bot_within_retention",
    );
    expect(result.stats.preservedDeletedBotCount).toBe(1);
  });

  it("soft-deleted 봇 30d 경과 → orphan (보존 해제)", () => {
    const result = computeOrphans({
      bots: [
        makeBot({
          id: "bot-1",
          deletedAt: new Date(NOW.getTime() - 31 * DAY_MS),
        }),
      ],
      storageFiles: [
        makeFile("bot-1", "expired.pdf", new Date(NOW.getTime() - 60 * DAY_MS)),
      ],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(1);
    expect(result.preserved).toHaveLength(0);
  });

  it("legacy 봇 (hasUntrackedFileSource) → preserve (보수적)", () => {
    const result = computeOrphans({
      bots: [
        makeBot({
          id: "bot-1",
          hasUntrackedFileSource: true,
        }),
      ],
      storageFiles: [
        makeFile("bot-1", "legacy.pdf", new Date(NOW.getTime() - 100 * DAY_MS)),
      ],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(0);
    expect(result.preserved).toHaveLength(1);
    expect(result.preserved[0].reason).toBe("untracked_bot");
    expect(result.stats.preservedUntrackedBotCount).toBe(1);
  });

  it("봇 없음 (storage 폴더만 존재) → bot_not_found preserve", () => {
    const result = computeOrphans({
      bots: [],
      storageFiles: [
        makeFile(
          "ghost-bot",
          "orphan.pdf",
          new Date(NOW.getTime() - 10 * DAY_MS),
        ),
      ],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(0);
    expect(result.preserved).toHaveLength(1);
    expect(result.preserved[0].reason).toBe("bot_not_found");
    expect(result.stats.preservedBotNotFoundCount).toBe(1);
  });

  it("다중 봇 + 다중 파일 혼합 — 정확한 분류", () => {
    const referencedPath = "bot-active/ref.pdf";
    const bots: BotInput[] = [
      makeBot({
        id: "bot-active",
        referencedStoragePaths: new Set([referencedPath]),
      }),
      makeBot({
        id: "bot-trash",
        deletedAt: new Date(NOW.getTime() - 5 * DAY_MS),
      }),
      makeBot({
        id: "bot-legacy",
        hasUntrackedFileSource: true,
      }),
    ];

    const storageFiles: StorageFileInput[] = [
      // bot-active: 1 referenced + 1 orphan + 1 recent
      makeFile("bot-active", "ref.pdf", new Date(NOW.getTime() - 10 * DAY_MS)),
      makeFile(
        "bot-active",
        "orphan.pdf",
        new Date(NOW.getTime() - 5 * DAY_MS),
      ),
      makeFile(
        "bot-active",
        "fresh.pdf",
        new Date(NOW.getTime() - 3 * HOUR_MS),
      ),
      // bot-trash: 1 in retention
      makeFile(
        "bot-trash",
        "trashed.pdf",
        new Date(NOW.getTime() - 50 * DAY_MS),
      ),
      // bot-legacy: 1 untracked
      makeFile("bot-legacy", "old.pdf", new Date(NOW.getTime() - 200 * DAY_MS)),
      // ghost: 1 bot_not_found
      makeFile("ghost", "ghost.pdf", new Date(NOW.getTime() - 10 * DAY_MS)),
    ];

    const result = computeOrphans({ bots, storageFiles, now: NOW });

    expect(result.stats.totalFiles).toBe(6);
    expect(result.stats.referencedCount).toBe(1);
    expect(result.stats.orphanCount).toBe(1);
    expect(result.stats.preservedRecentCount).toBe(1);
    expect(result.stats.preservedDeletedBotCount).toBe(1);
    expect(result.stats.preservedUntrackedBotCount).toBe(1);
    expect(result.stats.preservedBotNotFoundCount).toBe(1);
    expect(result.orphans[0].path).toBe("bot-active/orphan.pdf");
  });

  it("soft-deleted 30d 경과 + legacy 봇 — untracked 보존이 우선 (분류 순서)", () => {
    // code M-2 (β-3b 리뷰): 분류 순서 = soft_deleted_within_retention →
    // untracked_bot → referenced/orphan. 30d 초과 + legacy 조합은 untracked 로
    // 분류 (보수적 보존). 영구 보존되므로 운영자가 별도로 인지해야 함.
    const result = computeOrphans({
      bots: [
        makeBot({
          id: "bot-1",
          deletedAt: new Date(NOW.getTime() - 60 * DAY_MS),
          hasUntrackedFileSource: true,
        }),
      ],
      storageFiles: [
        makeFile("bot-1", "legacy.pdf", new Date(NOW.getTime() - 90 * DAY_MS)),
      ],
      now: NOW,
    });

    expect(result.orphans).toHaveLength(0);
    expect(result.preserved).toHaveLength(1);
    // soft_deleted retention 초과 → 다음 분기 검사 → untracked 로 보존.
    expect(result.preserved[0].reason).toBe("untracked_bot");
  });

  it("custom ttlMs 적용 — 1h TTL 로 단축", () => {
    const result = computeOrphans({
      bots: [makeBot({ id: "bot-1" })],
      storageFiles: [
        // 2시간 전 업로드, 24h TTL 이면 preserve / 1h TTL 이면 orphan
        makeFile("bot-1", "x.pdf", new Date(NOW.getTime() - 2 * HOUR_MS)),
      ],
      ttlMs: HOUR_MS,
      now: NOW,
    });

    expect(result.orphans).toHaveLength(1);
  });

  it("custom retentionMs 적용 — 7d 로 단축", () => {
    const result = computeOrphans({
      bots: [
        makeBot({
          id: "bot-1",
          deletedAt: new Date(NOW.getTime() - 10 * DAY_MS),
        }),
      ],
      storageFiles: [
        makeFile("bot-1", "x.pdf", new Date(NOW.getTime() - 60 * DAY_MS)),
      ],
      retentionMs: 7 * DAY_MS,
      now: NOW,
    });

    // 10d 경과 > 7d retention → 보존 해제 → orphan
    expect(result.orphans).toHaveLength(1);
  });
});
