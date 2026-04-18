/**
 * 위젯 Config 클라이언트 — 서버 `/api/widget-config/{botSlug}` 로부터 봇별 UI 설정 로드.
 *
 * 설계 결정:
 *   - 로드 실패 / 부분 누락 / 형식 오류는 모두 **기본값으로 폴백**. 위젯이 아예 표시되지 않는 경로보다
 *     낮은 퀄리티라도 표시되는 경로를 선호 (MVP UX 원칙).
 *   - primaryColor 는 CSS 변수에 주입되므로 정규식 재검증 — 서버 스키마가 이미 검증하지만
 *     네트워크 어디선가 변조될 가능성까지 이중 방어 (defense in depth).
 *   - avatar/welcomeMessage 등 긴 문자열은 길이 상한 재적용 — 비정상 응답 대비.
 */

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export type WidgetPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export type WidgetLanguage = "ko" | "en" | "ja" | "zh";

export interface WidgetBrand {
  readonly name: string;
  readonly welcomeMessage: string;
  readonly placeholder: string;
  readonly language: WidgetLanguage;
  readonly avatar?: string;
  readonly primaryColor: string;
  readonly position: WidgetPosition;
  readonly buttonSize: number;
  readonly borderRadius: number;
  readonly fontFamily: string;
}

export const DEFAULT_BRAND: WidgetBrand = {
  name: "도움이 필요하세요?",
  welcomeMessage: "안녕하세요! 무엇이든 물어보세요.",
  placeholder: "메시지를 입력하세요",
  language: "ko",
  primaryColor: "#2b7cff",
  position: "bottom-right",
  buttonSize: 56,
  borderRadius: 16,
  fontFamily: "Pretendard",
};

const POSITIONS: ReadonlySet<WidgetPosition> = new Set<WidgetPosition>([
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
]);

const LANGUAGES: ReadonlySet<WidgetLanguage> = new Set<WidgetLanguage>([
  "ko",
  "en",
  "ja",
  "zh",
]);

/**
 * `/api/widget-config/{botId}` 를 호출해 brand 를 얻는다.
 * 실패 (네트워크/파싱/형식) 는 DEFAULT_BRAND 를 반환 — caller 는 null 체크 없이 사용 가능.
 */
export async function loadWidgetBrand(
  botId: string,
  apiUrl: string,
  signal?: AbortSignal,
): Promise<WidgetBrand> {
  const url = `${apiUrl}/api/widget-config/${encodeURIComponent(botId)}`;
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", signal });
  } catch {
    return DEFAULT_BRAND;
  }

  if (!response.ok) return DEFAULT_BRAND;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return DEFAULT_BRAND;
  }

  return normalizeBrand(body);
}

/** 서버 응답을 WidgetBrand 로 정규화. 누락/형식 오류 필드는 기본값으로 폴백. */
export function normalizeBrand(body: unknown): WidgetBrand {
  if (!body || typeof body !== "object" || !("widget" in body))
    return DEFAULT_BRAND;
  const raw = (body as { widget: unknown }).widget;
  if (!raw || typeof raw !== "object") return DEFAULT_BRAND;
  const w = raw as Record<string, unknown>;

  const avatar = pickUrl(w.avatar);

  return {
    name: pickString(w.name, 1, 50) ?? DEFAULT_BRAND.name,
    welcomeMessage:
      pickString(w.welcomeMessage, 1, 500) ?? DEFAULT_BRAND.welcomeMessage,
    placeholder: pickString(w.placeholder, 0, 100) ?? DEFAULT_BRAND.placeholder,
    language: pickLanguage(w.language) ?? DEFAULT_BRAND.language,
    ...(avatar ? { avatar } : {}),
    primaryColor: pickColor(w.primaryColor) ?? DEFAULT_BRAND.primaryColor,
    position: pickPosition(w.position) ?? DEFAULT_BRAND.position,
    buttonSize: pickInt(w.buttonSize, 40, 80) ?? DEFAULT_BRAND.buttonSize,
    borderRadius: pickInt(w.borderRadius, 0, 32) ?? DEFAULT_BRAND.borderRadius,
    fontFamily: pickFontFamily(w.fontFamily) ?? DEFAULT_BRAND.fontFamily,
  };
}

function pickString(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

function pickUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  try {
    const u = new URL(v);
    // img src 용도라 http/https 만 허용 (data:/javascript: 차단)
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function pickColor(v: unknown): string | null {
  // CSS 변수 주입 대상 — 스키마 검증을 믿되 전송 도중 변조 가능성까지 재방어
  return typeof v === "string" && HEX_COLOR_RE.test(v) ? v : null;
}

function pickPosition(v: unknown): WidgetPosition | null {
  return typeof v === "string" && (POSITIONS as ReadonlySet<string>).has(v)
    ? (v as WidgetPosition)
    : null;
}

function pickLanguage(v: unknown): WidgetLanguage | null {
  return typeof v === "string" && (LANGUAGES as ReadonlySet<string>).has(v)
    ? (v as WidgetLanguage)
    : null;
}

function pickInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

// 서버 스키마는 `[\w\s,'-]+` 까지 허용하지만 클라는 `'` 를 제외.
// 이유 (재리뷰 code M-1 / sec M-3): fontFamily 가 큰따옴표로 포장된 CSS 값 안에 들어가면
// `Pretendard', 'Arial` 같은 입력이 `"Pretendard', 'Arial"` 로 직렬화되어 단일 폰트로 잘못 해석됨.
// XSS 는 아니지만 폰트 fallback 이 깨지는 UX 회귀라, 렌더 단계에서 추가 차단.
const FONT_FAMILY_RE = /^[\w\s,-]+$/;

function pickFontFamily(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  return FONT_FAMILY_RE.test(trimmed) ? trimmed : null;
}
