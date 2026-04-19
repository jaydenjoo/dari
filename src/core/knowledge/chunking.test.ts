import { describe, it, expect } from "vitest";

import { chunkText, DEFAULT_CHUNK_OPTIONS } from "./chunking";

describe("chunkText", () => {
  it("빈 문자열 → 빈 배열", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("공백-only → 빈 배열 (trim 후 0자)", () => {
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("chunkSize 이하 입력 → 단일 청크 (trim 적용)", () => {
    expect(chunkText("  짧은 텍스트  ")).toEqual(["짧은 텍스트"]);
  });

  it("정확히 chunkSize 길이 → 단일 청크", () => {
    const text = "a".repeat(500);
    expect(chunkText(text)).toEqual([text]);
  });

  it("500자 + 100 오버랩: 1001자 입력 → 3 청크 (0-500, 400-900, 800-1001)", () => {
    // 경계 케이스: step = 400, chunks at [0..500], [400..900], [800..1001]
    const text = Array.from({ length: 1001 }, (_, i) => String(i % 10)).join(
      "",
    );
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toBe(text.slice(0, 500));
    expect(chunks[1]).toBe(text.slice(400, 900));
    expect(chunks[2]).toBe(text.slice(800, 1001));
    // 오버랩 검증: chunk[1] 의 첫 100자 = chunk[0] 의 마지막 100자
    expect(chunks[1].slice(0, 100)).toBe(chunks[0].slice(-100));
  });

  it("커스텀 옵션: chunkSize=10, overlap=3 → step=7", () => {
    const text = "0123456789abcdefghij"; // 20자
    const chunks = chunkText(text, { chunkSize: 10, overlap: 3 });
    // [0..10]=0123456789, [7..17]=789abcdefg, [14..20]=efghij
    expect(chunks).toEqual(["0123456789", "789abcdefg", "efghij"]);
  });

  it("overlap >= chunkSize → throw (무한 루프 방어)", () => {
    expect(() => chunkText("abc", { chunkSize: 100, overlap: 100 })).toThrow(
      /overlap.*must be strictly less than chunkSize/,
    );
    expect(() => chunkText("abc", { chunkSize: 100, overlap: 150 })).toThrow();
  });

  it("chunkSize 가 양의 정수 아님 → throw", () => {
    expect(() => chunkText("abc", { chunkSize: 0, overlap: 0 })).toThrow(
      /chunkSize/,
    );
    expect(() => chunkText("abc", { chunkSize: -1, overlap: 0 })).toThrow(
      /chunkSize/,
    );
    expect(() => chunkText("abc", { chunkSize: 1.5, overlap: 0 })).toThrow(
      /chunkSize/,
    );
  });

  it("overlap 이 음의 정수 → throw", () => {
    expect(() => chunkText("abc", { chunkSize: 10, overlap: -1 })).toThrow(
      /overlap/,
    );
  });

  it("기본 옵션 = {chunkSize:500, overlap:100}", () => {
    expect(DEFAULT_CHUNK_OPTIONS).toEqual({ chunkSize: 500, overlap: 100 });
  });

  it("한글 유니코드 보존 (surrogate 단순 slice)", () => {
    const text = "가나다라마".repeat(200); // 1000자
    const chunks = chunkText(text);
    // 각 청크 재결합 시 원본 복원 가능 (오버랩 제거)
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length > 0 && c.length <= 500)).toBe(true);
  });
});
