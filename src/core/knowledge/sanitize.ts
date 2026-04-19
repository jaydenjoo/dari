/**
 * 지식 텍스트 sanitization (Task 1-7-a 보안 리뷰 H-2).
 *
 * 제거 대상:
 *   - NULL byte (U+0000): Postgres `text` 타입이 거부 (22021). DB 레벨에서 에러가
 *     터지기 전에 제거하여 에러 흐름 오염 방지.
 *   - Unicode 방향 제어 + zero-width + BOM: Trojan Source 변형 방어.
 *     knowledge chunks 가 RAG 로 LLM prompt 에 삽입되거나 UI 에 렌더링될 때
 *     텍스트 방향 반전/은닉 공격 차단. (widget 의 CONTROL_CHAR_RE 와 유사 범위)
 *
 * 범위 (의도적 비제거):
 *   - 일반 줄바꿈/탭 (`\n`, `\t`): FAQ·매뉴얼 서식에 필수.
 *   - 이모지: 지식 원문 보존.
 *
 * 지식 content 는 LLM 입력 + (현재는 비노출이지만 향후) UI 렌더링 양쪽 경로를
 * 통과하므로 저장 시점에 sanitize 하여 downstream 방어 중복을 줄인다.
 */

// U+0000 NULL byte.
const NULL_BYTE_RE = /\u0000/g;

// U+200B-U+200F 제로폭 계열 + U+202A-U+202E 방향 override + U+2060-U+206F 포맷
// + U+FEFF BOM. Tag chars 계열(U+E0000-U+E007F)은 별도.
const UNICODE_CONTROL_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

// Tag Characters (unicode "invisible" block — 은닉된 명령어 삽입에 쓰임).
const TAG_CHARS_RE = /[\u{E0000}-\u{E007F}]/gu;

export function sanitizeKnowledgeText(raw: string): string {
  return raw
    .replace(NULL_BYTE_RE, "")
    .replace(UNICODE_CONTROL_RE, "")
    .replace(TAG_CHARS_RE, "");
}
