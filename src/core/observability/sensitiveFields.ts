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
  // 클라이언트 IP — PIPA·GDPR 식별 가능 정보. 로깅 시 hash 형태(`ipHash`)로 변환할 것.
  // 'ipHash' 는 redact 대상 아님 (해시화로 PII 제거됨). 근거: security N-4 (Task 1-6-a).
  "ip",
  // Storage 경로 — `{bot_id}/{uuid}.{ext}` 패턴. bot_id UUID 유출은 RLS 로 격리됐지만
  // 멀티테넌시(workspace 도입) 이후 workspace/owner 추정 벡터로 전환 가능. Task 1-7-c
  // sec LOW-2 이월 → β-3 통합. 값 확인이 꼭 필요하면 해시 형태(`storagePathHash`)로 변환.
  "storagePath",
  "storage_path",
  // 주의: userId / user_id 는 redact 하지 않는다.
  //   - UUID 형태의 auth.uid() 는 직접 PII 가 아니며, 요청 상관분석(incident
  //     correlation)의 핵심 키. 프로덕션에서 "어떤 유저에게 발생한 에러"를
  //     추적하려면 반드시 로그에 남아야 한다.
  //   - OWASP Logging Cheat Sheet 도 UUID 식별자 로깅을 권장 (email/phone
  //     같은 직접 PII 와 구분).
  //   - Sentry 로 가는 내용은 별도 `beforeSend` redactDeep 이 2차 방어.
  //   - 근거: Task 1-5-c security-reviewer H-1 재평가 (2026-04-18).
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
