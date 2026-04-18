import { PageBackground } from "@/components/ui/page-background";

export default function Loading() {
  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative mx-auto w-full max-w-3xl">
        <nav className="mb-6">
          <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
        </nav>

        <header className="mb-8">
          <div className="mb-2 h-3.5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="mb-3 h-10 w-64 animate-pulse rounded bg-gray-200" />
          <div className="h-3.5 w-80 animate-pulse rounded bg-gray-200" />
        </header>

        <div className="space-y-6">
          <div
            aria-label="편집 폼을 불러오는 중"
            className="h-72 animate-pulse rounded-2xl border border-gray-200/80 bg-white"
          />
          <div
            aria-hidden
            className="h-64 animate-pulse rounded-2xl border border-gray-200/80 bg-white"
          />
          <div
            aria-hidden
            className="h-96 animate-pulse rounded-2xl border border-gray-200/80 bg-white"
          />
        </div>
      </div>
    </main>
  );
}
