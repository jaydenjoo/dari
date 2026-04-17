/**
 * 로그(Pino) / Sentry 리포트 양쪽에서 자동 redact 될 민감 필드명.
 * logger 와 beforeSend 의 **단일 진실 공급원**.
 *
 * 필드 추가/변경 시 이 파일만 수정하면 양쪽이 자동으로 동기화된다 — drift 방지.
 */

/** 정확한 이름 일치로 redact 대상이 되는 객체 키. */
export const SENSITIVE_FIELD_NAMES = [
  "password",
  "token",
  "authorization",
  "apiKey",
  "api_key",
  "secret",
  "clientSecret",
  "client_secret",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "privateKey",
  "private_key",
  "serviceRoleKey",
  "service_role_key",
  // 개인정보 (🟡 프로젝트 — 가맹점/사용자 이메일·전화번호 보호)
  "email",
  "phone",
  "phoneNumber",
  "phone_number",
] as const;

/** HTTP 헤더명 redact 대상 (case-insensitive 비교). */
export const SENSITIVE_HEADER_NAMES = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
] as const;

/** Redact 치환 문자열. */
export const REDACTED = "[Redacted]";

/**
 * Pino `redact.paths` 포맷으로 변환.
 * 최상위 / 1-depth 중첩 / HTTP 헤더(2-depth) 경로를 모두 나열.
 * Pino 는 완전 일치 + 1-depth glob 기반이므로 `*.password` 경로를 명시적으로 추가.
 */
export function buildPinoRedactPaths(): readonly string[] {
  const paths: string[] = [];

  for (const field of SENSITIVE_FIELD_NAMES) {
    paths.push(field);
    paths.push(`*.${field}`);
  }

  for (const header of SENSITIVE_HEADER_NAMES) {
    paths.push(`headers.${header}`);
    paths.push(`req.headers.${header}`);
  }

  return paths;
}
