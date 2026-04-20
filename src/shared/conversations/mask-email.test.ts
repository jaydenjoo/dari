import { describe, expect, it } from "vitest";

import { maskEmail } from "./mask-email";

describe("maskEmail", () => {
  it("일반 (local 2자 이상): 앞 2자 + `***` + 도메인", () => {
    expect(maskEmail("alice@example.com")).toBe("al***@example.com");
    expect(maskEmail("bob@test.co.kr")).toBe("bo***@test.co.kr");
    expect(maskEmail("hidream72@gmail.com")).toBe("hi***@gmail.com");
  });

  it("local 1자: 원자 미노출 — `***@domain`", () => {
    expect(maskEmail("a@example.com")).toBe("***@example.com");
  });

  it("`@` 없음: 완전 마스킹 `***` (atIdx < 0 분기)", () => {
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });

  it("`@` 로 시작 (atIdx = 0): `***` — local 0자", () => {
    expect(maskEmail("@example.com")).toBe("***");
  });

  it("local 정확히 2자: `ab***@domain`", () => {
    expect(maskEmail("ab@x.com")).toBe("ab***@x.com");
  });
});
