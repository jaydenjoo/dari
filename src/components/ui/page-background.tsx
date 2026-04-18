/**
 * 페이지 전반에 깔리는 도트 패턴 배경.
 *
 * 디자인 시스템 v2 기본 배경(순백 금지 원칙): #fafbfc + 22px 그리드 도트.
 * 랜딩 / 대시보드 / 상태 페이지(로딩·에러·not-found) 등 모든 곳에 공통 적용.
 *
 * 사용:
 *   <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
 *     <PageBackground />
 *     {/* 페이지 컨텐츠 — 배경 위로 띄우려면 `relative` 로 감싸기 *\/}
 *   </main>
 *
 * 블롭(큰 원형 그라디언트)은 페이지마다 위치·개수·opacity 가 달라 일반화
 * 부적합 — 각 페이지에서 inline 으로 둔다 (`/bots/new`, `/bots/[slug]`, `/login` 등).
 */

type PageBackgroundProps = {
  /**
   * 배경 강도. 기본 "subtle" (opacity-40).
   * "medium" (opacity-50) 는 블롭이 강해 도트가 덜 보이는 페이지에서 선택.
   */
  intensity?: "subtle" | "medium";
};

export function PageBackground({
  intensity = "subtle",
}: PageBackgroundProps = {}) {
  const opacityClass = intensity === "medium" ? "opacity-50" : "opacity-40";

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${opacityClass}`}
      style={{
        backgroundImage:
          "radial-gradient(circle, #dde0e4 0.5px, transparent 0.5px)",
        backgroundSize: "22px 22px",
      }}
    />
  );
}
