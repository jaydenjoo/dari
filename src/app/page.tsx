import Link from "next/link";
import { signOut } from "./auth/logout/actions";
import { PageBackground } from "@/components/ui/page-background";
import { createClient } from "@/core/db/client-server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fafbfc] px-6 py-12">
      <PageBackground />

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
          <div className="space-y-6">
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
                운영 중인 봇을 관리하거나 새로운 봇을 만들어 보세요.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Link
                href="/bots"
                data-testid="home-bots-link"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[15px] font-semibold text-white shadow-[0_2px_8px_rgba(43,124,255,0.15),0_8px_24px_rgba(43,124,255,0.18)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(43,124,255,0.2),0_12px_32px_rgba(43,124,255,0.25)]"
              >
                <span>내 봇 목록</span>
                <span className="text-blue-200 transition-colors group-hover:text-white">
                  →
                </span>
              </Link>
              <Link
                href="/bots/new"
                data-testid="home-new-bot-link"
                className="group inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-[15px] font-medium text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
              >
                <span>새 봇 만들기</span>
                <span className="text-gray-300 transition-colors group-hover:text-gray-500">
                  →
                </span>
              </Link>
            </div>

            <form action={signOut} className="border-t border-gray-100 pt-5">
              <button
                type="submit"
                data-testid="logout-button"
                className="text-sm text-gray-400 transition-colors hover:text-gray-600"
              >
                로그아웃
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
