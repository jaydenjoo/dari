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
