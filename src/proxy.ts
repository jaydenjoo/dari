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

/**
 * `updateSession` 이 갱신한 쿠키를 redirect response 에도 그대로 옮긴다 (Task 0-D-6).
 *
 * 문제: `NextResponse.redirect(url)` 는 빈 cookies 로 시작 — 세션 refresh 직후
 *       redirect 시 새로 발급된 JWT 쿠키가 클라이언트에 전달되지 않아, 다음 요청에서
 *       세션이 만료된 것으로 인식되거나 race condition 으로 흐름이 끊긴다.
 * 해결: refreshed cookies (옵션·만료일 포함) 를 redirect response 에 복제.
 */
function redirectWithRefreshedCookies(
  url: URL,
  refreshedResponse: NextResponse,
): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of refreshedResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export async function proxy(request: NextRequest) {
  const { user, response } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  // 로그인 상태로 /login 접근 → 홈으로
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirectWithRefreshedCookies(url, response);
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
    return redirectWithRefreshedCookies(url, response);
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 자산·API·Next 내부 경로 제외.
    // API 는 각 핸들러가 자체 auth — proxy 가 세션 refresh 하지 않아도 OK.
    //
    // 확장자 제외 (Task A-3 추가 2026-04-21):
    //   - 이미지: png/jpg/jpeg/gif/svg/webp/ico
    //   - 스크립트/스타일: **js/css/map** (원래 누락 — `public/widget.js` 가 `/login` 으로
    //     리다이렉트되어 cross-origin embed 가 작동 안 하던 Phase 1 잔존 버그)
    //   - 폰트: woff/woff2/ttf/eot (pretendard 등 public 정적 자산)
    //
    // `/_next/static/*` 은 이미 제외되므로 Next 번들은 중복 제외. 사용자 업로드 `.js`
    // 는 없는 구조이므로 `.js$` 포괄 제외가 안전.
    //
    // ⚠️ **public/ 전용 가정** (code/sec LOW 2026-04-21): 위 확장자 제외는 `public/`
    // 하위가 "인증 없이 공개 가능" 이라는 전제 위에 성립. `public/` 에 민감 정보 포함
    // `.js`/`.css`/`.map` 을 두지 말 것. 향후 동적 `.js` 라우트(예: `/config.js`)
    // 를 보호 경로로 추가할 일이 생기면 이 제외 규칙을 먼저 재검토 (예외 pattern 추가).
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|js|css|map|woff|woff2|ttf|eot)$).*)",
  ],
};
