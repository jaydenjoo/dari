import { describe, expect, it } from "vitest";
import { isPublicPath, isSafeNextPath } from "./route-policy";

describe("isPublicPath", () => {
  describe("공개 경로 (비로그인 접근 허용)", () => {
    it.each([
      ["/", "홈"],
      ["/login", "로그인 페이지"],
      ["/auth/callback", "OAuth callback"],
      ["/auth/logout", "logout action"],
      ["/auth/", "auth 루트"],
      ["/auth/anything/deep", "auth 하위 깊은 경로"],
    ])("%s (%s) 는 공개", (pathname) => {
      expect(isPublicPath(pathname)).toBe(true);
    });
  });

  describe("보호 경로 (로그인 필요)", () => {
    it.each([
      ["/bots", "봇 목록"],
      ["/bots/123", "개별 봇"],
      ["/settings", "설정"],
      ["/admin/users", "관리자"],
      ["/login/extra", "/login 의 하위 경로 — exact 매치만 공개"],
      ["/loginx", "/login 접두어이지만 다른 경로"],
      ["/authx/callback", "/auth/ 가 아닌 다른 접두어"],
    ])("%s (%s) 는 보호", (pathname) => {
      expect(isPublicPath(pathname)).toBe(false);
    });
  });

  it("빈 문자열은 공개로 취급되지 않는다 (방어적)", () => {
    expect(isPublicPath("")).toBe(false);
  });
});

describe("isSafeNextPath", () => {
  describe("허용 (absolute path + query)", () => {
    it.each([
      ["/", "루트"],
      ["/bots", "봇 목록"],
      ["/bots?tab=active", "쿼리스트링 포함"],
      ["/bots/123", "동적 세그먼트"],
      ["/bots/123?filter=a&sort=name", "복수 쿼리"],
      ["/settings#section", "해시 포함"],
      ["/api/internal", "api 경로도 문자열로는 안전"],
    ])("%s (%s) 는 안전", (value) => {
      expect(isSafeNextPath(value)).toBe(true);
    });
  });

  describe("차단 (open redirect / XSS 벡터)", () => {
    it.each([
      ["//evil.com/path", "protocol-relative URL"],
      ["//evil.com", "도메인만"],
      ["/\\evil.com", "백슬래시 — 구형 브라우저에서 //로 해석"],
      ["/@evil.com/path", "userinfo 해석 가능"],
      ["javascript:alert(1)", "javascript URI"],
      ["data:text/html,<script>alert(1)</script>", "data URI"],
      ["https://evil.com", "절대 외부 URL"],
      ["bots", "상대 경로 (/ 시작 안 함)"],
      ["", "빈 문자열"],
    ])("%s (%s) 는 차단", (value) => {
      expect(isSafeNextPath(value)).toBe(false);
    });

    it("2000자 초과는 차단", () => {
      const tooLong = "/" + "a".repeat(2001);
      expect(isSafeNextPath(tooLong)).toBe(false);
    });

    it("비문자열(null/undefined/object/숫자)은 차단", () => {
      expect(isSafeNextPath(null)).toBe(false);
      expect(isSafeNextPath(undefined)).toBe(false);
      expect(isSafeNextPath({ path: "/bots" })).toBe(false);
      expect(isSafeNextPath(42)).toBe(false);
    });
  });
});
