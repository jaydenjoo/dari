/**
 * 대화 목록의 "첫 질문 프리뷰" 생성 헬퍼.
 *
 * Task 1-8-a: conversations 목록에서 각 대화의 맨 처음 user 메시지를
 * 80자 내외로 축약해 표시한다. Server Component 에서 직접 호출.
 *
 * 설계 결정:
 *   - 입력 messages 는 DB 쿼리 순서에 의존하지 않는다 (정렬 가드 내장).
 *   - ISO 8601 created_at 은 사전식 비교 = 시각 정렬과 일치 (Z 종결자 전제).
 *   - truncate 는 UTF-16 code unit 기준 — 이모지 경계 끊길 수 있으나 MVP 수용.
 */

export interface PreviewableMessage {
  role: string;
  content: string;
  created_at: string;
}

export function pickFirstUserMessage<T extends PreviewableMessage>(
  messages: readonly T[],
): T | null {
  let earliest: T | null = null;
  for (const m of messages) {
    if (m.role !== "user") continue;
    if (earliest === null || m.created_at < earliest.created_at) {
      earliest = m;
    }
  }
  return earliest;
}

export function truncatePreview(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}
