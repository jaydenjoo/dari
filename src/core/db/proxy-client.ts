/**
 * Supabase Proxy Client — Next.js 16 `proxy.ts` (구 middleware) 전용
 *
 * 매 요청마다 새로 생성해야 한다 (캐시/재사용 금지). Request 쿠키에서
 * 세션을 읽고, Supabase SDK 가 토큰을 refresh 하면 Response 쿠키로
 * 흘려보낸다. 세션 유지의 핵심 — 이 refresh 가 없으면 Server Component
 * 에서 세션이 만료돼 로그아웃이 "끊기듯이" 발생.
 *
 * 사용 (proxy.ts):
 *   const { user, response } = await updateSession(request);
 *   if (!user && isProtected(pathname)) return NextResponse.redirect(...);
 *   return response;
 *
 * 참고: Next.js 16 에서 middleware → proxy 리네임. 공식 Supabase SSR
 * 가이드의 `middleware.ts` 예시를 `proxy.ts` 로 적용.
 */

// ⚠️ `import "server-only"` 를 추가하지 말 것.
//    Next.js 16 proxy 런타임은 해당 패키지를 resolve 못 해 `adapterFn is not a function`
//    으로 크래시. 또한 Next.js 는 proxy 파일·그 의존 모듈을 클라이언트 번들에 포함하지
//    않으므로 "server-only" 가드가 원천 불필요. 본 파일은 `proxy.ts` 외에서 import 금지
//    (오용 시 클라이언트 번들 유입 위험). ESLint no-restricted-imports 로 강제 예정.
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/shared/config/env";
import type { Database } from "./types";

export async function updateSession(request: NextRequest): Promise<{
  supabase: SupabaseClient<Database>;
  user: User | null;
  response: NextResponse;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 1) request 에 먼저 반영 — downstream 에서 최신 쿠키 읽기 가능
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // 2) 새 response 를 만들어 외부 반환값을 갱신. let 재할당은
          //    closure 로 캡처된 response 변수를 업데이트 — 최종 return 시
          //    이 최신 response 가 호출자에게 전달된다.
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getUser() 호출이 내부적으로 refresh 를 트리거 — 이 시점에 setAll 이 실행되어
  // response 변수가 최신 쿠키를 담게 된다. getSession() 은 서버 측에서 위변조 검증을
  // 생략하므로 보안상 getUser() 가 공식 권장.
  //
  // 에러 처리: Supabase SSR SDK 는 네트워크·인증 실패를 throw 하지 않고
  // `{ data: { user: null }, error }` 형태로 반환하도록 설계됨. 따라서 여기서
  // try-catch 불필요 — 실패 시 user=null 로 자연스럽게 비로그인 분기로 흘러간다.
  // (SDK 동작이 바뀌어 throw 로 전환되면 proxy 가 500 으로 떨어지므로 회귀 즉시 감지)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user, response };
}
