import { z } from "zod";

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
  timezone: z.string().default("Asia/Seoul"),
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
  trigger: z.string().default("상담원 연결"),
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
  fontFamily: z.string().default("Pretendard"),
});

// ─── Analytics ───
export const analyticsSchema = z.object({
  enabled: z.boolean().default(true),
  webhookUrl: z.string().url().optional(),
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
  // 보안: 위젯 허용 도메인 화이트리스트 (Task 1-0에서 CORS 검증에 사용)
  allowedDomains: z.array(z.string().min(1)).default([]),
});

// ─── Types (타입 자동 추론 — 수동 유지 불필요) ───
export type DariConfig = z.infer<typeof dariConfigSchema>;
export type Identity = z.infer<typeof identitySchema>;
export type AIConfig = z.infer<typeof aiSchema>;
export type AIModel = z.infer<typeof aiModelSchema>;
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export type BehaviorMode = z.infer<typeof behaviorModeSchema>;
export type Behavior = z.infer<typeof behaviorSchema>;
export type Appearance = z.infer<typeof appearanceSchema>;
export type Analytics = z.infer<typeof analyticsSchema>;
