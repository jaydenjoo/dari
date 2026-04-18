import { describe, it, expect } from "vitest";

import { isValidSlug, slugify } from "./slug-util";

describe("slugify", () => {
  it("영문 이름을 소문자+하이픈 slug 로 변환", () => {
    expect(slugify("My Bot")).toBe("my-bot");
    expect(slugify("Customer Support")).toBe("customer-support");
  });

  it("특수문자를 하이픈으로 치환하고 중복 하이픈을 압축", () => {
    expect(slugify("hello!!world")).toBe("hello-world");
    expect(slugify("foo.bar@baz")).toBe("foo-bar-baz");
    expect(slugify("a---b")).toBe("a-b");
  });

  it("앞/뒤 하이픈 및 공백 제거", () => {
    expect(slugify("-hello-")).toBe("hello");
    expect(slugify("  my bot  ")).toBe("my-bot");
  });

  it("한글만 있으면 빈 문자열 반환 (사용자 직접 입력 유도)", () => {
    expect(slugify("나의 봇")).toBe("");
    expect(slugify("안녕")).toBe("");
  });

  it("한글+영문 혼합은 영문만 남음", () => {
    expect(slugify("내 bot")).toBe("bot");
  });

  it("64자 초과는 잘라내고 잘린 끝의 하이픈을 제거", () => {
    expect(slugify("a".repeat(70))).toBe("a".repeat(64));
    const trailing = "a".repeat(63) + "-bcdef";
    expect(slugify(trailing).endsWith("-")).toBe(false);
    expect(slugify(trailing).length).toBeLessThanOrEqual(64);
  });
});

describe("isValidSlug", () => {
  it("유효한 slug 통과", () => {
    expect(isValidSlug("my-bot")).toBe(true);
    expect(isValidSlug("abc")).toBe(true);
    expect(isValidSlug("a".repeat(64))).toBe(true);
    expect(isValidSlug("bot-123")).toBe(true);
  });

  it("2자 이하 거부", () => {
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });

  it("대문자 / 공백 / 언더스코어 / 마침표 거부", () => {
    expect(isValidSlug("My-Bot")).toBe(false);
    expect(isValidSlug("my bot")).toBe(false);
    expect(isValidSlug("my_bot")).toBe(false);
    expect(isValidSlug("my.bot")).toBe(false);
  });

  it("하이픈으로 시작/끝 거부", () => {
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("abc-")).toBe(false);
  });

  it("65자 이상 거부", () => {
    expect(isValidSlug("a".repeat(65))).toBe(false);
  });
});
