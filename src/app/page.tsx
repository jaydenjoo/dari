import Link from "next/link";
import { signOut } from "./auth/logout/actions";
import { createClient } from "@/core/db/client-server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fafbfc] px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle, #dde0e4 0.5px, transparent 0.5px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative w-full max-w-xl rounded-3xl border border-gray-200/80 bg-white p-10 shadow-[0_4px_12px_rgba(0,0,0,0.03),0_20px_48px_rgba(0,0,0,0.08)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-600">
            다
          </div>
          <span className="text-xl font-bold tracking-[-0.02em] text-gray-900">
            Dari
          </span>
        </div>

        {user ? (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <p className="text-sm font-medium tracking-[0.05em] text-blue-600 uppercase">
                로그인됨
              </p>
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-gray-900">
                안녕하세요,{" "}
                <span className="text-blue-600">
                  {user.email ?? user.id.slice(0, 8)}
                </span>
              </h1>
              <p className="pt-2 text-base leading-relaxed text-gray-500">
                봇 목록·대화는 다음 단계에서 만나실 수 있어요. (Phase 1)
              </p>
            </div>

            <form action={signOut}>
              <button
                type="submit"
                className="group flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
              >
                <span>로그아웃</span>
                <span className="text-gray-300 transition-colors group-hover:text-gray-500">
                  →
                </span>
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-5">
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-gray-900">
              대화형 AI 봇,
              <br />한 줄로 내 사이트에.
            </h1>
            <p className="text-base leading-relaxed text-gray-500">
              Dari 는 누구나 자신만의 AI 챗봇을 만들고
              <br />
              웹사이트에 붙일 수 있게 도와드려요.
            </p>
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-[0_2px_8px_rgba(43,124,255,0.15),0_8px_24px_rgba(43,124,255,0.18)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(43,124,255,0.2),0_12px_32px_rgba(43,124,255,0.25)]"
            >
              <span>시작하기</span>
              <span className="text-blue-200 transition-colors group-hover:text-white">
                →
              </span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
