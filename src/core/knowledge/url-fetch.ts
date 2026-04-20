import "server-only";

import { z } from "zod";

import { getFirecrawlClient } from "@/lib/clients/firecrawl";
import { logger } from "@/core/logging";

/**
 * URL 지식 소스 수집 (Task 1-7-b).
 *
 * 흐름: 입력 URL → Firecrawl scrape → markdown 추출 → 크기 가드 → 호출자에게 반환.
 * 호출자(ingest-url.ts)가 sanitize → chunk → embed → RPC 로 이어받는다.
 *
 * 보안:
 *   - URL 검증은 `knowledgeUrlSchema` 단일 출처 (http/https + 길이 상한).
 *   - 응답 바이트 상한(200KB) → 스토리지/임베딩 비용 폭발 방어.
 *   - 에러 throw 메시지는 static identifier(`"URL 처리 실패"`) 만 — Firecrawl 내부
 *     메시지(4xx/5xx payload, SdkError.details) 가 상위 catch 누락 시 응답에 새지 않도록.
 *     내부 상세는 `logger.error` 메타에 단일 출처로 기록.
 *
 * source_identifier 매핑: DB knowledge_chunks.source_identifier CHECK (1~500자) 제약에
 * 정합하도록 URL 상한도 500자로 좁힌다. (실 운영 URL 중 500자 초과는 극히 드물며,
 * 대부분은 쿼리스트링 비대한 SPA 패턴 — 지식 원본 후보 아님.)
 */

export const MAX_URL_LENGTH = 500;
export const MAX_MARKDOWN_BYTES = 200 * 1024; // 200KB
const SCRAPE_TIMEOUT_MS = 30_000;

export const knowledgeUrlSchema = z
  .string()
  .trim()
  .min(1, { message: "URL 을 입력해주세요." })
  .max(MAX_URL_LENGTH, {
    message: `URL 은 ${MAX_URL_LENGTH}자 이하여야 해요.`,
  })
  .refine(
    (s) => {
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "http 또는 https 주소만 지원해요." },
  );

export type FetchUrlResult = Readonly<{
  // sanitize 전·크기 상한으로 절단된 markdown.
  markdown: string;
  // Firecrawl 이 리다이렉트 추적 후 응답에 기록한 최종 URL (없으면 입력값 유지).
  sourceUrl: string;
  // 200KB 초과로 절단되었는지.
  truncated: boolean;
  // 원본 markdown 바이트 수 (로깅 / 추후 분석용).
  originalBytes: number;
}>;

/**
 * UTF-8 안전하게 바이트 단위 절단.
 * Buffer.subarray 로 자르면 마지막 코드 포인트가 깨져 U+FFFD 로 변할 수 있음 → 꼬리에
 * 연속된 replacement character 만 제거하여 사람이 읽을 수 있는 끝점을 보장.
 */
function truncateToBytes(input: string, maxBytes: number): string {
  const buf = Buffer.from(input, "utf8").subarray(0, maxBytes);
  return buf.toString("utf8").replace(/\uFFFD+$/u, "");
}

/**
 * 로깅 시 URL 의 쿼리스트링/해시를 제거하여 인라인 토큰 노출을 차단.
 * Pino redact 는 **필드명** 기반이라 `url` 문자열 내부의 `?access_token=...` 같은 인라인
 * 시크릿을 감지 못 한다. `new URL().origin + pathname` 으로 축소하여 Sentry/로그에 기록.
 * 파싱 실패 시 `"(invalid-url)"` 반환 (내부 값 유출 방지).
 * security review LOW, 2026-04-20.
 */
export function sanitizeUrlForLog(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "(invalid-url)";
  }
}

export async function fetchUrlAsMarkdown(url: string): Promise<FetchUrlResult> {
  let doc;
  try {
    const client = getFirecrawlClient();
    doc = await client.scrape(url, {
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: SCRAPE_TIMEOUT_MS,
    });
  } catch (err) {
    logger.error(
      { err, url: sanitizeUrlForLog(url) },
      "Firecrawl scrape 실패 — 네트워크/4xx/5xx/timeout",
    );
    throw new Error("URL 처리 실패");
  }

  const markdown = typeof doc.markdown === "string" ? doc.markdown : "";
  if (markdown.trim().length === 0) {
    logger.warn(
      { url: sanitizeUrlForLog(url), statusCode: doc.metadata?.statusCode },
      "Firecrawl scrape markdown 이 비어있음 — 빈 페이지/JS-only/차단 가능",
    );
    throw new Error("URL 처리 실패");
  }

  const originalBytes = Buffer.byteLength(markdown, "utf8");
  const truncated = originalBytes > MAX_MARKDOWN_BYTES;
  const finalMarkdown = truncated
    ? truncateToBytes(markdown, MAX_MARKDOWN_BYTES)
    : markdown;

  if (truncated) {
    logger.warn(
      {
        url: sanitizeUrlForLog(url),
        originalBytes,
        maxBytes: MAX_MARKDOWN_BYTES,
      },
      "크롤링 markdown 200KB 초과 — 절단 후 계속",
    );
  }

  const sourceUrl =
    typeof doc.metadata?.sourceURL === "string" && doc.metadata.sourceURL
      ? doc.metadata.sourceURL
      : url;

  return {
    markdown: finalMarkdown,
    sourceUrl,
    truncated,
    originalBytes,
  };
}
