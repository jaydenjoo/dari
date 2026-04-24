import { z } from "zod";

import { isValidOriginEntry } from "@/core/security/origin-check";

/**
 * Dari Config 스키마 — "챗봇의 정체성"을 결정하는 단일 진실 공급원
 *
 * 설계 원칙:
 * - P1 안정성: 잘못된 Config는 부팅 시점에 즉시 실패 (런타임 폭탄 방지)
 * - P2 유지보수: `version` 필드로 미래 스키마 변경 대비 (→ migrations.ts)
 * - P3 확장성: behavior.mode / knowledge.sources 는 확장 가능한 discriminated union
 *
 * 사용:
 *   import { dariConfigSchema, type DariConfig } from "@/core/config";
 *   const config = dariConfigSchema.parse(rawJson);
 */

// ─── Identity ───
export const identitySchema = z.object({
  name: z.string().min(1).max(50),
  avatar: z.string().url().optional(),
  welcomeMessage: z.string().min(1).max(500),
  placeholder: z.string().max(100).default("질문을 입력하세요..."),
  language: z.enum(["ko", "en", "ja", "zh"]).default("ko"),
});

// ─── AI ───
export const aiModelSchema = z.enum([
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5",
]);

export const aiSchema = z.object({
  model: aiModelSchema.default("claude-sonnet-4-6"),
  systemPrompt: z.string().min(10).max(8000),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(64).max(8192).default(1024),
  ragEnabled: z.boolean().default(true),
});

// ─── Knowledge Sources (discriminated union — 확장 가능) ───
export const urlSourceSchema = z.object({
  type: z.literal("url"),
  urls: z.array(z.string().url()).min(1).max(50),
  recrawlInterval: z.enum(["never", "daily", "weekly"]).default("never"),
});

export const fileSourceSchema = z.object({
  type: z.literal("file"),
  files: z.array(z.string().min(1)).min(1).max(50),
  // Task 1-7-d: Storage 파일 경로 추적 — 삭제 시 정확한 파일 제거용.
  // optional — 1-7-c 초기 저장 데이터(storagePaths 없음) 호환. 신규 저장부터 채워짐.
  // 삭제 오케스트레이션은 storagePaths 없으면 best-effort skip (chunks/sources 만 삭제).
  //
  // 포맷 강제 (sec review LOW-1): `{bot_id UUID}/{file UUID}.{pdf|txt|md}`.
  //   - Storage RLS 0010 이 `storage.foldername(name)[1] = bot_id` 로 owner 격리.
  //   - 스키마 자체에 regex 를 걸어 "임의 문자열 삽입" 경로를 DB 레벨에서 차단.
  //   - 정확한 UUID 시간복잡도 대신 hex+hyphen 32~40자 범위로 느슨하게 받아 uuid v1/v4/nil 등
  //     Postgres gen_random_uuid() 출력 전반과 호환.
  storagePaths: z
    .array(
      z.string().regex(/^[0-9a-f-]{32,40}\/[0-9a-f-]{32,40}\.(pdf|txt|md)$/i),
    )
    .max(50)
    .optional(),
});

export const textSourceSchema = z.object({
  type: z.literal("text"),
  title: z.string().max(100).optional(),
  content: z.string().min(10).max(100_000),
});

export const knowledgeSourceSchema = z.discriminatedUnion("type", [
  urlSourceSchema,
  fileSourceSchema,
  textSourceSchema,
]);

export const knowledgeSchema = z.object({
  sources: z.array(knowledgeSourceSchema).default([]),
});

// ─── Behavior ───
export const behaviorModeSchema = z.enum([
  "support",
  "sales",
  "faq",
  "coaching",
]);

export const businessHoursSchema = z.object({
  enabled: z.boolean().default(false),
  // IANA timezone 형식 (예: Asia/Seoul, America/Argentina/Buenos_Aires, UTC, Etc/GMT+9).
  // Phase 2 위젯에서 `new Intl.DateTimeFormat(locale, { timeZone })` 사용 시
  // invalid 입력으로 인한 런타임 에러 방어 (security L-2).
  // `+`, `-` 허용은 `Etc/GMT+9` 같은 IANA 유효 존 거부 방지 (재리뷰 LOW 반영).
  timezone: z
    .string()
    .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/, {
      message: "유효한 시간대를 입력하세요 (예: Asia/Seoul, UTC).",
    })
    .default("Asia/Seoul"),
  hours: z
    .string()
    .regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, {
      message: "형식: HH:MM-HH:MM (예: 09:00-18:00)",
    })
    .default("09:00-18:00"),
  offHoursMessage: z
    .string()
    .max(500)
    .default("현재 업무 시간이 아닙니다. 남겨주시면 익일 답변드리겠습니다."),
});

export const handoffSchema = z.object({
  enabled: z.boolean().default(false),
  // JSONB 저장 크기 + 위젯 렌더링 방어 위해 최대 길이 제한 (security L-3).
  trigger: z.string().max(200).default("상담원 연결"),
  channel: z.enum(["kakao", "email", "slack", "none"]).default("none"),
});

export const behaviorSchema = z.object({
  mode: behaviorModeSchema.default("support"),
  fallbackMessage: z
    .string()
    .max(500)
    .default("죄송합니다. 이 질문에 대해서는 담당자에게 연결해드리겠습니다."),
  collectEmail: z.boolean().default(false),
  collectEmailPrompt: z.string().max(200).optional(),
  businessHours: businessHoursSchema.default(businessHoursSchema.parse({})),
  handoff: handoffSchema.default(handoffSchema.parse({})),
});

// ─── Appearance ───
export const themeSchema = z.enum(["light", "dark", "auto"]);
export const positionSchema = z.enum([
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
]);

export const appearanceSchema = z.object({
  theme: themeSchema.default("light"),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { message: "Hex 색상 형식 (예: #2b7cff)" })
    .default("#2b7cff"),
  position: positionSchema.default("bottom-right"),
  buttonSize: z.number().int().min(40).max(80).default(56),
  borderRadius: z.number().int().min(0).max(32).default(16),
  // CSS 주입 방어: 위젯 런타임이 `style="font-family: ${value}"` 형태로 주입할 때
  // `\w\s,'-` 외 문자는 CSS 이스케이프 공격 경로가 될 수 있음 (security L-1).
  // 다국어 폰트 이름(한글 등)은 Phase 2 위젯 전용 escaping 이 설계된 뒤 재평가.
  fontFamily: z
    .string()
    .max(100)
    .regex(/^[\w\s,'-]+$/, {
      message: "영문·숫자·공백·쉼표·따옴표·하이픈만 사용할 수 있어요.",
    })
    .default("Pretendard"),
});

// ─── Analytics ───
/**
 * webhookUrl SSRF 방어 (security M-1, 재리뷰 CRITICAL 반영).
 *
 * Phase 2 이후 봇 런타임이 이 URL 로 실제 HTTP 요청을 보낸다. 내부망/메타데이터
 * 서비스 접근을 차단하기 위해 값이 있을 때만 아래 제약을 적용한다:
 *   - https 만 허용 (http/file/ftp 차단)
 *   - IPv4 사설/loopback: 10/8, 172.16/12, 192.168/16, 169.254/16 (link-local), 127/8
 *   - IPv6 사설/loopback: ::1, fc00::/7 (ULA), fe80::/10 (link-local),
 *     ::ffff:0:0/96 (IPv4-mapped — 우회 차단)
 *   - hostname blocklist: localhost / 0.0.0.0
 *
 * 한계 (Phase 2 백로그):
 *   - DNS rebinding 은 fetch 시점 dns.lookup 재검증으로만 차단 가능.
 *   - 단축/8진/16진 IPv4 표기는 Node URL 이 `hostname` 으로 보존 (정규화 X) —
 *     아래 isPrivateIPv4 패턴은 십진 점표기만 검사하므로, 비십진 표기는
 *     통과 후 fetch 시점에 차단해야 한다. (Phase 2 IP normalization 필요)
 */
function isPrivateIPv4(host: string): boolean {
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

function isPrivateIPv6(inner: string): boolean {
  // inner 는 [] 가 제거된 ipv6 hostname (이미 lowercase).
  if (inner === "::1") return true;
  if (inner === "::") return true;
  // ULA: fc00::/7 (fc__, fd__)
  if (/^f[cd]/.test(inner)) return true;
  // link-local: fe80::/10 (fe8_, fe9_, fea_, feb_)
  if (/^fe[89ab]/.test(inner)) return true;
  // IPv4-mapped IPv6: ::ffff:x.x.x.x — 사설 IPv4 우회 경로
  const v4mapped = inner.match(/^::ffff:([0-9.]+)$/);
  if (v4mapped) {
    const ipv4 = v4mapped[1];
    return isPrivateIPv4(ipv4) || ipv4 === "0.0.0.0" || /^127\./.test(ipv4);
  }
  // 16진 IPv4-mapped IPv6 도 같이: ::ffff:7f00:1 등
  if (/^::ffff:[0-9a-f]+:[0-9a-f]+$/.test(inner)) return true;
  return false;
}

function isSafeExternalWebhook(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  // hostname 은 환경에 따라 IPv6 일 때 `[::1]` 또는 `::1` 둘 다 가능 — 브라켓 제거.
  const raw = parsed.hostname.toLowerCase();
  const host = raw.replace(/^\[|\]$/g, "");

  // hostname 단순 blocklist.
  if (["localhost", "0.0.0.0"].includes(host)) return false;

  // IPv6 (콜론 포함) 검사 — IPv4-mapped 우회 차단 포함.
  if (host.includes(":")) {
    if (isPrivateIPv6(host)) return false;
    return true;
  }

  // IPv4 점표기 검사. (8진/16진/단축 표기는 Phase 2 fetch 레이어에서 추가 차단 필요)
  if (isPrivateIPv4(host)) return false;

  return true;
}

export const analyticsSchema = z.object({
  enabled: z.boolean().default(true),
  webhookUrl: z
    .string()
    .url()
    .refine(isSafeExternalWebhook, {
      message: "외부 HTTPS URL 만 허용됩니다. (내부망/localhost 차단)",
    })
    .optional(),
});

// ─── 최상위 Config ───
export const CURRENT_CONFIG_VERSION = "1.0" as const;

export const dariConfigSchema = z.object({
  botId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, {
    message:
      "botId는 소문자/숫자/하이픈만 (3~64자, 첫/끝은 영숫자). 예: chatsio-support",
  }),
  version: z.literal(CURRENT_CONFIG_VERSION).default(CURRENT_CONFIG_VERSION),
  identity: identitySchema,
  ai: aiSchema,
  knowledge: knowledgeSchema.default(knowledgeSchema.parse({})),
  behavior: behaviorSchema.default(behaviorSchema.parse({})),
  appearance: appearanceSchema.default(appearanceSchema.parse({})),
  analytics: analyticsSchema.default(analyticsSchema.parse({})),
  // 보안: 위젯 허용 도메인 화이트리스트 (Task 1-0에서 CORS 검증에 사용).
  // Task β-4: entry 포맷 refine 추가 — 잘못된 entry 가 config 에 저장되는 경로 차단.
  // 허용: `https://example.com` / `https://*.example.com` / `http://localhost:3000`.
  // 차단: 빈 문자열 / 스킴 누락 / http+외부 / *.com (TLD 단독) / IP-style / 다중 와일드카드.
  allowedDomains: z
    .array(
      z.string().min(1).refine(isValidOriginEntry, {
        message:
          "올바른 origin 형식이 아닙니다 (예: https://example.com 또는 https://*.example.com)",
      }),
    )
    .default([]),
});

// ─── Types (타입 자동 추론 — 수동 유지 불필요) ───
export type DariConfig = z.infer<typeof dariConfigSchema>;
export type Identity = z.infer<typeof identitySchema>;
export type AIConfig = z.infer<typeof aiSchema>;
export type AIModel = z.infer<typeof aiModelSchema>;
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export type Knowledge = z.infer<typeof knowledgeSchema>;
export type BehaviorMode = z.infer<typeof behaviorModeSchema>;
export type Behavior = z.infer<typeof behaviorSchema>;
export type Appearance = z.infer<typeof appearanceSchema>;
export type Analytics = z.infer<typeof analyticsSchema>;
