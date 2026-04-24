/**
 * Task B-4: Claude 토큰 단가 (USD per 1M tokens).
 *
 * **근사치 주석 (CRITICAL)**: `messages.tokens_used` 는 input + output 합산 단일
 * 필드다. Claude 는 input/output 단가가 다르지만 (output ≈ 5× input), 현 스키마
 * 에서는 분리 불가 → "혼합 평균 단가" 로 근사. ±15~20% 오차 수용 (Phase 3
 * `input_tokens`/`output_tokens` 분리 마이그레이션으로 정확도 향상 예정).
 *
 * 하드코딩 근거: MVP 단계. Phase 3 에 env (`CLAUDE_USD_PER_1M_TOKENS`) 또는
 * DB `model_pricing` 테이블로 이관. 단가 변경 시 이 파일 1 줄 수정.
 *
 * 기준 모델: **Claude Haiku 4.5** (현 `src/core/ai/factory.ts` 기본 모델).
 * Anthropic 공식 가격 (2026-01 기준):
 *   - Input:  $1.00 / 1M tokens
 *   - Output: $5.00 / 1M tokens
 *   - 일반 챗봇 대화 비율 (대략 1:2 in/out) → blended ≈ $3.67/1M
 *   - 보수적 혼합 단가: **$3.50/1M** (약간 저평가로 원가 경고 민감도 ↓)
 *
 * 모델 변경 시 이 값 갱신 + learnings.md 기록.
 */

// USD per 1M tokens. blended (input + output 혼합 근사).
export const CLAUDE_HAIKU_4_5_USD_PER_MILLION_TOKENS = 3.5;

// 앱 전체 기본 단가. `factory.ts` 기본 모델과 동기화.
export const DEFAULT_USD_PER_MILLION_TOKENS =
  CLAUDE_HAIKU_4_5_USD_PER_MILLION_TOKENS;
