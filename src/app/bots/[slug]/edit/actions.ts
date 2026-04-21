"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AUDIT_EVENTS, logAuditEvent } from "@/core/audit";
import {
  dariConfigSchema,
  fileSourceSchema,
  urlSourceSchema,
  type DariConfig,
  type KnowledgeSource,
} from "@/core/config";
import { createClient } from "@/core/db/client-server";
import type { Database } from "@/core/db/types";
import {
  ALLOWED_MIME_TYPES,
  ingestFileKnowledge,
  ingestTextKnowledge,
  ingestUrlKnowledge,
  knowledgeUrlSchema,
  MAX_FILE_BYTES,
  removeKnowledgeSource,
  sanitizeFilename,
  sanitizeKnowledgeText,
} from "@/core/knowledge";
import { logger } from "@/core/logging";
import { checkBotDeleteRatelimit } from "@/core/ratelimit/bot-delete-limiter";
import { checkBotFileIngestRatelimit } from "@/core/ratelimit/bot-file-ingest-limiter";
import { checkBotSourceRemoveRatelimit } from "@/core/ratelimit/bot-source-remove-limiter";
import { checkBotUrlIngestRatelimit } from "@/core/ratelimit/bot-url-ingest-limiter";

import { isValidSlug } from "../../new/slug-util";

type BotUpdate = Database["public"]["Tables"]["bots"]["Update"];

// Task 1-7-a: text 지식 허용 최대 길이 (textSourceSchema 와 일치).
const MAX_KNOWLEDGE_TEXT_LENGTH = 100_000;
const MIN_KNOWLEDGE_TEXT_LENGTH = 10;

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

  // 3. 기존 봇 조회 — knowledge.sources 보존 + text 지식 재임베딩에 bot.id 필요.
  //    RLS bots_select_owner 가 owner 자동 필터 → 타인 봇/미존재 = data null.
  const { data: existing, error: selectErr } = await supabase
    .from("bots")
    .select("id, config")
    .eq("slug", slug)
    .maybeSingle();

  if (selectErr) {
    logger.error(
      {
        errCode: selectErr.code,
        errMsg: selectErr.message,
        slug,
        userId: user.id,
      },
      "봇 조회 실패",
    );
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

  // 5. 기존 config 복구 + knowledge.sources 편집 (text 타입만).
  //    - allowedDomains: CORS 화이트리스트. 편집 UI 가 아직 없지만 타 경로로 설정될 수 있음
  //      → silent 초기화를 막기 위해 명시적으로 보존 (code H-1).
  //    - knowledge.sources[type!=='text'] (url/file): 편집 UI 미지원 → 그대로 보존.
  //    - knowledge.sources[type==='text']: Task 1-7-a — 단일 textarea 로 교체/삭제.
  //
  // code M-4: existingParsed 실패 시 fail-fast. success=false 로 두고 기본값 []
  // 로 진행하면 url/file 같은 비편집 소스가 조용히 삭제된다 (데이터 손실).
  // Task 1-7-b 이후 url/file 소스 존재 가능 → 반드시 에러 응답.
  const existingParsed = dariConfigSchema.safeParse(existing.config);
  if (!existingParsed.success) {
    logger.error(
      {
        err: existingParsed.error,
        slug,
        userId: user.id,
      },
      "기존 봇 config 파싱 실패 (저장 중단)",
    );
    return {
      error:
        "봇 설정을 불러오는 중 오류가 발생했어요. 관리자에게 문의해 주세요.",
    };
  }

  const preservedNonTextSources: KnowledgeSource[] =
    existingParsed.data.knowledge.sources.filter((s) => s.type !== "text");
  const existingTextContent =
    existingParsed.data.knowledge.sources.find((s) => s.type === "text")
      ?.content ?? "";
  const preservedAllowedDomains = existingParsed.data.allowedDomains;

  // 6. 새 text 지식 추출 + sanitize + 검증.
  //    sec H-2: NULL byte (Postgres 22021) + Unicode 방향 제어 (Trojan Source)
  //    는 trim 전에 먼저 제거 — "빈 문자열 = 삭제 의도" 분기가 정확히 동작하도록.
  const rawText = String(formData.get("knowledge.text.content") ?? "");
  const newTextContent = sanitizeKnowledgeText(rawText).trim();

  if (newTextContent.length > MAX_KNOWLEDGE_TEXT_LENGTH) {
    return {
      fieldErrors: {
        "knowledge.text.content": `최대 ${MAX_KNOWLEDGE_TEXT_LENGTH.toLocaleString()}자까지 저장할 수 있어요.`,
      },
    };
  }
  if (
    newTextContent.length > 0 &&
    newTextContent.length < MIN_KNOWLEDGE_TEXT_LENGTH
  ) {
    return {
      fieldErrors: {
        "knowledge.text.content": `${MIN_KNOWLEDGE_TEXT_LENGTH}자 이상 입력하거나 비워두세요.`,
      },
    };
  }

  // 7. text 지식 변경된 경우만 재임베딩 (knowledge RPC → 실패 시 bots UPDATE 건너뜀).
  //    Gemini API 느림 (초 단위) → 미변경 시 건너뛰어 저장 속도 유지.
  const knowledgeChanged = newTextContent !== existingTextContent;
  if (knowledgeChanged) {
    try {
      await ingestTextKnowledge(supabase, existing.id, newTextContent);
    } catch (err) {
      logger.error(
        { err, botId: existing.id, userId: user.id },
        "text 지식 재임베딩 실패",
      );
      return {
        error:
          "지식 저장에 실패했어요. 잠시 후 다시 시도해 주세요. (다른 섹션은 저장되지 않았습니다)",
      };
    }
  }

  // 8. sources 재계산 (빈 content = text 항목 제거, 있으면 단일 text 항목 추가).
  const newSources: KnowledgeSource[] =
    newTextContent.length > 0
      ? [...preservedNonTextSources, { type: "text", content: newTextContent }]
      : preservedNonTextSources;

  const newConfig: DariConfig = {
    ...parsed.data,
    knowledge: { sources: newSources },
    allowedDomains: preservedAllowedDomains,
  };

  // 9. UPDATE — RLS bots_update_owner USING + WITH CHECK 자동 적용.
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
    logger.error(
      {
        errCode: updateErr.code,
        errMsg: updateErr.message,
        slug,
        userId: user.id,
      },
      "봇 UPDATE 실패",
    );
    return {
      error: "봇 수정에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!updated || updated.length === 0) {
    // 위 select 단계에서 이미 잡히지만 race condition 안전망.
    return { error: "봇을 수정할 권한이 없어요." };
  }

  // 감사 로그 — Epic B Task B-2. throw 금지 계약.
  await logAuditEvent(supabase, {
    eventType: AUDIT_EVENTS.BOT_UPDATE,
    entityType: "bot",
    entityId: existing.id,
    actorId: user.id,
    metadata: { slug, knowledgeChanged },
  });

  redirect(`/bots/${slug}`);
}

// ─── Task 1-7-b: URL 지식 소스 추가 ──────────────────────────────────────────

export type AddUrlFormState = {
  // 폼 전체 에러 (URL 처리 실패, 권한, 세션 등).
  error?: string;
  // 필드 에러 ("knowledge.url" 키).
  fieldErrors?: Record<string, string>;
  // 성공 응답 — 동일 페이지에 머물며 성공 UI 표시 (updateBot 의 redirect 와 달리).
  success?: {
    url: string;
    chunkCount: number;
    truncated: boolean;
    resolvedUrl: string;
  };
};

/**
 * URL 지식 소스 추가 Server Action (Task 1-7-b).
 *
 * 흐름:
 *   1. slug/URL 입력 검증 (DB 왕복 전).
 *   2. 세션 검증 + 봇 소유권 확인 (RLS 2중 방어).
 *   3. 기존 config 파싱 (실패 시 fail-fast — 다른 소스 보존 보장).
 *   4. `ingestUrlKnowledge`: Firecrawl scrape → sanitize → chunk → embed → RPC.
 *   5. config.knowledge.sources 갱신 (동일 URL 있으면 교체, 없으면 append).
 *   6. bots UPDATE.
 *
 * 보안 (owner-authed 4중):
 *   - slug 정적 검증 → `createClient` 세션 → RLS 자동 필터 (select/update) → mass assignment 차단
 *     (URL 외 모든 필드 폼 미수신 → 조작 경로 없음).
 *   - 에러 throw 메시지는 정적 식별자로 고정 (url-fetch / ingest-url 에서 sanitize 완료).
 *     여기서는 사용자에게 보여줄 한국어 문구로만 매핑.
 */
export async function addUrlSourceAction(
  slug: string,
  _prev: AddUrlFormState,
  formData: FormData,
): Promise<AddUrlFormState> {
  // 1. slug 형식 검증.
  if (!isValidSlug(slug)) {
    return { error: "잘못된 봇 주소예요." };
  }

  // 2. URL 입력 검증 (DB 왕복 전 fail-fast).
  const rawUrl = String(formData.get("knowledge.url") ?? "");
  const parsedUrl = knowledgeUrlSchema.safeParse(rawUrl);
  if (!parsedUrl.success) {
    return {
      fieldErrors: {
        "knowledge.url":
          parsedUrl.error.issues[0]?.message ?? "URL 형식이 잘못됐어요.",
      },
    };
  }
  const url = parsedUrl.data;

  // 3. 세션.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/bots/${slug}/edit`)}`);
  }

  // 3-1. Rate limit (security review MEDIUM, 2026-04-20).
  //   `FIRECRAWL_API_KEY` 는 앱 공용 키 → 한 owner 의 남용이 전체 사용자 영향.
  //   owner(user.id) 기준 20req/10m sliding window. fail-open 시에는 checkRatelimit
  //   내부가 로깅 후 통과시킴 (Upstash 장애 중 서비스 차단 회피) — factory.ts 패턴.
  const rl = await checkBotUrlIngestRatelimit(user.id);
  if (!rl.ok) {
    return {
      error:
        "URL 추가 요청이 너무 많아요. 잠시 후 다시 시도해 주세요. (10분 안에 20회 제한)",
    };
  }

  // 4. 봇 조회 (id + 기존 config).
  const { data: existing, error: selectErr } = await supabase
    .from("bots")
    .select("id, config")
    .eq("slug", slug)
    .maybeSingle();

  if (selectErr) {
    logger.error(
      {
        errCode: selectErr.code,
        errMsg: selectErr.message,
        slug,
        userId: user.id,
      },
      "봇 조회 실패",
    );
    return {
      error: "봇 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!existing) {
    // 타인 봇 또는 존재하지 않음 — enumeration 방어 위해 동일 메시지.
    return { error: "봇을 찾을 수 없어요." };
  }

  // 5. 기존 config 파싱 (fail-fast — url/file 등 비편집 소스 보존 필수).
  const existingParsed = dariConfigSchema.safeParse(existing.config);
  if (!existingParsed.success) {
    logger.error(
      { err: existingParsed.error, slug, userId: user.id },
      "기존 봇 config 파싱 실패 (URL 추가 중단)",
    );
    return {
      error:
        "봇 설정을 불러오는 중 오류가 발생했어요. 관리자에게 문의해 주세요.",
    };
  }

  // 6. 크롤링 + 임베딩 + RPC.
  let result;
  try {
    result = await ingestUrlKnowledge(supabase, existing.id, url);
  } catch (err) {
    logger.error(
      { err, botId: existing.id, url, userId: user.id },
      "URL 지식 수집 실패",
    );
    // throw 메시지는 static identifier ("URL 처리 실패" / "knowledge RPC failed") —
    // 사용자 친화 메시지로 매핑. 내부 상세는 위 logger.error 가 단일 출처.
    const message =
      err instanceof Error && err.message === "URL 처리 실패"
        ? "URL 에서 내용을 읽어오지 못했어요. (페이지 차단 · 비어있음 · 타임아웃 등) 다른 주소로 시도하거나 잠시 후 다시 시도해 주세요."
        : "지식 저장에 실패했어요. 잠시 후 다시 시도해 주세요.";
    return { error: message };
  }

  // 7. config.knowledge.sources 갱신.
  //    - 기존 동일 URL (url 타입 + urls 배열에 이 URL 포함) 을 가진 소스 제거 → 새 소스 추가.
  //    - text/file/다른 url 소스는 그대로 보존.
  //    - **MVP 전제 (code review M-2, 2026-04-20)**: 이 액션은 URL 을 1개씩
  //      `{ type:"url", urls:[url] }` 소스 1개로 append. 한 소스에 여러 URL 이 담긴 경우(=
  //      Phase 2 다중 URL UI) `includes(url)` 매칭 소스 전체가 교체된다. 다중 URL 입력이
  //      도입되면 "해당 URL 만 제거 + 나머지 보존" 으로 로직 갱신 필요.
  const existingSources = existingParsed.data.knowledge.sources;
  const filtered = existingSources.filter(
    (s) => !(s.type === "url" && s.urls.includes(url)),
  );
  const newUrlSource = urlSourceSchema.parse({
    type: "url",
    urls: [url],
    recrawlInterval: "never",
  });
  const newSources: KnowledgeSource[] = [...filtered, newUrlSource];

  const newConfig: DariConfig = {
    ...existingParsed.data,
    knowledge: { sources: newSources },
  };

  // 8. bots UPDATE (RLS bots_update_owner 자동).
  const { data: updated, error: updateErr } = await supabase
    .from("bots")
    .update({
      config: newConfig,
    } satisfies Database["public"]["Tables"]["bots"]["Update"])
    .eq("slug", slug)
    .select("id");

  if (updateErr) {
    logger.error(
      {
        errCode: updateErr.code,
        errMsg: updateErr.message,
        slug,
        userId: user.id,
        url,
      },
      "봇 UPDATE 실패 (URL 소스 추가 단계)",
    );
    return { error: "봇 수정에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (!updated || updated.length === 0) {
    return { error: "봇을 수정할 권한이 없어요." };
  }

  // 9. 캐시 갱신 — 편집 페이지 재진입 시 새 소스 반영.
  revalidatePath(`/bots/${slug}/edit`);

  return {
    success: {
      url,
      chunkCount: result.chunkCount,
      truncated: result.truncated,
      resolvedUrl: result.resolvedUrl,
    },
  };
}

// ─── Task 1-7-c: 파일 지식 소스 추가 ─────────────────────────────────────────

export type AddFileFormState = {
  // 폼 전체 에러 (파일 처리 실패, 권한, 세션 등).
  error?: string;
  // 필드 에러 ("knowledge.file" 키).
  fieldErrors?: Record<string, string>;
  // 성공 응답.
  success?: {
    filename: string;
    chunkCount: number;
    bytes: number;
    ext: string;
  };
};

/**
 * 파일 지식 소스 추가 Server Action (Task 1-7-c).
 *
 * 흐름:
 *   1. slug 검증.
 *   2. FormData 에서 File 추출 + 기본 검증 (존재/크기/MIME).
 *   3. 세션 검증 + rate limit (owner 기준 20req/10m).
 *   4. 봇 조회 (RLS 2중 방어) + 기존 config 파싱 (fail-fast — 비편집 소스 보존).
 *   5. ingestFileKnowledge — extract → sanitize → chunk → embed → Storage → RPC.
 *   6. config.knowledge.sources 갱신 (같은 파일명 있으면 교체, 없으면 append).
 *   7. bots UPDATE + revalidatePath.
 *
 * 보안 (owner-authed 5중):
 *   - slug 정적 검증 → 세션 → rate limit → RLS (select/update) → Storage RLS (insert).
 *   - mass assignment 차단: 파일 외 필드 폼 미수신. owner_id/slug/botId 조작 경로 없음.
 *   - magic bytes 재검증 (ingestFileKnowledge 내부) — Content-Type 헤더 위조 방어.
 *
 * 에러 메시지는 ingest-file.ts throw 식별자 기반으로 사용자 친화 한글 매핑:
 *   - "파일 처리 실패" → 파일 형식/손상/크기 초과 안내
 *   - "파일 업로드 실패" → Storage 쪽 장애
 *   - "knowledge embedding failed" / "knowledge RPC failed" → 내부 오류 안내
 */
export async function addFileSourceAction(
  slug: string,
  _prev: AddFileFormState,
  formData: FormData,
): Promise<AddFileFormState> {
  // 1. slug 형식 검증.
  if (!isValidSlug(slug)) {
    return { error: "잘못된 봇 주소예요." };
  }

  // 2. File 추출 + 사전 검증 (DB 왕복 전 fail-fast).
  //    code review MEDIUM-2 (2026-04-20): instanceof 체크와 size 체크 분리 —
  //    TypeScript narrowing 명확화 + UX 메시지 구분.
  const raw = formData.get("knowledge.file");
  if (!(raw instanceof File)) {
    return {
      fieldErrors: { "knowledge.file": "파일을 선택해 주세요." },
    };
  }
  if (raw.size === 0) {
    return {
      fieldErrors: { "knowledge.file": "빈 파일은 업로드할 수 없어요." },
    };
  }
  if (raw.size > MAX_FILE_BYTES) {
    return {
      fieldErrors: {
        "knowledge.file": `파일 크기는 ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB 이하여야 해요.`,
      },
    };
  }
  // MIME 화이트리스트 (Storage 버킷과 정합). 실제 검증은 ingestFileKnowledge 가
  // magic bytes 로 이중 수행 — 여기는 명백한 오류(.exe/.zip 등) fail-fast.
  const mime = raw.type.toLowerCase();
  if (mime && !(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    return {
      fieldErrors: {
        "knowledge.file": "PDF, TXT, MD 파일만 업로드할 수 있어요.",
      },
    };
  }

  // 3. 세션.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/bots/${slug}/edit`)}`);
  }

  // 3-1. Rate limit (owner 기준 20req/10m).
  const rl = await checkBotFileIngestRatelimit(user.id);
  if (!rl.ok) {
    return {
      error:
        "파일 업로드 요청이 너무 많아요. 잠시 후 다시 시도해 주세요. (10분 안에 20회 제한)",
    };
  }

  // 4. 봇 조회 (id + 기존 config).
  const { data: existing, error: selectErr } = await supabase
    .from("bots")
    .select("id, config")
    .eq("slug", slug)
    .maybeSingle();

  if (selectErr) {
    logger.error(
      {
        errCode: selectErr.code,
        errMsg: selectErr.message,
        slug,
        userId: user.id,
      },
      "봇 조회 실패",
    );
    return {
      error: "봇 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!existing) {
    return { error: "봇을 찾을 수 없어요." };
  }

  // 5. 기존 config 파싱 (fail-fast — 비편집 소스 보존 필수).
  const existingParsed = dariConfigSchema.safeParse(existing.config);
  if (!existingParsed.success) {
    logger.error(
      { err: existingParsed.error, slug, userId: user.id },
      "기존 봇 config 파싱 실패 (파일 추가 중단)",
    );
    return {
      error:
        "봇 설정을 불러오는 중 오류가 발생했어요. 관리자에게 문의해 주세요.",
    };
  }

  // 6. buffer 변환 + 원 파일명 확보.
  //    sanitizeFilename 은 ingestFileKnowledge 내부에서도 수행 (중복 방어 OK).
  const sanitizedFilename = sanitizeFilename(raw.name);
  if (sanitizedFilename.length === 0) {
    return {
      fieldErrors: {
        "knowledge.file":
          "파일명이 올바르지 않아요. 다른 파일을 선택해 주세요.",
      },
    };
  }

  const buffer = Buffer.from(await raw.arrayBuffer());

  // 7. 파이프라인 실행.
  let result;
  try {
    result = await ingestFileKnowledge(supabase, existing.id, {
      buffer,
      filename: raw.name,
    });
  } catch (err) {
    logger.error(
      {
        err,
        botId: existing.id,
        filename: sanitizedFilename,
        bytes: raw.size,
        mime: mime || "(empty)",
        userId: user.id,
      },
      "파일 지식 수집 실패",
    );

    // throw 식별자 → 사용자 메시지 매핑.
    if (err instanceof Error) {
      if (err.message === "파일 처리 실패") {
        return {
          error:
            "파일을 처리하지 못했어요. PDF · TXT · MD 형식인지, 암호 설정이 없는지, 스캔본이 아닌지 확인해 주세요.",
        };
      }
      if (err.message === "파일 업로드 실패") {
        return {
          error: "파일 저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
        };
      }
    }
    return {
      error: "지식 저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  // 8. config.knowledge.sources 갱신.
  //    - 같은 파일명의 `{ type:"file", files:[name] }` 이 있으면 제거 후 새로 append.
  //    - 다른 소스(text/url/다른 file)는 보존.
  //    - **MVP 전제 (1-7-b learnings 동일 패턴)**: 이 액션은 파일 1개씩
  //      `{ type:"file", files:[name] }` 소스 1개로 append. Phase 2 다중 파일 UI 도입 시
  //      "해당 파일만 제거 + 나머지 보존" 으로 로직 갱신 필요.
  //    - Task 1-7-d: `storagePaths` 에 Storage 실제 경로({bot_id}/{uuid}.{ext}) 를 함께
  //      기록해 삭제 시점에 정확히 제거 가능. 기존 저장 데이터(storagePaths 없음)는
  //      optional 필드로 호환 (removeSource 가 없으면 best-effort skip).
  const existingSources = existingParsed.data.knowledge.sources;
  const filtered = existingSources.filter(
    (s) => !(s.type === "file" && s.files.includes(result.sanitizedFilename)),
  );
  const newFileSource = fileSourceSchema.parse({
    type: "file",
    files: [result.sanitizedFilename],
    storagePaths: [result.storagePath],
  });
  const newSources: KnowledgeSource[] = [...filtered, newFileSource];

  const newConfig: DariConfig = {
    ...existingParsed.data,
    knowledge: { sources: newSources },
  };

  // 9. bots UPDATE.
  const { data: updated, error: updateErr } = await supabase
    .from("bots")
    .update({
      config: newConfig,
    } satisfies Database["public"]["Tables"]["bots"]["Update"])
    .eq("slug", slug)
    .select("id");

  if (updateErr) {
    logger.error(
      {
        err: updateErr,
        slug,
        userId: user.id,
        filename: result.sanitizedFilename,
      },
      "봇 UPDATE 실패 (파일 소스 추가 단계)",
    );
    return { error: "봇 수정에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (!updated || updated.length === 0) {
    return { error: "봇을 수정할 권한이 없어요." };
  }

  // 10. 캐시 갱신.
  revalidatePath(`/bots/${slug}/edit`);

  return {
    success: {
      filename: result.sanitizedFilename,
      chunkCount: result.chunkCount,
      bytes: result.bytes,
      ext: result.ext,
    },
  };
}

// ─── Task 1-7-d: 지식 소스 개별 삭제 ─────────────────────────────────────────

export type RemoveSourceFormState = {
  // 폼 전체 에러.
  error?: string;
  // 성공 응답.
  success?: {
    sourceType: "text" | "url" | "file";
    identifier: string;
    removedChunks: number;
    removedFiles: number;
    hadStorageFailures: boolean;
  };
};

const VALID_SOURCE_TYPES: ReadonlyArray<"text" | "url" | "file"> = [
  "text",
  "url",
  "file",
] as const;

/**
 * 지식 소스 개별 삭제 Server Action (Task 1-7-d).
 *
 * 흐름:
 *   1. slug/sourceType/identifier 검증 (DB 왕복 전 fail-fast).
 *   2. 세션 → rate limit (10req/5m user.id).
 *   3. 봇 조회 (RLS 2중 방어).
 *   4. 기존 config 파싱 (fail-fast — 다른 소스 보존).
 *   5. 해당 source 존재 확인 + storagePaths 수집 (file 타입만).
 *   6. `removeKnowledgeSource`: RPC 빈 배열 = chunks 삭제 + Storage best-effort.
 *   7. config.knowledge.sources 갱신 (해당 source 제거).
 *   8. bots UPDATE + revalidatePath.
 *
 * 보안 (owner-authed 5중):
 *   - slug/타입/식별자 정적 검증 → 세션 → rate limit → RLS select/update → chunks RPC
 *     (security invoker + RLS delete/insert_owner).
 *   - Mass assignment: 폼 필드는 sourceType/sourceIdentifier 둘뿐. owner_id/slug/botId
 *     조작 경로 없음.
 *   - 사용자에게 노출되는 에러 메시지는 정적 (내부 errcode/RPC 상세 숨김).
 *
 * MVP 전제 (1-7-b/c 패턴 일관):
 *   - 한 source = 1-원소 배열 (files:[name] / urls:[url]) 기준. 다중 UI 도입 시
 *     "해당 원소만 제거 + 나머지 보존" 으로 filter/map 로직 갱신 필요.
 */
export async function removeSourceAction(
  slug: string,
  _prev: RemoveSourceFormState,
  formData: FormData,
): Promise<RemoveSourceFormState> {
  // 1. slug.
  if (!isValidSlug(slug)) {
    return { error: "잘못된 봇 주소예요." };
  }

  // 2. sourceType.
  const rawType = String(formData.get("sourceType") ?? "");
  if (!(VALID_SOURCE_TYPES as readonly string[]).includes(rawType)) {
    return { error: "지식 소스 타입이 올바르지 않아요." };
  }
  const sourceType = rawType as "text" | "url" | "file";

  // 3. identifier (text 는 빈값 허용, url/file 은 필수).
  //    길이 상한은 DB jsonb + 개별 스키마에 의존. 여기선 과도한 입력 방어 목적 1024자.
  const identifier = String(formData.get("sourceIdentifier") ?? "");
  if (identifier.length > 1024) {
    return { error: "지식 소스 식별자가 너무 길어요." };
  }
  if (sourceType !== "text" && identifier.length === 0) {
    return { error: "삭제할 소스를 찾을 수 없어요." };
  }

  // 4. 세션.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/bots/${slug}/edit`)}`);
  }

  // 4-1. Rate limit.
  const rl = await checkBotSourceRemoveRatelimit(user.id);
  if (!rl.ok) {
    return {
      error:
        "삭제 요청이 너무 많아요. 잠시 후 다시 시도해 주세요. (5분 안에 10회 제한)",
    };
  }

  // 5. 봇 조회.
  const { data: existing, error: selectErr } = await supabase
    .from("bots")
    .select("id, config")
    .eq("slug", slug)
    .maybeSingle();

  if (selectErr) {
    logger.error(
      {
        errCode: selectErr.code,
        errMsg: selectErr.message,
        slug,
        userId: user.id,
      },
      "봇 조회 실패",
    );
    return {
      error: "봇 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!existing) {
    return { error: "봇을 찾을 수 없어요." };
  }

  // 6. 기존 config 파싱 (fail-fast).
  const existingParsed = dariConfigSchema.safeParse(existing.config);
  if (!existingParsed.success) {
    logger.error(
      { err: existingParsed.error, slug, userId: user.id },
      "기존 봇 config 파싱 실패 (소스 삭제 중단)",
    );
    return {
      error:
        "봇 설정을 불러오는 중 오류가 발생했어요. 관리자에게 문의해 주세요.",
    };
  }

  const existingSources = existingParsed.data.knowledge.sources;

  // 7. 해당 source 존재 확인 + storagePaths 수집 (file 만).
  //    "이미 삭제된 소스" 에 대한 호출을 거부 — idempotent 로 만들지 않음으로써
  //    UI 버그/경쟁 조건을 가시화 (사용자에겐 친화 메시지).
  let sourceFound = false;
  const storagePaths: string[] = [];
  for (const s of existingSources) {
    if (sourceType === "text" && s.type === "text") {
      sourceFound = true;
      break;
    }
    if (
      sourceType === "url" &&
      s.type === "url" &&
      s.urls.includes(identifier)
    ) {
      sourceFound = true;
      // url 에는 Storage 없음.
      break;
    }
    if (
      sourceType === "file" &&
      s.type === "file" &&
      s.files.includes(identifier)
    ) {
      sourceFound = true;
      if (s.storagePaths && s.storagePaths.length > 0) {
        storagePaths.push(...s.storagePaths);
      }
      // 여러 source 가 같은 filename 을 담은 경우까지 전부 청소하기 위해
      // break 하지 않고 계속 수집 (MVP 에선 드물지만 방어적).
      continue;
    }
  }
  if (!sourceFound) {
    return { error: "이미 삭제되었거나 찾을 수 없는 소스예요." };
  }

  // 7-2. storagePaths prefix 재검증 — defense-in-depth (sec review MEDIUM-1).
  //   - Storage RLS 0010 이 이미 `storage.foldername(name)[1] = bot_id` 로 owner 격리.
  //   - 앱 레이어에서도 prefix 일치를 확인해 단일 방어선을 2중화. config jsonb 가 비정상
  //     경로로 조작되었거나(타 Server Action/관리자 도구), 스키마 regex 우회 경로가 생겨도
  //     Storage 삭제 호출 자체를 차단.
  //   - 불일치 발견 시 해당 경로만 degrade (제외) — chunks 삭제는 계속 진행하여 UX 연속성 유지.
  const expectedPrefix = `${existing.id}/`;
  const safeStoragePaths = storagePaths.filter((p) =>
    p.startsWith(expectedPrefix),
  );
  if (safeStoragePaths.length !== storagePaths.length) {
    logger.error(
      {
        botId: existing.id,
        expectedPrefix,
        invalidCount: storagePaths.length - safeStoragePaths.length,
        userId: user.id,
      },
      "storagePaths prefix 불일치 감지 — 해당 경로는 Storage 삭제 건너뜀",
    );
  }

  // 8. chunks + Storage 삭제.
  let removeResult;
  try {
    removeResult = await removeKnowledgeSource({
      supabase,
      botId: existing.id,
      sourceType,
      identifier,
      storagePaths: safeStoragePaths.length > 0 ? safeStoragePaths : undefined,
    });
  } catch (err) {
    logger.error(
      {
        err,
        botId: existing.id,
        sourceType,
        userId: user.id,
      },
      "지식 소스 삭제 실패",
    );
    return { error: "삭제에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }

  // 9. config.knowledge.sources 에서 해당 source 제거 (MVP 1-원소 가정).
  //    Phase 2 다중 UI 도입 시 map + 원소 필터로 세분화.
  const newSources = existingSources.filter((s) => {
    if (sourceType === "text") return s.type !== "text";
    if (sourceType === "url") {
      return !(s.type === "url" && s.urls.includes(identifier));
    }
    // file
    return !(s.type === "file" && s.files.includes(identifier));
  });

  const newConfig: DariConfig = {
    ...existingParsed.data,
    knowledge: { sources: newSources },
  };

  // 10. bots UPDATE.
  const { data: updated, error: updateErr } = await supabase
    .from("bots")
    .update({
      config: newConfig,
    } satisfies Database["public"]["Tables"]["bots"]["Update"])
    .eq("slug", slug)
    .select("id");

  if (updateErr) {
    logger.error(
      {
        err: updateErr,
        slug,
        userId: user.id,
        sourceType,
      },
      "봇 UPDATE 실패 (소스 삭제 단계)",
    );
    return { error: "봇 수정에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (!updated || updated.length === 0) {
    return { error: "봇을 수정할 권한이 없어요." };
  }

  // 11. 캐시 갱신.
  revalidatePath(`/bots/${slug}/edit`);

  return {
    success: {
      sourceType,
      identifier,
      removedChunks: removeResult.removedChunks,
      removedFiles: removeResult.removedFiles,
      hadStorageFailures: removeResult.failedFiles.length > 0,
    },
  };
}

// ─── Task B-1 (Epic B): 봇 영구 삭제 ─────────────────────────────────────────

export type DeleteBotFormState = {
  error?: string;
};

// Storage list 한 번당 상한.
// 근거:
//   - 파일 크기 상한 10MB (0010 `knowledge-files.file_size_limit`) × 1000건 = 10GB/봇.
//     MVP 단계에서 한 봇이 10GB 분량 지식을 쌓는 케이스는 없음 가정 (상위 outlier 이하).
//   - Supabase storage.list 기본 limit 은 100, 단일 호출 최대 1000 — 이 값이 실용 상한.
//   - 초과 시 pagination 구현 대신 Phase 2 sweeper 에 위임 (`bot_id` 디렉토리 정리).
// 초과 시 동작: 상위 1000개만 제거, 나머지는 orphan 으로 잔존 (DB row 는 이미 삭제).
// orphan 파일은 `knowledge_files_select_owner` RLS 가 `bots.owner_id = auth.uid()` 를
// 요구하므로 외부 노출 위험 없음 (bots row 가 사라지면 select 도 0-row → 접근 불가).
const STORAGE_CLEANUP_LIST_LIMIT = 1000;

/**
 * 봇 영구 삭제 Server Action (Epic B Task B-1).
 *
 * UX: "위험 영역" 카드 → DeleteBotDialog (typed confirmation) → 이 action 호출.
 *
 * 방어 (4중):
 *   1. slug 형식 정규식 (DB 왕복 전).
 *   2. 세션 `getUser()` — proxy 에 이은 재확인.
 *   3. `checkBotDeleteRatelimit(user.id)` — 5 req/1h, 반복 스크립트 차단.
 *   4. **typed confirmation 서버측 재검증** — `confirmName === bot.name` 체크
 *      (클라이언트 활성 상태만 믿으면 우회 가능).
 *   + RLS `bots_delete_owner` 가 DB 레벨 owner 격리 (5중 방어).
 *
 * 삭제 순서 (중요):
 *   - Storage cleanup → DB DELETE 순.
 *   - 이유: DB row 가 먼저 사라지면 `knowledge_files_*_owner` RLS 의 `bots` 참조가
 *     0-row 가 되어 Storage 삭제가 RLS 거부됨. 반드시 DB 존재하는 상태에서
 *     Storage 먼저 정리.
 *
 * Cascade (DB 레벨 자동):
 *   - bots → conversations (0003 ON DELETE CASCADE)
 *   - bots → knowledge_chunks (0005 ON DELETE CASCADE)
 *   - conversations → messages (0003 ON DELETE CASCADE)
 *   → 앱에선 `DELETE FROM bots` 한 번이면 연관 테이블 전부 정리됨.
 *
 * Storage cleanup 은 best-effort:
 *   - list/remove 실패 시 `logger.warn` 남기고 DB 삭제 진행.
 *   - orphan 파일은 Phase 2 주기 sweeper 로 정리 (경로 {bot_id}/* 인데 bots row
 *     가 이미 없으면 고아).
 *   - DB 삭제 성공 = 사용자에겐 "삭제됨". Storage 잔존은 비가시적 정리 부채.
 *
 * 에러 메시지는 정적 — enumeration / 내부 구조 유출 방어.
 * 성공 시 revalidatePath("/bots") + redirect("/bots").
 */
export async function deleteBotAction(
  slug: string,
  _prev: DeleteBotFormState,
  formData: FormData,
): Promise<DeleteBotFormState> {
  // 1. slug 형식 검증.
  if (!isValidSlug(slug)) {
    return { error: "잘못된 봇 주소예요." };
  }

  // 2. 확인 입력값 수신 (typed confirmation).
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  if (confirmName.length === 0) {
    return { error: "봇 이름을 입력해 주세요." };
  }
  // 입력 길이 상한 — 과도한 문자열 방어. DB name 컬럼 실제 상한과 무관하게 1024 충분.
  if (confirmName.length > 1024) {
    return { error: "입력값이 너무 길어요." };
  }

  // 3. 세션.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/bots/${slug}/edit`)}`);
  }

  // 4. Rate limit — 파괴적 작업 엄격 (5 req/1h).
  const rl = await checkBotDeleteRatelimit(user.id);
  if (!rl.ok) {
    return {
      error:
        "삭제 요청이 너무 많아요. 잠시 후 다시 시도해 주세요. (1시간 안에 5회 제한)",
    };
  }

  // 5. 봇 조회 (id + name 만 필요).
  //    RLS bots_select_owner 가 owner 자동 필터 → 타인 봇/미존재 = null.
  const { data: existing, error: selectErr } = await supabase
    .from("bots")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (selectErr) {
    logger.error(
      {
        errCode: selectErr.code,
        errMsg: selectErr.message,
        slug,
        userId: user.id,
      },
      "봇 조회 실패 — 삭제 action",
    );
    return {
      error: "봇 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!existing) {
    // 타인 봇/미존재 — enumeration 방어.
    return { error: "봇을 찾을 수 없어요." };
  }

  // 6. typed confirmation 서버측 재검증.
  //    - client 의 활성 버튼 상태만 믿으면 curl/devtools 우회 가능.
  //    - 정확한 이름 일치로 "실수 삭제" 와 "의도적 삭제" 를 구분.
  if (confirmName !== existing.name) {
    return { error: "봇 이름이 일치하지 않아요." };
  }

  // 7. Storage cleanup — best-effort, DB 삭제 전에 수행 (RLS 참조 유효 상태).
  try {
    const { data: files, error: listErr } = await supabase.storage
      .from("knowledge-files")
      .list(existing.id, { limit: STORAGE_CLEANUP_LIST_LIMIT });

    if (listErr) {
      logger.warn(
        {
          errMsg: listErr.message,
          botId: existing.id,
          userId: user.id,
        },
        "Storage list 실패 — DB 삭제는 진행, orphan 잔존 가능",
      );
    } else if (files && files.length > 0) {
      const paths = files.map((f) => `${existing.id}/${f.name}`);
      const { error: rmErr } = await supabase.storage
        .from("knowledge-files")
        .remove(paths);
      if (rmErr) {
        logger.warn(
          {
            errMsg: rmErr.message,
            botId: existing.id,
            userId: user.id,
            count: paths.length,
          },
          "Storage remove 실패 — orphan 잔존 가능, Phase 2 sweeper 대상",
        );
      }
    }
  } catch (err) {
    // list/remove 가 throw 하는 경로 (네트워크 단절 등) — 로깅 후 DB 삭제 진행.
    logger.warn(
      {
        err,
        botId: existing.id,
        userId: user.id,
      },
      "Storage cleanup 예외 — DB 삭제는 진행",
    );
  }

  // 8. DELETE FROM bots — FK cascade 가 conversations/messages/knowledge_chunks 자동 정리.
  //    .select('id') 로 영향받은 row 확인 → 0 이면 RLS 거부 또는 race.
  const { data: deleted, error: delErr } = await supabase
    .from("bots")
    .delete()
    .eq("slug", slug)
    .select("id");

  if (delErr) {
    logger.error(
      {
        errCode: delErr.code,
        errMsg: delErr.message,
        slug,
        botId: existing.id,
        userId: user.id,
      },
      "봇 DELETE 실패",
    );
    return {
      error: "봇 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  if (!deleted || deleted.length === 0) {
    // RLS 거부 또는 race condition — 위 select 로 이미 owner 검증 통과했으므로
    // 여기 도달 = 동시성 이슈 (다른 탭/세션에서 이미 삭제) 가능.
    return { error: "봇을 삭제할 권한이 없거나 이미 삭제되었어요." };
  }

  logger.info(
    {
      botId: existing.id,
      slug,
      userId: user.id,
    },
    "봇 영구 삭제 완료",
  );

  // 감사 로그 — Epic B Task B-2. DB row 삭제 후 기록.
  //   - entity_id(=existing.id) 는 UUID 값 자체로는 유효하지만 bots row 가 이미 삭제됨 →
  //     **dangling 참조**. B-3 soft delete 복구 UI 에서 audit_logs.entity_id 로 봇을 재조회
  //     할 경우 null 반환. 복구 키는 별도 bots_tombstone 또는 soft delete 테이블로 격리 필요
  //     (security review MEDIUM, 2026-04-21).
  //   - throw 금지 계약 → 기록 실패해도 삭제 완료 상태 유지.
  await logAuditEvent(supabase, {
    eventType: AUDIT_EVENTS.BOT_DELETE,
    entityType: "bot",
    entityId: existing.id,
    actorId: user.id,
    metadata: { slug, deleteMode: "permanent" },
  });

  // 9. 캐시 갱신 + 리다이렉트 (서버 고정 경로 — open redirect 방어).
  revalidatePath("/bots");
  redirect("/bots");
}
