import { describe, expect, it } from "vitest";

import {
  buildCorsHeaders,
  matchAllowedDomain,
  normalizeOrigin,
} from "./origin-check";

describe("normalizeOrigin", () => {
  it("기본 https 을 그대로 유지", () => {
    expect(normalizeOrigin("https://example.com")).toBe("https://example.com");
  });

  it("trailing slash / path / query / fragment 제거", () => {
    expect(normalizeOrigin("https://example.com/")).toBe("https://example.com");
    expect(normalizeOrigin("https://example.com/path")).toBe(
      "https://example.com",
    );
    expect(normalizeOrigin("https://example.com?x=1")).toBe(
      "https://example.com",
    );
    expect(normalizeOrigin("https://example.com#h")).toBe(
      "https://example.com",
    );
  });

  it("host 대소문자 정규화", () => {
    expect(normalizeOrigin("https://EXAMPLE.COM")).toBe("https://example.com");
  });

  it("비표준 포트 보존, 기본 포트(443) 생략", () => {
    expect(normalizeOrigin("https://example.com:8443")).toBe(
      "https://example.com:8443",
    );
    expect(normalizeOrigin("https://example.com:443")).toBe(
      "https://example.com",
    );
  });

  it("http 은 localhost / 127.0.0.1 만 허용", () => {
    expect(normalizeOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(normalizeOrigin("http://127.0.0.1:4000")).toBe(
      "http://127.0.0.1:4000",
    );
    expect(normalizeOrigin("http://[::1]:4000")).toBe("http://[::1]:4000");
    // 기본 포트 80 생략
    expect(normalizeOrigin("http://localhost")).toBe("http://localhost");
  });

  it("http + 외부 호스트 거부", () => {
    expect(normalizeOrigin("http://example.com")).toBeNull();
    expect(normalizeOrigin("http://192.168.1.1")).toBeNull();
  });

  it("비허용 스킴 거부 (ftp / data / javascript / file)", () => {
    expect(normalizeOrigin("ftp://example.com")).toBeNull();
    expect(normalizeOrigin("data:text/html,hi")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("file:///etc/passwd")).toBeNull();
  });

  it("빈 / null / 비문자열 / 파싱 실패 입력은 null", () => {
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("   ")).toBeNull();
    expect(normalizeOrigin(null)).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
  });

  it("IDN 호모그래프는 Punycode 로 변환되어 ASCII 과 불일치", () => {
    // 'exаmple.com' — 'a' 자리에 Cyrillic 'а' (U+0430)
    const cyrillic = "https://exа" + "mple.com";
    const normalized = normalizeOrigin(cyrillic);
    expect(normalized).toMatch(/^https:\/\/xn--/);
    expect(normalized).not.toBe("https://example.com");
  });

  it("trailing dot 호스트 정규화 — `example.com.` 과 `example.com` 동일 취급", () => {
    expect(normalizeOrigin("https://example.com.")).toBe("https://example.com");
    expect(normalizeOrigin("https://example.com./path")).toBe(
      "https://example.com",
    );
  });

  it("userinfo(@) 공격 — hostname 만 추출되어 evil.com 로 정규화 (의도된 보안 동작)", () => {
    // `https://example.com@evil.com` 의 실 host 는 evil.com (URL API 표준).
    // 이 정규화가 matchAllowedDomain 에서 evil.com 차단으로 이어진다.
    expect(normalizeOrigin("https://example.com@evil.com")).toBe(
      "https://evil.com",
    );
  });

  it("normalizeOrigin 은 idempotent — 정규화된 값을 다시 넣어도 동일 결과", () => {
    const first = normalizeOrigin("https://EXAMPLE.COM:443/path?x=1");
    expect(first).toBe("https://example.com");
    expect(normalizeOrigin(first)).toBe(first);
  });
});

describe("matchAllowedDomain", () => {
  it("빈 allowedDomains = allow-all (MVP 정책)", () => {
    expect(matchAllowedDomain("https://any.example.com", [])).toBe(true);
    expect(matchAllowedDomain("http://localhost:3000", [])).toBe(true);
  });

  it("정규화 실패 origin 은 빈 배열이어도 false", () => {
    expect(matchAllowedDomain("not a url", [])).toBe(false);
    expect(matchAllowedDomain(null, [])).toBe(false);
    expect(matchAllowedDomain("http://example.com", [])).toBe(false); // http 외부
  });

  it("정확 매칭 성공", () => {
    expect(
      matchAllowedDomain("https://example.com", ["https://example.com"]),
    ).toBe(true);
  });

  it("정확 매칭 실패 — 스킴/포트/호스트 불일치", () => {
    // http 은 외부 호스트 거부 정책으로 origin 정규화부터 실패 → allowedDomains 과 무관
    expect(
      matchAllowedDomain("http://example.com", ["https://example.com"]),
    ).toBe(false);
    // 포트 차이
    expect(
      matchAllowedDomain("https://example.com:8443", ["https://example.com"]),
    ).toBe(false);
    // 호스트 다름
    expect(
      matchAllowedDomain("https://other.com", ["https://example.com"]),
    ).toBe(false);
  });

  it("와일드카드 서브도메인 허용", () => {
    expect(
      matchAllowedDomain("https://www.example.com", ["https://*.example.com"]),
    ).toBe(true);
    // 중첩 서브도메인도 OK
    expect(
      matchAllowedDomain("https://a.b.example.com", ["https://*.example.com"]),
    ).toBe(true);
  });

  it("와일드카드 — base 자신 제외", () => {
    expect(
      matchAllowedDomain("https://example.com", ["https://*.example.com"]),
    ).toBe(false);
  });

  it("와일드카드 — 스킴 교차 차단", () => {
    expect(
      matchAllowedDomain("http://www.example.com", ["https://*.example.com"]),
    ).toBe(false);
  });

  it("악용 벡터 — 접미사/접두사/쿼리", () => {
    // example.com.evil.com 을 example.com 로 착각시키려는 접미사 공격
    expect(
      matchAllowedDomain("https://example.com.evil.com", [
        "https://example.com",
      ]),
    ).toBe(false);
    // evil-example.com 접두사 공격
    expect(
      matchAllowedDomain("https://evil-example.com", ["https://example.com"]),
    ).toBe(false);
    // 쿼리에 화이트리스트 값을 넣어도 origin host 는 evil.com → 매칭 안 됨
    expect(
      matchAllowedDomain("https://evil.com?fake=example.com", [
        "https://example.com",
      ]),
    ).toBe(false);
  });

  it("잘못된 entry 는 조용히 skip", () => {
    expect(
      matchAllowedDomain("https://example.com", [
        "",
        "not a url",
        "https://*.*.example.com",
        "https://example.com",
      ]),
    ).toBe(true);
  });

  it("서브도메인 자동 포함 없음 — *. 명시 필요", () => {
    expect(
      matchAllowedDomain("https://www.example.com", ["https://example.com"]),
    ).toBe(false);
  });

  it("IP 스타일 와일드카드 거부 — *.192.168 / *.10.0 등", () => {
    // 숫자 레이블로만 구성된 base 는 IP 대역 오용으로 간주해 차단
    expect(matchAllowedDomain("https://1.192.168", ["https://*.192.168"])).toBe(
      false,
    );
    expect(
      matchAllowedDomain("https://host.10.0.0.1", ["https://*.10.0.0.1"]),
    ).toBe(false);
  });

  it("TLD 와일드카드 차단 — *.com / *.net 등 단일 레이블은 거부", () => {
    // *.com 등록 시 모든 .com 허용 방지 (security HIGH)
    expect(matchAllowedDomain("https://evil.com", ["https://*.com"])).toBe(
      false,
    );
    expect(matchAllowedDomain("https://attacker.net", ["https://*.net"])).toBe(
      false,
    );
    // 실수로 점 없는 값 등록 시에도 skip
    expect(
      matchAllowedDomain("https://evil.localhost", ["https://*.localhost"]),
    ).toBe(false);
  });

  it("userinfo(@) 공격 — allowedDomains 에 있어도 실 host 는 evil.com 이라 차단", () => {
    expect(
      matchAllowedDomain("https://example.com@evil.com", [
        "https://example.com",
      ]),
    ).toBe(false);
  });

  it("trailing dot entry — `https://example.com.` 도 정확 매칭 성공", () => {
    expect(
      matchAllowedDomain("https://example.com", ["https://example.com."]),
    ).toBe(true);
    // 와일드카드 base 에 trailing dot
    expect(
      matchAllowedDomain("https://www.example.com", ["https://*.example.com."]),
    ).toBe(true);
    // origin 이 trailing dot 형태라도 정확 매칭 성공
    expect(
      matchAllowedDomain("https://example.com.", ["https://example.com"]),
    ).toBe(true);
  });

  it("entry 양끝 공백은 trim — 매칭에 영향 없음", () => {
    expect(
      matchAllowedDomain("https://example.com", ["  https://example.com  "]),
    ).toBe(true);
  });
});

describe("buildCorsHeaders", () => {
  it("매칭 성공 시 Allow-Origin + Vary 반환", () => {
    const headers = buildCorsHeaders("https://www.example.com", [
      "https://*.example.com",
    ]);
    expect(headers).toEqual({
      "Access-Control-Allow-Origin": "https://www.example.com",
      Vary: "Origin",
    });
  });

  it("매칭 실패 시 Vary 만 반환 (Allow-Origin 없음)", () => {
    const headers = buildCorsHeaders("https://evil.com", [
      "https://example.com",
    ]);
    expect(headers).toEqual({ Vary: "Origin" });
  });

  it("null / 파싱 실패 origin 도 Vary 만", () => {
    expect(buildCorsHeaders(null, [])).toEqual({ Vary: "Origin" });
    expect(buildCorsHeaders("not a url", [])).toEqual({ Vary: "Origin" });
  });

  it("빈 allowedDomains (allow-all) + 유효 origin → Allow-Origin 반영", () => {
    const headers = buildCorsHeaders("https://any-site.example", []);
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://any-site.example",
    );
    expect(headers["Vary"]).toBe("Origin");
  });
});
