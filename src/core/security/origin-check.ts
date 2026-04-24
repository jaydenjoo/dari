/**
 * 위젯 엔드포인트(Epic 1-6) 의 CORS 허용 여부를 판정하는 순수 함수 모음.
 *
 * 정책 (Task 1-0-b Plan 권장안, Jayden 승인):
 *   1. 빈 `allowedDomains` = allow-all (MVP UX) — Phase 2 편집 UI 배포 시 "1개 이상 필수" 정책 전환.
 *   2. 와일드카드 문법: `https://*.example.com` 형태만. `*` 는 첫 호스트 조각 단독으로만.
 *   3. 서브도메인 자동 포함 안 함 — `*.` 를 명시해야 함.
 *   4. 스킴 정책: https 필수. http 는 localhost / 127.0.0.1 / [::1] 만 예외(로컬 개발).
 *   5. 저장 포맷: 풀 origin `"https://example.com"`. 스킴 누락은 파싱 실패 → 차단.
 *   6. 적용 레이어: Route Handler 헬퍼. Next proxy 전역 확장 아님.
 *
 * server-only 불필요 — 순수 함수 (네트워크·DB 접근 없음). 필요 시 클라이언트에서도 import 가능.
 */

import { parse as parseTld } from "tldts";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * baseHost 가 Public Suffix List 의 effective TLD 자체인지 판정.
 *
 * 일치하면 와일드카드(`https://*.<baseHost>`) 가 effective TLD 전체를 허용하는 셈
 * → 사실상 allow-all 과 동일한 위험. 양 검증 지점에서 차단한다.
 *
 * ICANN + Private 도메인 모두 검사:
 *   - "com", "co.uk" → ICANN PSL → true
 *   - "s3.amazonaws.com", "vercel.app", "github.io" → Private PSL → true
 *   - "example.com", "api.example.co.uk" → 정상 도메인 → false
 *
 * 판정 기준: `domain === null` (PSL 자체이면 domain 추출 불가) 또는
 * `publicSuffix === baseHost` (정확 일치).
 */
function isPublicSuffixOnly(baseHost: string): boolean {
  const result = parseTld(baseHost, {
    allowPrivateDomains: true,
    allowIcannDomains: true,
  });
  // tldts IResult 의 domain / publicSuffix 는 string | null | undefined.
  // == null 로 null + undefined 동시 처리 (코드 리뷰 H-1).
  // 파싱 불가 / publicSuffix 식별 불가 시 안전 측 = 차단 (PSL 자체로 간주).
  if (result.domain == null) return true;
  if (result.publicSuffix == null) return true;
  return result.publicSuffix === baseHost;
}

// `i` 플래그 유지 사유: entry 가 `HTTPS://...` 대문자 스킴으로 저장된 레거시·수기
// 입력을 허용한다. 정규화 레이어(`normalizeOrigin`)와 역할 일부 중복이지만
// 저장 포맷이 강제되지 않은 상태에서 와일드카드 분기를 안전하게 잡기 위한 안전망.
const WILDCARD_ENTRY_PATTERN = /^(https?):\/\/\*\.(.+)$/i;

/**
 * `allowedDomains` 엔트리 형식 검증 (Task β-4: schema refine 단 검증).
 *
 * `matchEntry` 와 동일한 차단 로직을 **저장 시점** 에 적용 → 잘못된 entry 가
 * config 에 침투하는 경로 차단. 매칭 시점 (`matchAllowedDomain`) 은 안전망 유지.
 *
 * 거부 사례:
 *   - 빈 문자열 / 스킴 누락 (`example.com`)
 *   - http + 외부 호스트 (로컬만 예외 — `normalizeOrigin` 정책)
 *   - `*.com` 등 TLD 단독 와일드카드 (모든 .com 허용 위험)
 *   - `*.co.uk`, `*.s3.amazonaws.com`, `*.vercel.app` 등 PSL effective TLD 와일드카드
 *     (PSL `tldts` 도입 — ICANN + Private 모두 차단)
 *   - `*.*.example.com` 다중 와일드카드
 *   - `https://192.168.1.1` IP-style
 *   - `*.192.168` 숫자 레이블만 와일드카드
 */
export function isValidOriginEntry(entry: string): boolean {
  const trimmed = entry.trim();
  if (trimmed.length === 0) return false;

  // userinfo (@) 주입 차단 — `https://*.legit.com@evil.com` 형태 입력 시 URL parser 가
  // `legit.com` 을 username 으로 해석해 hostname 이 evil.com 이 됨. 와일드카드 base 가
  // userinfo + host 결합 문자열로 평가되면서 PSL/IP/multi-label 검사 우회 가능.
  // 정상 origin 에는 `@` 가 절대 출현하지 않으므로 entry 자체에서 차단. (sec H-1 Fix)
  if (trimmed.includes("@")) return false;

  const wildcardMatch = WILDCARD_ENTRY_PATTERN.exec(trimmed);
  if (wildcardMatch) {
    const scheme = wildcardMatch[1];
    const baseHostRaw = wildcardMatch[2];
    if (baseHostRaw.includes("*")) return false;
    if (!baseHostRaw.replace(/\.$/, "").includes(".")) return false;
    if (/^\d+(\.\d+)*\.?$/.test(baseHostRaw)) return false;
    if (isPublicSuffixOnly(baseHostRaw.replace(/\.$/, ""))) return false;
    return normalizeOrigin(`${scheme}://${baseHostRaw}`) !== null;
  }

  const normalized = normalizeOrigin(trimmed);
  if (!normalized) return false;

  // 직접 IP 입력 차단 — LOCAL_HOSTS 외 IPv4/IPv6 host 는 거부.
  // normalizeOrigin 이 LOCAL_HOSTS (localhost/127.0.0.1/[::1]) 는 이미 통과시키므로,
  // 여기서 IP-pattern 인 host 는 외부 IP. 정상 운영 도메인은 항상 호스트네임.
  let host: string;
  try {
    host = new URL(normalized).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
  if (LOCAL_HOSTS.has(host)) return true;
  if (/^\d+(\.\d+){3}$/.test(host)) return false;
  if (host.includes(":")) return false;
  return true;
}

/**
 * Raw Origin 헤더 / URL 문자열을 정규화해 `"<scheme>://<host>[:<port>]"` 형태로 반환.
 * 파싱 실패 · 허용 스킴 아님 · http + 외부 호스트는 null.
 *
 * 정규화 규칙:
 *   - host 소문자. URL API 가 IDN 을 Punycode(`xn--...`)로 자동 변환 → 호모그래프 방어
 *   - path / query / fragment / trailing slash 제거
 *   - 기본 포트(https:443 / http:80) 제거
 *   - 그 외 비표준 포트는 보존
 */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  // trailing dot 제거 — `example.com.` 과 `example.com` 은 동일 도메인.
  // URL API 는 trailing dot 을 보존하므로 정규화에서 한 번 더 제거해 매칭 일관화.
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const port = parsed.port; // 기본 포트는 빈 문자열

  if (scheme === "https") {
    return port ? `https://${host}:${port}` : `https://${host}`;
  }
  if (scheme === "http") {
    if (!LOCAL_HOSTS.has(host)) return null;
    return port ? `http://${host}:${port}` : `http://${host}`;
  }
  return null;
}

/**
 * origin 이 allowedDomains 중 하나와 매칭되는지 검사.
 *
 * - origin: raw 값이면 normalize 경유. 이미 정규화된 값이어도 idempotent.
 * - allowedDomains 빈 배열 = true (MVP allow-all, 상세는 파일 상단 주석).
 * - 각 entry: 정확 매칭 또는 `https://*.<base>` 와일드카드.
 * - 와일드카드는 서브도메인만 매칭 (base 자체 제외). 중첩 서브도메인도 허용.
 * - 잘못된 entry (파싱 실패, 빈 문자열) 는 조용히 skip.
 *
 * ⚠️ null / 누락 Origin 처리:
 *   - `null` / `undefined` / 비문자열 / 파싱 실패 origin 은 빈 배열(allow-all) 이어도 **false**.
 *   - 즉 `Origin` 헤더가 없는 요청(서버간 curl, 일부 non-browser, sandboxed iframe 의 "null" 문자열 등)은
 *     allow-all 정책에서도 차단된다. 브라우저 요청만 허용하기 위한 의도적 설계.
 *   - 위젯을 `<iframe sandbox>` 에 넣으면 Origin 이 `"null"` 로 전달되어 차단됨. 위젯 embed 가이드에서
 *     sandbox 를 사용하지 않도록 안내하거나, 필요 시 별도 처리 Task 가 필요.
 */
export function matchAllowedDomain(
  origin: string | null | undefined,
  allowedDomains: readonly string[],
): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  if (allowedDomains.length === 0) return true;

  for (const entry of allowedDomains) {
    if (matchEntry(normalizedOrigin, entry)) return true;
  }
  return false;
}

function matchEntry(normalizedOrigin: string, rawEntry: string): boolean {
  const entry = rawEntry.trim();
  if (entry.length === 0) return false;
  // userinfo (@) 주입 차단 — 매칭 시점 이중 방어. DB 직접 UPDATE / migration /
  // 레거시 데이터 등 isValidOriginEntry 우회 경로에서 들어온 entry 도 막는다.
  if (entry.includes("@")) return false;

  const wildcardMatch = WILDCARD_ENTRY_PATTERN.exec(entry);
  if (wildcardMatch) {
    return matchWildcard(normalizedOrigin, wildcardMatch[1], wildcardMatch[2]);
  }

  const normalizedEntry = normalizeOrigin(entry);
  if (!normalizedEntry) return false;
  return normalizedOrigin === normalizedEntry;
}

function matchWildcard(
  normalizedOrigin: string,
  scheme: string,
  baseHostRaw: string,
): boolean {
  // baseHostRaw 자체에 `*` 가 또 있으면 거부 (`*.*.example.com` 등 비지원 문법)
  if (baseHostRaw.includes("*")) return false;

  // TLD 단독 와일드카드 방어 — `https://*.com` 을 등록하면 모든 `.com` 도메인이
  // 허용되어 사실상 allow-all 과 동일한 효과가 난다. base 에 최소 1개의 점을
  // 요구해 "2+ 레이블" 을 강제한다. (security HIGH 반영, OWASP A01)
  if (!baseHostRaw.replace(/\.$/, "").includes(".")) return false;

  // IP-style base 차단 — `*.192.168` / `*.192.168.1.1` 등 숫자 레이블로만 구성된
  // base 는 사실상 IP 대역 와일드카드로 오용될 수 있어 거부. 정상 도메인은 최소
  // 하나의 비숫자 레이블을 가진다 (예: example.com 의 `example`). (sec 재리뷰 LOW)
  if (/^\d+(\.\d+)*\.?$/.test(baseHostRaw)) return false;

  // PSL effective TLD 와일드카드 차단 — `*.co.uk` / `*.s3.amazonaws.com` /
  // `*.vercel.app` 등은 effective TLD 전체를 허용하는 셈이라 사실상 allow-all.
  // ICANN + Private PSL 모두 검사. 저장 시점(`isValidOriginEntry`) 과 매칭 시점
  // 이중 방어 — 레거시 entry / 테스트 직접 호출 우회 차단. (Task β-4 잔여 ①)
  if (isPublicSuffixOnly(baseHostRaw.replace(/\.$/, ""))) return false;

  const baseOrigin = normalizeOrigin(
    `${scheme.toLowerCase()}://${baseHostRaw}`,
  );
  if (!baseOrigin) return false;

  let originUrl: URL;
  let baseUrl: URL;
  try {
    originUrl = new URL(normalizedOrigin);
    baseUrl = new URL(baseOrigin);
  } catch {
    return false;
  }

  if (originUrl.protocol !== baseUrl.protocol) return false;
  if (originUrl.port !== baseUrl.port) return false;

  // URL.hostname 도 trailing dot 을 보존할 수 있어 양측 정규화 재적용.
  const originHost = originUrl.hostname.toLowerCase().replace(/\.$/, "");
  const baseHost = baseUrl.hostname.toLowerCase().replace(/\.$/, "");

  if (originHost === baseHost) return false; // 자기 자신은 와일드카드로 덮지 않음
  return originHost.endsWith(`.${baseHost}`);
}

/**
 * CORS 응답 헤더 생성.
 *
 * 매칭 성공:
 *   - `Access-Control-Allow-Origin`: 정규화된 origin (wildcard `*` 사용 금지 — 특정 origin 만 반영)
 *   - `Vary: Origin` — 동일 URL 에 대해 origin 별 캐시 분리
 *
 * 매칭 실패 또는 null origin:
 *   - `Vary: Origin` 만 반환. `Access-Control-Allow-Origin` 부재 → 브라우저가 CORS 거부
 *
 * credentials 는 포함하지 않음 — 위젯은 anon 요청 전제 (쿠키 미사용).
 *
 * ⚠️ Epic 1-6 배선 시점 체크리스트:
 *   - OPTIONS 핸들러 분리 — preflight 응답에 `Access-Control-Allow-Methods` /
 *     `Access-Control-Allow-Headers` / `Access-Control-Max-Age` 추가
 *   - 위젯 엔드포인트에 **RLS 또는 bot_id 기반 인가** 적용 확인 — allow-all 빈 배열
 *     정책은 CORS 계층만 여는 것. 데이터 접근은 별도 인가 레이어 필요
 *   - `Access-Control-Allow-Credentials: true` 금지 — 위젯은 anon 전제이며 credentials
 *     허용 시 allow-all (빈 배열) + 동적 Allow-Origin 조합이 쿠키 탈취 벡터로 전환됨
 *   - Route Handler wrapper `withAllowedOrigin(handler)` 로 헤더 주입·거부 응답 일원화
 *   - matchWildcard 재파싱 비용이 문제되면 `allowedDomains` 파싱 결과 캐시 도입
 */
export function buildCorsHeaders(
  origin: string | null | undefined,
  allowedDomains: readonly string[],
): Record<string, string> {
  const normalized = normalizeOrigin(origin);
  if (!normalized || !matchAllowedDomain(normalized, allowedDomains)) {
    return { Vary: "Origin" };
  }
  return {
    "Access-Control-Allow-Origin": normalized,
    Vary: "Origin",
  };
}
