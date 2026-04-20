"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { Knowledge, KnowledgeSource } from "@/core/config";
import { chunkKey } from "@/core/knowledge/source-key";

import { removeSourceAction, type RemoveSourceFormState } from "./actions";
import { ConfirmSubmitButton } from "./confirm-button";

/**
 * Task 1-7-d: 등록된 지식 소스 통합 리스트 + 개별 삭제 UI.
 *
 * 설계:
 *   - 메인 updateBot 폼 **밖** SectionCard 안에 배치 (EditBotForm 에서 조립).
 *   - 각 row 가 자체 `<form action={removeSourceAction}>` + `useActionState` 보유 —
 *     하나의 행 삭제가 다른 행 상태에 영향 주지 않는다.
 *   - `<ConfirmSubmitButton>` 으로 native `confirm()` 가드 (실수 삭제 방어).
 *   - revalidatePath 가 page 를 재렌더 → 성공 시 해당 row 자동 unmount.
 *
 * chunkCounts:
 *   - Record<`${source_type}:${source_identifier}`, number> 형식 (RSC→Client 직렬화).
 *   - page.tsx 에서 knowledge_chunks 단일 쿼리 후 groupBy (RLS 자동 격리).
 *   - 표시 실패(0) 는 UX 미세 이슈 — 실제 삭제는 identifier 기반이므로 안전.
 *
 * MVP 전제 (1-7-b/c 와 동일):
 *   - 한 source 는 1-원소 배열 (urls:[u] / files:[f]). Phase 2 다중 UI 시
 *     row 당 identifier 별도 입력 패턴 유지 → 이미 flatMap 으로 풀어내므로 호환.
 */

type SourceMeta = {
  sourceType: "text" | "url" | "file";
  identifier: string;
  displayName: string;
  subtitle?: string;
  badge: { label: string; bg: string; fg: string };
  iconPath: string;
  chunkCount: number;
};

function metaFromSource(
  source: KnowledgeSource,
  counts: Readonly<Record<string, number>>,
): SourceMeta[] {
  // chunkKey 는 remove-source.ts 와 동일한 (source_type, source_identifier) 매핑을
  // 사용해 키를 생성 — 표시 값과 실제 삭제 대상이 단일 출처로 일치 (code M-1).
  if (source.type === "text") {
    return [
      {
        sourceType: "text",
        identifier: "",
        displayName: "텍스트 지식 (인라인)",
        subtitle: `${source.content.length.toLocaleString()}자`,
        badge: { label: "TEXT", bg: "bg-blue-50", fg: "text-blue-700" },
        iconPath: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
        chunkCount: counts[chunkKey("text", "")] ?? 0,
      },
    ];
  }
  if (source.type === "url") {
    return source.urls.map((u) => ({
      sourceType: "url" as const,
      identifier: u,
      displayName: u,
      badge: { label: "URL", bg: "bg-emerald-50", fg: "text-emerald-700" },
      iconPath:
        "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
      chunkCount: counts[chunkKey("url", u)] ?? 0,
    }));
  }
  // file
  return source.files.map((f) => {
    const ext = f.split(".").pop()?.toLowerCase() ?? "";
    return {
      sourceType: "file" as const,
      identifier: f,
      displayName: f,
      subtitle: ext.toUpperCase(),
      badge: { label: "FILE", bg: "bg-violet-50", fg: "text-violet-700" },
      iconPath:
        "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7zM13 3.5 18.5 9H14a1 1 0 0 1-1-1V3.5z",
      chunkCount: counts[chunkKey("file", f)] ?? 0,
    };
  });
}

export function SourcesList({
  slug,
  knowledge,
  chunkCounts,
}: {
  slug: string;
  knowledge: Knowledge;
  chunkCounts: Readonly<Record<string, number>>;
}) {
  const items = knowledge.sources.flatMap((s) =>
    metaFromSource(s, chunkCounts),
  );

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <ul data-testid="knowledge-sources-list" className="space-y-3">
      {/*
        key 에 idx 를 포함한 이유 (code review M-2):
          - text 소스는 스키마상 단일 슬롯이라 identifier="" 가 최대 1개 → 충돌 없음.
          - url/file 은 identifier(URL/파일명) 가 소스 간 유일 → 충돌 없음.
          - 그러나 legacy 데이터(중복 filename) 가 있을 수 있어 `:idx` 로 최종 유일성 보장.
          - revalidatePath 후 서버 재렌더 모델이라 낙관적 state 이동 없음 — key 안정성 OK.
      */}
      {items.map((item, idx) => (
        <SourceRow
          key={`${item.sourceType}:${item.identifier}:${idx}`}
          slug={slug}
          meta={item}
        />
      ))}
    </ul>
  );
}

function SourceRow({ slug, meta }: { slug: string; meta: SourceMeta }) {
  const bound = removeSourceAction.bind(null, slug);
  const [state, formAction] = useActionState<RemoveSourceFormState, FormData>(
    bound,
    {},
  );

  return (
    <li
      data-testid={`knowledge-source-row-${meta.sourceType}`}
      className="group rounded-xl border border-gray-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.badge.bg} ${meta.badge.fg}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d={meta.iconPath} />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-semibold tracking-[0.05em] ${meta.badge.bg} ${meta.badge.fg}`}
            >
              {meta.badge.label}
            </span>
            {meta.subtitle && (
              <span className="text-xs text-gray-500">{meta.subtitle}</span>
            )}
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-500">
              청크 {meta.chunkCount.toLocaleString()}개
            </span>
          </div>
          <p
            className="mt-1 truncate text-sm leading-relaxed text-gray-800"
            title={meta.displayName}
          >
            {meta.displayName}
          </p>
        </div>

        <form action={formAction} className="shrink-0">
          <input type="hidden" name="sourceType" value={meta.sourceType} />
          <input
            type="hidden"
            name="sourceIdentifier"
            value={meta.identifier}
          />
          <DeleteButton sourceType={meta.sourceType} />
        </form>
      </div>

      {state.error && (
        <p
          role="alert"
          data-testid="knowledge-source-row-error"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          data-testid="knowledge-source-row-success"
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800"
        >
          삭제 완료 — 청크 {state.success.removedChunks.toLocaleString()}개
          {state.success.sourceType === "file" &&
            ` · 파일 ${state.success.removedFiles}개`}
          {state.success.hadStorageFailures && (
            <span className="ml-1 text-emerald-700/80">
              (일부 파일 정리 지연)
            </span>
          )}
        </p>
      )}
    </li>
  );
}

function DeleteButton({ sourceType }: { sourceType: "text" | "url" | "file" }) {
  const { pending } = useFormStatus();
  const confirmMsg =
    sourceType === "file"
      ? "이 파일과 관련 청크를 모두 삭제합니다. 계속할까요?"
      : sourceType === "url"
        ? "이 URL 의 청크를 모두 삭제합니다. 계속할까요?"
        : "텍스트 지식 전체를 삭제합니다. 계속할까요?";

  return (
    <ConfirmSubmitButton
      confirmMessage={confirmMsg}
      disabled={pending}
      data-testid="knowledge-source-row-delete"
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "삭제 중..." : "삭제"}
    </ConfirmSubmitButton>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="knowledge-sources-empty"
      className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-6 py-10 text-center"
    >
      <p className="text-sm font-medium text-gray-700">
        아직 등록된 지식이 없어요
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        아래 섹션에서 텍스트·URL·파일을 추가하면 이곳에 목록이 표시돼요.
        <br />
        봇은 등록된 지식을 근거로 답변해요.
      </p>
    </div>
  );
}
