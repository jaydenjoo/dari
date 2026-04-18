/**
 * Knowledge 섹션 자리표시 — Phase 2 에서 구현 예정.
 *
 * Task 1-5-d 범위 결정:
 *   knowledge.sources 는 discriminated union (url/file/text) 으로 구조가 복잡하고,
 *   임베딩 파이프라인·파일 업로드 인프라가 부재하여 편집해도 동작하지 않는다.
 *   → 자리표시만 노출하고 기존 sources 값은 Server Action 에서 그대로 보존한다.
 */
export function KnowledgePlaceholder({ sourceCount }: { sourceCount: number }) {
  return (
    <div
      data-testid="knowledge-placeholder"
      className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-5"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"
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
          <path d="M12 6.5v6l4 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-700">
          지식 베이스 편집은 Phase 2 에서 지원돼요
        </p>
        <p className="text-xs leading-relaxed text-gray-500">
          위젯 런타임 + 임베딩 파이프라인이 함께 배포되면 활성화됩니다. 현재
          저장된 지식 소스 {sourceCount}개는 그대로 유지됩니다.
        </p>
      </div>
    </div>
  );
}
