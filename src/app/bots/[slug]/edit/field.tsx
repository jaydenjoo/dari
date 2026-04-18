/**
 * 편집 폼 공통 Field — 라벨 + 입력 + (에러 또는 힌트).
 *
 * 1-5-b /bots/new 의 Field 와 시각적으로 동일하지만 별도 파일로 분리:
 *   - 편집 폼은 30+ 필드라 sub-component 분리 후 공유 컴포넌트가 필수.
 *   - errorKey 는 dot path (예: "identity.name") — 부모가 fieldErrors 받아 매핑.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string | null;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p
          data-testid={`${htmlFor}-error`}
          role="alert"
          className="text-xs text-red-600"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] text-gray-900 placeholder-gray-400 transition outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";

export const textareaClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm leading-relaxed text-gray-900 placeholder-gray-400 transition outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";

export const selectClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] text-gray-900 transition outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 appearance-none";
