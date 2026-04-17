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
