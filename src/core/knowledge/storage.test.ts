import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY ??= "sk-fake-anthropic-test-placeholder";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= "fake-google-genai-test-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fake-supabase-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    "fake-supabase-anon-test-placeholder";
});

import {
  buildKnowledgeFilePath,
  contentTypeForExtension,
  KNOWLEDGE_FILES_BUCKET,
  removeKnowledgeFile,
  uploadKnowledgeFile,
} from "./storage";

type UploadArgs = { path: string; data: Buffer; contentType: string };

function makeStorageMock(spec: {
  uploadResult?: { error: { message: string } | null };
  removeResult?: { error: { message: string } | null };
}) {
  const uploadCalls: Array<{
    bucket: string;
    path: string;
    data: Buffer;
    options: Record<string, unknown>;
  }> = [];
  const removeCalls: Array<{ bucket: string; paths: string[] }> = [];

  const upload = vi.fn(
    (path: string, data: Buffer, options: Record<string, unknown>) => {
      uploadCalls.push({ bucket: "", path, data, options });
      return Promise.resolve(spec.uploadResult ?? { error: null });
    },
  );
  const remove = vi.fn((paths: string[]) => {
    removeCalls.push({ bucket: "", paths });
    return Promise.resolve(spec.removeResult ?? { error: null });
  });

  const from = vi.fn((bucket: string) => {
    return {
      upload: (p: string, d: Buffer, o: Record<string, unknown>) => {
        uploadCalls.push({ bucket, path: p, data: d, options: o });
        return Promise.resolve(spec.uploadResult ?? { error: null });
      },
      remove: (paths: string[]) => {
        removeCalls.push({ bucket, paths });
        return Promise.resolve(spec.removeResult ?? { error: null });
      },
    };
  });

  const client = {
    storage: { from },
  } as unknown as Parameters<typeof uploadKnowledgeFile>[0];

  return { client, uploadCalls, removeCalls, upload, remove };
}

describe("buildKnowledgeFilePath", () => {
  it("{bot_id}/{uuid}.{ext} 포맷 — RLS 정책의 foldername[1] 매칭 보장", () => {
    expect(buildKnowledgeFilePath("bot-123", "uuid-abc", "pdf")).toBe(
      "bot-123/uuid-abc.pdf",
    );
  });
});

describe("contentTypeForExtension", () => {
  it("PDF → application/pdf", () => {
    expect(contentTypeForExtension("pdf")).toBe("application/pdf");
  });
  it("TXT → text/plain", () => {
    expect(contentTypeForExtension("txt")).toBe("text/plain");
  });
  it("MD → text/markdown", () => {
    expect(contentTypeForExtension("md")).toBe("text/markdown");
  });
  it("미지원 ext → throw '파일 업로드 실패'", () => {
    expect(() => contentTypeForExtension("exe")).toThrow(/^파일 업로드 실패$/);
  });
});

describe("uploadKnowledgeFile", () => {
  it("정상 업로드 — knowledge-files 버킷 + 옵션(upsert/cacheControl no-store/contentType)", async () => {
    const { client, uploadCalls } = makeStorageMock({});
    const args: UploadArgs = {
      path: "bot-1/uuid-1.pdf",
      data: Buffer.from("%PDF-1.5"),
      contentType: "application/pdf",
    };

    const out = await uploadKnowledgeFile(client, args);

    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].bucket).toBe(KNOWLEDGE_FILES_BUCKET);
    expect(uploadCalls[0].path).toBe("bot-1/uuid-1.pdf");
    // sec INFO-2: cacheControl 은 "no-store" — private 버킷이 public 전환 리스크 방어.
    expect(uploadCalls[0].options).toMatchObject({
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "no-store",
    });
    expect(out).toEqual({
      path: "bot-1/uuid-1.pdf",
      storagePath: "bot-1/uuid-1.pdf",
      contentType: "application/pdf",
    });
  });

  it("Storage 에러 → throw '파일 업로드 실패' (Supabase 내부 메시지 비노출)", async () => {
    const { client } = makeStorageMock({
      uploadResult: {
        error: { message: "bucket size_limit exceeded (detail leaked)" },
      },
    });

    await expect(
      uploadKnowledgeFile(client, {
        path: "bot-1/uuid-1.pdf",
        data: Buffer.from("x"),
        contentType: "application/pdf",
      }),
    ).rejects.toThrow(/^파일 업로드 실패$/);

    // 원본 Supabase 메시지가 throw 에 포함되지 않음
    const { client: c2 } = makeStorageMock({
      uploadResult: {
        error: { message: "bucket size_limit exceeded (detail leaked)" },
      },
    });
    await expect(
      uploadKnowledgeFile(c2, {
        path: "bot-1/uuid-1.pdf",
        data: Buffer.from("x"),
        contentType: "application/pdf",
      }),
    ).rejects.not.toThrow(/size_limit|detail leaked/);
  });
});

describe("removeKnowledgeFile", () => {
  it("정상 삭제 → removed=true", async () => {
    const { client, removeCalls } = makeStorageMock({});
    const out = await removeKnowledgeFile(client, "bot-1/uuid-1.pdf");
    expect(out).toEqual({ removed: true });
    expect(removeCalls[0].paths).toEqual(["bot-1/uuid-1.pdf"]);
  });

  it("에러 시 throw 없이 removed=false (best-effort 롤백)", async () => {
    const { client } = makeStorageMock({
      removeResult: { error: { message: "not found" } },
    });
    const out = await removeKnowledgeFile(client, "bot-1/uuid-1.pdf");
    expect(out).toEqual({ removed: false });
  });
});
