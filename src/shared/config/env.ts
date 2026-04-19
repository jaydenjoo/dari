import { z } from "zod";

/**
 * 환경변수 Zod 검증 스키마 (Dari)
 *
 * 사용법:
 *   // 서버 전용 (API Route, Server Component, Server Action)
 *   import { env } from "@/shared/config/env";
 *   env.ANTHROPIC_API_KEY;  // 서버 전용 값 접근 가능
 *
 *   // 클라이언트에서도 안전 (NEXT_PUBLIC_*만 노출)
 *   import { env } from "@/shared/config/env";
 *   env.NEXT_PUBLIC_APP_URL;
 *
 * 규칙:
 * - NEXT_PUBLIC_* : 브라우저 번들에 포함됨 → 민감 정보 절대 금지
 * - 나머지        : 서버 전용, 클라이언트 번들에서 자동 제거됨
 * - 누락/형식 오류 : 앱 부팅 시점에 즉시 실패 (런타임 폭탄 방지)
 */

// 클라이언트 안전 (브라우저에 노출됨 — 민감 정보 포함 금지)
export const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:4000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  // 브라우저 Sentry 이벤트 `environment` 태그. `NEXT_PUBLIC_*` 접두사 필수 —
  // 빌드 타임 인라인이므로 Vercel Preview/Production 각각 등록 (docs/environments.md §7).
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
    .enum(["development", "preview", "production"])
    .optional(),
});

// 서버 전용 (API keys, secrets)
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

  // ─── Crawling (Firecrawl, 실패 시 cheerio 폴백) ───
  FIRECRAWL_API_KEY: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

const isServer = typeof window === "undefined";

function summarizeFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
): string {
  return Object.entries(fieldErrors)
    .map(([field, errors]) => `${field}: ${errors?.join(", ") ?? "unknown"}`)
    .join(" | ");
}

function parseEnv(): ServerEnv | ClientEnv {
  if (isServer) {
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

  // 클라이언트: NEXT_PUBLIC_* 만 검증 (나머지는 빌드 시 제거됨)
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  });
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.error("❌ 환경변수 검증 실패 (클라이언트):", fieldErrors);
    throw new Error(
      `Invalid client environment variables — ${summarizeFieldErrors(fieldErrors)}. See docs/env-template.md`,
    );
  }
  return parsed.data;
}

export const env = parseEnv() as ServerEnv;

export type Env = ServerEnv;
export type PublicEnv = ClientEnv;
