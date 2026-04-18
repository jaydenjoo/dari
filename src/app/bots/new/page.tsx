import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/core/db/client-server";

import CreateBotForm from "./create-bot-form";

export const metadata: Metadata = {
  title: "새 봇 만들기 — Dari",
};

export default async function NewBotPage() {
  // proxy 가 보호 라우트 리디렉트를 수행하지만, 페이지 레벨 2중 방어.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fbots%2Fnew");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fafbfc] px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(43,124,255,0.08) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -bottom-40 h-[500px] w-[500px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(43,124,255,0.06) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle, #dde0e4 0.5px, transparent 0.5px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative mx-auto w-full max-w-2xl">
        <nav className="animate-in fade-in mb-6 duration-500">
          <Link
            href="/bots"
            className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
          >
            <span aria-hidden>←</span>
            <span>내 봇 목록</span>
          </Link>
        </nav>

        <header
          className="animate-in fade-in slide-in-from-bottom-2 mb-8 duration-500"
          style={{ animationDelay: "80ms", animationFillMode: "both" }}
        >
          <p className="mb-2 text-xs font-semibold tracking-[0.05em] text-blue-600 uppercase">
            새 봇
          </p>
          <h1 className="text-4xl leading-tight font-bold tracking-[-0.02em] text-gray-900">
            봇 정체성 정하기
          </h1>
          <p className="mt-3 text-base leading-relaxed text-gray-500">
            최소 정보만 입력하면 바로 시작할 수 있어요.
            <br className="sm:hidden" /> 나머지 설정은 언제든 변경할 수 있어요.
          </p>
        </header>

        <div
          className="animate-in fade-in slide-in-from-bottom-2 duration-500"
          style={{ animationDelay: "160ms", animationFillMode: "both" }}
        >
          <CreateBotForm />
        </div>
      </div>
    </main>
  );
}
