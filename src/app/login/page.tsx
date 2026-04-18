import { isSafeNextPath } from "@/core/auth/route-policy";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signInWithGoogle, signInWithPassword } from "./actions";

type SearchParams = Promise<{ error?: string; next?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  missing_code:
    "로그인 과정에서 필요한 정보를 받지 못했어요. 다시 시도해주세요.",
  auth_failed: "Google 로그인 중 문제가 생겼어요. 다시 시도해주세요.",
  oauth_init_failed: "로그인을 시작하지 못했어요. 잠시 후 다시 시도해주세요.",
  invalid_input: "이메일 형식과 비밀번호(6자 이상)를 확인해주세요.",
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않아요.",
  too_many_attempts: "로그인 시도가 너무 잦아요. 잠시 후 다시 시도해주세요.",
};

function resolveErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "알 수 없는 오류가 발생했어요.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, next } = await searchParams;
  const errorMsg = resolveErrorMessage(error);
  // `signInWithGoogle` 이 최종 방어를 하지만, 페이지 단계에서도 동일 정책을 적용해
  // 잘못된 값이 hidden input 으로 전달되지 않게 한다 (이중 방어 + 의도 명확화).
  const safeNext = isSafeNextPath(next) ? next : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fafbfc] px-6 py-12">
      {/* 배경 블롭 — 디자인 시스템 v2 (순백 금지) */}
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
      {/* 도트 텍스처 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle, #dde0e4 0.5px, transparent 0.5px)",
          backgroundSize: "22px 22px",
        }}
      />

      <Card className="relative w-full max-w-md border border-gray-200/80 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.03),0_20px_48px_rgba(0,0,0,0.08)]">
        <CardHeader className="space-y-3 pt-10 pb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl font-bold tracking-tight text-blue-600">
            다
          </div>
          <CardTitle className="text-2xl font-bold tracking-[-0.02em] text-gray-900">
            Dari 에 오신 걸 환영해요
          </CardTitle>
          <CardDescription className="text-base leading-relaxed text-gray-500">
            초대받은 계정으로 로그인하면 <br className="sm:hidden" />
            봇과 대화를 이어갈 수 있어요.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 px-8 pb-10">
          {errorMsg && (
            <div
              role="alert"
              data-testid="login-error"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700"
            >
              {errorMsg}
            </div>
          )}

          <form action={signInWithPassword} className="space-y-3">
            {safeNext && <input type="hidden" name="next" value={safeNext} />}
            <div className="space-y-1.5">
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-gray-700"
              >
                이메일
              </label>
              <input
                id="login-email"
                data-testid="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@example.com"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] text-gray-900 placeholder-gray-400 transition outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-gray-700"
              >
                비밀번호
              </label>
              <input
                id="login-password"
                data-testid="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                placeholder="6자 이상"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] text-gray-900 placeholder-gray-400 transition outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button
              type="submit"
              data-testid="login-submit"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[15px] font-semibold text-white shadow-[0_2px_8px_rgba(43,124,255,0.15),0_8px_24px_rgba(43,124,255,0.18)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(43,124,255,0.2),0_12px_32px_rgba(43,124,255,0.25)]"
            >
              <span>로그인</span>
              <span className="text-blue-200 transition-colors group-hover:text-white">
                →
              </span>
            </button>
          </form>

          <div
            aria-hidden
            className="flex items-center gap-3 text-xs tracking-[0.05em] text-gray-400 uppercase"
          >
            <span className="h-px flex-1 bg-gray-200" />
            <span>또는</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <form action={signInWithGoogle}>
            {safeNext && <input type="hidden" name="next" value={safeNext} />}
            <button
              type="submit"
              data-testid="login-google-submit"
              className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-[15px] font-medium text-gray-800 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)]"
            >
              <GoogleIcon className="h-5 w-5" />
              <span className="tracking-[-0.01em]">Google 로 계속하기</span>
              <span className="ml-auto text-gray-300 transition-colors group-hover:text-gray-500">
                →
              </span>
            </button>
          </form>

          <p className="pt-2 text-center text-xs leading-relaxed text-gray-400">
            로그인하면 Dari 의 이용 약관과
            <br />
            개인정보 처리방침에 동의하게 돼요.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.6 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.6z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.3 21.3 7.4 24 12 24z"
      />
      <path
        fill="#FBBC04"
        d="M5.4 14.3c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.2 0 10.1 0 12s.5 3.8 1.4 5.4l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.4 0 3.3 2.7 1.4 6.6l4 3.1c1-2.8 3.5-4.9 6.6-4.9z"
      />
    </svg>
  );
}
