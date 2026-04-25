/**
 * prod 데모 봇 챗봇 smoke (Task A-5b-① + A 통합 마지막 검증).
 *
 * 검증 시나리오:
 *   1. dairect 봇 (Origin=https://dairect.kr, allowedDomains 매칭)
 *      → 사용자 메시지 → SSE 스트리밍 응답 수신 → 응답 텍스트 길이 > 0
 *      → RAG 인용 검증: 응답에 knowledge 키워드 ("hidream72@gmail.com" 또는 "포트폴리오") 포함
 *   2. dari 봇 (Origin=https://dari-theta.vercel.app, allowedDomains 매칭)
 *      → 사용자 메시지 → SSE 스트리밍 응답 수신 → 응답 텍스트 길이 > 0
 *      → RAG 인용 검증: 응답에 knowledge 키워드 ("RAG" 또는 "Anthropic" 또는 "한국어") 포함
 *
 * 외부 의존:
 *   - Vercel prod 배포 (https://dari-theta.vercel.app) — 정상 작동
 *   - Anthropic API (chat) + Gemini API (embedding for RAG) — 외부 호출 발생
 *
 * 실행:
 *   - 기본: skip (CI 자동 skip + 외부 의존 비용 회피)
 *   - 명시 실행: `RUN_PROD_CHAT_SMOKE=1 pnpm test:e2e tests/e2e/prod-chat-smoke.spec.ts --project=chromium`
 *
 * 실패 시 의미:
 *   - HTTP != 200 → withAllowedOrigin HOC 차단 또는 chat route 에러
 *   - 응답 비어있음 → streamText 또는 Anthropic API 장애
 *   - knowledge 키워드 부재 → RAG 미작동 (Gemini embedding 또는 match_knowledge_chunks RPC 장애)
 */

import { test, expect } from "@playwright/test";

const PROD_BASE_URL = "https://dari-theta.vercel.app";

const SHOULD_RUN = process.env.RUN_PROD_CHAT_SMOKE === "1";

interface ChatScenario {
  slug: string;
  origin: string;
  userMessage: string;
  expectedKeywords: string[]; // RAG 인용 검증 — 1개 이상 포함되면 PASS
}

const SCENARIOS: ChatScenario[] = [
  {
    slug: "dairect",
    origin: "https://dairect.kr",
    userMessage: "Dairect 에 의뢰하려면 어떻게 연락해야 하나요?",
    expectedKeywords: ["hidream72@gmail.com", "이메일", "포트폴리오", "의뢰"],
  },
  {
    slug: "dari",
    origin: "https://dari-theta.vercel.app",
    userMessage: "Dari 의 핵심 기능과 기술 스택을 알려주세요.",
    expectedKeywords: [
      "RAG",
      "Anthropic",
      "Claude",
      "한국어",
      "위젯",
      "임베드",
    ],
  },
];

/**
 * AI SDK UI message stream 응답 본문에서 텍스트 부분 추출.
 *
 * UIMessageStreamResponse 형식: NDJSON 스트림 (line 단위 JSON).
 * 각 line: { type: "text-delta", id, delta } / { type: "text-start" } / { type: "text-end" } /
 *          { type: "finish" } / { type: "start-step" } / etc.
 *
 * 우리는 type === "text-delta" 의 delta 필드만 누적.
 */
function extractTextFromUIStream(body: string): string {
  const lines = body.split("\n").filter((l) => l.trim());
  let accumulated = "";
  for (const line of lines) {
    // SSE prefix `data: ` 제거 가능
    const json = line.startsWith("data: ") ? line.slice(6) : line;
    if (json === "[DONE]") continue;
    try {
      const obj = JSON.parse(json);
      if (
        obj &&
        typeof obj === "object" &&
        obj.type === "text-delta" &&
        typeof obj.delta === "string"
      ) {
        accumulated += obj.delta;
      }
    } catch {
      // 파싱 실패 라인 무시 (event prefix 등)
    }
  }
  return accumulated;
}

test.describe("prod 데모 봇 챗봇 smoke", () => {
  test.skip(
    !SHOULD_RUN,
    "RUN_PROD_CHAT_SMOKE=1 환경변수로만 실행 (외부 API 비용 + prod 의존)",
  );

  // 외부 의존이라 retry 1회 + 타임아웃 60s
  test.describe.configure({ retries: 1, timeout: 60_000 });

  for (const scenario of SCENARIOS) {
    test(`${scenario.slug} 봇이 사용자 질문에 답변하며 knowledge 를 인용한다`, async ({
      request,
    }) => {
      const url = `${PROD_BASE_URL}/api/chat/${scenario.slug}`;
      const startTs = Date.now();

      const response = await request.post(url, {
        headers: {
          "Content-Type": "application/json",
          Origin: scenario.origin,
        },
        data: { message: scenario.userMessage },
      });

      const elapsed = Date.now() - startTs;
      const status = response.status();
      const body = await response.text();

      // 1. HTTP 200 응답
      expect(
        status,
        `[${scenario.slug}] HTTP ${status} (origin=${scenario.origin}). body 미리보기: ${body.slice(0, 200)}`,
      ).toBe(200);

      // 2. SSE stream 본문 비어있지 않음
      expect(
        body.length,
        `[${scenario.slug}] empty body — streamText 시작 실패 의심`,
      ).toBeGreaterThan(0);

      // 3. UIMessageStream 파싱 → 텍스트 응답 추출
      const answer = extractTextFromUIStream(body);
      console.log(
        `[${scenario.slug}] elapsed=${elapsed}ms answer.length=${answer.length}`,
      );
      console.log(
        `[${scenario.slug}] answer 미리보기: ${answer.slice(0, 300)}`,
      );

      expect(
        answer.length,
        `[${scenario.slug}] AI 응답 텍스트 비어있음 (UIMessageStream 파싱 실패 또는 모델 응답 0).\n원본 body 미리보기:\n${body.slice(0, 500)}`,
      ).toBeGreaterThan(20);

      // 4. RAG 인용 검증 — expectedKeywords 중 최소 1개 포함
      const matchedKeywords = scenario.expectedKeywords.filter((kw) =>
        answer.toLowerCase().includes(kw.toLowerCase()),
      );
      expect(
        matchedKeywords.length,
        `[${scenario.slug}] knowledge 인용 부재 — expectedKeywords ${JSON.stringify(scenario.expectedKeywords)} 중 어느 것도 응답에 미포함.\n응답 전문:\n${answer}`,
      ).toBeGreaterThan(0);

      // 5. Latency 모니터 (Vercel Pro 60s 한도 안에 들어와야)
      expect(
        elapsed,
        `[${scenario.slug}] latency ${elapsed}ms — Vercel function timeout 가능성`,
      ).toBeLessThan(45_000);
    });
  }
});
