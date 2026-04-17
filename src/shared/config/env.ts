import { z } from "zod";

/**
 * 환경변수 zod 검증 스키마 (v9.3 표준)
 *
 * 규칙:
 * - 모든 환경변수는 여기서 검증 (런타임 안전)
 * - 누락·오타 시 앱 시작 시점에 즉시 실패
 * - NEXT_PUBLIC_ 접두사는 브라우저 노출됨 (주의)
 * - 민감 정보는 NEXT_PUBLIC_ 없이 (서버 전용)
 */
const envSchema = z.object({
  // Node 환경
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // 앱 URL (Vercel Preview 배포 대응)
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000"),

  // ─── Supabase (사용 시 주석 해제) ───
  // NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  // NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  // SUPABASE_SERVICE_ROLE_KEY: z.string().min(20), // 서버 전용

  // ─── 프로젝트별 환경변수를 여기 추가 ───
});

/**
 * 파싱된 환경변수 (타입 안전)
 *
 * 사용:
 *   import { env } from "@/shared/config/env";
 *   console.log(env.NEXT_PUBLIC_APP_URL);
 *
 * 누락 시 앱 시작이 차단되므로, 런타임 `process.env.X` 직접 참조 금지.
 */
export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
