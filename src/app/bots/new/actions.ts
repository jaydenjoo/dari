"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { dariConfigSchema, type DariConfig } from "@/core/config";
import { createClient } from "@/core/db/client-server";
import type { Database } from "@/core/db/types";
import { logger } from "@/core/logging";
import { checkBotCreateRatelimit } from "@/core/ratelimit/bot-create-limiter";

import { isValidSlug, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from "./slug-util";

type BotInsert = Database["public"]["Tables"]["bots"]["Insert"];

// 봇 생성 폼 입력 스키마.
// - slug: bots 테이블 CHECK 제약 + DariConfig.botId 정규식과 완전 일치
// - 나머지 길이 제한은 DariConfig identity.name / identity.welcomeMessage / ai.systemPrompt 와 동기
const createBotSchema = z.object({
  name: z
    .string()
    .min(1, { message: "봇 이름을 입력해 주세요." })
    .max(50, { message: "봇 이름은 50자 이내로 입력해 주세요." }),
  slug: z
    .string()
    .min(SLUG_MIN_LENGTH, { message: "주소는 3자 이상이어야 해요." })
    .max(SLUG_MAX_LENGTH, { message: "주소는 64자 이내여야 해요." })
    .refine(isValidSlug, {
      message:
        "소문자·숫자·하이픈만 사용할 수 있어요 (첫·끝 글자는 영문/숫자).",
    }),
  welcomeMessage: z
    .string()
    .min(1, { message: "첫 인사 메시지를 입력해 주세요." })
    .max(500, { message: "첫 인사는 500자 이내로 입력해 주세요." }),
  systemPrompt: z
    .string()
    .min(10, { message: "AI 지시사항은 10자 이상이어야 해요." })
    .max(8000, { message: "AI 지시사항은 8000자 이내로 입력해 주세요." }),
});

type FormFields = z.infer<typeof createBotSchema>;

export type CreateBotFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof FormFields, string>>;
};

/**
 * 봇 생성 Server Action.
 *
 * 보안:
 *   - `getUser()` 로 세션 검증 (anon 차단, proxy 에 이은 이중 방어)
 *   - `owner_id = auth.uid()` 명시 주입 → RLS INSERT 정책 (WITH CHECK) 통과
 *   - DariConfig 구성 시 Zod default 가 나머지 필드 (behavior/appearance/…) 채움
 *   - unique 충돌 (23505) 은 사용자에게 명시적 안내 — slug 는 공개 식별자이므로
 *     enumeration 위험 없음
 *
 * 실패 시 에러를 state 로 반환해 같은 페이지에 머문다 (사용자 입력 유지).
 */
export async function createBot(
  _prev: CreateBotFormState,
  formData: FormData,
): Promise<CreateBotFormState> {
  const parsed = createBotSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    welcomeMessage: String(formData.get("welcomeMessage") ?? ""),
    systemPrompt: String(formData.get("systemPrompt") ?? ""),
  });

  if (!parsed.success) {
    const fieldErrors: CreateBotFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof FormFields;
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const { name, slug, welcomeMessage, systemPrompt } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=%2Fbots%2Fnew");
  }

  // Rate limit — 사용자당 하루 20개 봇 생성.
  // Zod/세션 검증 이후에 둬야 정상 사용자가 폼 오타로 제출해도 카운터가 깎이지 않는다.
  // dev/test 에서는 자동 skip, prod Upstash 장애 시 fail-open + Sentry 알림.
  const rl = await checkBotCreateRatelimit(user.id);
  if (!rl.ok) {
    return {
      error: "봇 생성 한도에 도달했어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  // DariConfig 구성 — Zod default 로 나머지 필드 자동 채움.
  // 주의: `bots.slug` 와 `config.botId` 가 동일 값으로 이중 저장된다.
  // 향후 slug 변경 UI 를 만들 때는 `config.botId` 도 반드시 함께 갱신해야 한다.
  let config: DariConfig;
  try {
    config = dariConfigSchema.parse({
      botId: slug,
      identity: { name, welcomeMessage },
      ai: { systemPrompt },
    });
  } catch (err) {
    logger.error({ err, slug }, "DariConfig 파싱 실패");
    return {
      error: "봇 설정 구성에 실패했어요. 입력값을 다시 확인해 주세요.",
    };
  }

  const payload: BotInsert = {
    slug,
    name,
    owner_id: user.id,
    config,
  };

  const { error: insertError } = await supabase.from("bots").insert(payload);

  if (insertError) {
    // PostgreSQL 23505 = unique_violation (slug 중복).
    if (insertError.code === "23505") {
      return {
        fieldErrors: {
          slug: "이미 사용 중인 주소예요. 다른 값으로 시도해 주세요.",
        },
      };
    }

    logger.error({ err: insertError, slug, userId: user.id }, "봇 INSERT 실패");
    return {
      error: "봇 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  redirect("/bots");
}
