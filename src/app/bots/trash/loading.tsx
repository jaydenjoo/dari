import { PageBackground } from "@/components/ui/page-background";

export default function Loading() {
  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative mx-auto w-full max-w-5xl">
        <header className="mb-10">
          <div className="mb-2 h-3.5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-10 w-48 animate-pulse rounded bg-gray-200" />
        </header>

        <div
          aria-label="휴지통을 불러오는 중"
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-gray-200/80 bg-white"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
