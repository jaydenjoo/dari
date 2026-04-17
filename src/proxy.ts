import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, isSafeNextPath } from "@/core/auth/route-policy";
import { updateSession } from "@/core/db/proxy-client";

/**
 * Dari Proxy — 세션 refresh + 보호 라우트 게이트.
 *
 * Next.js 16 에서 `middleware` 파일 컨벤션이 `proxy` 로 리네임됨. API 동작은
 * 동일 (NextRequest/NextResponse, matcher, Node 런타임 기본).
 *
 * 동작 순서:
 *   1. `updateSession` 이 Supabase 세션을 refresh — Server Component 에서
 *      세션 만료로 인한 끊김 방지 (쿠키에 새 JWT 기록).
 *   2. 비로그인 유저가 보호 라우트 접근 → `/login` 리디렉트. 원래 목적지를
 *      `?next=` 쿼리로 보존하여 로그인 후 복귀 가능하게 한다.
 *   3. 로그인 상태로 `/login` 접근 → `/` 리디렉트 (재로그인 화면 노출 방지).
 *
 * 공개/보호 정책은 `@/core/auth/route-policy` 단일 출처.
 * API 라우트 (`/api/*`) 는 matcher 에서 제외 — 각 핸들러가 자체 auth 검증 수행.
 */

export async function proxy(request: NextRequest) {
  const { user, response } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  // 로그인 상태로 /login 접근 → 홈으로
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 비로그인 + 보호 라우트 → /login 으로 (원래 목적지 + 쿼리스트링 보존)
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // 쿼리스트링 포함한 전체 경로를 next 에 담아 탭·필터 상태까지 복원 가능하게 한다.
    // 내부 생성 값이지만 길이 한도·형식을 isSafeNextPath 로 재확인 (방어적).
    const nextValue = `${pathname}${request.nextUrl.search}`;
    if (isSafeNextPath(nextValue)) {
      url.searchParams.set("next", nextValue);
    }
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 자산·API·Next 내부 경로 제외.
    // API 는 각 핸들러가 자체 auth — proxy 가 세션 refresh 하지 않아도 OK.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
