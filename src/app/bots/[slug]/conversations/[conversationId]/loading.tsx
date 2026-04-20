import { PageBackground } from "@/components/ui/page-background";

export default function Loading() {
  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <PageBackground />

      <div className="relative mx-auto w-full max-w-4xl">
        <div className="mb-6 h-5 w-32 animate-pulse rounded bg-gray-100" />

        <div className="mb-8">
          <div className="mb-2 h-4 w-20 animate-pulse rounded bg-blue-100/70" />
          <div className="mb-3 h-9 w-64 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-white/70"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>

        <div className="mb-6 h-14 animate-pulse rounded-xl bg-white/60" />

        <ul className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
            >
              <div
                className="h-16 w-64 animate-pulse rounded-2xl bg-white/70"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
