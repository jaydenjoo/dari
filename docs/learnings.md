# 교훈 기록 (Compound Engineering)

> **기록 원칙**: 증상 → 원인 → 해결 → **규칙** (규칙이 핵심)
>
> **기록 트리거**:
>
> - 에러 2회 이상 반복
> - 30분 이상 소요된 문제
> - AI가 방향을 이탈한 케이스
> - 설계 결정 (왜 이 방식을 선택했나)
>
> **기록 안 함**: 단순 오타, 1분 해결, 일회성 환경 문제

---

## 템플릿

### [날짜] 제목

**증상**: 무엇이 어떻게 잘못됐는가

**원인**: 왜 그랬는가 (근본 원인까지)

**해결**: 어떻게 고쳤는가

**규칙** ⭐: 다음엔 이렇게 하면 재발 방지

- 규칙 1
- 규칙 2

---

## 기록

### 2026-04-19 supabase-js `.rpc()` 안전 계약 — `{data,error}` + throw 두 경로 모두 감싸야 함 (기술 이슈)

**증상**: Task 1-6-c `retrieveRelevantChunks` 초안. `embedBatch` 는 try-catch 로 감쌌는데 `admin.rpc("match_knowledge_chunks", ...)` 는 `{ data, error }` 분기만 처리. 독립 code-reviewer 리뷰 MEDIUM-1: `admin.rpc()` 자체가 네트워크 단절/fetch 레이어 예외 시 throw 로 나올 수 있고, 이 경로는 catch 되지 않아 상위 `callAnthropic` 까지 예외가 전파됨 → `null` 반환 → 502 응답. "RAG 는 보조 기능이므로 chat 전체 실패로 전파 금지" 안전 계약 위반.

**원인**: supabase-js (postgrest-js) 의 응답 모델은 **두 경로**. ① DB 단에서 쿼리가 실행되어 에러가 돌아오면 `{ data: null, error: {...} }` 일반 경로. ② 네트워크/fetch 레이어에서 실패하면 `throw`. 함수 내부에서 `embedBatch` 처럼 명시적 throw 만 가정하고 `.rpc()` 는 구조화된 응답만 올 것이라고 가정하면, 네트워크 장애 시점에 안전 계약이 깨진다. embedBatch catch 와 admin.rpc catch 의 **대칭성**이 안전 계약의 형식적 조건.

**해결**: `admin.rpc(...)` 호출을 try-catch 로 감싸 throw 경로도 빈 배열 fallback 으로 귀결시키고, 회귀 방지 테스트 (`mockRpc.mockRejectedValueOnce(new Error("fetch failed"))`) 로 catch 누락을 즉시 노출하도록 추가.

**규칙** ⭐:
- supabase-js `.rpc()` / `.from().select()` 등 네트워크 호출이 **안전 계약(throw 금지)** 을 가지는 함수 안에 있으면 **반드시 try-catch + `{error}` 분기 둘 다** 처리.
- 동일 함수 내에서 외부 호출이 여러 개면 모든 외부 호출에 대해 **대칭적으로** catch 적용 (일부만 감싸면 경로 불일치가 독립 리뷰에서 반드시 잡힌다).
- 안전 계약 구현을 증명하는 것은 **해피 패스 아닌 실패 경로 테스트**. throw 케이스를 mock 하는 테스트는 필수.

---

### 2026-04-19 소유자 신뢰 모델 escape 정책 — 외부 입력 vs 내부 설정 분기 (설계 결정)

**증상**: Task 1-6-c `augmentSystemPromptWithKnowledge` 독립 security-reviewer 리뷰 MEDIUM-2: 청크 content 는 escape 하면서 `basePrompt` (봇 소유자 systemPrompt) 는 escape 안 함. 소유자가 실수로 systemPrompt 에 `</knowledge>` 를 삽입하면 LLM 이 지식 블록 닫힘으로 오해 가능. "같은 함수의 두 입력을 다르게 처리하면 일관성 훼손 아닌가?"

**원인**: Prompt 조립 함수에 들어오는 두 입력의 **신뢰 경계(trust boundary)** 가 다르다. 청크 content 는 봇 소유자가 업로드한 자료지만 사용자(지식을 이용할 end-user) 입장에서는 외부 입력 — 악성 청크로 LLM 을 조종할 수 있는 Prompt Injection 벡터 (OWASP LLM01). basePrompt 는 봇 소유자 본인이 직접 작성한 systemPrompt 로, Claude 공식 권장 패턴에서 `<role>`, `<instructions>`, `<format>` 같은 XML 태그를 소유자가 **의도적으로** 사용하는 것이 정당. escape 를 걸면 이 정당한 사용을 훼손.

**해결**: escape 적용 범위를 "외부 입력 청크 content" 로 한정하고, basePrompt 는 그대로 전달. 주석에 "basePrompt 는 봇 소유자가 작성한 systemPrompt 로 신뢰된 입력이며... `<role>` 등 XML 태그를 사용하는 것이 정당 ... 소유자가 실수로 `</knowledge>` 를 넣는 시나리오는 소유자 자기 책임 영역으로 수용" 명시 (security MEDIUM-2 의식적 미반영 근거).

**규칙** ⭐:
- Prompt / Template 조립 함수에서 여러 입력이 들어올 때, 각 입력의 **신뢰 경계**를 먼저 식별: 외부 입력(사용자·크롤러·API) / 소유자 입력(설정값·systemPrompt) / 시스템 상수.
- escape/sanitize 는 **외부 입력**에만 적용. 소유자 입력에 escape 를 걸면 Claude 공식 XML 패턴 같은 정당한 사용을 차단.
- 신뢰 경계 분기의 **근거를 주석에 명시** — 미래 리뷰어가 "왜 한쪽만 escape 하지?" 로 되묻지 않게.
- 의식적 미반영 결정은 독립 리뷰 ID(sec MEDIUM-2 등) 와 함께 주석에 코딩 → 추적 가능성.

---

### 2026-04-19 Vercel Sentry Native Integration 이 기존 수동 조직 무시 + env 숨김 주입 (AI 이탈 / 설계 결정)

**증상**: Jayden 이 Sentry 설정을 위해 ① Sentry 웹에서 수동으로 `dari-vb` 조직 + `javascript-nextjs` 프로젝트 생성 + DSN 복사 → `.env.local` 에 등록 ② Vercel Marketplace 에서 Sentry Integration 설치 (Create New 선택). Vercel 배포 로그 확인 시 source map 은 전혀 다른 조직(`jayden-f0`) + 프로젝트(`sentry-copper-mountain`) 로 업로드. Vercel Project Settings → Environment Variables UI 에는 `SENTRY_*` env 가 하나도 안 보임에도 빌드 시점에는 정상 주입되어 warning 2건 제거됨.

**원인**:
- Vercel Marketplace 의 "Create New Sentry Account" (Vercel Native) 경로는 **기존 Sentry 계정과 완전 독립적으로 신규 조직을 자동 생성**. Jayden 이 이미 만든 `dari-vb` 를 탐색/연결하지 않는다. 결과적으로 조직 2개 공존.
- Integration-주입 env (`SENTRY_AUTH_TOKEN` 등) 는 Project Settings → Environment Variables UI 에 표시되지 않는 숨김 경로로 주입. 사용자 관리 env 와 구분되어 "숨김 주입" 방식. UI 에서 존재 확인 불가, 배포 로그에서만 동작 증명.
- AI 가 `@sentry/nextjs` 코드 통합을 먼저 완료한 후 Jayden 이 외부 설정을 해야 하는 의존 관계에서, 설정 절차의 권장 순서(`Vercel Marketplace 먼저 → 자동 프로젝트 생성` vs `수동 프로젝트 먼저 → Integration 나중에`) 를 선행 안내하지 않음 → Jayden 이 수동 조직 + Integration 자동 조직 양쪽 만드는 시행착오.

**해결**: 사건 시점에는 `jayden-f0` 유지 + `dari-vb` 폐기 경로 A 채택 (Integration 이 이미 정상 연결). `.env.local` DSN 도 `jayden-f0` 의 것으로 재교체. 근본 재발 방지는 메모리 + 이 교훈:

**규칙** ⭐:
- 외부 SDK 도입 Task 의 Plan 단계에서 **외부 선결 조건 체크리스트**를 먼저 제시 (계정/조직/프로젝트/권한/env/결제/**공식 권장 설치 순서**/수동 구간). 코드 완성 후 Jayden 이 외부 설정 착수하면 늦다 — 배포 warning 이 첫 증상.
- Vercel Marketplace 류 "Create New" 는 기존 외부 계정을 **탐색하지 않음**. "Link Existing" 선택지가 있으면 이게 기본이어야 한다. 안내 시 반드시 Link Existing 을 기본 추천.
- Integration-주입 env 는 UI 표시 안 될 수 있다. 존재 확인은 Project Settings 가 아니라 **배포 로그** (`Organization: ...`, `Projects: ...` 라인) 가 진실의 근원.
- 메모리 `feedback_external_service_precheck.md` 규칙을 Plan 단계마다 트리거해서 체크리스트 선제시.

---

### 2026-04-19 공개 에러 메시지 정적화 — 외부 호출 실패 시 throw 에는 static identifier (설계 결정)

**증상**: Task 1-7-a 독립 보안 리뷰 H-1. `src/core/knowledge/ingest.ts` 의 `supabase.rpc("replace_text_knowledge_chunks", …)` 실패 시 `throw new Error(\`replace_text_knowledge_chunks failed: ${error.message}\`)` 로 Postgres 에러 메시지를 throw 에 포함. 현재 경로(Server Action catch)는 일반화 메시지로 가공하지만, 향후 API Route/Edge Function 이 catch 없이 에러를 전파하면 Postgres errcode(`23503 foreign_key_violation`), 정책명("new row violates row-level security policy"), 테이블·컬럼명 등 내부 스키마 정보가 HTTP 응답에 노출될 수 있다. OWASP A05 Security Misconfiguration.

**원인**: 에러 메시지에 외부 API/DB 응답의 `error.message` 를 그대로 interpolation 하는 관례. 편의상 자주 쓰이지만, "어느 호출자가 어떻게 catch 할지" 는 함수 시그니처로 보장 불가. 함수를 public API 로 내놓는 순간, 에러 흐름 중 하나라도 catch 를 빼먹으면 내부 정보가 샌다 (fail-open 경로).

**해결**: throw 메시지는 static identifier(`"knowledge RPC failed"`) 만. 내부 상세는 `logger.error({ err, botId, chunkCount }, "…")` 메타 필드에 담아 **단일 출처**로 기록. 상위 catch 가 일반화 응답(`"지식 저장에 실패했어요"`) 으로 바꿀 여지를 주면서, catch 가 누락돼도 사용자 응답에 내부 정보가 섞이지 않는다. 테스트도 `rejects.toThrow(/^knowledge RPC failed$/)` 정적 매칭 + `rejects.not.toThrow(/row-level security/)` 내부 메시지 비포함 검증 쌍으로 회귀 방지.

**규칙** ⭐:

- **외부 API/DB/RPC 실패의 throw 메시지는 static identifier 만** — `"knowledge RPC failed"`, `"anthropic API failed"`, `"upstash rate check failed"` 수준. 동적 interpolation(`${error.message}`) 금지.
- **내부 상세는 logger.error 메타 단일 출처** — 디버깅 정보(Postgres errcode, 정책명, 스택, 요청 컨텍스트 botId/userId) 는 logger 에만. 여러 호출자가 catch 없이 전파해도 내부 정보가 사용자에게 가지 않는다.
- **테스트에서 양방향 검증** — `rejects.toThrow(/^static-id$/)` + `rejects.not.toThrow(/internal-keyword/)` 쌍. 미래 회귀 + 개발 중 `error.message` 포함하려는 유혹을 코드 리뷰 단계에서 차단.
- **호출자 관례 의존 금지** — "지금 호출자가 catch 하니까 괜찮다" 는 시점 편의. 함수 public 화 = 에러 노출 경로 무한 확장. 시그니처만으로 안전해야 한다.
- **예외: 호출자가 확정된 internal 헬퍼**는 static + 필요 시 덧붙이기 허용. 단 public export 순간 static 고정 재검토.

---

### 2026-04-19 side-effect import 모듈 테스트 — vi.hoisted + process.env 사전 주입 (설계 결정)

**증상**: Task γ-3 에서 `src/shared/config/env.test.ts` 를 작성. `env.ts` 는 import 시점에 `parseEnv()` 를 즉시 호출하고 필수 환경변수 누락 시 throw 한다 (fail-fast 설계). `import { clientSchema } from "./env"` 하는 순간 test 환경이 production 수준 env 를 갖추지 않아 즉시 실패 (`GOOGLE_GENERATIVE_AI_API_KEY`, `UPSTASH_REDIS_REST_URL` 등 "Invalid input: expected string, received undefined"). Vitest 는 기본적으로 `NODE_ENV=test` 만 주입.

**원인**: ES 모듈 spec 에 따라 top-level statement 는 import 구문보다 먼저 실행되지 않는다 (import hoist). 테스트 파일 상단에 `process.env.X = ...` 를 작성해도 `import` 가 먼저 실행되어 env.ts 의 side-effect 가 먼저 터진다. `beforeAll` / `beforeEach` 는 describe 블록 진입 이후이므로 역시 늦다.

**해결**: `vi.hoisted()` 콜백은 vitest 런타임이 **import 구문보다 먼저 실행되도록 hoist** 한다. 그 안에서 `process.env.X ??= "..."` 로 필수 env 주입 후 `import` 실행.

```ts
// src/shared/config/env.test.ts
import { vi, describe, it, expect } from "vitest";

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY ??= "sk-fake-anthropic-test-placeholder";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fake-supabase-service-role-test-key";
  // ... 나머지 필수 env
});

import { clientSchema } from "./env"; // 이제 parseEnv 통과
```

추가 주의사항:

- **`NODE_ENV` 재할당 금지** — `@types/node` + Next tsconfig 조합으로 readonly literal union 이라 TS2540. vitest 가 자동 주입하므로 재할당 불요·불가.
- **플레이스홀더에 `fake-*` prefix + `test-placeholder` suffix** — gitleaks / truffleHog 패턴 회피. "이게 실 키 아니다" 를 정규식과 코드 리뷰어 눈으로 모두 구분 가능.
- **`??=` 로 기존 환경변수 보존** — 실 환경에서 테스트 실행 시 실 값 유지, 각 테스트 파일이 독립적으로 주입해도 충돌 없음.

**규칙** ⭐:

- **부팅 시 fail-fast 하는 환경 검증 모듈 (env / config / bootstrap)** 을 test 하려면 `vi.hoisted` 로 import 전 주입. describe 내 `beforeAll` 은 늦다. Jest 의 `jest.setMock` hoist 와 유사한 패턴.
- **대안 고려**: 모듈이 복잡해지면 "schema 정의" 와 "parse 실행" 을 별도 파일로 분리 (`env.schema.ts` + `env.ts`) 하면 side-effect free import 로 테스트 용이. 이번은 vi.hoisted 로 충분해서 분리 보류 — 테스트가 3개 이상 늘거나 schema 자체를 런타임에 재사용해야 할 때 분리 승격.
- **테스트 키에 `fake-*` prefix 강제** — gitleaks / truffleHog / GitHub secret scanner 정규식 회피. 공개 리포 (GitHub) 사용 시 필수.
- **NODE_ENV 는 런타임 플랫폼이 주입** — vitest (test), Next (dev/prod), Vercel (production) 각각 담당. 테스트 코드는 신뢰만.

---

### 2026-04-18 공개 응답의 화이트리스트 명시 복제 — spread 금지 (설계 결정)

**증상**: Task 1-6-d `/api/widget-config/[botSlug]` GET 엔드포인트가 `DariConfig` 에서 위젯에 필요한 필드를 선별해야 했다. 전체 config 는 10+ 섹션으로, `identity` / `appearance` 외에 `ai.systemPrompt` (8000자 봇 로직), `knowledge.sources` (비공개 문서), `allowedDomains` (CORS 화이트리스트), `analytics.webhookUrl` (SSRF 검증된 외부 URL), `behavior.*` 등 **절대 노출하면 안 되는 필드**가 다수.

**원인**: "필요한 필드 추가" 방식으로 짜면 편하지만, 스키마 확장 시 새 필드가 **자동 노출되는 fail-open 경로**가 된다. 반대로 "민감 필드 제외" 블랙리스트 방식은 체크 누락 시 즉시 유출. 공개 API response shape 는 **명시적 화이트리스트만 안전**.

**해결**: `pickPublicConfig(config: DariConfig): WidgetPublicConfig` 단일 출처에서:

- **spread 금지** (`...config.identity` 도 금지) — 필드를 하나씩 이름으로 복제
- 9 필드만 명시: `name / welcomeMessage / placeholder / language / avatar / primaryColor / position / buttonSize / borderRadius / fontFamily`
- 반환 타입 `WidgetPublicConfig` 를 readonly interface 로 — TS 가 shape 불일치 감지
- 새 필드가 스키마에 추가돼도 `pickPublicConfig` 가 자동 **누락** (안전 fail)

**규칙** ⭐:

- **공개(anon) response DTO 는 spread 금지** — 필드를 한 줄씩 이름으로 명시 복제. 타입이 `Pick<Config, …>` 라도 런타임 객체 리터럴은 명시 필수.
- **블랙리스트(제외 방식) 금지** — 새 필드가 생겼을 때 리뷰어가 "이거 빼야 하나?" 체크해야 하는 구조는 결국 샌다.
- **DTO 인터페이스는 readonly** — 클라이언트가 원본 객체 의도 오인 방지. 서버 `WidgetPublicConfig` 와 클라 `WidgetBrand` 를 거울처럼 매칭.
- **스키마 전체 대조를 파일 상단 주석으로 유지** — pickPublicConfig 상단에 "절대 노출 금지 필드" 체크리스트 명시 (현재 route.ts 파일 상단 docblock).

---

### 2026-04-18 Enumeration 방어 — HTTP status + response code 둘 다 통일 (설계 결정)

**증상**: Task 1-6-d 1차 구현에서 "bot 부존재" = `404 + bot_not_available`, "origin 거부" = `403 + origin_not_allowed`. 코드 주석엔 "모두 404 계열로 위장(enumeration 방지)" 로 적혀 있었지만 실제로는 status + code 모두 구분됨.

**원인**: **HTTP status 하나만 통일하면 충분하다는 착각**. 공격자가 응답 body 를 파싱하면 `code` 필드에서 구분 가능. 반대로 `code` 만 통일하고 status 가 다르면 네트워크 탭/cURL 로 구분. 둘 중 하나라도 다르면 slug enumeration 경로가 열린다.

**해결**: `origin_not_allowed` 분기를 제거하고 bot 부존재와 **완전히 동일한 응답**:

```ts
if (!matchAllowedDomain(origin, bot.config.allowedDomains)) {
  return jsonError("bot_not_available", 404, origin, bot.config.allowedDomains);
}
```

`ErrorCode` union 에서 `origin_not_allowed` 자체를 제거 — 타입 레벨에서도 재사용 경로 차단.

**규칙** ⭐:

- **Enumeration 방어는 `HTTP status + response body code + 응답 지연` 3요소 모두 통일**. 하나라도 다르면 timing oracle / response diff 로 식별됨.
- **"봇 존재 + 권한 거부" 는 "봇 부존재" 와 동일 응답** — 공개 endpoint 에서 존재 여부 누출은 그 자체가 정보 유출.
- **rate limit 응답(429) 만 예외 허용** — 브라우저가 retry-after 해석해야 하므로 다른 status 필요. 대신 rate limit 을 botId+IP 복합키로 단시간 probing 어렵게.
- **타입 union 에서도 제거** — ErrorCode 에 남아 있으면 미래 리팩터 때 재사용 위험. "쓰이지 않는 상수" 는 제거가 안전.

---

### 2026-04-18 신규 보안 함수 3건 포함 위젯 번들 재리뷰에서 bypass 3건 추가 포착 (설계 결정)

**증상**: Task 1-6-b 위젯 스캐폴딩 1차 리뷰(code + security 병렬)에서 9건을 일괄 반영한 뒤 Ship 직전 security 단독 재리뷰를 돌렸다. 차단급(CRITICAL)·HIGH 0 + 회귀 0 이었지만 MEDIUM 3건이 **신규 보안 함수 3종(`BOT_ID_PATTERN` / `sanitizeUserInput` / `extractKnownCode`)의 bypass 경로**로 포착됐다:

1. `sanitizeUserInput` 의 C1 제어문자(`\x80-\x9F`) 미필터
2. `sanitizeUserInput` 의 Unicode 방향 제어(U+202A-E) · isolate(U+2066-9) · BOM(U+FEFF) · Tag characters(U+E0000-7F) 미필터
3. `config.ts` 의 `.trim()` 이 비ASCII 공백(NBSP/BOM/라인구분자) 을 놓쳐 `\uFEFFslug` 형태의 invisible DoS 가능

**원인**: 보안 함수의 "정상 입력 보존 vs 공격 입력 차단" 트레이드오프는 1차 리뷰 시야에서 **현재 구현이 커버하는 범위**에 집중된다. "아직 커버 안 하는 범위의 공격 벡터"는 2차 관점에서야 탐지된다. 특히 LLM Prompt Injection 의 Unicode 층위(방향 제어, Tag chars)는 2024-2025 새 연구 결과라 일반 1차 리뷰 체크리스트에 미편입.

**해결**:

- `CONTROL_CHAR_RE` 를 `\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F` 로 확장 (C1 포함)
- `UNICODE_CONTROL_RE` 신규 추가 (`[\u202A-\u202E\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]` / `u` 플래그)
- `config.ts` 에 `EXT_TRIM_RE` (일반 공백 + NBSP + BOM + 라인/단락 구분자 + 방향 제어 + isolate) 로 trim 확장
- `widget.test.ts` 신규 14 케이스 — 정상 입력 보존 3 / C0 3 / C1 1 / 방향 4 / Tag 1 / 조합 3
- 번들 4.1 → 4.4KB gzip (0.3KB 증가로 공격 표면 대폭 축소)

**규칙** ⭐:

- **신규 보안 함수 추가 시 반드시 security 단독 재리뷰 라운드** — "현재 구현 커버 범위" 외 bypass 탐색 전용 프롬프트로. 지난 Task(1-5-d SSRF IPv6, 1-6-a 차단급 M-1) 에 이은 세 번째 실증. 이제 **공식 절차** 로 편입.
- **Unicode 사용자 입력 sanitize 체크리스트**: C0(0x00-1F) / DEL(0x7F) / C1(0x80-9F) / 방향 제어(U+202A-E) / isolate(U+2066-9) / BOM(U+FEFF) / Tag chars(U+E0000-7F) 층을 한 번에 제거. 정상 입력에 필요한 ZWSP(U+200B) / ZWNJ(U+200C) / ZWJ(U+200D) 는 제외(이모지 결합·폰트 처리).
- **`.trim()` 은 보안 경계에 부족** — JavaScript 기본 `trim()` 이 비ASCII 공백(NBSP/BOM 등)을 전부 제거하지 않음. slug 처럼 ASCII 전제 필드는 명시적 확장 정규식 사용.
- **sanitize 테스트는 "정상 입력 보존" 케이스 먼저** — 한글/이모지/개행이 깨지지 않는지부터 확인해야 실용성 유지. 공격 차단만 테스트하면 overfilter 회귀를 못 잡음.

---

### 2026-04-18 pnpm 은 `prebuild` 훅 미자동실행 — `&&` 체인 명시 필수 (기술 이슈)

**증상**: Task 1-6-b 에서 Next 빌드 전에 위젯 번들을 선행 생성하려고 `package.json` 에 `"prebuild": "pnpm build:widget"` 훅을 넣었다. `pnpm build` 실행 시 훅이 **미호출**되어 `public/widget.js` 갱신이 안 됨. 첫 검증에서는 이전 호출 산출물이 public/ 에 남아 있어 "성공"처럼 보였으나, 삭제 후 재실행으로 함정 포착.

**원인**: pnpm 7+ 부터 `pre*` / `post*` 스크립트는 **보안상 기본 비활성화** 되었다 (supply chain 공격 방어 — 악성 dep 이 `postinstall` 등으로 임의 실행되는 벡터 차단). npm/yarn 은 여전히 실행한다. `enable-pre-post-scripts=true` 로 켤 수는 있으나 전역 리스크 증가.

**해결**:

- `"build": "pnpm build:widget && next build"` 로 명시 체인 전환
- `"prebuild"` 스크립트 제거
- 모든 pipeline 관계는 `&&` / `;` 로 명시, 훅 의존 금지

**규칙** ⭐:

- **pnpm 프로젝트에서 `pre*` / `post*` 훅 의존 금지** — `prepare` (husky 등) 만 예외적으로 작동. 나머지는 명시 체인으로.
- **산출물 선행 삭제로 빌드 체인 검증** — 빌드 스크립트 추가 후 반드시 `rm -f <산출물> && pnpm <chain>` 으로 파이프라인이 "정말로 생성하는지" 확인. 기존 산출물 잔존이 성공 착시를 만든다.
- **빌드 스크립트 내부에서 이전 산출물 정리** — `unlink(outfile).catch(()=>{})` 한 줄로 dev 모드 산출물이 prod 빌드에 섞이는 경로(`.map` 파일 등) 완전 차단. `.gitignore` 만으로는 배포 파이프라인(Vercel 등) 에서 방어 불가.

---

### 2026-04-17 계획 수립 시 3대 우선순위 명시적 검증 필요 (설계 결정)

**증상**: 초기 마스터 플랜 v1.0은 기능 나열 중심이었으나, 안정성(P1) 40점으로 치명적 부실.
테스트 전략 없음 / 에러 처리 아키텍처 없음 / 로깅·관찰성 없음 / Rate limiting 없음 / Prompt Injection 방어 없음 / CORS·도메인 화이트리스트 없음 등 12개 누락.

**원인**: 기능 중심(MoSCoW) 사고에 갇혀 비기능 요구사항(NFR = 안정성·유지보수·확장성)을 뒤로 미룸. "구현 먼저, 안정성은 나중에" 마인드는 나중에 벽을 뜯어야 하는 재공사로 이어짐.

**해결**: Jayden의 3대 우선순위 확인(1. 안정성 > 2. 유지보수 > 3. 확장성)에 맞춰 마스터 플랜 v3.0 재설계.

- Epic 0-E (안정성 기반) 추가: Vitest/Playwright/Pino/Sentry/Health check
- Epic 0-F (유지보수 기반) 추가: ADR/CI/환경 분리/모듈 README
- Epic 0-G (확장성 기반) 추가: Plugin 인터페이스/EventBus
- Task 1-0 (보안 기반) 추가: Rate limit/CORS/Prompt Injection 방어

**규칙** ⭐:

- 계획 수립 시 **항상 P1/P2/P3에 대해 명시적 검증 섹션을 포함**할 것. "기능 나열 → 끝"은 부실 계획.
- 각 Task 종료 기준에 **"테스트 작성 + 에러 처리 + 로깅"을 공통 필수**로 편입.
- 안정성·관찰성 장치는 **Phase 0에 선배선**. 기능 다 올린 후 박아넣기는 불가능에 가까움.

---

### 2026-04-17 개발 완료와 공개 공지 분리 사고의 함정 (설계 결정)

**증상**: 프로젝트 완료 후 데모 별도 제작하려는 사고 패턴 확인됨. 이는 완벽주의 함정 → 영영 공개 못 함.

**원인**: "개발 ≠ 공개" 이분법. 실제로는 **실배포가 곧 검증 수단**이며, 혼자만의 완성 기준은 끝없이 올라감.

**해결**: Soft Launch 4 Stage 전략을 플랜에 편입.

- Stage 1 (사일런트 배포, Day 14): dairect.kr 1개 봇 본인만 사용
- Stage 2 (클로즈드 베타, Day 15): 3개 봇 + 지인 5~10명
- Stage 3 (소프트 오픈, Day 17~18): 랜딩 공개 + 블로그
- Stage 4 (퍼블릭 런칭, Day 18): 포트폴리오 등록 + SI 영업 개시

**규칙** ⭐:

- 개발과 공개를 **한 로드맵에 병합**할 것. Phase 1.5부터 실배포 시작.
- "완성의 기준"을 **Go/No-Go 기준으로 고정**. 감정적 완벽주의 방지.
  예: Stage 1 → 2: "내가 3일 사용해보고 싫지 않다", Stage 2 → 3: "테스터 10명 중 6명 '또 쓰겠다'"
- 데모는 별도 제작물이 아님. **실배포된 인스턴스 = 라이브 데모**. 별도 제작 비용 0.

---

### 2026-04-17 Write 도구가 `.env*` 파일 생성 차단 (기술 이슈)

**증상**: `.env.example` 생성 시 Write + Bash heredoc 모두 `Permission denied`.

**원인**: Claude Code 보안 정책이 모든 `.env*` 파일 생성을 원천 차단 (실제 비밀 유출 방지 목적). 내용이 템플릿이어도 차단됨.

**해결**: `docs/env-template.md` 로 대체 — 기능 동일, 관례만 다름. `.gitignore`에 `!.env.example` 예외 규칙은 미리 추가해둠 (미래 대비).

**규칙** ⭐:

- `.env*` 파일은 Claude가 **생성 불가**. 실제 값은 **Jayden이 직접 생성** 필수.
- 환경변수 템플릿은 `docs/env-template.md` 에 작성 → Jayden 이 복사해서 `.env.local` 만듦.
- 관례(`.env.example`)를 지키지 못할 때는 **명시적 대체 문서 + 이유 주석** 남길 것.

---

### 2026-04-17 Zod 4.x `.default({})` 엄격 타입 체크 (기술 이슈)

**증상**: nested Zod schema에 `.default({})` 사용 시 TS2769 에러 5개 발생.
예: `behaviorSchema.default({})` → "Argument of type '{}' is not assignable..."

**원인**: Zod 4.x는 `.default()`의 값 타입을 output 타입으로 엄격 검증. inner 필드 모두에 default가 있어도 TS 입장에선 output 타입에 **모든 필드가 필수로 표기**됨.

**해결**: `schema.default(schema.parse({}))` 패턴 — 모듈 로드 시 각 default가 합쳐진 완전한 객체를 생성해 전달.

```ts
// ❌ Zod 4.x에서 타입 에러
behavior: behaviorSchema.default({}),

// ✅ 모듈 로드 시 완전한 default 객체 생성
behavior: behaviorSchema.default(behaviorSchema.parse({})),
```

**규칙** ⭐:

- Zod 4.x에서 **nested object에 빈 default**를 주려면 `schema.default(schema.parse({}))` 패턴 사용.
- 각 inner 필드에 default가 모두 있어야 `parse({})`가 성공 → 이 전제가 깨지면 모듈 로드 단계에서 실패 감지 가능 (좋은 조기 경고).
- 함수형 default `default(() => schema.parse({}))` 도 가능하나, 값 default가 TS 추론과 더 잘 맞음.

---

### 2026-04-17 Drizzle + Supabase RLS 궁합 — 실행 직전 재평가 필요 (설계 결정)

**증상**: Task 3 Step 4 구현 직전, 원계획(Drizzle ORM + Supabase 하이브리드)의 실행 단계에서 RLS 자동 적용 문제 발견. 설계 승인까지 받고 파일 작성 직전에 재평가하여 Drizzle 제외로 전환.

**원인**: 계획 단계에선 Drizzle이 "쿼리 빌더로만" 기능한다고 낙관. 실제로는 `postgres-js` 드라이버가 `DATABASE_URL`로 직결 → service_role 권한으로 연결 → **RLS 완전 무시됨**. Supabase의 핵심 가치(RLS 자동 적용)를 상실하거나 매 쿼리마다 `SET LOCAL request.jwt.claim.sub = '...'` 수동 세션 설정이 필요. Next.js SSR 쿠키/세션 통합도 공식 지원 없음.

**해결**: Drizzle 제외, `@supabase/ssr` + `supabase-js` 일원화. 브라우저/서버/관리자 클라이언트 3종 분리. 복잡한 분석 쿼리가 실제로 생기면 그 시점에 Drizzle 재평가.

**규칙** ⭐:

- **계획과 구현 사이에 "실행 직전 재평가" 단계를 항상 명시적으로 둘 것**. 사전 완벽 계획은 불가능. 구현 흐름 안에 재평가 지점을 내장.
- **외부 스택 궁합 이슈는 코드 쓰기 시작해야 보이는 경우 많음**. 특히 인증/권한/세션 관리 영역. 타 라이브러리와의 **integration mode** (service_role 직결 vs RLS 경유 vs 세션 전달)를 계획 단계에서 문서화.
- "에러 최소 + 효율" 원칙은 **이미 확립된 공식 패턴 우선**. 하이브리드 구조는 첫 구현에는 비추천 — 한 방향으로 밀고 필요시 보강.
- 계획 승인 이후에도 **재평가 발견 시 즉시 멈추고 Jayden에게 비교표 제시**. 침묵으로 원계획 밀고 나가면 에러 누적.

---

### 2026-04-17 gitleaks — env 샘플값은 `<placeholder>` 각괄호 형식으로 (기술 이슈)

**증상**: `docs/env-template.md` 커밋 시 pre-commit 훅의 gitleaks가 JWT prefix (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)와 `placeholder_anon_key_at_least_20_chars` 를 실제 키로 오인 → 3건 차단.

**원인**: gitleaks의 `generic-api-key` 룰은 엔트로피 기반 탐지 (임계치 약 3.5). 영숫자 조합 문자열이 이 값을 넘으면 탐지됨. JWT prefix도 base64 특성상 고엔트로피.

**해결**: 실제 키가 아닌 모든 샘플값을 `<paste-from-dashboard>`, `<placeholder-for-dev-boot>` 형태의 각괄호 placeholder로 교체. env.ts의 `.min(20)` Zod 제약 통과하도록 길이 유지.

**규칙** ⭐:

- **env 템플릿 문서는 항상 `<xxx-xxx>` 각괄호 형식 사용**. 이유: (1) gitleaks 오탐 회피, (2) 시각적으로 "치환 대상"임이 명확 (실제 값과 헷갈림 제로), (3) Zod `.min(N)` 제약도 길이 조정으로 통과 가능.
- **`--no-verify`로 훅을 우회하지 말 것**. 훅은 보안 가드 — 우회는 우연히 진짜 키가 섞였을 때 유출 경로가 됨. 훅이 막으면 근본 수정이 원칙.
- Jayden의 Git 안전 규칙과 일치 (`--no-verify 금지`).

---

### 2026-04-17 DB 컬럼 네이밍 리팩토링은 데이터 0건 시점이 최저 비용 (설계 결정)

**증상**: Task 3 완료 후 conversations 설계 시 `bots.bot_id`(외부 slug)와 `conversations.bot_id`(uuid FK) 이름 충돌 발견. 두 컬럼이 같은 이름인데 의미가 다름 → 향후 코드/SQL 작성 시 혼동 위험.

**원인**: 최초 bots 테이블 설계에서 slug 컬럼명을 `bot_id`로 명명. 타 테이블에서 bots를 FK로 참조할 때의 이름 충돌을 예상 못 함 — "bot_id" 라는 이름이 "봇을 가리키는 ID"로 자연스럽게 우선 선점됨.

**해결**: 데이터 0건 + 의존 코드 최소(types.ts 3줄 + schema.ts regex) 시점에 `bots.bot_id → bots.slug` 리네임 마이그레이션(0002) 실행. bots의 `slug`(외부) vs 타 테이블 `bot_id`(uuid FK) 네이밍 원칙 확립.

**규칙** ⭐:

- **네이밍 이슈 발견 시 "지금 vs 나중" 비용 비교를 즉시 수행**. 데이터 없고 코드 얇을 때는 **지금** 고치는 게 최저 비용. 나중에 미루면 데이터/코드/FK/문서/쿼리가 쌓여 기하급수적으로 비싸짐.
- **식별자 네이밍 원칙 고정**: `<entity>.slug` = 외부 노출용 자연 키, `<other>.<entity>_id` = 내부 FK의 uuid. 한 프로젝트 안에서 일관.
- 데이터 0건 시점의 리팩토링은 PostgreSQL의 `alter table ... rename column` 으로 충분. check 표현식의 컬럼 참조도 PG12+ 자동 업데이트.

---

### 2026-04-17 DO 블록 내 `now()`는 트랜잭션 고정값 — 트리거 검증 기법 (기술 이슈)

**증상**: `set_updated_at` 트리거 검증용 DO 블록에서 `initial_updated_at < after_update_at` 비교가 false → "트리거 동작 실패"로 오판. 실제로는 트리거가 정상 동작하고 있었음. 1차 검증 실패 후 재설계 필요.

**원인**: PostgreSQL의 `now()`는 **트랜잭션 시작 시점 고정값**. DO 블록은 단일 트랜잭션이므로 `insert ... default now()`와 뒤따르는 `update ... set updated_at = now()` (트리거 안)가 **정확히 같은 timestamp**를 반환. `>` 비교가 영원히 false. `pg_sleep()`을 끼워도 `now()`는 변하지 않음 (cf. `clock_timestamp()`는 실시간 시각).

**해결**: "현재값이 과거가 아님을 증명" 패턴으로 전환 — UPDATE 시 `updated_at = '2020-01-01'` 같은 명백한 과거값을 시도로 넣고, BEFORE UPDATE 트리거가 이를 `now()`로 덮어쓰면 저장된 값은 당연히 과거가 아님. 한 트랜잭션 안에서 깔끔히 증명.

**규칙** ⭐:

- **DO 블록 한 트랜잭션 내에서 `now()` 차이로 트리거 검증하지 말 것**. 같은 값이라 영원히 false.
- **"트리거가 예약 값을 덮어쓰는 성질"을 이용한 검증**: 명백히 틀린 값(과거/NULL/경계초과)을 INSERT/UPDATE 시도 → 저장된 값이 교정되어 있으면 트리거 OK.
- **실시간 비교가 꼭 필요하면 `clock_timestamp()` 사용** — 트랜잭션 내에서도 호출마다 달라짐.
- **별도 트랜잭션 2회로 분리 검증**하는 방법도 있음 (`execute_sql` 2회 호출). 하지만 단일 DO로 묶는 방법이 훨씬 깔끔.

---

### 2026-04-17 `ALTER FUNCTION ... SET search_path` 가 최소 변경 경로 (설계 결정)

**증상**: 보안 린트 `function_search_path_mutable` WARN 2건 해결 방안 선택 시점. DROP+CREATE로 재생성할지, ALTER만 할지 결정 필요.

**원인**: 함수에 `search_path` 가 지정되지 않으면 호출자의 role-mutable search_path를 상속 → 동명 사용자 정의 함수로 하이재킹되어 권한 상승 경로가 됨. Supabase linter가 WARN으로 고지. 수정 옵션 3가지 (ALTER / DROP+CREATE / `search_path = 'public'`).

**해결**: `ALTER FUNCTION ... SET search_path = ''` 만으로 해결. 2줄. 의존 트리거 3개를 건드리지 않음. 빈 search_path 에서도 내부 참조는 이미 `public.xxx` 스키마 명시 또는 `now()` 같은 pg_catalog 내장 함수라 정상 동작.

**규칙** ⭐:

- **함수 본문 수정이 없다면 `ALTER FUNCTION ... SET search_path = ''` 가 최소 변경 경로**. DROP+CREATE는 의존 트리거/뷰가 CASCADE로 날아가 재생성 비용 큼.
- **`search_path = ''` 선택 기준**: 함수 본문이 (1) 스키마 명시된 테이블 참조, (2) `pg_catalog` 내장 함수, (3) 언어 키워드(`new`/`old`) 만 사용한다면 안전. 한 개라도 비스키마 참조가 있으면 명시로 변경 후 적용.
- **보안 린트는 운영 전에 선해결**. 데이터 0건 시점 = 최저 비용. 정책상 WARN도 CI에서 실패시키는 규칙을 고려.
- **수정 후 `advisors(security)` 즉시 재실행**하여 해소 확인. 린트 재등장 시 접근 방법 재검토.

---

### 2026-04-17 Supabase types 자동 생성 보류 결정 (설계 결정)

**증상**: Epic 0-B 완결 시점, `src/core/db/types.ts` 상단에 원래 "모든 테이블 완성 후 `supabase gen types typescript` 로 자동 생성 전환" 방침이 있었음. knowledge_chunks 추가 완료로 전환 시점 도래.

**원인**: 자동 생성은 `jsonb` 컬럼을 전부 `Json` 으로 평탄화. 이 프로젝트는 bots.config 컬럼에 `DariConfig` (Zod 스키마 기반 복합 타입)를, messages.sources 컬럼에 `MessageSource[]` (구조화된 튜플)를 저장. 자동 생성으로 전환하면 **두 구조 타입이 `Json` (= `string | number | boolean | null | { [key: string]: Json } | Json[]`) 로 퇴화** → 타입 안전성 손실. 특히 config.behavior.collectEmail 같은 깊은 필드 접근에서 TS가 구조를 잃음.

**해결**: 자동 생성 보류. types.ts를 수동 유지 방침으로 확정. 상단 주석에 "**수동 유지 결정 (Epic 1 이후 재평가)**" 명시. 테이블/함수 추가 시 수동 동기화 워크플로 유지.

**규칙** ⭐:

- **자동 생성 도구는 "원시 타입 → TS 타입" 범용 매핑에 강함**. 반대로 "구조화된 jsonb" 같은 프로젝트 특화 의미는 전혀 보존 못 함.
- **결정 기준**: `jsonb` 컬럼에 (1) 고정 구조가 있고, (2) 앱 코드가 해당 구조의 깊은 필드를 자주 쓰면 → **수동 유지** 우선. 스키마-ORM 친화 프로젝트(얇은 jsonb, 평탄 구조)라면 자동 생성이 비용 절감.
- **하이브리드 전략**: 언젠가 자동 생성으로 가되, `Database['public']['Tables']['bots']['Row']['config']` 부분만 타입 override로 `DariConfig` 주입하는 패턴 — 자동 생성 파이프라인 정착 후 재평가.
- **결정을 코드 주석에 남길 것** — "왜 수동인가"를 후임(또는 미래의 나)이 재해석할 수 있게. 정책 없는 수동은 "귀찮아서 미뤘다" 로 오해됨.

---

### 2026-04-17 공식 가이드와 도구 자체 런타임 권고가 충돌할 때 (설계 결정)

**증상**: Next.js 16.2 공식 가이드(`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`)대로 `vite-tsconfig-paths` 플러그인 설치 후 `npm test` 실행 시, Vite 런타임이 직접 경고 출력 — "Vite now supports tsconfig paths resolution natively via `resolve.tsconfigPaths` option. You can remove the plugin."

**원인**: 프레임워크 공식 문서는 **출간 시점 스냅샷**이라 상위 도구(Vite/Vitest)의 최신 네이티브 기능 반영이 지연됨. `vite-tsconfig-paths`는 Vite 5 이하에서 필수였으나, Vite 6+ / Vitest 4+는 `resolve.tsconfigPaths: true` 네이티브 내장 — 플러그인은 과잉 의존성.

**해결**: 플러그인 제거, `resolve.tsconfigPaths: true` 네이티브 옵션 채택. 테스트 6/6 동일 통과, 실행 속도 604ms → 136ms (4.4배), devDependency -1개, 경고 소거.

**규칙** ⭐:

- **의존성 설치 직후 런타임 경고/deprecation 메시지를 반드시 1회 확인**. 프레임워크 공식 가이드는 스냅샷 — 도구 자체의 권고가 항상 더 최신.
- **"공식 가이드 vs 도구 런타임 권고" 충돌 시 → 도구 런타임 권고 우선**. 근거: (1) 도구가 자기 최신 기능을 가장 잘 앎, (2) 측정 가능한 이득(속도/의존성 수)으로 검증 가능, (3) deprecation 메시지는 미래 호환성 신호.
- **예외**: 도구 권고가 experimental/beta이거나 breaking change를 요구하면 보류 — 이 경우 공식 가이드의 안정 경로 유지.
- **절차**: (1) 공식 가이드대로 최초 설정 → (2) 설치·실행 로그 확인 → (3) 최신 권고 감지 시 즉시 전환 → (4) 테스트 재통과 + 이득 측정값 기록.

---

### 2026-04-17 독립 code-reviewer 를 통한 보안 사각 발견 (설계 결정)

**증상**: Task 0-E-2 (Pino logger) 와 Task 0-E-3 (Sentry beforeSend) 양쪽에서 Writer(주 컨텍스트) 가 놓친 CRITICAL 2건씩, MEDIUM 4건씩을 독립 reviewer 가 발견. 예: Pino 의 REDACT_PATHS 가 `serviceRoleKey`/`accessToken`/`x-api-key` 등 16개 중 다수 누락, Sentry 의 beforeSend 가 `event.user`/`event.breadcrumbs[].data`/`event.request.query_string` 3대 PII 경로 미커버.

**원인**: Writer 는 자신이 작성한 코드의 "설계 가정" 을 당연시함 — "redact 은 필요한 건 다 넣었다" / "beforeSend 는 extra/contexts/request.data 만 훑으면 충분". 같은 컨텍스트 안의 self-review 는 자기 전제를 의심하지 못함. 편향 회피에는 외부 시선 구조적으로 필요.

**해결**: Claude Code 의 `code-reviewer` 서브에이전트로 독립 리뷰 위임. 주 컨텍스트와 격리된 별도 세션에서 리뷰어가 파일을 처음 읽고 판단. 프롬프트에 (1) 프로젝트 3대 우선순위, (2) 🔴 보안 등급, (3) 리뷰 관점 우선순위 목록, (4) "놓칠 가능성 있는 경로" 체크리스트를 명시 → CRITICAL/MEDIUM/NITS/GOOD 분류된 구조화 리포트 받음.

**규칙** ⭐:

- **🔴 보안 등급 프로젝트의 보안/관찰성/인증/결제 Task 는 구현 직후 독립 리뷰 필수**. 🟡/🟢 는 선택적.
- **리뷰 프롬프트는 "무엇을 놓쳤을 것인가"를 구체적으로 명시**. "리뷰해주세요" 같은 일반 요청은 피상적 피드백만 받음. 누락 가능한 경로·필드·케이스 목록을 프롬프트에 포함해 Reviewer 의 탐색 방향 유도.
- **리뷰어가 "커밋 비권장" 판정 시 즉시 수정 → 재검증 → 커밋**. 일단 커밋하면 follow-up PR 비용은 기하급수적. 지금이 최저 비용.
- **CRITICAL 은 사실상 100% 수용. MEDIUM 은 🔴 프로젝트라면 기본 채택**. NITS 는 시간 여유에 따라.
- **절차**: 구현 → 기본 검증(test/tc/build) → 독립 리뷰 → CRITICAL+MEDIUM 수정 → 재검증 → 커밋. 리뷰 누락은 "빨리 갔다가 나중에 2배로 되돌아가기" 전형.

---

### 2026-04-17 env.ts 누락은 "첫 사용 라우트" 추가 시에만 드러남 (기술 이슈)

**증상**: Task 0-E-4 빌드에서 `❌ 환경변수 검증 실패 (서버): NEXT_PUBLIC_SUPABASE_ANON_KEY: [ 'Invalid input: expected string, received undefined' ]` → 빌드 실패. 그런데 이전 4번의 빌드(Task 0-E-1 ~ 0-E-3)는 동일한 env 상태에서 모두 통과했음. 5번째 빌드에서만 실패.

**원인**: env.ts 는 모듈 로드 시점 `parseEnv()` throw 설계 (fail-fast). 하지만 모듈은 **실제 import 되어야 실행됨**. 프로젝트 내 env.ts 를 import 하는 경로는 Supabase 클라이언트 3종(`client-server.ts`, `client-admin.ts`, `client-browser.ts`) 뿐. 이들이 page.tsx/layout.tsx 에 아직 연결되지 않은 상태 → Next.js build 의 "Collecting page data" 단계에서 env.ts 코드가 **결코 실행되지 않음** → env 미설정이 눈에 띄지 않음. `/api/health` 의 `route.ts` 가 `createClient()` 호출 → `client-server.ts → env.ts` 체인을 빌드 시점에 최초 로드 → 미설정 드러남.

**해결**: Jayden 이 `.env.local` 에 즉시 추가. 빌드 재시도 통과 → dev server → curl /api/health → HTTP 200 확인.

**규칙** ⭐:

- **빌드 성공 ≠ env 완전성 증명**. 라우트가 적은 초기 단계일수록 위험 — env 체인이 로드되는 경로가 없으면 검증도 돌지 않는다.
- **fail-fast env 검증 설계를 채택할 때는 "검증이 실제로 실행되는지" 함께 확인**. 검증 로직이 있어도 로드되지 않으면 **죽은 코드**.
- **조기 감지 장치**: (a) CI 에 `npm run build` 필수 포함, (b) 가장 의존성 많은 모듈을 import 하는 **최소 스모크 엔드포인트**(`/api/health` 같은)를 초기에 배선, (c) env 스키마 vs `.env.local` 키 자동 비교 스크립트.
- **새 프로젝트 초기 체크리스트**: 첫 커밋 직후 "env.ts 에 선언된 모든 키가 `.env.local` 에 실제 값으로 존재하는가" 를 수동 점검. 비어있는 placeholder 는 `min(20)` 같은 Zod 제약을 통과하지 못한다.
- **Claude 는 `.env*` 파일 읽기/쓰기 권한 없음** — env 디버깅은 항상 Jayden 에게 명시적 확인 요청 (이 규칙은 앞선 교훈 "Write 도구가 `.env*` 파일 생성 차단" 과 동일 맥락).

---

### 2026-04-17 CI placeholder env 는 workflow YAML 하드코딩 금지 — shell 동적 생성 (설계 결정)

**증상**: `next build` 는 env.ts 의 Zod 검증(`url()`, `.min(20)`, `.startsWith("sk-")`) 통과 필수. CI 에서 실 Supabase/AI 값은 불필요 → placeholder 가 필요한데, YAML `env:` 섹션에 직접 기재하는 방안은 gitleaks 오탐 리스크가 큼 (`sk-` prefix, JWT prefix, 20+자 base64 문자열 모두 탐지 대상).

**원인**: YAML 에 쓴 문자열은 (1) 커밋 히스토리 영구 기록, (2) gitleaks entropy + rule 기반 탐지 양쪽 적중, (3) 각괄호 `<placeholder>` 로 우회하면 Zod `.url()`/`.startsWith()` 제약에 실패.

**해결**: Build step 직전 별도 step 에서 `echo "KEY=$(openssl rand -hex 24)" >> "$GITHUB_ENV"` 로 동적 생성. `sk-$(openssl ...)` 같은 조합으로 prefix 요구도 충족. URL 은 `https://ci-placeholder.<vendor>.<tld>` 고정값 (URL 형식은 gitleaks 오탐 거의 없음).

**규칙** ⭐:

- **CI 에서 서버 env placeholder 가 필요하면 반드시 shell step 으로 동적 생성**. YAML 의 `env:` 섹션에 secret-like 문자열 하드코딩 금지.
- **패턴**: `echo "KEY=$(openssl rand -hex N)" >> "$GITHUB_ENV"` + 필요 시 prefix 결합 (`sk-$(...)`).
- **URL 제약**: `url()` Zod 는 랜덤 해시로 생성 불가 → `https://ci-placeholder.<vendor>.<tld>` 고정값 사용.
- **이득 3가지**: (1) gitleaks 오탐 0, (2) 커밋 히스토리에 secret-like 문자열 0, (3) 매 실행 값이 바뀌어 실 secret 으로 오해될 여지 0.
- **안티패턴**: `.env.ci` 파일을 리포에 커밋 (누출 리스크 영구) / Real GitHub Secrets 사용 (Jayden 수동 등록 필요 + 노출 리스크 미세 존재 / `<placeholder>` 각괄호 (Zod URL 제약 위반).

---

### 2026-04-17 독립 리뷰 2 에이전트 병렬 = 단일 개발자의 정합성 안전망 (설계 결정)

**증상**: Task 0-F-3 (환경 분리 문서 + `SENTRY_ENVIRONMENT` end-to-end) 구현 완료 후 독립 code-reviewer + security-reviewer **병렬** 리뷰로 MEDIUM 4건 포착 — 단일 개발자 시점에서 놓친 문서·코드 정합성 이슈:

- `ADR-008` 내부 참조 `§9` 가 line 29 에 남음 (앞서 line 73 만 수정, 한 곳 누락)
- `DATABASE_URL` 이 Zod `required` 인데 `environments.md §3` 은 preview 에 "(미사용)" 표기 (Preview 배포 시 부팅 실패 가능)
- RLS 미활성화 상태 Preview URL 공개에 대한 명시적 경고가 `§9 🟡 주의` 에 누락
- 브라우저 Sentry 는 `NEXT_PUBLIC_*` 제약으로 preview/prod 구분 불가 — 완화 절차 누락

**원인**: 단일 개발자가 이전 수정 컨텍스트에 갇혀 섹션 번호 리넘버링 시 전체 참조 스캔 누락. 문서·코드 정합성 (Zod 스키마 ↔ 문서 매트릭스) 이 **한 눈에 안 보이는** 분산 구조. 실제 위험은 "Preview 배포 시 부팅 실패" 같은 운영 영향으로 발현.

**해결**: "리뷰" 지시 시 code-reviewer + security-reviewer 두 에이전트 **병렬 호출** 규칙화 (MEMORY.md `feedback_review_dual_agents.md` 영속). 4건 포착 후 옵션 B (M1-M4 전체 반영). CRITICAL/HIGH 0, MEDIUM 4 → Fix then ship / Ship as-is.

**규칙** ⭐:

- **섹션 번호 재배치 (§N → §N+1) 시 `grep "§<이전 번호>"` 전체 파일 스캔 필수**. 참조 한 곳만 고치면 다른 곳 놓치기 쉬움.
- **Zod 스키마와 문서 (환경변수 매트릭스 등) 의 required/optional 분류는 같은 PR 에서 함께 수정**. 스키마가 진실 공급원 — 문서가 따라야 함.
- **단일 개발자 프로젝트도 구현 완료 후 code-reviewer + security-reviewer 병렬 리뷰 루틴화**. 문서·코드 정합성은 self-review 로 발견 어려움.
- **"리뷰" 단독 지시 = 두 에이전트 병렬 호출** (MEMORY.md `feedback_review_dual_agents.md`). 수식어 있을 때만 단일.
- 독립 리뷰 프롬프트에 **이미 검증 완료한 항목 (prettier/tsc/test 등) 명시** → 재검증 회피로 토큰 절약.

---

### 2026-04-17 Next.js env 주입 경계 — NEXT_PUBLIC\_ 없는 env 는 브라우저에서 undefined (기술 이슈)

**증상**: `SENTRY_ENVIRONMENT` 를 서버/엣지/브라우저 3곳에서 동일하게 사용하려 했으나, `instrumentation-client.ts` 에서 `process.env.SENTRY_ENVIRONMENT` 가 `undefined` 로 취급됨. 결과: 브라우저 에러가 `NODE_ENV` 기반으로 분류되어 Vercel Preview/Production 에러가 하나의 bucket 으로 묶임. fallback chain `X ?? Y` 의 왼쪽 항이 항상 `undefined` → chain 무의미.

**원인**: Next.js 빌드 시스템은 **클라이언트 번들에 `NEXT_PUBLIC_*` 접두사 있는 env 만 inline 치환**. 접두사 없는 서버 전용 env 는 브라우저 번들에서 `process.env.X` 가 그대로 `undefined`. 런타임 에러는 안 나지만 fallback 의 첫 단계가 **쓸모 없는 분기**.

**해결**: 서버/엣지에서만 `SENTRY_ENVIRONMENT` 사용하고 브라우저는 `NODE_ENV` fallback 유지. `instrumentation-client.ts` 에 **제약 설명 주석** 추가 + `environments.md §7` 에 브라우저 구분 불가 경고 + Stage 2 진입 전 완화 옵션 명문화 (A: Alert 필터 `!platform.browser`, B: `NEXT_PUBLIC_SENTRY_ENVIRONMENT` 도입). 후자는 backlog 분리.

**규칙** ⭐:

- **클라이언트 번들에 값이 필요하면 반드시 `NEXT_PUBLIC_*` 접두사**. 이것이 없으면 브라우저에서 항상 `undefined`.
- 서버 + 브라우저 양쪽에 같은 값을 쓰려면 **두 env 변수 (`X` 서버 + `NEXT_PUBLIC_X` 클라이언트) 이중 세팅** 필요. 이중 관리 비용을 감수할 가치가 있는지 먼저 판단.
- fallback chain 설계 시 **런타임별 값 주입 경계를 반드시 검증**. 한 런타임에서 왼쪽 항이 항상 `undefined` 면 chain 의 첫 단계가 쓸모 없는 설계.
- Sentry environment 태그처럼 "preview/prod 구분이 꼭 필요한 상황" 이 아니라면 `NEXT_PUBLIC_*` 도입은 오버엔지니어링 (조기 추상화 금지). 실제 사고 triage 지연이 관찰되면 그때 도입.
- **`instrumentation-client.ts` 의 제약 주석 필수**: 브라우저 특성 모르는 후임 기여자가 "왜 여기만 fallback 이 다른가" 의심할 때 즉시 답 제공.

---

### 2026-04-17 Next.js 16 에서 middleware → proxy 리네임 + src/ 레이아웃은 src/proxy.ts 필수 (설계 결정 / AI 이탈 방지)

**증상**: Task 0-D-1 (Supabase Google OAuth) Plan 을 `middleware.ts` 기준으로 작성했으나 실행 직전 재평가 시 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/` 에 `middleware.md` 가 없고 `proxy.md` 만 존재함을 발견. 또한 루트에 `proxy.ts` 를 두면 Next.js 가 인식하지 못하여 redirect 가 동작하지 않음 (로그에 `proxy.ts:` 타임 미출력). `src/proxy.ts` 로 이동 후 정상 감지.

**원인**: Next.js 16 에서 2 가지 파일 컨벤션 변경이 동시에 발생했으나 어디에도 "breaking" 이라고 강조 표시되지 않음 (단순 "renamed / deprecated" 표현).

1. `middleware.ts` → `proxy.ts` 리네임 (함수명·타입명도 `middleware`/`NextMiddleware` → `proxy`/`NextProxy`)
2. `src/` 디렉토리 레이아웃을 쓰는 프로젝트는 파일을 **반드시 `src/proxy.ts`** 에 둬야 감지 (docs 에 "or inside `src` if applicable" 로 기술). 루트 `proxy.ts` 는 `src/` 프로젝트에서는 조용히 무시됨 — `next dev` 에러 없음, 단순히 실행되지 않을 뿐이라 원인 특정이 까다로움.

training data 는 `middleware.ts` 기준이고 Supabase SSR 공식 가이드도 아직 `middleware.ts` 예시를 보여준다. AGENTS.md 가 이미 "This is NOT the Next.js you know" 로 경고했으나 이 구체 변경은 실 구현 단계에서만 드러남.

**해결**: Plan 단계에서 코드 작성 전 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/` 확인 → `proxy.md` 발견. Plan 수정안을 Jayden 에게 즉시 보고·승인 받은 후 진행. 파일 위치는 실제 구현 중 dev server 로그에서 `proxy.ts:` 타임이 안 찍히는 걸 보고 `src/` 로 이동.

**규칙** ⭐:

- **AGENTS.md 의 "This is NOT the Next.js you know" 경고는 실제**. Next.js 관련 구현 시작 전 **반드시** `node_modules/next/dist/docs/` 에서 해당 파일 컨벤션·API reference 를 먼저 확인. training data 우선 사용은 금지.
- Next.js 파일 컨벤션 확인 경로: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/` — `middleware.md` 없으면 `proxy.md` 같은 대체 명칭 검색.
- **`src/` 레이아웃 프로젝트는 Next.js 특수 파일도 `src/` 안에**: `src/proxy.ts`, `src/middleware.ts` (레거시), `src/instrumentation.ts` 등. 루트 두면 조용히 무시 가능.
- **dev server 로그에 `<file>.ts: <ms>` 타임이 찍히는지로 감지 여부 판단**. 안 찍히면 Next.js 가 해당 파일을 인식하지 못하는 것. HMR 에러 안 나는 "조용한 실패" 에 속지 말 것.
- Supabase/외부 라이브러리 가이드의 예시 코드는 **항상 프레임워크 최신 버전에 맞춰 재검증**. SDK 가이드는 보통 구 Next 버전 기준. 파일명·함수명만 최신 컨벤션 (`proxy`/`NextProxy`) 으로 치환.
- **실행 직전 재평가를 Plan 승인 후에도 멈추지 않는 단계로 운영**. Plan 에 "실행 직전 재평가 체크포인트" 섹션을 내장하고, 발견 시 즉시 Plan 수정안 제시.

---

### 2026-04-18 외부 의존 보안 레이어의 로컬/E2E fallback 은 설계 단계에서 정의 (설계 결정)

**증상**: Upstash rate limit 을 로그인에 추가 후 로컬 개발 + Playwright E2E 에서 11번째 로그인부터 `too_many_attempts` 로 자가 차단. Plan 승인 이후 실제 E2E 실행에서 발견.

**원인**: `resolveClientIp` 가 헤더 없을 때 `"unknown"` fallback 사용. 로컬/E2E 환경은 `x-forwarded-for` 가 없어 모든 요청이 `"unknown"` 버킷에 몰림. 실 Upstash 인스턴스와 연결된 상태에서 반복 테스트로 카운트가 빠르게 소진. Plan 에 로컬 fallback 조항이 없어 발생.

**해결**: `checkLoginRatelimit` 맨 앞에 `if (env.NODE_ENV !== "production") return { ok: true }` 가드. 로컬/E2E 는 항상 skip, prod 만 실 Redis 로 방어. 기존 catch 의 fail-open 은 유지 (prod 에서 Redis 장애 대응).

**규칙** ⭐:

- **외부 의존 보안 레이어** (rate limit, captcha, SSO, WAF 등) 추가 시 Plan 에 **로컬/E2E 모드 fallback 을 명시적으로 정의**. 기본 패턴: "로컬 DX 유지 + prod 만 실 활성화".
- 구현 방법 2가지: (a) `NODE_ENV` 기반 분기, (b) `ENABLE_*` 플래그 env 변수. (a) 가 단순해서 권장, 복수 환경 구분 필요 시 (b).
- **Plan 에 해당 조항이 없으면 "실행 직전 재평가"에서 반드시 추가**. 2026-04-17 Drizzle 재평가 교훈의 구체 적용 사례.
- `x-forwarded-for` 없을 때 `"unknown"` 버킷 공유는 단일 공격자가 전원 차단할 수 있는 DoS 벡터 — Vercel 전제에서는 안전하나 비-Vercel 배포 시 재평가.

---

### 2026-04-18 proxy redirect 시 updateSession 세션 쿠키 유실 (기술 이슈)

**증상**: Playwright `fullyParallel: true` 로 5 spec 동시 실행 시 `/login → / 리디렉트 후 "로그인됨" 배지 미노출` 1~2건 랜덤 실패. `--workers=1` 순차 실행은 5/5 통과.

**원인**: Next.js 16 `src/proxy.ts` 에서 로그인 유저가 `/login` 에 접근하면 `NextResponse.redirect(url)` 을 **새 응답 객체로** 반환. 이 과정에서 `updateSession(request)` 이 리턴한 `response` 의 `Set-Cookie` 헤더가 복사되지 않아 refresh 된 세션 쿠키가 유실. 다음 요청(`/` 홈) 에서 낡은 쿠키 사용 → 비로그인 상태로 렌더링. 공용 `MAIN_TEST_USER` 계정을 여러 worker 가 공유하면서 세션 refresh 타이밍 race 증폭.

**해결 (우회)**: `--workers=1` 순차 실행으로 증상 회피. 근본 수정은 Task 0-D-6 로 분리.

**규칙** ⭐:

- **Next.js 16 proxy 에서 새 `NextResponse.redirect/rewrite` 반환 시**, `updateSession` 이 미리 설정한 `response.cookies` 를 복사해야 함. 패턴: `const redirect = NextResponse.redirect(url); response.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value)); return redirect;` (또는 헤더 단위 복사).
- **E2E 병렬 실행은 테스트 계정 격리** — worker 별 독립 이메일 (`e2e-w${workerIndex}@...`) 을 global-setup 에서 생성. 공용 계정은 race 의 온상.
- **"한 번은 통과, 한 번은 실패" = race condition 신호** — 순차 실행 (`--workers=1`) 으로 재현해서 결정론 확인 후 원인 조사. flaky 를 "재시도로 덮는" 습관 금지.
- proxy / middleware 의 응답 객체 재생성은 항상 "쿠키/헤더 merge" 가 누락 가능한 지점 — 체크리스트로 학습.

---

### 2026-04-18 supabase-js select 문자열 literal 파싱 실패 — `.returns<T[]>()` 회피 (기술 이슈)

**증상**: Server Component 에서

```ts
const { data } = await supabase
  .from("bots")
  .select("id, slug, name, status, updated_at")
  .neq("status", "deleted")
  .order("updated_at", { ascending: false });
```

로 작성한 쿼리에서 `data` 가 `never[] | null` 로 추론됨. 이후 `data.map((bot) => bot.name)` 사용 시 TS2339 `Property 'name' does not exist on type 'never'` 에러 8건 폭발.

**원인**: `@supabase/supabase-js` v2.103 의 select literal 타입 추론은 chain 메서드 (`neq` → `order`) 를 거치면서 narrowing 이 풀려 `never[]` 로 떨어지는 경우가 있음. 공식 타입 정의가 복잡한 computed type 연산을 시도하나 TS 가 depth limit 이나 복잡도에서 포기하면 `never`.

**해결**: 체인 마지막에 `.returns<BotListItem[]>()` 을 덧붙이고 `type BotListItem = { ... }` 를 명시. supabase-js 가 명시된 타입으로 데이터 역직렬화.

```ts
type BotListItem = {
  id: string;
  slug: string;
  name: string;
  status: BotStatus;
  updated_at: string;
};

const { data, error } = await supabase
  .from("bots")
  .select("id, slug, name, status, updated_at")
  .neq("status", "deleted")
  .order("updated_at", { ascending: false })
  .returns<BotListItem[]>();
```

**규칙** ⭐:

- supabase-js 쿼리에서 select 컬럼 목록이 **2개 이상**이거나 **필터·정렬 체인**이 붙으면 `.returns<T[]>()` 로 명시적 타입 annotation 을 기본 패턴으로 사용. 단일 컬럼 `.select("id")` 는 추론 가능.
- 타입은 `Database["public"]["Tables"]["bots"]["Row"]` 의 `Pick<...>` 보다 **로컬 `type`** 정의가 가독성·유지보수 나음 (select 컬럼 목록과 필드 목록이 같은 파일에 인접).
- `select("*")` 로 회피는 금지 (글로벌 규칙 + 번들 크기 증가 + 과다 노출).
- 한 번 `.returns<T[]>()` 를 붙이면 이후 추가되는 메서드 (`.single()`, `.maybeSingle()`) 도 타입 보존. 체인 **맨 끝**에 붙이는 게 원칙.

---

### 2026-04-18 Playwright + Next.js ESM — `tests/e2e/package.json` 로 서브스코프 격리 (기술 이슈)

**증상**: Playwright 실행 시 `ReferenceError: exports is not defined in ES module scope` 가 `global-setup.ts` 에서 발생. 루트 `tsconfig.json` 은 `module: "esnext"`, `moduleResolution: "bundler"`. 테스트 서브디렉토리용 `tsconfig.json` 에 `module: "commonjs"` override 해봤으나 무시됨. `.mts` 확장자로 변경 시 이번엔 import 한 `./support/fixtures.ts` 에서 `SyntaxError: Named export '...' not found. CommonJS module.` 로 갈아타는 식으로 오류 이동.

**원인**: Playwright 1.59 는 자체 ESM loader 를 쓰는데, 대상 파일의 확장자 + 가장 가까운 `package.json` 의 `type` 필드 조합으로 CJS/ESM 판정. `.ts` 는 기본 CJS 로 처리되고, `.mts` 만 ESM. 확장자 섞이면 import 경로를 따라 타입이 뒤섞임. 루트 tsconfig 의 `module: esnext` 는 **출력 포맷** 힌트일 뿐, Node/Playwright 의 **런타임 모듈 판정** 과 무관.

**해결**: `tests/e2e/package.json` 을 추가해 `{"type": "module"}` 로 서브스코프를 ESM 로 명시. 그 이후 디렉토리 아래 `.ts` 전체가 ESM 로 일관 처리되어 import/export 혼선 해소. 이 방식은 루트 패키지의 `type` 을 변경하지 않아 Next.js 와 기타 모듈에 영향 없음.

**규칙** ⭐:

- Monorepo 성격의 서브프로젝트 (tests/e2e, scripts 등) 에서 **ESM/CJS 판정을 격리** 해야 하면 `package.json` 을 서브디렉토리에 두고 `type` 필드로 분리. `tsconfig.json` 의 `module` 옵션은 런타임 판정에 영향 없음.
- 혼선이 나면 확장자 (`.ts` / `.mts` / `.cts`) 를 바꿔 끼우기 전에 먼저 "가장 가까운 package.json 의 `type`" 을 확인.
- Playwright 1.40+ 는 ESM 지원이지만 global-setup/teardown 은 런타임 require() 경로가 섞일 수 있어 이 분리가 특히 중요.

---

### 2026-04-18 Supabase admin API — `Authorization: Bearer <service_role>` 헤더 명시 필요 (기술 이슈)

**증상**: `supabase.auth.admin.createUser({ email, password, email_confirm: true })` 호출 시 `User not allowed` (HTTP 401) 에러. `SUPABASE_SERVICE_ROLE_KEY` 를 `createClient(url, key)` 의 두 번째 인자로 넘겼는데도 거부됨. 처음엔 env 값이 anon 키인 줄 알았으나 JWT 의 role claim 디코드 결과 `service_role` 확인됨.

**원인**: `@supabase/supabase-js` v2.103 는 두 번째 인자를 `apikey` 헤더로만 자동 설정하고 `Authorization` 은 세션 토큰이 있을 때만 설정. admin API (`/auth/v1/admin/*`) 는 `apikey` 로는 권한 인식 안 함 — **반드시 `Authorization: Bearer <service_role>`** 이 필요. 사용자 세션이 없는 admin 전용 클라이언트에서는 이를 수동으로 지정해야 함.

**해결**:

```ts
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
  },
});
```

**규칙** ⭐:

- Supabase admin 클라이언트 생성 시 `global.headers.Authorization` 을 반드시 명시. `persistSession: false` + `autoRefreshToken: false` 와 세트.
- `auth.admin.*` API 호출이 `User not allowed` 반환하면 **가장 먼저 확인할 것**: (1) env 값이 실제 service_role JWT 인지 (`role` claim 디코드), (2) `Authorization` 헤더 명시 여부. apikey 만으로는 불가.
- Supabase 공식 문서의 "Admin API" 섹션은 이 헤더 요구를 명시하지만 JS SDK 예시는 암묵적으로 처리된 듯 보이는 함정. E2E 인프라 같이 admin 으로만 작동하는 코드에서는 반드시 수동 설정.
- JWT role 확인 스크립트: `node -e "require('dotenv').config({path:'.env.local'}); const k = process.env.SUPABASE_SERVICE_ROLE_KEY; const p = JSON.parse(Buffer.from(k.split('.')[1], 'base64').toString()); console.log(p.role, p.ref)"`.

---

### 2026-04-18 SQL 기반 RLS 시뮬레이션을 UI E2E 대체 수단으로 활용 (설계 결정)

**증상**: Task 0-D-2 RLS 정책 14개 적용 후 두 계정 교차 검증 필요. 실제로 두 Google OAuth 계정을 로그인 → 전환 → 로그아웃 → UI 로 SELECT/UPDATE/DELETE 교차 시도하려면 ~20-30분 소요. E2E Playwright 로 자동화해도 Google OAuth UI 자동화 제약 + 계정 2개 준비 비용 큼.

**원인**: Supabase 의 RLS 는 `auth.uid()` 가 세션의 `request.jwt.claims.sub` 필드를 읽는 방식으로 구현됨. 실제 로그인 = 세션 레이어가 이 claim 을 설정해주는 것뿐. PostgreSQL 의 `SET LOCAL "request.jwt.claims"` 로 같은 claim 을 직접 주입하면 정책 평가 결과가 실제 로그인 시와 **100% 동일**.

**해결**: 테스트 유저 추가(Dashboard 1-click) → service_role 로 봇/대화/메시지 준비 → 각 시나리오를 독립 트랜잭션 (`begin; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","role":"authenticated"}'; <검증 쿼리>; rollback;`) 으로 실행. 10 시나리오 ~3-4분 완결. 공격 시도 (impersonation / owner 이전 / 타인 UPDATE·DELETE / immutable 위반) 는 `42501 RLS violation` 에러 또는 `0 rows affected` 로 차단 확인.

**규칙** ⭐:

- **RLS 정책 검증은 SQL 시뮬레이션이 최고 효율**. UI E2E 는 세션 레이어 전체를 통합 테스트하는 시점(Playwright 최종 검증) 에만 필요. 정책 로직 자체는 claim 주입으로 충분.
- **시뮬레이션 패턴**: `begin; set local role authenticated; set local "request.jwt.claims" = '{"sub":"<A uid>","role":"authenticated"}'; <쿼리>; rollback;` — rollback 으로 세션 변수 자동 해제.
- 공격 시나리오별 기대 결과 패턴:
  - INSERT WITH CHECK 위반 → `ERROR: 42501 RLS policy violation` (트랜잭션 abort)
  - UPDATE/DELETE USING 불일치 → `0 rows affected` (에러 아님, 조용한 차단)
  - owner 이전 공격 (UPDATE 의 SET owner_id = 타인) → WITH CHECK 가 변경 후 row 를 평가하므로 `42501` 차단
  - 정책 부재 테이블 조작 (messages UPDATE/DELETE) → `0 rows affected` (basic deny)
- **테스트 데이터는 cleanup 철저** (트랜잭션 rollback 외에 준비 데이터는 명시적 DELETE). `bots` 는 cascade 로 하위 테이블 자동 삭제.
- **`SET LOCAL ROLE anon` 으로 익명 컨텍스트도 동일 방식 검증** — `to authenticated` 명시된 정책은 anon 에 평가조차 되지 않아 자동 0 rows.
- Supabase `auth.users` 에는 MCP 로 직접 INSERT 하지 말 것 (스키마 내부 trigger·constraint 복잡). Dashboard > Authentication > Users > "Add user" 가 안전. 30초.

---

### 2026-04-17 Next 16 proxy 런타임에서 import "server-only" 금지 (기술 이슈)

**증상**: `src/core/db/proxy-client.ts` (proxy 전용 Supabase client) 상단에 `import "server-only";` 추가 후 dev server 가동 → 모든 요청이 `TypeError: adapterFn is not a function` 으로 404 반환. 에러 스택은 `.next/dev/server/middleware.js:4:3` 로 이어지지만 원인 라인이 압축되어 직관적 추적 불가. `proxy.ts:` 타임은 로그에 찍혀 (proxy 자체는 감지됨) 파일 위치 문제가 아닌 런타임 문제임을 확인.

**원인**: Next.js 16 의 proxy 런타임 (middleware 후속) 에서 `"server-only"` 패키지가 resolve 되지 못함. 해당 패키지는 Server Component / Route Handler / Server Action 용으로 설계됐고, proxy 번들은 이를 지원하지 않는 것으로 보인다. 명시적 error 메시지가 없어 `adapterFn` 초기화 시점에 호출부가 `undefined` 로 떨어지는 방식.

기존에 `src/core/db/client-server.ts` 에 `"server-only"` 가 정상 동작하는 것을 보고 `proxy-client.ts` 에도 당연히 되리라 가정한 것이 화근. client-server 는 Server Component/Action 컨텍스트, proxy-client 는 proxy runtime — **실행 컨텍스트가 다름에도 같은 가드를 쓸 수 있다고 오해**.

**해결**: `proxy-client.ts` 에서 `import "server-only";` 제거. proxy 파일 자체가 Next.js 내부에서 서버 전용 번들로 처리되고 클라이언트 번들에는 절대 포함되지 않으므로 가드 원천 불필요. 파일 상단에 "server-only 재추가 금지" 주석 + 근거 + 오용 방지 가이드 기록 (ESLint no-restricted-imports 규칙화는 별도 Task).

**규칙** ⭐:

- **proxy.ts 및 그 의존 모듈에서 `import "server-only"` 금지**. proxy 번들은 해당 패키지를 resolve 하지 못해 `adapterFn is not a function` 크래시.
- **`"server-only"` 가드의 적용 범위는 Server Component / Route Handler / Server Action** — proxy/middleware 에는 쓰지 않음. proxy 파일 자체가 서버 전용 번들로 처리되므로 가드 중복.
- "proxy 전용" 모듈은 파일명에 `proxy-` 접두사를 붙여 구분하고, **주석으로 "`proxy.ts` 외에서 import 금지" 명시**. guard 없이도 오용 방지 — 추후 ESLint `no-restricted-imports` 로 강제.
- **`adapterFn is not a function` 에러를 만나면 가장 먼저 의심할 것**: (1) `"server-only"` import 체인, (2) Edge runtime 전용 API 를 Node 에서 호출, (3) `async` default export 가 아닌 다른 형태. 스택의 `.next/dev/server/middleware.js:4:3` 위치는 힌트가 되지 못함.
- 실행 컨텍스트가 다른 유사 모듈을 만들 때 **"당연히 같은 패턴이 통하리라" 는 가정 금지** — Server Component / Server Action / Route Handler / Proxy / Edge / Client 각각 제약이 다름. 기존 파일 복붙 대신 해당 런타임의 공식 예시 우선 확인.

---

### 2026-04-18 supabase-js INSERT 도 타입 추론 한계로 `as never` 회피 (기술 이슈)

**증상**: `supabase.from("bots").insert(payload)` 에서 TS2769 `No overload matches this call. values: never`. `payload` 에 유효한 `bots.Insert` 타입 객체를 넘겨도 `values` 가 `never` 로 좁혀짐. 에러 시그니처에 `PostgrestFilterBuilder<{ PostgrestVersion: "12"; }, never, never, null, "bots", never, "POST">` 가 보이고 `Row = Relationships = never` 상태.

**원인**: `@supabase/ssr` + postgrest-js 최신 버전은 `Database` 타입에서 `__InternalSupabase.PostgrestVersion` 필드를 먼저 읽고, 그다음 `Tables[TableName]` 을 추론한다. 현재 프로젝트의 `src/core/db/types.ts` 는 수동 유지 (ADR: 자동 생성이 `DariConfig`/`MessageSource` 등 Zod 구조 타입을 `Json` 으로 평탄화) 로, `__InternalSupabase` 슬롯이 빠져 있다. 이 때문에 postgrest-js 가 PostgrestVersion 만 추출하고 실제 스키마 구조는 읽지 못해 values 가 기본 `never` 로 fallback.

기존에 SELECT 쪽은 `.returns<BotListItem[]>()` 제네릭 주입으로 우회 (learnings.md 2026-04-18 항목). INSERT 쪽은 제네릭 주입 슬롯이 없어 값 타입 자체를 캐스트해야 한다.

**해결**: `BotInsert` 타입으로 payload 를 명시해 의도를 보존한 뒤 `insert(payload as never)` 로 호출. 타입 정보는 컴파일러에 보이되 postgrest 시그니처 제약만 우회.

```ts
type BotInsert = Database["public"]["Tables"]["bots"]["Insert"];

const payload: BotInsert = { slug, name, owner_id: user.id, config };
// supabase-js 타입 추론 한계 — __InternalSupabase 슬롯 부재
const { error } = await supabase.from("bots").insert(payload as never);
```

**규칙** ⭐:

- **INSERT/UPDATE/UPSERT 타입 에러 시 같은 패턴 적용**: `const payload: <Table>Insert = {...}; .insert(payload as never)`. BotInsert 로 의도를 선언해두면 필드 오타/누락은 잡을 수 있다 (진짜 `any` 와 다름).
- **근본 해결은 types.ts Database 타입에 `__InternalSupabase.PostgrestVersion: "12"` 추가**. 1 파일 1 필드 수정으로 SELECT `.returns<T[]>()` + INSERT `as never` 양쪽 모두 제거 가능성 — backlog 로 관리 (별도 Task, 실패 시 롤백 간단).
- **에러 시그니처 `PostgrestFilterBuilder<{ PostgrestVersion: ... }, never, never, ...>` 를 보면 즉시 이 이슈** — Database 타입 구조가 아니라 supabase-js internal 슬롯이 원인이라고 확정.
- **`as never` 는 임시 회피 주석 필수** — 코드에 "왜" 를 남겨 후속 개발자가 근본 해결 루트로 이어가도록. "\_\_InternalSupabase 슬롯 부재" 키워드를 주석에 포함.
- **자동 생성 타입으로 전환 검토 시점**: Zod 기반 구조 타입 손실이 한 번이라도 런타임 버그를 일으키기 전. 현재까지는 수동 유지가 이득이나 테이블 수가 늘면 재평가.

---

### 2026-04-18 React 19 — 파생 상태는 이벤트 핸들러에서 동기화, useEffect 금지 (기술 이슈)

**증상**: 봇 생성 폼에서 `name` 입력에 따라 `slug` 자동 생성하려고 `useEffect` + `setSlug(slugify(name))` 작성. ESLint 에서 `react-hooks/set-state-in-effect` 에러.

```
error  Error: Calling setState synchronously within an effect can trigger cascading renders
```

**원인**: React 19 의 강화된 lint 규칙. `useEffect` 는 외부 시스템 동기화 전용 (DOM 직접 조작 / 구독 / 타이머 등) 이고, **파생 상태 계산은 렌더 중 또는 이벤트 핸들러에서 처리해야 한다**. `useEffect` 내 `setState` 는 cascading renders (첫 렌더 → effect 실행 → setState → 재렌더 → ...) 를 유발해 성능 저하 + 중간 상태 노출 위험.

React 팀 공식 가이드 "You Might Not Need an Effect" 의 첫 번째 패턴: "다른 state/props 에서 state 를 도출하는 경우" → 이벤트 핸들러에서 동기화.

**해결**: `useEffect` 제거 → onChange 핸들러에서 직접 계산.

```tsx
// ❌ BAD
useEffect(() => {
  if (!slugEdited) setSlug(slugify(name));
}, [name, slugEdited]);

// ✅ GOOD
function handleNameChange(next: string): void {
  setName(next);
  if (!slugEdited) setSlug(slugify(next));
}

<input onChange={(e) => handleNameChange(e.target.value)} />;
```

**규칙** ⭐:

- **input A 의 값이 input B 에 파생되는 패턴 → useEffect 절대 금지**. 이벤트 핸들러 함수 하나에서 `setA + setB` 동시 호출.
- 여러 파생이 있으면 `handleXxx` 함수로 묶어 이벤트 핸들러와 분리 (가독성 + 재사용).
- **useEffect 를 써야 할 때만 써라**: (1) DOM 수동 조작, (2) 외부 라이브러리 구독, (3) 타이머/애니메이션, (4) 데이터 fetch (Server Component 아닐 때). 그 외 "A 가 바뀌면 B 를 업데이트" 는 대부분 이벤트 핸들러 or 렌더 중 계산.
- **파생 상태 자체를 없앨 수 있는지 먼저 검토**: 매 렌더마다 `const slug = slugEdited ? userInput : slugify(name);` 처럼 계산만 하면 상태가 불필요. 사용자가 수정한 값을 "기억" 해야 할 때만 상태 분리.
- **에러 메시지가 lint 에 나오는 시점에 바로 잡을 것** — 런타임에는 문제 없어 보여도 React 19/20 업데이트에서 정식 에러로 승격될 가능성. 설계 단계에서 effect 사용 여부를 체크리스트화.
- 참조: https://react.dev/learn/you-might-not-need-an-effect

---

### 2026-04-18 Next.js App Router notFound() 가 Turbopack dev 모드에서 200 응답 (기술 이슈)

**증상**: Playwright E2E 에서 `/bots/[slug]` 상세 페이지의 "존재하지 않는 slug" / "타인 봇 slug" 접근 시 `expect(response?.status()).toBe(404)` 가 `Expected 404 / Received 200` 으로 실패. `not-found.tsx` 는 정상 렌더되어 "봇을 찾을 수 없어요" heading 은 노출됨 (error-context page snapshot 확인).

**원인**: Next.js 16.2 의 Turbopack dev 서버가 App Router `notFound()` 호출 시 HTTP 상태를 **200 으로 응답** (내용은 정확히 `not-found.tsx`). 프로덕션 빌드 (`pnpm build && pnpm start`) 에서는 404 로 응답하는 것이 정상. Next.js 공식 문서 상은 dev/prod 모두 404 가 맞지만 Turbopack dev 가 이를 지키지 않는 구현 차이.

**해결**: E2E 에서 `response.status()` 체크를 제거하고 **콘텐츠(heading "봇을 찾을 수 없어요")** 로 not-found 상태를 판정. 판정 의도(RLS 필터 + notFound 렌더)는 그대로 검증하면서 dev/prod HTTP 상태 차이를 우회.

```ts
// ❌ BAD — Turbopack dev 에서 실패
expect(response?.status()).toBe(404);

// ✅ GOOD — dev/prod 양쪽에서 통과
await expect(
  page.getByRole("heading", { name: "봇을 찾을 수 없어요" }),
).toBeVisible();
```

**규칙** ⭐:

- **App Router `notFound()` 의 HTTP 상태는 E2E 에서 신뢰하지 말 것**. Turbopack dev 모드에서 200, 프로덕션 빌드에서 404 차이. 콘텐츠 기반 판정 (`not-found.tsx` 가 렌더한 고유 heading/문구) 이 호환성 높고 의도 명확.
- **Next.js E2E 일반 원칙**: proxy redirect / notFound / error boundary 등 **프레임워크 내부 렌더 경로는 HTML 콘텐츠로 판정**. status code 는 네트워크·프레임워크 구현에 의존 — dev vs prod 차이 가능.
- **반대로 Route Handler(API 라우트)** 에서 `NextResponse.json(..., { status: 404 })` 처럼 **명시적** status 반환은 dev/prod 동일. status 체크 OK.
- 프로덕션 빌드로 E2E 돌리면 status 체크도 통과하지만 dev 피드백 루프가 매우 느림. 콘텐츠 판정이 기본 전략.

---

### 2026-04-18 sensitiveFields redact 대상은 직접 PII 만 — UUID 식별자 예외 (설계 결정)

**증상**: security-reviewer HIGH 지적: "logger.error 에서 `userId` 가 redact 없이 평문 노출 — OWASP A09/A01". `SENSITIVE_FIELD_NAMES` 에 `userId` / `user_id` 추가했더니 `logger.test.ts` + `beforeSend.test.ts` **기존 테스트 2건 실패** (기존 테스트가 `userId: "user-42"` 가 child logger 바인딩에 그대로 남고, Sentry `contexts.auth.userId` 가 치환되지 않는 것을 명시적으로 assert).

**원인**: userId(Supabase `auth.uid()` UUID) 는 **직접 PII 가 아니라 "요청 상관분석 키(correlation id)"**. email/phone 같이 사용자를 직접 식별할 수 있는 PII 와 구분됨. 프로덕션 로그에서 userId 가 없으면 "어떤 유저에게 발생한 오류인지" 파악 불가 → 디버깅 원천 차단. 기존 테스트 2건은 이 설계 의도를 의도적으로 보호하던 것.

OWASP Logging Cheat Sheet:

- **DO log**: user identifier (UUID) for audit/debug
- **DO NOT log**: secrets, tokens, passwords, direct PII (email, phone)

security 리뷰 지적은 **이론상 타당** 했으나 (로그 파이프라인 유출 시 account enumeration 근거), 실무에서 userId 는 로깅 필수. **Sentry 로 가는 내용은 별도 `beforeSend` 의 `redactDeep` 이 2차 방어** — 외부 유출 경로는 이미 이중 보호.

**해결**: userId / user_id redact **취소 (롤백)**. `sensitiveFields.ts` 에 근거 주석 남김 — 같은 지적이 반복되지 않도록.

```ts
// 주의: userId / user_id 는 redact 하지 않는다.
//   - UUID 형태의 auth.uid() 는 직접 PII 가 아니며, 요청 상관분석 키.
//   - OWASP Logging Cheat Sheet 도 UUID 식별자 로깅을 권장.
//   - Sentry 로 가는 내용은 별도 beforeSend redactDeep 이 2차 방어.
//   - 근거: Task 1-5-c security-reviewer H-1 재평가 (2026-04-18).
```

**규칙** ⭐:

- **redact 대상 결정 기준**: "이 필드가 없으면 디버깅 불가능한가?" Yes → **기본 redact 대상 아님**.
  - 직접 PII (email, phone, fullName, SSN 등): redact O
  - 요청 상관분석 식별자 (userId UUID, requestId, botId, sessionId): redact X
  - 비밀 자체 (password, token, secret, apiKey, serviceRoleKey): redact O
- **리뷰 제안이 기존 테스트와 충돌하면 재평가 우선**. 테스트는 "의도된 동작 보호" 역할 — 리뷰가 이를 깨면 둘 중 하나가 틀린 것. 리뷰 지적의 합리성과 테스트가 보호하는 설계 의도를 **비교해 판정**하고, reject 결정 시 **근거를 코드 주석 + learnings 에 기록** (미래 동일 제안 반복 방지).
- **Sentry redact 이중 방어 원칙**: 로그 파이프라인에 상관분석 키가 남아도 OK. 외부 Sentry 전송은 별도 redact 함수가 있으므로 외부 유출 보호됨.
- redact 정책은 **단일 출처(SENSITIVE_FIELD_NAMES)** 로 관리. 필드 추가/제외 시 **근거 주석 필수** — "왜 이건 제외했나" 기록이 후속 리뷰 반복 차단의 핵심.

---

### 2026-04-18 Zod 4.x `.default()` 는 undefined 입력에 정상 적용 (기술 이슈)

**증상**: Task 1-5-d 의 code-reviewer 가 H-2 로 `fontFamily: optStr("appearance.fontFamily")` → Zod `z.string().default("Pretendard")` 조합에서 `undefined` 입력이 타입/런타임 에러 유발 가능성 제기. 비슷하게 `timezone`, `hours`, `offHoursMessage`, `handoff.trigger`, `fallbackMessage` 모두 의심 필드로 지목.

**원인**: Zod v3 → v4 마이그레이션 시 `.default()` 동작이 바뀌었다는 근거 없이, 리뷰어가 보수적으로 "undefined = 타입 위반" 으로 가정. 실제 Zod 4.x 는 `"A default value is only applied when the input is undefined"` (공식 문서) 를 유지. 이미 `schema.test.ts` 의 "최소 입력" 테스트 (`dariConfigSchema.parse({...}).behavior.businessHours.timezone === "Asia/Seoul"`) 가 이 전제를 간접 검증하고 있었음 — 78/78 통과가 증거.

**해결**: H-2 를 허위 양성으로 판정하고 코드 수정 대신 `buildConfigInput` 주석에 근거 한 줄 추가:

```ts
// empty string 인 optional 필드는 undefined 로 변환.
// → Zod 4.x 의 `.default()` 는 `undefined` 입력에 default 를 정상 적용하므로
//   `z.string().default("X")` 필드에 undefined 를 보내도 default("X") 로 채워진다.
//   (참고: schema.test.ts 의 "최소 입력" 테스트가 이 전제를 검증함)
```

**규칙** ⭐:

- **리뷰 제안을 받기 전에 "기존 테스트가 이미 검증 중인가?" 확인**. 통과 중인 테스트가 간접 증명이면 제안은 허위 양성 가능성 큼. 기계적 반영 전에 테스트 커버리지 확인.
- **Zod `.default()` 동작 확정**: `undefined` 입력 시 default 적용. 키 자체가 없어도 동일. 즉 `optStr` 헬퍼가 `undefined` 반환해도 안전.
- **허위 양성 판정 시 코드 주석으로 기록**. 다음 리뷰/유지보수자가 같은 의문 반복 방지. 설명은 "왜 괜찮은가" + "증거 위치(테스트 파일 경로)".
- 라이브러리 동작에 대한 리뷰 제안은 **공식 문서 인용 + 기존 테스트 크로스체크** 로 판정. 추측성 의심에 기계적 반영은 오버엔지니어링.

---

### 2026-04-18 미래 Phase 보안 위협을 schema 레이어에 선제 차단 (설계 결정)

**증상**: Task 1-5-d 독립 보안 리뷰에서 4건 발견 — `analytics.webhookUrl` SSRF 위험 / `fontFamily` CSS injection / `timezone` IANA 미검증 / `handoff.trigger` 길이 무제한. 모두 **Phase 1 에서는 실제 실행 경로 없음** (위젯 런타임이 Phase 2 에 도입 예정). "현재는 문제 없으니 넘어가자" vs "Phase 2 전 선제 차단" 사이에서 판단 필요.

**원인**: "아직 사용 안 되니 나중에" 마인드는 Phase 2 런타임 코드가 실제로 값을 사용하기 시작한 시점에 급하게 막아야 하는 재공사를 만든다. 특히 `DariConfig` 는 **단일 진실 공급원 (SSOT)** 으로 이미 모든 엔드포인트·저장 경로가 통과하는 지점이라, schema 레이어에 제약을 얹는 것이 가장 적은 비용으로 가장 넓은 보호를 제공.

**해결**: 네 건 모두 선제 차단.

- `analytics.webhookUrl`: `.refine(isSafeExternalWebhook)` 로 https-only + IPv4/IPv6 사설 대역 차단
- `fontFamily`: `.max(100) + regex /^[\w\s,'-]+$/` (CSS injection 방어)
- `timezone`: `.regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/)` (IANA 형식 + Etc/GMT+9 허용)
- `handoff.trigger`: `.max(200)` (JSONB 크기 + 위젯 렌더링 방어)

각 제약에 **"security L-X, Phase 2 런타임 전 선제 차단" 주석** 명시. 회귀 방지 단위 테스트 `analyticsSchema` / `businessHoursSchema` 블록 +8 케이스 추가.

**규칙** ⭐:

- **단일 진실 공급원(schema/config)에 보안 제약을 집중**시키는 것이 분산된 엔드포인트 검증보다 우수. 모든 저장 경로·로드 경로가 통과하므로 한 번의 수정으로 전 경로 보호.
- **"현재 실행 안 된다" ≠ "나중에 막아도 된다"**. 실제 위협이 되는 시점 = 데이터가 이미 DB 에 존재하는 시점. 데이터 0건 + 사용 경로 X 시점이 선제 차단의 최저 비용 창. (2026-04-17 "데이터 0건 시점 리팩토링 최저 비용" 교훈의 보안 버전)
- **선제 차단 코드에는 근거 주석 3종 필수**: (1) 어떤 공격을 막는가, (2) OWASP/CVE 참조, (3) Phase 2 의 어느 실행 경로에서 값이 쓰이는가. 미래 유지보수자가 "이 regex 왜 있지?" 고민할 때의 교과서.
- **회귀 방지 테스트 동반**. 선제 차단은 "현재 실행 안 되는 코드" 라 쉽게 회귀함. `schema.test.ts` 블록 형태로 우회 시나리오 명시적 케이스화.

---

### 2026-04-18 Node.js URL hostname IPv6 브라켓 + IPv4-mapped 우회 (기술 이슈)

**증상**: Task 1-5-d 재리뷰 CRITICAL — `isSafeExternalWebhook` 1차 구현이 IPv4 점표기(`10.0.0.1` 등)와 hostname blocklist(`localhost`, `127.0.0.1`, `::1`) 만 검사하면 **IPv6 우회 가능**:

- `https://[fc00::1]/x` (ULA 사설)
- `https://[fe80::1]/x` (link-local)
- `https://[::ffff:10.0.0.1]/x` (IPv4-mapped IPv6 — 사설 IPv4 우회)
- `https://[::ffff:7f00:1]/x` (16진 IPv4-mapped)

추가로 Node.js URL 파싱이 `new URL("https://[::1]/").hostname` 을 `::1` 로 반환할지 `[::1]` 로 반환할지 **환경별 일관성 X** — blocklist 리터럴 매칭이 우회될 수 있음.

**원인**: SSRF 방어 시 IPv4 만 생각하는 것이 흔한 함정. 현대 클라우드 (AWS VPC, K8s, Docker) 는 IPv6 내부 통신 사용 증가 + `::ffff:x.x.x.x` 형태의 IPv4-mapped 가 자동 생성 경로. 브라켓 처리 누락은 URL API 세부 스펙 차이를 무시한 결과.

**해결**: `isPrivateIPv4` 와 `isPrivateIPv6` 를 분리하고 브라켓 정규화 선처리.

```ts
const raw = parsed.hostname.toLowerCase();
const host = raw.replace(/^\[|\]$/g, ""); // 브라켓 제거 환경 일관화

if (["localhost", "0.0.0.0"].includes(host)) return false;

if (host.includes(":")) {
  if (isPrivateIPv6(host)) return false; // ::1, fc__, fd__, fe8_~feb_, ::ffff:사설
  return true;
}

if (isPrivateIPv4(host)) return false; // 127/10/192.168/172.16-31/169.254
return true;
```

`isPrivateIPv6` 는 IPv4-mapped 파싱까지 수행 — `::ffff:(x.x.x.x)` 를 추출해 `isPrivateIPv4` 재호출. 회귀 방지 테스트 8 케이스 (정상/http거부/IPv4 사설 8종/IPv6 사설+mapped 8종/정상 공인 IPv6/undefined).

**규칙** ⭐:

- **SSRF 방어 체크리스트**: IPv4 사설 + IPv6 사설 + IPv4-mapped IPv6 + hostname 정규화(대소문자/브라켓) + 스킴 제한(https-only).
- **URL API 의 `hostname` 필드는 플랫폼/버전별 IPv6 브라켓 처리 다름** — 항상 `.replace(/^\[|\]$/g, "")` 선처리 후 비교.
- **DNS rebinding / 비십진 IPv4 표기 (8진/16진/단축) 는 schema 레이어로 완전 차단 불가** — fetch 시점 `dns.lookup()` 결과 재검증 필요. Phase 2 백로그로 이관하되 **명시적 주석** 으로 "schema 레이어 한계" 기록.
- **재리뷰 필수 시점**: 신규 보안 함수(SSRF, auth, crypto)는 첫 구현 직후 **반드시 별도 리뷰 라운드** — 단순 유틸보다 우회 벡터가 다양해 1차 리뷰로 완전 커버 어려움.

---

### 2026-04-18 `__InternalSupabase.PostgrestVersion` 슬롯 = supabase-js 타입 추론 활성화 열쇠 (기술 이슈)

**증상**: `src/core/db/types.ts` 를 수동 정의 (Epic 0-B 에서 자동 생성 대신 선택 — DariConfig·MessageSource 같은 구조 타입 정확도 보존 목적) 하면서 `supabase.from("bots").insert(payload)` 시 payload 타입이 `never` 로 좁혀져 TS2345 에러. `.returns<T[]>()` / `as never` 어셔션 회피가 전 프로젝트 6곳에 퍼짐.

**원인**: postgrest-js v1.x 는 `Database` 타입에서 두 요소를 탐지해 Insert/Update payload 추론을 활성화한다.

1. 최상위 `__InternalSupabase: { PostgrestVersion: string }` 슬롯 — `ClientServerOptions` 주입 경로
2. 각 테이블의 `Relationships: GenericRelationship[]` 필드 — `GenericTable` 요구조건

둘 중 하나라도 없으면 `GenericTable` 제약 불만족 → payload 타입이 `never` 로 fallback. `supabase gen types` 는 둘 다 자동 생성하지만, **수동 정의 시 문서화된 가이드 없음** → 쉽게 누락.

**해결**: types.ts 최상위에 슬롯 + 4 테이블 모두에 빈 `Relationships: []` 추가.

```ts
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12"; // postgrest-js feature-flags 12 = 가장 보수적
  };
  public: {
    Tables: {
      bots: {
        Row: { ... };
        Insert: { ... };
        Update: { ... };
        Relationships: []; // FK 정의 없으면 빈 배열
      };
      // ... conversations / messages / knowledge_chunks 동일
    };
    // ...
  };
};
```

PostgrestVersion="12" 선택 근거: postgrest-js `feature-flags.ts` 의 `SpreadOnManyEnabled`/`MaxAffectedEnabled` 가 13+ 에서만 활성화 → 현재 사용 안 함 → 12 가 가장 보수적·안전.

슬롯 추가 후 `.returns<T[]>()` 4곳 + `as never` 2곳 전부 제거 가능. tsc/build/e2e 그대로 통과.

**규칙** ⭐:

- **supabase-js `Database` 타입을 수동 정의할 때 필수 2 요소**: (1) `__InternalSupabase.PostgrestVersion: "12"` (2) 각 테이블 `Relationships: []`. 누락 시 모든 INSERT/UPDATE 에서 `as never` 강제됨.
- **`as never` 어셔션이 여러 곳에 반복되면 = 타입 정의 자체 결함 신호**. 회피 코드를 파일별로 붙이는 대신 근본 수정 우선 검토.
- PostgrestVersion 은 **실제 Supabase 서버 버전 < postgrest-js feature 기대치** 의 보수적 값 선택. 미래 feature 사용 시점에 13+ 로 업그레이드.
- 수동 정의 선택 근거는 `types.ts` 상단 주석에 명시 — Epic 1 이후 자동 생성 파이프라인 재평가 약속 유지.

---

### 2026-04-18 Next.js 16 proxy 의 `NextResponse.redirect()` 는 빈 cookies (기술 이슈)

**증상**: Task 0-D-6 — proxy 에서 `updateSession` 이 세션 토큰 refresh 후 반환한 `response.cookies` 가 `NextResponse.redirect(url)` 생성 시 **전파되지 않음**. 결과: 로그인 직후 보호 라우트 접근 시 새 JWT 쿠키가 클라이언트로 안 가서 다음 요청에서 세션 만료 인식 → 재로그인 루프 또는 E2E worker 격리 race.

**원인**: `NextResponse.redirect()` 는 **빈 cookies 를 가진 새 Response** 를 생성. `updateSession` 이 갱신한 response 는 closure 로 최신 cookies 를 보유하지만, redirect 분기에서 그 response 를 버리고 redirect 를 새로 만들면 cookies 가 누락. Supabase SSR 공식 가이드의 middleware 예시가 "redirect 안 하는 케이스만" 보여주는 숨겨진 함정.

**해결**: helper 로 refreshed cookies 를 redirect response 에 복제.

```ts
function redirectWithRefreshedCookies(
  url: URL,
  refreshedResponse: NextResponse,
): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of refreshedResponse.cookies.getAll()) {
    redirect.cookies.set(cookie); // 옵션/만료일/secure 등 모두 복제
  }
  return redirect;
}
```

모든 redirect 분기 (로그인→/, 비로그인→/login) 에서 일관되게 사용.

**규칙** ⭐:

- **Next.js 16 proxy (구 middleware) 의 redirect 분기는 cookies 를 수동 전파해야** session refresh 결과가 클라이언트에 도달한다. `NextResponse.redirect()` 는 cookies 불포함.
- Supabase SSR 의 `updateSession` 패턴 사용 시 **redirect 시나리오 별도 처리 필수**. 공식 가이드 예시는 성공 경로만 커버 — redirect 분기는 직접 해결.
- cookies 복제는 `response.cookies.getAll()` + `redirect.cookies.set(cookie)` 루프. `cookie` 객체 자체를 set 하면 옵션(httpOnly/secure/expires/sameSite)까지 복제됨 — 문자열/값만 전달하면 유실.
- 이런 종류의 "문서에 없는 함정" 은 **E2E 에서 세션 흐름 테스트** (로그인 → 보호 라우트 접근 → 로그아웃 → 재접근) 로 조기 감지 가능. proxy 단순 테스트는 부족함.

---

### 2026-04-18 `server-only` 는 vitest node 환경에서 throw — alias stub 필수 (기술 이슈)

**증상**: Task 1-0-a 에서 `src/core/ratelimit/factory.ts` / `bot-create-limiter.ts` 가 `import "server-only"` 를 사용하면 vitest 실행 시 **두 단계 실패**:

1. 패키지 resolve 실패 — `Cannot find package 'server-only'`. pnpm 에서 `server-only` 는 Next.js 의 transitive dep 이라 `.pnpm/` 하위에만 있고 직접 import 경로에 없음
2. resolve 성공 후 런타임 throw — `This module cannot be imported from a Client Component module`. `server-only/index.js` 는 의도적으로 throw 하고 Next.js 번들러가 server 빌드에서만 빈 stub 으로 교체. vitest 는 번들러 미경유라 실 throw 모듈이 로드됨

**원인**: `server-only` 는 "client 번들에서 import 되는 순간 throw" 하도록 설계된 guard. server 번들에서는 webpack/turbopack 이 virtual 모듈로 교체. vitest 는 그 교체 메커니즘을 거치지 않는다.

**해결**: vitest.config 에 `resolve.alias` + 빈 stub 파일.

```ts
// vitest.config.mts
resolve: {
  alias: {
    "server-only": new URL("./vitest.stubs/server-only.ts", import.meta.url)
      .pathname,
  },
},

// vitest.stubs/server-only.ts
export {};
```

추가로 `pnpm add -D server-only` 로 직접 devDep 등록해 resolve 단계를 먼저 성공시킨 뒤 alias 가 실 모듈 대신 stub 으로 교체하게 한다.

**규칙** ⭐:

- **Next.js + pnpm + vitest 조합에서 `server-only` import 하는 모듈을 단위 테스트하려면**: (1) `devDependencies` 에 명시 추가 (resolve 성공용) (2) `vitest.config` alias + stub 파일 (throw 회피용) 둘 다 필요. 한쪽만으로는 안 됨.
- `vi.mock("server-only", () => ({}))` 를 테스트마다 반복하지 말 것 — 여러 테스트에 같은 import 체인이 있으면 글로벌 1회 설정이 깔끔.
- stub 파일은 `src/` 바깥(`vitest.stubs/`)에 둬 tsconfig include / eslint / Next 빌드와 충돌 없게.
- 유사 패턴: `next/font`, `next/server` 같은 다른 Next 가상 모듈도 vitest 에서 import 할 경우 동일 alias 전략 필요할 수 있음.

---

### 2026-04-18 CORS 와일드카드의 TLD 단독 레이블 bypass (보안 이슈)

**증상**: Task 1-0-b `matchAllowedDomain("https://evil.com", ["https://*.com"])` → **true**. 봇 소유자가 `https://*.com` 을 allowedDomains 에 등록하면 실질적으로 모든 `.com` 허용 = allow-all. `*.net`, `*.localhost`, `*.co.uk` (ccSLD) 전부 동일 카테고리.

**원인**: 와일드카드 매칭이 `originHost.endsWith(".${baseHost}")` 순수 문자열 비교. `baseHost = "com"` 이면 `"evil.com".endsWith(".com") = true`. URL API 가 `https://com` 을 유효하게 파싱해 baseOrigin 정규화도 통과시킨다. 1차 리뷰에서 `baseHostRaw.includes("*")` 가드는 있었지만 "레이블 개수" 제약이 없었음.

**해결**: `matchWildcard` 진입 직후 base 에 **최소 1개의 점 필수** 가드 + IP 대역 오용 차단.

```ts
// TLD 단독 차단 — base 에 점이 최소 1개 있어야 2+ 레이블
if (!baseHostRaw.replace(/\.$/, "").includes(".")) return false;

// IP 스타일 차단 — 숫자 레이블로만 구성된 base (예: *.192.168) 거부
if (/^\d+(\.\d+)*\.?$/.test(baseHostRaw)) return false;
```

ccSLD (`*.co.uk`) 완전 방어는 Public Suffix List(`tldts` 등) 필요 — MVP 범위 밖. 주석으로 한계 명시 + Phase 2 schema refinement 로 이관.

**규칙** ⭐:

- **와일드카드 도메인 매칭은 `endsWith` 단순 비교로 불충분**. base 에 레이블 개수 하한(최소 2 레이블, 점 1개) 을 코드 레벨에서 강제. 소유자 입력(allowedDomains) 은 신뢰하지 않는다 — Trust Boundary 관점에서 앱 설정도 외부 입력.
- 보안 매칭 함수는 **"URL 파싱 성공 ≠ 의미적 유효"** — `new URL("https://com")` 이 파싱 가능하다고 정상 도메인으로 취급하면 안 됨. 도메인의 **의미적 제약** (TLD 아님, IP 대역 아님) 을 별도 가드로 추가.
- 재리뷰 교훈 재확인: Task 1-5-d SSRF IPv6 사례와 동일 패턴 — 신규 보안 함수는 1차 리뷰로 CRITICAL/HIGH 포착, 재리뷰로 추가 LOW 포착. **"신규 보안 함수는 별도 리뷰 라운드 필수"** 교훈이 다시 실증.
- schema 레벨 정규식 검증(`z.string().regex(...)`) 이 있으면 입력 경로에서 미리 차단 가능 — Phase 2 에서 `allowedDomains` refinement 1순위 backlog.

---

### 2026-04-18 `NODE_ENV` Zod default 는 skip 분기 정책의 무음 비활성화 위험 (설계 결정)

**증상**: Task 1-0-a 보안 리뷰(MEDIUM)에서 지적 — rate limit 등 `env.NODE_ENV !== "production"` 로 skip 하는 정책이 프로덕션에서 `NODE_ENV` 누락 시 **무음 비활성화**될 위험. `env.ts` 의 `NODE_ENV: z.enum([...]).default("development")` 가 Zod 기본값을 "development" 로 주입해 rate limit 전체가 에러 없이 통과.

**원인**: Zod `.default()` 는 런타임 안정성 UX 장치이지만, **보안 정책의 분기 조건** 으로 사용되는 env 키에는 부적합. Vercel 은 `NODE_ENV=production` 을 자동 주입하므로 정상 경로에서는 문제 없지만, Docker 직접 배포 / 커스텀 런타임 / CI pipeline 오류 시 "production 이 아님" 으로 오해되어 skip 분기가 전부 열린 채 기동될 수 있다.

**해결**: `NODE_ENV` default 제거 → 플랫폼 주입 누락 시 **부팅 실패** (fail-fast).

```ts
// env.ts — before
NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

// after
NODE_ENV: z.enum(["development", "production", "test"]),  // default 제거
```

Next.js(dev/build/start) / Vitest(test) / Vercel(production) 은 각 빌드/런타임에서 NODE_ENV 를 자동 주입하므로 정상 경로 영향 없음. 커스텀 런타임·Docker 는 명시 주입 필수화.

**규칙** ⭐:

- **보안 분기 조건에 쓰이는 env 키는 Zod default 금지**. 무음 비활성화보다 명시적 부팅 실패가 항상 안전 (fail-fast principle).
- 분기 조건 env (`NODE_ENV`, `FEATURE_FLAG_*`, `DISABLE_RATELIMIT` 등) 는 **required** 로 두되, 정반대로 UX 안정성 env (`LOG_LEVEL`, `PORT`) 는 default 로 DX 보호. 용도별 구분.
- 이 원칙은 Phase 2 이후 FeatureFlag, A/B 테스트 분기, 성능 모니터링 on/off 등 장래 정책에도 동일 적용.
- 배포 문서 (`docs/environments.md`) 에 "NODE_ENV 는 플랫폼에서 반드시 명시 주입" 체크리스트 항목으로 추가 권장 (backlog).

---

### 2026-04-18 Anon Chat API 의 "6중 보안 레이어" 체크리스트 (설계 결정)

**상황**: Task 1-6-a — 위젯 Chat API(`/api/chat/[botId]`) 는 **인증 없는 anon 요청** 을 처리하는 첫 엔드포인트. 기존 Supabase RLS 방어 계층이 동작하지 않는(service_role 경유) 상황에서 공격 표면이 급증. 독립 보안 리뷰는 MEDIUM 3건 (Anthropic raw Error 로깅 / 메시지 저장 DoS / max_tokens 비용 공격) 을 포착했고 모두 수용. 이 과정에서 anon 엔드포인트가 공통적으로 요구하는 방어 구조가 드러남.

**원인**: anon API 는 "누가 호출하는지 모른다" 는 전제에서 각 요청이 어떤 봇에 속하는지 / 어디서 왔는지 / 얼마나 자주 오는지 / 어떤 대화에 쓸지 / 무엇을 반환할지 / 에러 시 어떻게 일반화할지를 **엔드포인트 코드가 직접 책임** 져야 한다. 한 레이어만 빠져도 bypass 경로 생김.

**해결**: Dari 의 anon 엔드포인트는 아래 6개 레이어를 모두 관통해야 한다.

```
1. resource lookup     — service_role + status='active' 필터. 실패 시 404 일반화
2. origin 검증          — matchAllowedDomain (`allowedDomains` 기준)
3. rate limit          — factory 재사용, 복합키 `{resource}:${ip}` (리소스 간 쿼터 격리)
4. 소유권 검증          — nested resource(conversationId 등) 의 부모 리소스 일치 확인
5. 응답 최소화          — config 원문·systemPrompt·내부 식별자 미노출. 반환 필드 화이트리스트
6. 에러 일반화          — 부재 / 정책 위반 / 포맷 오류 모두 동일 코드·메시지로 수렴 (enumeration 방지)
```

Task 1-6-a 의 `src/app/api/chat/[botId]/route.ts` 는 이 6개를 POST 진입 직후 시퀀셜 체크로 구현. 각 레이어는 helper 로 분리되어 재리뷰/확장이 용이.

**규칙** ⭐:

- **새 anon 엔드포인트(위젯 이외의 공개 API, 웹훅 수신 등)를 추가할 때 6 레이어 전부 통과 여부를 체크리스트로 검증**. 하나라도 빠지면 Plan 단계에서 명시적으로 유보 근거 기록.
- 리소스 lookup 은 반드시 **status/활성 필터** 를 포함 (soft-delete 된 리소스 접근 차단). `status` 가 없는 테이블도 유사 플래그(예: `is_public`, `deleted_at IS NULL`) 필수.
- Rate limit key 는 **리소스 식별자 + 호출자 식별자 복합** 이 기본. 한쪽만 사용하면 리소스 간 쿼터 간섭 또는 리소스별 격리 실패.
- 응답 필드는 **화이트리스트 방식** — `const response = { conversationId, message }` 처럼 명시적 구성. DB row 전체 spread 금지 (internal 필드 노출 위험).
- 에러 응답 코드/메시지는 **enumeration 일반화** — "bot 없음" vs "RLS 차단" 을 구분 가능한 응답은 scraping 도구에게 힌트 제공.
- 비용·저장 공격 방어는 **레이어별 상한** — 요청 크기(Zod), 봇당 rate(factory), 리소스당 누적(message count), AI output(maxTokens clamp) 각각 별도로 체크.

---

### 2026-04-18 외부 SDK catch 로깅은 `sanitizeLoggableError` 경유 원칙 (설계 결정)

**증상**: Task 1-6-a 보안 리뷰(MEDIUM T12) — `callAnthropic` / `loadActiveBot` / `resolveConversationId` 등 외부 SDK(Anthropic, Supabase) catch 블록에서 `logger.error({ err }, ...)` 로 raw Error 객체를 그대로 기록. Anthropic SDK `APIError.message` 는 Authorization 헤더·API 키 값을 포함할 수 있고, Supabase PostgrestError 도 URL 을 message 에 포함한다. Pino redact 는 필드명 기반이라 `err.message` 안 inline 문자열은 걸러내지 못함 → Sentry bridge 로 그대로 전달.

**원인**: 기존에 `sanitizeLoggableError` 는 Task 1-0-a fail-open 전용으로 factory.ts 내부에 비공개 함수였음. 다른 외부 SDK catch 에서는 raw Error 그대로 로깅하는 관행이 확산. Anthropic/Supabase 처럼 **어떤 외부 서비스든 에러 메시지에 secret 이 들어갈 수 있다** 는 점을 간과.

**해결**: `sanitizeLoggableError` 를 export 하고 **모든 외부 SDK catch 경로에서 필수 경유**.

```ts
// factory.ts
export function sanitizeLoggableError(err: unknown): { name: string; message: string };

// route.ts, ai/*, db/*, 외부 웹훅 핸들러 등
try {
  await externalSDK.call(...);
} catch (err) {
  logger.error({ err: sanitizeLoggableError(err), ...ctx }, "...");
}
```

마스킹 규칙(URL / Bearer 토큰 / `token=` 쿼리) 은 기존 그대로. 필드명 redact(Pino) + message inline 마스킹(sanitize) 이 2중 방어선을 이룬다.

**규칙** ⭐:

- **외부 SDK(Anthropic, Supabase, Upstash, Stripe, Firecrawl 등) catch 블록의 logger.error 는 반드시 `sanitizeLoggableError` 경유**. 내부 로직 에러(직접 throw 한 Error)는 예외 — 자체 메시지 통제하에 있음.
- `Error.message` 는 Pino redact 미도달 영역. inline 문자열 마스킹이 없으면 secret 이 Sentry/로그 파일로 유출. 이는 OWASP A09 (Security Logging Failures) 의 전형 패턴.
- 신규 외부 SDK 도입 시 **그 SDK 가 에러 메시지에 secret 을 포함하는지를 먼저 조사**. 조사 없이 raw Error 로깅은 금지.
- 중앙 마스킹 함수의 정규식은 공격자가 우회 쉽지만, 2중 방어(필드 redact + 메시지 마스킹)의 두 번째 layer 가 없는 것보다 크게 낫다. 정규식 확장은 새 secret 포맷(JWT, SSN 등) 발견 시 증분 추가.
- `pnpm pre-commit` 또는 lint 규칙으로 `catch (err) { logger.error({ err`) 직접 기록 검출 가능하면 자동화 (Phase 2 backlog).

---

### 2026-04-18 보안 재리뷰 후 추가 code+security 병렬 라운드의 가치 (설계 결정)

**증상**: Task 1-6-a Chat API 보안 재리뷰(MEDIUM 3 + LOW 3 신규 발견, 일괄 수정 계획 수립) 직후 "리뷰" 단독 지시로 code+security 병렬 추가 라운드 실행. 결과: 🔴 차단급 M-1 (`route.ts:267` 새 conversation INSERT 에 `visitor_id` 누락 → `has_identity` check 위반 → 모든 신규 conversation 500 실패) 발견. **두 에이전트 모두 합의**. 이 버그는 직전 1차 보안 재리뷰 + 본체 1차 code+security 리뷰에서도 미포착 — production 배포 시점에야 첫 위젯 호출에서 드러났을 것.

**원인**: 보안 재리뷰는 "수정안의 보안 적정성"에 집중하는 경향. 기존 코드의 **정합성 (스키마 제약 충족, 호출 흐름 일관성)** 은 사각지대. code-reviewer 가 별도 관점으로 "이 코드는 실제 동작하는가" 검증해야 발견. 또한 보안 권장 코드 자체가 회귀를 만들 수 있음 (N-3 D-3-a 가 정상 위젯 차단 → 둘 다 폐기 합의로 발견).

**해결**: 보안 이슈 일괄 수정 직전에 **code+security 병렬 라운드 1회 추가** 정책. 단일 보안 라운드 → 수정 적용 → 코드 후속 라운드 패턴 대신, **수정 직전 양쪽 동시 검증**.

**규칙** ⭐:

- **신규 보안 함수 / 보안 수정 일괄 적용 직전에 code+security 병렬 라운드 1회 추가 의무**. 비용 ~10-15분, 가치 차단급 1건 = 1시간+ 디버깅 + production 사고 회피. ROI 명확.
- 보안 리뷰 단일 관점은 "수정안 적정성"에 갇힘. **code-reviewer 가 "기존 코드 정합성" + "수정으로 인한 회귀" 검증 보완**.
- "리뷰" 단독 지시 → code-reviewer + security-reviewer 병렬 (memory `feedback_review_dual_agents.md` 일치).
- **두 에이전트가 합의한 발견은 강한 신호** — 단독 발견보다 우선순위 상위. 합의 = false positive 가능성 낮고 두 관점에서 위협 명확.
- 1차 보안 리뷰 → 수정 → **추가 라운드 → 잔여 발견 반영** 의 3단 패턴이 신규 보안 함수의 표준. 1차만으로 ship 금지.

---

### 2026-04-18 보안 리뷰 권장 코드도 비판적 재검토 (설계 결정)

**증상**: Task 1-6-a 보안 재리뷰의 N-3 (OPTIONS bot lookup → DB DoS + bot enumeration timing oracle) 권장 수정안:

```typescript
return new NextResponse(null, {
  status: 204,
  headers: { Vary: "Origin", "Access-Control-Max-Age": "600" },
});
```

이 코드는 `Access-Control-Allow-Origin` 헤더 부재 → 브라우저가 cross-origin 응답 거부 → **정상 위젯의 cross-origin POST 요청 전부 차단**. 즉 위젯 기능 자체 무력화. code+security 추가 라운드에서 둘 다 폐기 합의 → Phase 2 backlog 이동.

**원인**: 보안 권장 코드는 "이 위협을 막는다"에 집중하지만 **"정상 트래픽이 동작하는가"를 동시에 검증 안 하는 경우** 있음. CORS preflight 의 `Access-Control-Allow-Origin` 헤더는 브라우저 CORS 정책의 핵심이라, 빠뜨리면 cross-origin 자체가 깨짐. 또한 N-3 위협 자체 (bot enumeration timing oracle) 의 실질 영향이 작은데 폐기 비용이 큼 (정상 위젯 100% 차단).

**해결**: N-3 폐기 → Phase 2 backlog. 대안 검토 (in-memory LRU 캐시 / 별도 limiter / `*` 단순 응답) 모두 트레이드오프 있음 → MVP 는 lookup 유지 + `Access-Control-Max-Age=600` 으로 preflight 자연 최소화에 의존.

**규칙** ⭐:

- **보안 리뷰 권장 코드는 그대로 적용 전 "정상 트래픽이 동작하는가" 검증**. 특히 CORS / 인증 / 헤더 조작 / 차단 응답 영역은 회귀 발생률 높음.
- **위협 차단 비용 vs 위협 실질 영향** 비교 — 비용 ≫ 영향이면 backlog 또는 alternative.
- code+security 병렬 라운드가 **상호 검증 메커니즘**. security 권장이 code 관점에서 회귀 만들면 둘 다 합의로 폐기.
- 보안 리뷰 결과 정리 시 "권장 코드를 그대로 적용 시 부수 효과는?" 컬럼 추가 검토.
- "권장 X 가 위협 Y 를 막지만 정상 트래픽 Z 를 차단" 패턴 발견 시 PROGRESS/learnings 즉시 기록 (다음 세션 재발 방지).

---

### 2026-04-18 PII 해시화 + 이중 redact 방어선 패턴 (설계 결정)

**증상**: Task 1-6-a 보안 재리뷰(N-4) — 운영 가시성 위해 `logger.warn` 에 클라이언트 IP 포함 권장. 그러나 IP 는 PIPA 제2조 1항 / GDPR Recital 30 기준 **식별 가능 정보** — 평문 로깅은 컴플라이언스 위험 (장기 보존, 외부 로그 수집기 전송 시 더 큼). 한편 raw IP 없이는 동일 IP 의 반복 시도 추적이 불가능 (보안 가시성 손실).

**원인**: PII 처리 시 "전혀 로깅 안 함" vs "평문 로깅" 이분법 사고. 실제로는 **"변환 후 로깅"** 이 균형점 — 추적 가치 (동일 IP → 동일 해시) 보존 + 원본 노출 방어.

**해결**: **이중 방어선**:

1. `hashClientIp(ip)` — SHA-256 prefix 8자 (`ipHash` 필드) 변환 후 의도적 사용처에서 로깅
2. `sensitiveFields.ts 'ip'` 추가 — 실수로 raw IP 가 logger 객체에 들어가도 Pino redact 가 자동 마스킹

`ipHash` 는 redact 대상 아님 (해시화로 PII 제거된 값). `ip` ↔ `ipHash` 명명 분리가 핵심.

```ts
// route.ts
function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 8);
}

logger.warn({ ipHash: hashClientIp(clientIp), ... }, "...");
// raw clientIp 가 실수로 들어가면 sensitiveFields.ts 'ip' 가 [Redacted]
```

**규칙** ⭐:

- **PII 직접 노출 vs 로깅 가치 트레이드오프 시 해시화 패턴 우선 검토**. SHA-256 prefix 8자면 충돌 확률 충분히 낮으면서 추적 (동일 입력 → 동일 해시) 보존.
- **이중 방어선** 필수 — (1) 의도적 사용처는 변환 헬퍼 경유, (2) raw 필드명은 `sensitiveFields` 에 등록해 실수 누출 차단. 둘 중 하나 빠지면 방어선 깨짐.
- **변환 함수 명시화** — 인라인 정의보다 헬퍼 함수. `hashClientIp(ip)` 처럼 의도가 함수명에 드러나야 향후 다른 개발자가 raw 회귀 안 함.
- 해시 필드명은 raw 와 구분 (`ip` vs `ipHash`, `email` vs `emailHash`). 같은 이름이면 Pino redact 가 양쪽 모두 잡아 의도 불분명.
- 적용 가능 PII: IP (동일성 추적), 이메일 (해시 vs 부분 마스킹), 전화번호 (통계 파티셔닝), 결제 카드 번호 (PAN — 마지막 4자리 보존 패턴 별도). **목적별 변환 방식 선택**.
- ADR 권장 (Phase 2): "PII 로깅 정책" — 어떤 PII 를 어떤 변환으로 다룰지 단일 진실.

---
