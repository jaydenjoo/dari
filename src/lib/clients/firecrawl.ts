import "server-only";

import Firecrawl from "@mendable/firecrawl-js";

import { env } from "@/shared/config/env";

/**
 * Firecrawl Cloud SDK 싱글턴 래퍼 (Task 1-7-b).
 *
 * 설계:
 *   - cold-start 재사용 — Node.js runtime 에서 요청마다 새 HttpClient 생성 회피.
 *   - `env.FIRECRAWL_API_KEY` 는 부팅 시점에 `fc-` prefix 검증됨 (env.ts) → 여기서 재검증 불필요.
 *   - v2 기본 클라이언트 (`Firecrawl` 확장 = v2 + lazy v1 access). scrape/crawl 모두 v2 사용.
 *
 * 사용:
 *   const client = getFirecrawlClient();
 *   const doc = await client.scrape(url, { formats: ["markdown"], onlyMainContent: true });
 *
 * 테스트: 호출하는 모듈 레벨에서 `vi.mock("@mendable/firecrawl-js", ...)` 로 mock.
 */

let client: Firecrawl | null = null;

export function getFirecrawlClient(): Firecrawl {
  if (!client) {
    client = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });
  }
  return client;
}
