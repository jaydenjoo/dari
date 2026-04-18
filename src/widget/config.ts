/**
 * 위젯 설정 — data-* attribute 파싱 (보안 강화: sec H-1 + sec M-1).
 *
 * 설치 스니펫:
 *   <script src="https://dairect.kr/widget.js" data-bot-id="my-bot-slug" async></script>
 *
 * 설계 결정:
 *   - apiUrl 은 script.src 의 origin 만으로 결정한다. (sec H-1)
 *     `data-api-url` 등 속성으로 런타임 override 를 제공하지 않는다.
 *     공격자가 피해 사이트 DOM 에 접근 가능한 상황에서 메시지 유출 벡터가 될 수 있기 때문.
 *     staging/개발 용도는 별도 스크립트 URL (예: staging.dairect.kr/widget.js) 을 발급한다.
 *
 *   - botId 는 slug 정규식으로 사전 차단. (sec M-1)
 *     서버 DB 쿼리 전에 형식 검증으로 자원 낭비와 enumeration 시도를 줄인다.
 *     정규식은 서버측 slug 생성 규칙(lowercase 영숫자 + 하이픈) 과 일관.
 *
 *   - data-bot-id 는 path 파라미터가 `[botId]` 로 명명됐지만 실제 조회는 `slug` 기준이다.
 *     외부 인식 일관성을 위해 속성명은 `bot-id` 유지, 값은 slug 를 받는다.
 */

export interface WidgetConfig {
  readonly botId: string;
  readonly apiUrl: string;
}

/**
 * slug 형식: 첫·끝 글자는 영숫자, 중간은 영숫자/하이픈, 전체 1~64자.
 * 단일 문자 허용 (test fixture 대비), 연속 하이픈 허용 (서버와 동일 규칙).
 */
const BOT_ID_PATTERN = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * 확장 trim — 기본 `.trim()` 이 놓치는 비ASCII 공백·BOM·라인구분자 제거.
 * 공격자가 `\uFEFFmy-bot` 같이 invisible 문자를 주입해 위젯을 비활성화하는 DoS 벡터 차단.
 * (재리뷰 sec M-γ)
 *
 * 포함: 일반 공백(\s) + NBSP(U+00A0) + BOM(U+FEFF) + 라인/단락 구분자(U+2028/2029)
 * + 방향 제어(U+202A-U+202E) + isolate(U+2066-U+2069)
 */
const EXT_TRIM_RE =
  /^[\s\u00A0\uFEFF\u2028\u2029\u202A-\u202E\u2066-\u2069]+|[\s\u00A0\uFEFF\u2028\u2029\u202A-\u202E\u2066-\u2069]+$/g;

/**
 * script 태그의 dataset + src 로부터 설정 도출.
 * 필수값 누락이거나 형식 검증 실패 시 null — caller 는 silent fail.
 */
export function parseConfig(
  dataset: DOMStringMap,
  scriptSrc: string | null,
): WidgetConfig | null {
  const botId = dataset.botId?.replace(EXT_TRIM_RE, "").toLowerCase();
  if (!botId || !BOT_ID_PATTERN.test(botId)) return null;

  const apiUrl = deriveOriginFromSrc(scriptSrc);
  if (!apiUrl) return null;

  return { botId, apiUrl };
}

function deriveOriginFromSrc(src: string | null): string | null {
  if (!src) return null;
  try {
    return new URL(src).origin;
  } catch {
    return null;
  }
}
