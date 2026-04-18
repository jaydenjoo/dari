/**
 * 공통 상수: 테스트 계정 이메일/비번.
 *
 * 이메일은 `@dari.test` 가짜 도메인을 사용해 실 발송을 원천 차단.
 * 비번은 현재 정책 (8자 이상, OWASP 2025 권장) 을 충분히 초과하는 복잡한 값.
 */

export const MAIN_TEST_USER = {
  email: "e2e-main@dari.test",
  password: "PlaywrightE2E!2026",
} as const;
