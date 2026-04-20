import { describe, expect, it } from "vitest";

import { visitorLabelOf } from "./visitor";

describe("visitorLabelOf", () => {
  it("email 있음 — 마스킹된 이메일을 최우선 반환", () => {
    expect(visitorLabelOf({ user_id: "u1", email: "alice@example.com" })).toBe(
      "al***@example.com",
    );
  });

  it("email 없음 + user_id 있음 — `로그인 방문자`", () => {
    expect(visitorLabelOf({ user_id: "u1", email: null })).toBe(
      "로그인 방문자",
    );
  });

  it("email / user_id 둘 다 없음 — `익명 방문자`", () => {
    expect(visitorLabelOf({ user_id: null, email: null })).toBe("익명 방문자");
  });

  it("빈 문자열 email 은 falsy — user_id 로 fallback", () => {
    // `""` 은 falsy → maskEmail 호출 안 됨 → user_id 분기 도달.
    expect(visitorLabelOf({ user_id: "u1", email: "" })).toBe("로그인 방문자");
  });

  it("extra 필드가 있어도 구조적 typing 으로 수용 (호출자 DB row 직접 전달)", () => {
    const row = {
      user_id: null,
      email: "xy@y.z",
      visitor_id: "v-123",
      created_at: "2026-04-20T10:00:00Z",
    };
    expect(visitorLabelOf(row)).toBe("xy***@y.z");
  });
});
