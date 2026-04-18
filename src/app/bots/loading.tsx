export default function Loading() {
  return (
    <main className="relative min-h-screen bg-[#fafbfc] px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle, #dde0e4 0.5px, transparent 0.5px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative mx-auto w-full max-w-5xl">
        <header className="mb-10">
          <div className="mb-2 h-3.5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-10 w-40 animate-pulse rounded bg-gray-200" />
        </header>

        <ul
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="봇 목록을 불러오는 중"
        >
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)]"
            />
          ))}
        </ul>
      </div>
    </main>
  );
}
