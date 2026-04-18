"use server";

import { redirect } from "next/navigation";

import { dariConfigSchema, type DariConfig } from "@/core/config";
import { createClient } from "@/core/db/client-server";
import type { Database } from "@/core/db/types";
import { logger } from "@/core/logging";

import { isValidSlug } from "../../new/slug-util";

type BotUpdate = Database["public"]["Tables"]["bots"]["Update"];
type BotConfigRow = { config: DariConfig };

export type UpdateBotFormState = {
  // 폼 전체 또는 시스템 단의 에러.
  error?: string;
  // 필드 단위 검증 에러. key 는 dot path (예: "identity.name", "behavior.businessHours.hours").
  fieldErrors?: Record<string, string>;
};

/**
 * 폼 입력값(flat dot-name FormData)을 DariConfig 입력 객체로 빌드한다.
 *
 * 처리 규칙:
 *   - empty string 인 optional 필드는 undefined 로 변환.
 *     → Zod 4.x 의 `.default()` 는 `undefined` 입력에 default 를 정상 적용하므로
 *       `z.string().default("X")` 필드에 undefined 를 보내도 default("X") 로 채워진다.
 *       (참고: schema.test.ts 의 "최소 입력" 테스트가 이 전제를 검증함)
 *   - checkbox(boolean) 는 미수신(null) = false, 수신 = true.
 *   - number 필드는 Number() 변환. 비숫자/공백은 fallback (Zod default 와 동일).
 *
 * 참고: botId 는 폼에서 받지 않고 외부에서 주입 (slug = botId 단일 출처).
 *       knowledge.sources / allowedDomains 는 서버에서 기존 값 보존 (아래 5. 단계).
 */
function buildConfigInput(
  fd: FormData,
  botId: string,
): Record<string, unknown> {
  const str = (k: string): string => String(fd.get(k) ?? "").trim();
  const optStr = (k: string): string | undefined => str(k) || undefined;
  const num = (k: string, fallback: number): number => {
    const v = fd.get(k);
    if (v === null || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const bool = (k: string): boolean => fd.get(k) !== null;

  return {
    botId,
    // version 은 Zod default 로 자동.
    identity: {
      name: str("identity.name"),
      avatar: optStr("identity.avatar"),
      welcomeMessage: str("identity.welcomeMessage"),
      placeholder: optStr("identity.placeholder"),
      language: optStr("identity.language"),
    },
    ai: {
      model: optStr("ai.model"),
      systemPrompt: str("ai.systemPrompt"),
      temperature: num("ai.temperature", 0.7),
      maxTokens: num("ai.maxTokens", 1024),
      ragEnabled: bool("ai.ragEnabled"),
    },
    behavior: {
      mode: optStr("behavior.mode"),
      fallbackMessage: optStr("behavior.fallbackMessage"),
      collectEmail: bool("behavior.collectEmail"),
      collectEmailPrompt: optStr("behavior.collectEmailPrompt"),
      businessHours: {
        enabled: bool("behavior.businessHours.enabled"),
        timezone: optStr("behavior.businessHours.timezone"),
        hours: optStr("behavior.businessHours.hours"),
        offHoursMessage: optStr("behavior.businessHours.offHoursMessage"),
      },
      handoff: {
        enabled: bool("behavior.handoff.enabled"),
        trigger: optStr("behavior.handoff.trigger"),
        channel: optStr("behavior.handoff.channel"),
      },
    },
    appearance: {
      theme: optStr("appearance.theme"),
      primaryColor: optStr("appearance.primaryColor"),
      position: optStr("appearance.position"),
      buttonSize: num("appearance.buttonSize", 56),
      borderRadius: num("appearance.borderRadius", 16),
      fontFamily: optStr("appearance.fontFamily"),
    },
    analytics: {
      enabled: bool("analytics.enabled"),
      webhookUrl: optStr("analytics.webhookUrl"),
    },
  };
}

/**
 * 봇 편집 Server Action.
 *
 * 보안:
 *   - slug 는 client bind 인자로 전달되지만, RLS bots_update_owner 가
 *     `owner_id = auth.uid()` 로 자동 검증 → slug 조작해도 타인 봇 수정 불가.
 *   - `getUser()` 로 세션 검증 (proxy 에 이은 2중 방어).
 *   - owner_id / slug / botId 는 폼에서 받지 않으므로 클라이언트 조작 불가
 *     (botId 는 기존 slug 로 강제, name 은 identity.name 으로 단일 출처).
 *   - knowledge.sources 는 폼 미수신 → 기존 값 보존 (Phase 2 별도 편집).
 *
 * 실패 시 에러를 state 로 반환하여 폼이 같은 페이지에 머물도록 한다 (입력 유지).
 */
export async function updateBot(
  slug: string,
  _prev: UpdateBotFormState,
  formData: FormData,
): Promise<UpdateBotFormState> {
  // 1. slug 형식 선검증 — 잘못된 값으로 DB 왕복 방지 (security hardening).
  if (!isValidSlug(slug)) {
    return { error: "잘못된 봇 주소예요." };
  }

  // 2. 세션 검증.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/bots/${slug}/edit`)}`);
  }

  // 3. 기존 봇 조회 — knowledge.sources 보존을 위해 필요.
  //    RLS bots_select_owner 가 owner 자동 필터 → 타인 봇/미존재 = data null.
  const { data: existing, error: selectErr } = await supabase
    .from("bots")
    .select("config")
    .eq("slug", slug)
    .maybeSingle();

  if (selectErr) {
    logger.error({ err: selectErr, slug, userId: user.id }, "봇 조회 실패");
    return {
      error: "봇 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!existing) {
    // 타인 봇 또는 존재하지 않음 — enumeration 방어 위해 동일 메시지.
    return { error: "봇을 찾을 수 없어요." };
  }

  // 4. 폼 → DariConfig 빌드 + 검증.
  const inputObj = buildConfigInput(formData, slug);
  const parsed = dariConfigSchema.safeParse(inputObj);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { fieldErrors };
  }

  // 5. 폼 미수신 필드 보존 — existing.config 가 깨져있을 수 있으므로 safeParse 한번 더.
  //    - knowledge.sources: Phase 2 에서 별도 편집 UI 제공 예정
  //    - allowedDomains: CORS 화이트리스트. 편집 UI 가 아직 없지만 타 경로로 설정될 수 있음
  //      → silent 초기화를 막기 위해 명시적으로 보존 (code H-1).
  const existingParsed = dariConfigSchema.safeParse(existing.config);
  const preservedSources = existingParsed.success
    ? existingParsed.data.knowledge.sources
    : [];
  const preservedAllowedDomains = existingParsed.success
    ? existingParsed.data.allowedDomains
    : [];

  const newConfig: DariConfig = {
    ...parsed.data,
    knowledge: { sources: preservedSources },
    allowedDomains: preservedAllowedDomains,
  };

  // 6. UPDATE — RLS bots_update_owner USING + WITH CHECK 자동 적용.
  //    name 동기화: bots.name = identity.name (단일 출처).
  //    .select('id') 로 영향받은 row 확인 → 0 이면 RLS 거부 또는 race condition.
  const payload: BotUpdate = {
    name: newConfig.identity.name,
    config: newConfig,
  };

  const { data: updated, error: updateErr } = await supabase
    .from("bots")
    .update(payload)
    .eq("slug", slug)
    .select("id");

  if (updateErr) {
    logger.error({ err: updateErr, slug, userId: user.id }, "봇 UPDATE 실패");
    return {
      error: "봇 수정에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!updated || updated.length === 0) {
    // 위 select 단계에서 이미 잡히지만 race condition 안전망.
    return { error: "봇을 수정할 권한이 없어요." };
  }

  redirect(`/bots/${slug}`);
}
