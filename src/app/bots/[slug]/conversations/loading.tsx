import { PageBackground } from "@/components/ui/page-background";

export default function Loading() {
  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative mx-auto w-full max-w-4xl">
        <nav className="mb-6">
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        </nav>

        <header className="mb-8">
          <div className="mb-2 h-3.5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="mb-3 h-10 w-64 animate-pulse rounded bg-gray-200" />
          <div className="h-3.5 w-40 animate-pulse rounded bg-gray-200" />
        </header>

        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              aria-hidden
              className="h-24 animate-pulse rounded-xl border border-gray-200/80 bg-white"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
