import { PageBackground } from "@/components/ui/page-background";

export default function Loading() {
  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative mx-auto w-full max-w-4xl">
        <nav className="mb-6">
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        </nav>

        <header className="mb-10">
          <div className="mb-2 h-3.5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="mb-3 h-10 w-72 animate-pulse rounded bg-gray-200" />
          <div className="flex gap-2">
            <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
            <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          </div>
        </header>

        <div
          aria-label="봇 상세를 불러오는 중"
          className="mb-6 h-56 animate-pulse rounded-2xl border border-gray-200/80 bg-white"
        />
        <div
          aria-label="위젯 코드를 불러오는 중"
          className="h-44 animate-pulse rounded-2xl border border-gray-200/80 bg-white"
        />
      </div>
    </main>
  );
}
