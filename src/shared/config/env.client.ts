import { z } from "zod";

/**
 * 클라이언트(브라우저 번들) 환경변수 — NEXT_PUBLIC_* 만.
 *
 * 🔒 **보안 경계**: 이 파일에 있는 값만 브라우저에 노출된다. 서버 전용 키
 * (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY 등) 는 `env.server.ts` 에 격리되어
 * `"server-only"` 마커로 클라 번들 침투를 **build-time 에 차단**한다.
 *
 * 사용:
 *   import { env } from "@/shared/config/env.client";
 *   env.NEXT_PUBLIC_APP_URL;  // 브라우저 / Server Component 양쪽 안전
 *
 * 규칙:
 * - NEXT_PUBLIC_* 접두사 필수 (Next.js 빌드 타임 인라인 규약)
 * - 민감 정보 절대 금지 — 브라우저 소스 뷰로 누구나 조회 가능
 * - 누락/형식 오류 : 앱 부팅 시점에 즉시 실패 (런타임 폭탄 방지)
 */
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
  // 위젯 스크립트 CDN URL — ADR-009 γ 경로.
  // 기본값: 테스트 단계 Vercel 호스팅 (`dari-theta.vercel.app`).
  // 10군데 업체 테스트 완료 후 커스텀 도메인(`dairect.kr`) 연결 시 env 만 교체.
  // `/bots/[slug]` 설치 스니펫에 URL 그대로 인라인되므로 민감 정보 아님 (공개 의도).
  //
  // **https:// 강제** (sec C-1 2026-04-21): `z.string().url()` 만으로는
  // `javascript:` / `data:` / `http://` / `ftp://` 가 통과. 이 값이 고객사 HTML 의
  // `<script src="...">` 로 inline 되므로 Vercel Dashboard 실수·내부자 위협으로
  // 악성 스킴 주입 시 위젯 embed 한 전 고객사에 XSS/공급망 공격. `.refine()` 으로 차단.
  NEXT_PUBLIC_WIDGET_CDN_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith("https://"), {
      message:
        "위젯 CDN URL 은 https:// 로 시작해야 합니다 (javascript:/data:/http:/ftp: 거부)",
    })
    .default("https://dari-theta.vercel.app/widget.js"),
});

export type ClientEnv = z.infer<typeof clientSchema>;
export type PublicEnv = ClientEnv;

function summarizeFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
): string {
  return Object.entries(fieldErrors)
    .map(([field, errors]) => `${field}: ${errors?.join(", ") ?? "unknown"}`)
    .join(" | ");
}

const isServer = typeof window === "undefined";

function parseClientEnv(): ClientEnv {
  // 🔑 핵심: `env.server.ts` 가 `clientSchema` 를 extend 하므로 서버 파일 import 체인에서
  // `env.client.ts` 도 함께 평가된다. 서버 환경에서는 `env.server.env` 가 진실의 원천이므로,
  // 이 모듈의 `env` 는 사용되지 않는다 (client-browser.ts 는 "use client" 경계 이후에만 활성).
  // 따라서 서버에서는 process.env 검증을 skip 하고, 브라우저에서만 실제 검증을 수행한다.
  if (isServer) {
    // 빈 객체로 default 필드만 채움. required 필드 (SUPABASE URL/ANON) 는 서버 env 에서 검증.
    const parsed = clientSchema.safeParse({});
    return parsed.success ? parsed.data : ({} as ClientEnv);
  }

  // 브라우저: NEXT_PUBLIC_* 는 Next.js 가 빌드 타임에 인라인. 명시 선별 검증.
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_WIDGET_CDN_URL: process.env.NEXT_PUBLIC_WIDGET_CDN_URL,
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

export const env: ClientEnv = parseClientEnv();
