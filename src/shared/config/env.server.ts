import "server-only";

import { z } from "zod";

import { clientSchema } from "./env.client";

/**
 * 서버 전용 환경변수 — API keys / secrets / 서버 런타임 전용 설정.
 *
 * 🔒 **`"server-only"` 마커**: 이 모듈을 Client Component 에서 import 하면 Next.js
 * 빌드 단계에서 에러로 차단한다. `as ServerEnv` 런타임 캐스팅 대신 **build-time 방어**
 * 로 서버 env 누출 경로를 원천 봉쇄.
 *
 * 사용:
 *   import { env } from "@/shared/config/env.server";
 *   env.ANTHROPIC_API_KEY;              // 서버 전용 값
 *   env.NEXT_PUBLIC_WIDGET_CDN_URL;     // NEXT_PUBLIC_* 도 서버에서 접근 가능
 *
 * 규칙:
 * - Client Component 나 `"use client"` 경계 이후 파일에서 import 금지
 * - `env.client.ts` 의 clientSchema 를 상속해 NEXT_PUBLIC_* 까지 검증
 * - 누락/형식 오류 : 앱 부팅 시점에 즉시 실패 (런타임 폭탄 방지)
 */
export const serverSchema = clientSchema.extend({
  // NODE_ENV 는 런타임 플랫폼이 반드시 명시 주입해야 한다 (Next.js: dev/build/start 자동,
  // Vitest: "test" 자동, Vercel: "production" 자동). default 를 두지 않아 플랫폼 주입이
  // 누락되면 부팅이 실패(fail-fast) 하게 한다 — rate limit 같은 skip 분기 정책이
  // 무음으로 비활성화되는 사고 방지. 커스텀 런타임/Docker 직접 배포 시 명시 필수.
  NODE_ENV: z.enum(["development", "production", "test"]),

  // ─── Database (Supabase Postgres) ───
  // migration CLI 전용 — 앱 런타임은 @supabase/ssr 만 사용 (ADR-002).
  // 런타임에 참조되지 않으므로 optional. Vercel Preview/Prod 에도 등록 불요.
  DATABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // ─── AI Providers ───
  ANTHROPIC_API_KEY: z.string().startsWith("sk-"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(20),

  // ─── Rate Limiting (Upstash Redis) ───
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(20),

  // ─── Observability (dev에서는 선택) ───
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z
    .enum(["development", "preview", "production"])
    .optional(),

  // ─── Crawling (Firecrawl Cloud) ───
  // Task 1-7-b: URL 지식 업로드 파이프라인이 부팅 시점에 API 키 존재를 보증.
  // 키 누락 시 앱 실행 자체를 차단하여 크롤링 Server Action 이 런타임에 중간 실패하는
  // 경로(부분 저장)를 원천 차단. Vercel Preview/Production 환경변수 등록 필수.
  FIRECRAWL_API_KEY: z.string().startsWith("fc-"),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type Env = ServerEnv;

function summarizeFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
): string {
  return Object.entries(fieldErrors)
    .map(([field, errors]) => `${field}: ${errors?.join(", ") ?? "unknown"}`)
    .join(" | ");
}

function parseServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.error("❌ 환경변수 검증 실패 (서버):", fieldErrors);
    throw new Error(
      `Invalid server environment variables — ${summarizeFieldErrors(fieldErrors)}. See docs/env-template.md`,
    );
  }
  return parsed.data;
}

export const env: ServerEnv = parseServerEnv();
