/**
 * Dari 라우트 공개/보호 정책 — 단일 출처.
 *
 * `proxy.ts` 가 이 함수로 리디렉트 여부를 판단한다. 순수 함수라
 * Supabase client mock 없이 경로 분기만 단위 테스트 가능.
 *
 * 공개 (비로그인 접근 OK):
 *   - `/` (홈 / 랜딩)
 *   - `/login`
 *   - `/auth/*` (OAuth callback, logout 등)
 *
 * 보호 (로그인 필수):
 *   - 그 외 모든 경로 (향후 `/bots`, `/settings`, `/admin` 등)
 *
 * 주의: API 라우트 (`/api/*`) 는 proxy matcher 에서 제외되므로 여기서
 * 판단하지 않는다. 각 API 핸들러가 자체 auth 검증 수행.
 */

const PUBLIC_EXACT: ReadonlySet<string> = new Set(["/", "/login"]);
const PUBLIC_PREFIXES: readonly string[] = ["/auth/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * `?next=` 같이 외부에서 주입되는 복귀 경로가 redirect 대상으로 안전한지 검증.
 *
 * 허용: 절대 경로 (`/` 로 시작), 쿼리스트링 포함 가능 (`/bots?tab=active`)
 * 차단:
 *   - `//evil.com` (protocol-relative — 외부 호스트로 튕김)
 *   - `/\evil.com` (구형 브라우저에서 `//` 로 해석 가능한 백슬래시)
 *   - `/@evil.com` (일부 URL 파서가 userinfo 로 해석)
 *   - `javascript:...` (XSS)
 *   - 빈 문자열 / 비문자열
 *   - 과도한 길이 (> 2000자)
 *
 * 단일 출처: `proxy.ts`, `login/actions.ts`, `auth/callback/route.ts`,
 * `login/page.tsx` 가 모두 이 함수를 사용해 open redirect 를 이중으로 막는다.
 */
const MAX_NEXT_LENGTH = 2000;

export function isSafeNextPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_NEXT_LENGTH) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (value.includes("@")) return false;
  return true;
}
