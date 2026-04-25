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

### 2026-04-25 `.env.local` 이 prod Supabase 를 직접 참조 — dev/prod 분리 의도와 어긋난 채 운영 (긴급도 상승 발견)

**증상**: Gemini SDK 마이그레이션 검증을 위해 로컬 E2E `bot-knowledge-sources.spec.ts` 실행. globalSetup 의 `createTestUser('e2e-main@dari.test')` 가 "이미 등록됨" 으로 실패. 잔재 계정 정리 위해 dari-dev 프로젝트를 찾으려 했으나 **Supabase 프로젝트 목록에 dari-dev 가 없고 `dari` (prod ref `pxdopzlaffjcxqfrqidq`) 만 존재**. `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 이 prod 를 가리킴 → **로컬 E2E + `pnpm dev` 가 prod DB 에 실 데이터 쓰는 구조** 였음. 이전에 Playwright 가 만든 잔재 계정 + 봇이 prod 에 그대로 잔재.

**원인**:

1. **Phase 0 초기 setup 시 dev/prod 분리 미실행** — `environments.md` 는 dev (`dari-dev`) / prod (`dari-prod`) 2개 환경으로 분리한다고 기술하지만 실제는 dari (1개) 만 생성하고 그것을 prod 로 승격. `.env.local` 은 그대로 같은 프로젝트 가리킴.
2. **로컬에서 prod 인 줄 인지 못함** — Jayden 이 "로컬은 dev, prod 는 Vercel env" 로 인식하고 작업. 사실은 둘 다 같은 DB. 이 사실이 **이번 fix 검증 시점에 우연히 발견** — 그 전까지는 모르고 운영.
3. **부산물**: 로컬 E2E 실행 → prod 에 e2e 봇/계정 생성. PROGRESS 에서 본 `e2e-main@dari.test` + 자동 생성 봇 (`기간 전환 x-hq2h`, `파일 TXT u-bu95` 등) 이 prod 에 잔재. teardown 실패로 누적.
4. **봇 3개 삭제 미스터리도 같은 원인** — 2026-04-24 세션에 chatsio/findably/interviewgenie 봇이 soft-delete 되었는데 Jayden 은 자기 의도였다고 답변 (테스트 차원). 근본 원인은 **로컬에서 prod 봇을 직접 다룬 결과**.

**해결** (긴급, 별도 Task):

1. Supabase 에 **`dari-dev` 신규 프로젝트 생성** (free tier 또는 pro 의 무료 추가 슬롯).
2. 12개 마이그레이션 apply (`supabase link --project-ref <dari-dev-ref> && supabase db push`).
3. Auth Google OAuth + Site URL + Redirect URLs 등록 (로컬 4000).
4. `.env.local` 모든 Supabase env 를 dari-dev 로 교체 (URL, anon, service_role).
5. 잔재 e2e 계정 + 봇 prod 에서 영구 정리 (Jayden 봇 5개만 보존).
6. 검증: `pnpm dev` + E2E 실행 시 dari-dev 에만 데이터 생성, prod 영향 0.

**규칙** ⭐:

- **로컬 `.env.local` Supabase URL 은 prod 와 절대 같으면 안 된다** — 1인 운영 프로젝트라도 dev/prod 분리는 필수. 비용 0 (free tier) + 안전 ↑↑.
- **Phase 0 setup 체크리스트에 "Supabase 프로젝트 2개 (dev + prod) 분리 확인" 명시 항목 추가** — 그냥 "Supabase 프로젝트 생성" 으로 두면 1개로 끝나고 prod 승격 시 dev 가 사라짐.
- **`.env.local` 의 SUPABASE_URL 이 어떤 프로젝트인지 주석으로 명시** — 예: `NEXT_PUBLIC_SUPABASE_URL=... # dari-dev (NOT prod!)`. Phase 1 release checklist 에 "환경변수 값 주석 점검" 단계 추가.
- **로컬 dev 가 prod DB 사용하는 구조의 위험** = (a) `pnpm dev` 첫 시동 시 의도 없이 schema migration 적용 위험, (b) 디버깅 중 무심코 `DELETE FROM bots` 실행 가능, (c) 테스트 데이터가 prod 에 누적, (d) 다른 개발자 합류 시 prod 키 공유 강제. 이 4가지가 모두 1인 프로젝트에서도 사고 가능 시나리오.
- **운영 시점 환경 점검 SQL 한 줄 표준화**: `select current_database(), current_user, version();` + 결과를 PROGRESS 에 기록. dev/prod 헷갈릴 때 즉시 확인.
- **이번 발견의 우연성에 의존 불가**: 다음 silent drift 도 우연히 발견될 보장 없음. **Phase 0-D 완결 기준에 "prod URL ≠ 로컬 SUPABASE_URL 검증"** 추가 필요 (release-checklist 보강).

---

### 2026-04-25 Playwright `fullyParallel: true` + workers=5 체제에서 "빈 상태" 검증 spec 은 race 로 실패 (테스트 격리 설계 결함)

**증상**: Gemini SDK fix 검증 후 추가 spec 실행. `bots-list:15` ("로그인 후 /bots → 빈 상태") 가 fail. 스크린샷에서 봇 목록에 `기간 전환 x-hq2h` (bot-stats spec 의 봇), `파일 TXT u-bu95` (bot-knowledge-file spec 의 봇) 가 보임. 이 두 spec 이 같은 worker 또는 다른 worker 에서 봇을 만들고 cleanup 전에 `bots-list` spec 이 진입 → 빈 상태 expect 실패.

**원인**:

1. **`playwright.config.ts` `fullyParallel: true` + `workers: 5`** — 로컬 dev 에서 5개 spec 이 병렬 실행. 모든 spec 이 같은 `MAIN_TEST_USER` 로 로그인 (단일 globalSetup) → 같은 owner_id → RLS 가 모든 봇을 보여줌.
2. **`bots-list` spec 의 "빈 상태" expect** — 단일 worker 격리가 가정된 설계. 다른 spec 의 finally cleanup 이 실행되기 전에 진입 가능.
3. **finally cleanup 의 race** — `await deleteBotBySlug(slug)` 가 spec 종료 시 실행되지만, `bots-list` 가 그 사이 진입 가능.
4. **단일 테스트 계정 = 모든 spec 공유** — 격리하려면 spec 마다 별도 계정 필요 (createTestUser 호출당 1개). 현재는 globalSetup 에서 1개만 생성.

**해결** (별도 Task 이월):

1. **`bots-list` spec 에 `test.describe.serial`** 적용 — 이 파일만은 다른 spec 과 절대 동시 실행 안 됨.
2. 또는 **spec 별 격리 계정** — 각 spec 의 `test.beforeAll` 에서 `createTestUser` 호출, `afterAll` 에서 cleanup. Globalsetup 은 widget build 만.
3. 또는 `bots-list` 의 expect 를 "빈 상태" 가 아닌 "테스트 봇이 보이지 않음" 으로 약화 — 다른 spec 영향 흡수.

**규칙** ⭐:

- **Playwright `fullyParallel: true` 환경에서 "전체 상태 expect" (예: "X 가 N 개", "비어있음") 는 worker 격리 가정** — 다른 spec 이 만든 데이터가 동일 사용자 view 에 들어오면 fail. `test.describe.serial` 또는 spec 별 user 격리 필수.
- **단일 globalSetup 사용자 모델은 단순하지만 race 위험** — spec 수가 늘면 cross-spec interference 증가. Phase 2 이상에서는 spec 별 user 권장.
- **finally cleanup 은 race 보장 안 함** — Playwright 의 finally 는 spec 끝에 실행되지만 다른 spec 의 진입을 막지 않음. cleanup 으로 race 해결 시도 X.
- **테스트 spec 검증 시 첫 실행 (cold start) 와 재실행 (warm) 차이 인지** — race 는 빈도 의존적. CI 에서는 워커 수가 다르면 다른 결과 가능.
- **Playwright spec 의 expect 작성 시 다른 spec 과의 데이터 격리 가정 명시** — 코멘트로 "이 spec 은 격리된 user 를 가정. 공유 user 에서는 race 가능".

---

### 2026-04-25 외부 제공자 AI 모델 버전의 silent deprecation — 모델명 상수 고정은 미래 시한폭탄 (Gemini `text-embedding-004` 사례)

**증상**: Task A-5b-① Step 2 진입 직전 Jayden 이 prod 대시보드에서 지식 저장 시도 → 모두 실패. text + URL 크롤링 동시 고장. 조사 결과 Server Action 이 "지식 저장에 실패했어요..." 에러 배너 렌더. 내부 로그: `[404 Not Found] models/text-embedding-004 is not found for API version v1beta`. 로컬 E2E 재현 시도 → 동일 증상. prod env / Vercel 설정 / Supabase RLS / owner_id 모두 정상. **원인 = Google 이 우리가 쓰던 embedding 모델을 deprecate**. 코드는 멀쩡한데 외부 API 계약이 바뀌어 조용히 prod 가 고장.

**원인**:

1. **AI 모델 명시적 버전 고정의 역설** — Task 1-7-a 구현 당시 (2026-04-19) Google 공식 추천 모델 `text-embedding-004` 를 하드코딩. 이후 Google 은 `gemini-embedding-001` 을 신 권장으로 전환하며 구 모델을 v1beta API 에서 제외. 클라이언트에 공지는 있었겠지만 **운영자가 공식 공지 채널을 구독하지 않으면 놓침**.
2. **CI 에서 외부 API 포함 smoke test 부재** — `E2E_SKIP_EXTERNAL_API=true` 가 CI 에 설정돼있어 외부 API 의존 spec 은 skip. 로컬 E2E 는 명시 요청 시에만 실행. 따라서 Google 의 모델 변경이 **CI 녹색 상태에서 조용히 prod 에 반영되지 않음** (prod 와 실 호출 경로가 CI 와 괴리).
3. **모델 버전 drift 는 의존성 업그레이드와 성격이 다름** — SDK 버전은 package.json + Renovate 같은 도구로 관리 가능. **모델명은 코드 내 문자열 상수** 이라 dependency tool 로 추적 불가. 외부 deprecation 공지 + 수동 교체 외엔 방법 없음.
4. **로컬 Vercel prod env == `.env.local` 공유** — 본 세션 중 발견된 별도 이슈지만 맥락 관련: `.env.local` 이 prod Supabase 를 직접 참조했기에 로컬 E2E 도 prod 와 같은 증상 재현 가능 (이게 원인 확정에 도움이 됨, 우연). 정상 환경에서는 dev ≠ prod 라 로컬 재현 불가 가능성.

**해결**:

1. `@google/generative-ai 0.24.1` → `@google/genai 1.50.1` (신 SDK) + `text-embedding-004` → `gemini-embedding-001` + `outputDimensionality: 768` 명시 (128~3072 지원 중 DB `vector(768)` 유지).
2. API signature 변경: `model.batchEmbedContents({ requests })` → `ai.models.embedContent({ model, contents, config })`. `response.embeddings[].values` 구조 유지.
3. env 변수명 유지 (`GOOGLE_GENERATIVE_AI_API_KEY`) — 신 SDK 는 생성자에 `{apiKey}` 명시 전달하므로 env 교체 불요.
4. 테스트 mock 전면 재작성 — class 내부 `models.embedContent` 프로퍼티 구조로 신 SDK 인스턴스 모방.
5. security review MEDIUM 반영: `new GoogleGenAI({apiKey})` 에 `httpOptions` 의도적 미사용 주석 — 신 SDK 는 `httpOptions.baseUrl` 로 endpoint 오버라이드 가능 (SSRF 벡터), 생성자 호출 지점을 "잠금".

**규칙** ⭐:

- **AI 모델 버전을 코드 상수로 박을 때 "2년 뒤 이 문자열이 아직 유효한가?" 를 주석에 명시** — `GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"` 같은 상수 옆에 "Migration YYYY-MM-DD" 주석 + 다음 재확인 권고 시점. 미래 재마이그레이션 시 발견 단서.
- **외부 API 의존 스모크 테스트를 CI 에 최소 주 1회 실행 (Phase 3 이월)** — `E2E_SKIP_EXTERNAL_API=false` 로 주간 cron. 무료 tier 가 허용하는 소량 호출로 충분 (Gemini embedding = 무료, Anthropic = 최소 메시지 1건, Firecrawl = 무료 tier 소량). **"CI 녹색 + prod 조용히 고장"** 시나리오 조기 감지.
- **모델 deprecation 보다 빠르게 알 수 있는 경로는 `/api/health` 확장** — DB ping 만 하지 말고 AI SDK 가벼운 호출 (short text 1건 embedding) 추가. 외부 모니터링 (Sentry / Uptime Robot) 이 health 엔드포인트 긁으면 deprecation = health fail = 즉시 알림.
- **증상이 "UI 에 일반적 실패 메시지만 보임" 이면 root cause 는 외부 서비스 응답일 확률 높음** — Server Action 이 정적 메시지로 내부 에러 마스킹하는 패턴은 보안 원칙상 맞지만, 운영 진단 시 서버 로그 (`logger.error` 의 `err.message`) 가 유일한 단서. prod 에서 로그 접근 가능한 채널 (Sentry / Vercel Logs) 반드시 확보.
- **SDK 메이저 전환 시 기존 SDK 가 deprecated 경고 또는 breaking 변경 주는지 확인** — `@google/generative-ai` 도 `@google/genai` 이전에 `@google/generative-ai@0.24+` 에서 deprecation 경고 있었을 가능성. `pnpm outdated` 주기적 실행 + 메시지 확인 프로세스 필요.
- **근본 원인 확정까지 탐색 순서**: UI 에러 메시지 → Server Action 로그 → 외부 API 응답 → (외부 API 변경 확인) — **"env 누락"** 가설은 앱 부팅 성공한 상태에서는 우선순위 낮게. 실제 본 세션에서는 env 가설로 Jayden 에게 시간 낭비 유도한 측면 있음. 내부 로그 먼저 확인하는 습관 필요.

---

### 2026-04-24 rate limit reset 표시는 정확도와 정보 노출 사이 trade-off — Route Handler RFC 표준 vs Server Action 퍼지 표현 (Task β-4 설계 결정)

**증상**: Task β-4 에서 11 지점 (Route Handler 3 + Server Action 7+) 의 rate limit reset 시간을 사용자에게 노출하는 표준 패턴 설계 필요. 초기 구현은 모든 지점에 정확한 초 ("30초 후 다시 시도") 노출. security 리뷰 (sec M-1) 에서 지적: **공격자가 자동화 도구에서 정확 초를 파싱해 rate limit 윈도우/한도 추정 가능**. 예시:

- "30초 후 재시도" → 슬라이딩 윈도우가 30초 내외 = 분당 N 회 한도 역산
- "1시간 후 재시도" → 시간당 N 회 한도 추정
- 여러 IP 로 반복 요청 → Retry-After 패턴 분석 → 한도 정확도 점진 향상

이는 brute force 도구가 적응적으로 timing 을 조정해 차단 우회 시도를 가능하게 함. 대안 검토 시 trade-off 발생.

**원인**:

1. **사용자 UX vs 보안 정보 노출 충돌** — 정확한 초는 사용자 행동 결정에 도움 (예: 30초만 기다리면 됨). 동시에 공격자에게도 정확한 정보.
2. **인증된 사용자 전용 vs 공개 API 차이** — Server Action 은 dashboard 인증된 owner 만 접근 → 공격 표면 좁음. Route Handler 는 anon 접근 → 표면 넓음.
3. **RFC 6585 표준 vs 보안 trade-off** — `Retry-After` 헤더는 RFC 6585 표준. 변경하면 클라이언트 자동 backoff (browser fetch retry 등) 깨짐.
4. **정확도가 사용자 행동에 결정적인가?** — "30초 후" vs "1분 이내" 차이가 사용자 행동을 바꾸는가? 일반적으로 둘 다 "잠시 기다림" 으로 동일. 정확도가 결정적인 경우는 자동화 도구 (재시도 스크립트) 만 해당.

**해결**: 양면 정책으로 분리.

1. **Route Handler `Retry-After` 헤더**: **RFC 6585 표준 정확 초 유지**. 이유:
   - HTTP 표준 클라이언트 (browser fetch retry, axios-retry 등) 가 자동 사용
   - 헤더는 일반 사용자 화면에 직접 노출 안 됨 (개발자 도구 봐야 보임)
   - 변경 시 표준 위반 + 클라이언트 동작 깨짐
   - 공격자가 헤더 파싱은 가능하나, 표준이 그렇게 설계됨 (정보 비대칭 0)

2. **Server Action 사용자 메시지**: **퍼지 표현 채택**. 변경 사항:
   - 60초 미만 → "잠시 후 1분 이내 재시도 가능" (정확 초 미노출)
   - 60초~1시간 → "약 N분 후 재시도 가능" (이미 분 단위 모호)
   - 1시간 이상 → "약 N시간 후 재시도 가능" (시간 단위 모호화)
   - 사용자 인지 부담 거의 동일 + 공격 도구에 정확 정보 차단

3. **export route 의 JSON 응답 코드 (`{error: "too_many_requests"}`)**: 변경 없음. wire format 으로 사용 중. 사용자 노출 메시지 아님.

**규칙** ⭐:

- **Route Handler `Retry-After` 헤더 = RFC 6585 정확 초 표준 유지** — 표준 클라이언트 호환성 + 헤더 = 일반 사용자 미노출 → trade-off 무효
- **Server Action / 사용자 화면 메시지 = 퍼지 표현 표준** — 60s 미만 "잠시 후 1분 이내" / 1h 미만 "약 N분 후" / 1h+ "약 N시간 후". `withRetryAfter()` 단일 출처 적용.
- **새 rate-limited 지점 추가 시 위 패턴 자동 적용** — `RATE_LIMIT_MESSAGES` 상수 + `withRetryAfter()` 호출. 정확 초 노출 패턴 발견 시 즉시 fuzzy 로 변경.
- **인증 여부 무관 적용** — 인증된 사용자 전용이라도 정보 최소화 원칙 (defense-in-depth). 계정 탈취 시나리오에서도 공격 도구가 사용 못 함.
- **trade-off 판단 기준 명문화**:
  1. 사용자가 정확한 시간을 알아야 행동을 결정하는가? (대부분 NO)
  2. 공격자가 정보를 도구화 가능한가? (rate limit 정확도 = YES)
  3. 표준 클라이언트가 자동 처리하는가? (헤더 = YES → 표준 유지, 메시지 = NO → 퍼지 OK)
- **i18n 시드 패턴**: `RATE_LIMIT_MESSAGES` + `withRetryAfter` 분리 = 미래 다국어 지원 시 키 → locale 매핑 자연스럽게 도입 가능.

---

### 2026-04-24 HOC 패턴으로 라우트 횡단 검증 일원화 — `withAllowedOrigin` (Task β-4 설계 결정)

**증상**: Task β-4 진입 시점, chat / widget-config 두 라우트가 동일한 4단 검증 (bot 조회 → origin 검증 → rate limit → CORS 헤더) 을 각자 코드로 중복 수행 중. 라우트 추가 시점마다 동일 패턴 복사 → 정합성 위험. 누락 시 보안 결함 (예: 한 라우트에 `Retry-After` 만 있고 다른 곳 없음 / origin 검증 누락 / CORS 헤더 형식 불일치).

또한 `loadBot` 함수가 throw 하면 라우트 핸들러를 빠져나가 Next.js 기본 500 페이지 (HTML) 가 위젯 클라이언트에 전달될 수 있음 → 위젯 파서 (JSON 기대) 에서 파싱 오류 → silent fail.

**원인**:

1. **라우트 핸들러는 자체 로직만 담당** — Next.js Route Handler 는 단일 함수 export. 공통 검증을 추출하면 wrapper 패턴 필요.
2. **각 라우트의 책임 경계 불명확** — chat 은 추가로 body parsing / DB / streamText, widget-config 은 단순 GET. 어디까지 공통화 가능한가 ambiguous.
3. **에러 처리 일관성 부재** — 각 라우트가 `jsonError` 헬퍼 따로 정의. 동일 에러 코드 (`bot_not_available`) 가 다른 메시지 / 다른 헤더 가능.
4. **throw 처리 누락** — `loadBot` 같은 내부 함수가 throw 시 catch 안 하면 Next.js 가 처리 → HTML 500 페이지. 위젯 클라이언트는 JSON 기대 → 파싱 실패 → silent fail.

**해결**: Generic HOC `withAllowedOrigin<TBot extends {id, config}>` 도입.

```ts
export const POST = withAllowedOrigin<BotContext>(
  {
    loadBot: loadActiveBot,
    rateLimit: checkBotChatRatelimit,
    errorMessages: HOC_ERROR_MESSAGES,
  },
  async ({ bot, clientIp, corsHeaders }, req) => {
    // 비즈니스 로직만 — bot 검증, origin, rate limit 모두 통과 후 호출됨
    // body parsing / Anthropic / DB insert 등
  },
);
```

추가 안전 장치 (code M-1 Fix):

```ts
let bot: TBot | null;
try {
  bot = await options.loadBot(botSlug);
} catch {
  return jsonError("internal_error", 500, ...); // 정형 JSON 응답
}
```

**규칙** ⭐:

- **횡단 관심사 (cross-cutting concerns) 는 HOC 로 추출** — 인증 / 검증 / rate limit / CORS 등이 여러 라우트에서 중복되면 HOC 패턴 표준 채택. Generic 으로 라우트별 차이 (TBot context, limiter 함수, 에러 메시지) 를 옵션 주입.
- **HOC 가 throw 처리도 일원화** — handler 내부에서 try/catch 부담 제거. `loadBot` / `rateLimit` 같은 옵션 함수의 throw 도 HOC 가 catch 해서 정형 응답. 라우트마다 `try/catch` 작성 안 해도 됨.
- **handler 컨텍스트 = 통과 후 데이터** — `{bot, origin, clientIp, corsHeaders}` 처럼 검증 결과를 컨텍스트로 전달. handler 가 다시 origin 검증 / DB 재조회 안 함.
- **에러 메시지는 호출자 주입 (i18n 시드)** — HOC 가 메시지 하드코딩 안 함. 호출자가 `errorMessages` 옵션으로 주입 → 미래 locale 분기 자연스러움.
- **HOC 적용 후 기존 헤더 보존 검증 필수** — chat route 의 `x-conversation-id` + `Access-Control-Expose-Headers` 같은 라우트 특수 헤더는 handler 가 `corsHeaders` 와 함께 직접 반환. HOC 가 덮어쓰지 않음.
- **Throw 가 silent fail 로 이어지는 경로 차단** — 위젯 / API 클라이언트가 JSON 기대하는데 Next.js 기본 HTML 500 응답이 가면 파싱 실패 → silent. HOC 의 try/catch + 정형 JSON 응답 (예: `{error: "...", code: "internal_error"}`) 로 처리.
- **타입 정합성 = `errorMessages` 가 모든 코드 키 포함 필수** — `Record<AllowedOriginErrorCode, string>` 으로 컴파일 타임 강제. 새 에러 코드 추가 시 모든 호출자가 메시지 추가하지 않으면 타입 에러.

---

### 2026-04-24 service_role 키 사용 standalone 스크립트의 안전 패턴 표준화 (Task β-3b 설계 결정)

**증상**: Storage orphan cleanup 스크립트 (`scripts/cleanup-orphan-storage.ts`) 가 `service_role` 키로 RLS 우회 + 모든 봇의 Storage 파일 삭제 권한 보유. 잘못 설계하면:

- dev 환경의 `.env.local` 로 prod 키 의도치 않게 사용 → 실 데이터 손실
- 스크립트 단일 실행 실수 (--apply 오타) → 광범위 삭제 + 복구 불가
- legacy 데이터 (storagePaths 미기록 봇) 무차별 삭제 → 진짜 봇 자료 소실
- race condition (방금 업로드 + config UPDATE 직전) → 정상 데이터 삭제

대화 단위 Plan 에서 결정 포인트 7건 비교 + 권장안 + 추가 안전장치 제안을 통해 **표준 안전 패턴** 도출. 향후 retention cron / audit cleanup / 다른 standalone 스크립트의 템플릿이 됨.

**원인**:

1. **service_role 키의 본질** = "RLS 정책 = 운영자 신뢰 가정" 의 역설. 운영자가 곧 공격 표면. 단일 실행으로 광범위 영향 가능 → 실수 = 사고.
2. Next.js 앱 내 admin 호출은 인증된 사용자 세션 + 단일 trigger 라 영향 범위 제한적. standalone 스크립트는 이런 경계가 없음 → 직접 설계.
3. 실 데이터 손실 위험 vs 운영 편의성 균형 — 너무 안전 위주면 운영자가 우회 (e.g., SQL 직접 실행). 너무 편의 위주면 사고.
4. **운영 가이드 부재** = standalone 스크립트의 흔한 약점. 복잡한 안전 게이트가 있어도 운영자가 모르면 무용.

**해결**: 다음 6개 패턴을 표준으로 채택.

1. **dry-run 기본** — `--apply` 명시 없으면 분석만. CLI 실수 (스크립트 이름 직접 입력 / 옵션 누락) 시 안전.
2. **이중 게이트** — `--apply` flag + `CONFIRM_DELETE=yes` 환경변수 둘 다 필요. 한쪽만 있으면 `exit(2)` 즉시 abort. 자동화 환경에서도 의도 명확.
3. **보수적 분류 다수** — `bot_not_found` / `untracked_bot` / `recent_ttl` / `soft_deleted_within_retention` 등 "모르면 보존" 카테고리. 분류 오류 = 데이터 보존, 분류 정확 = 정확한 삭제.
4. **TTL race window** — 신규 업로드와 config UPDATE 사이 race 보호. 24h 가 storage 비용 미미 + race window 충분.
5. **Data flow 격리** — DB→Storage 단방향 (DB 에서 botId 가져온 후 그 폴더만 list/delete). CLI 인자가 path 에 직접 들어가지 않음 → injection 자동 방어. CLI 인자 → DB 쿼리 (parameterized) → DB 결과 → Storage operation.
6. **Per-batch 실패 격리** — 50개씩 batch 처리 + 1 batch 실패가 전체 중단 안 됨. failed 목록 별도 보고. audit trail 으로 부분 실패 추적.

**규칙** ⭐:

- **service_role 사용 standalone 스크립트는 위 6 패턴 모두 적용** — 표준 템플릿. 한 가지라도 빠지면 보안 결함.
- **CLI 인자가 직접 destructive operation path 에 들어가는 경로 금지** — 항상 DB 라운드트립 거쳐 정합성 검증 후 사용. CLI `--bot=<id>` → DB 검증 → DB 결과 botId 만 사용.
- **운영 가이드는 코드와 동시 작성** — `docs/scripts/<name>.md` 에 분류 정책 표 + 3 모드 실행법 + 권한·env + 안전 장치 표 + 운영자 주의사항 + Backlog. 코드 본 사람만 안전 게이트 의미를 알 수 있는 상태 = 위험.
- **이중 게이트 (`--apply` + `CONFIRM_DELETE=yes`) 우회 방법 차단** — pnpm script 가 이미 `--apply` 포함이면 env 게이트가 마지막 방어선. 둘 다 명시적으로 사용자 입력 필요.
- **bash history / log 보존 운영 원칙 명문화** — 스페이스 prefix + `tee log` audit trail 대용. Phase 3 까지 audit_logs 통합 못 하면 stdout 로그 파일이 유일한 추적 근거.
- **TTL/retention 같은 시간 경계는 항상 race 가능 → 운영 가이드에 SQL 검증 절차** — `now() - deleted_at between '29 days' and '31 days'` 같은 경계 봇 식별 SQL 제공.
- **legacy 데이터 (호환성 보존 항목) 는 영구 누적 → 마이그레이션 절차 문서화 + 정기 점검 필수** — 보수적 보존만으로는 부족, 정기적 sweep 절차 운영 가이드에 포함.

---

### 2026-04-24 `tsx --env-file=.env.local` standalone TypeScript 실행 패턴 (Node 20.6+ 위임, dotenv 명시 import 회피)

**증상**: Next.js 외부 standalone TypeScript 스크립트 (`scripts/cleanup-orphan-storage.ts`) 실행 시 환경변수 로드 필요. 옵션 4가지:

1. `dotenv` 패키지 명시 import (`import "dotenv/config"`) → `.env` 만 자동 로드, `.env.local` 은 별도 path 지정 필요
2. ESM hoisting 으로 인해 `dotenv.config()` 가 다른 import 보다 늦게 실행될 위험 → side-effect 두 단계 진입
3. `dotenv-cli` (`dotenv -e .env.local -- tsx ...`) → 추가 devDep 필요
4. Node 20.6+ 의 native `--env-file` flag → tsx 4.7+ 가 위임 지원

가장 깔끔하고 명료한 4번 채택. tsx 4.21.0 (Node v25.5.0) 환경에서 `tsx --env-file=.env.local --tsconfig=tsconfig.json scripts/...` 한 줄로 해결.

**원인**:

1. **ESM hoisting 위험** — `import { config } from "dotenv"; config({path:".env.local"})` 가 다른 `import` 보다 먼저 실행 보장 안 됨. side-effect 분리 (`scripts/_load-env.ts` import) 패턴은 가능하나 가독성 떨어짐.
2. **dotenv 명시 의존 시 path 관리 부담** — `.env`, `.env.local`, `.env.production` 등 우선순위 직접 처리. Node native `--env-file` 은 단일 path 명시.
3. **tsx 4.21 의 `--env-file` 위임** — Node 20.6+ flag 를 tsx 가 직접 패스. 별도 wrapper 불요.
4. tsconfig `paths` (`@/*` alias) 인식: tsx 4.x 는 `--tsconfig=tsconfig.json` 옵션 명시로 paths 자동 적용. 옵션 누락 시 일부 환경에서 alias 미인식 가능.

**해결**: `package.json` script 에 `tsx --env-file=.env.local --tsconfig=tsconfig.json scripts/<name>.ts` 통일.

```json
"scripts": {
  "cleanup:orphan-storage": "tsx --env-file=.env.local --tsconfig=tsconfig.json scripts/cleanup-orphan-storage.ts",
  "cleanup:orphan-storage:apply": "tsx --env-file=.env.local --tsconfig=tsconfig.json scripts/cleanup-orphan-storage.ts --apply"
}
```

**규칙** ⭐:

- **standalone TypeScript 스크립트 표준** = `tsx --env-file=.env.local --tsconfig=tsconfig.json` 두 옵션 항상 함께. dotenv 명시 import 금지 (ESM race / path 관리 부담).
- **tsx 는 transitive 가 아닌 명시 devDependency 로 등록** — `pnpm add -D tsx`. Phase 0 인프라 의존성에 포함. transitive 만으로는 다른 dep 변경 시 미설치 가능.
- **Node version 의존성 명시** — `--env-file` 은 Node 20.6+ 전용. `package.json` `engines: { node: ">=20.6" }` + `.nvmrc` 권장. CI runner / Vercel 환경 확인 + Backlog 등록.
- **tsconfig `paths` alias 사용 시 `--tsconfig` 옵션 필수** — `@/core/...` import 가 정상 resolve 되려면 tsx 가 tsconfig.json 위치 알아야 함. 옵션 누락 시 일부 환경에서 silent 실패.
- **각 script `package.json` 에 alias 등록** — `pnpm tsx <path>` 직접 입력은 옵션 누락 위험. `pnpm <alias>` 로 표준화.

---

### 2026-04-24 Phase 2 백로그 TODO ↔ 실 코드 drift — 타 Task 에서 자동 해소된 항목이 PROGRESS 에 TODO 로 잔존 (작업 패턴 / 프로세스 개선)

**증상**: Phase 2 백로그 청소 Task β-1 과 β-2 를 연속 진행하는데, 각 Task Plan 수립 단계에서 **TODO 항목이 이미 실 코드에 반영된 상태** 인 경우가 발견됨.

- **β-1 (우선 1)**: PROGRESS TODO = `formatRelative shared util 승격 — src/lib/date/relative.ts 신규 + bots/page.tsx · conversations/page.tsx 중복 제거`. 실제: **이미 `src/shared/time/relative.ts` 에 단일 출처 + 테스트 파일 존재**. 3페이지 모두 import 해서 사용 중. 어느 시점 (추정: Task B-5 barrel 도입 시점) 에 자연스레 반영됐는데 TODO 체크 업데이트 누락.
- **β-2 (우선 3 #3)**: PROGRESS TODO = `env.ts code M-1 "as ServerEnv" 타입 단언 개선 (ε-backlog)`. 실제: **`env.server.ts` 는 이미 `parseServerEnv()` + fail-fast throw 로 개선 완료**. `as ServerEnv` 캐스팅 없음. 주석 line 11 에 "`as ServerEnv` 런타임 캐스팅 대신 build-time 방어" 라고 **이미 개선된 상태를 설명** 하는 역사 주석. env.client.ts `({} as ClientEnv)` 는 의식적 설계 (line 62-65 주석).

2건 모두 **Plan 수립 전 Grep/Read 탐색** 으로 사전 발견 → 실 작업 범위 자동 축소.

**원인**:

1. **Task 간 부산물 누적** — Task 본체 외 부수 개선 (리팩터링, 주석 보강, 파일 재배치) 이 발생해도 PROGRESS 의 TODO 섹션 엔트리를 "이번에 이것도 같이 해소됐다" 고 체크하지 않음. β 시리즈 진입 시점에는 수개월 전 TODO 도 리스트에 그대로 남아있음.
2. **TODO 진입 프로세스 부재** — Plan 수립 시 "TODO 텍스트 → 바로 구현 범위" 로 점프하는 습관. 실 코드 상태 검증 단계가 생략되면 TODO 의 snapshot 성격 (작성 시점 기준) 이 간과됨.
3. **학습 트리거 도달** — 2회 반복. 1회는 우연이지만 2회 연속 같은 패턴 발견 = 구조적 이슈. 기록 규칙의 "에러 2회 반복" 트리거 충족.

**해결**:

1. β-1, β-2 모두 Plan 수립 전 `grep -rn <키워드>` + 해당 파일 Read 로 실 코드 상태를 먼저 검증 → 자동 해소 발견 시 "TODO 체크 + 자동 해소 근거 명시" 로 Task 범위에서 제외.
2. PROGRESS 우선 그룹별로 완결 표시 시 `[x] ~~<원 TODO 설명>~~ — 이미 반영 완료 확인 (탐색 중 자동 해소 발견, <근거 요약>)` 형태로 명시 → 미래 세션이 재확인 가능.

**규칙** ⭐:

- **백로그 Task 진입 시 Plan 수립 전 실 코드 상태 검증 필수** — `grep -rn <TODO 키워드>` 또는 해당 파일 Read 로 "TODO 가 여전히 유효한가" 를 먼저 확인. PROGRESS TODO 는 작성 시점 snapshot — 타 Task 에서 부수적으로 해소됐을 가능성을 항상 의식.
- **TODO drift 발견 시 즉시 PROGRESS 업데이트 포함** — 그 Task 완결 커밋에 "TODO X 자동 해소 확인" 체크를 포함. 미발견으로 방치하면 다음 Task 진입 시 또 중복 확인 비용 발생.
- **Task 완료 시 "의도하지 않게 같이 개선된 항목" 체크 습관** — 예: B-5 barrel 도입이 `formatRelative` 파일 위치 정돈을 포함했을 가능성. 대형 리팩터 완결 시 주변 TODO 섹션을 훑어 "덤으로 해소됐을 만한 항목" 을 체크하도록 세션 종료 프로토콜에 편입.
- **"자동 해소" 가 반복되면 원 TODO 의 granularity 재평가** — PROGRESS 의 우선순위 그룹이 너무 세분화되어 있으면 상호 종속성으로 인한 자동 해소가 잦아진다. 백로그 30+건 이상 누적 시 주기적 sweep 으로 granularity 재조정 (현재 백로그 15건 내외, 당장 불필요).
- **AI 방향 이탈 방지 교훈** — 내가 Plan 제시 시 "PROGRESS TODO 를 그대로 복사" 하면 자동 해소 항목을 놓침. **"TODO 텍스트" ≠ "실 작업 범위"** — 두 번 확인 습관을 Plan 수립 템플릿에 고정.

---

### 2026-04-21 Supabase prod URL Configuration 누락 → OAuth redirect localhost:3000 fallback (운영 지식 / Phase 0-D 완결 기준 보강)

**증상**: Task A-5a Step 2 (Jayden UI 봇 생성) 진입 직전, Jayden 이 prod (`https://dari-theta.vercel.app/login`) 에서 "Google 로 계속하기" 클릭 → `http://localhost:3000/?code=bfdc1629-...` 로 redirect. 포트 3000 ≠ Dari 4000, path `/` ≠ `/auth/callback` — **2중 불일치**. 로그인 불능 = Task A-5a Step 2 완전 블로킹.

**원인**:

1. Supabase 프로젝트 (`dari`, pxdopzlaffjcxqfrqidq) 의 `Authentication → URL Configuration` 에서 `Site URL` 이 Supabase 기본값 `http://localhost:3000` 그대로 방치.
2. `Redirect URLs` 화이트리스트에 Dari 의 `redirectTo` (`https://dari-theta.vercel.app/auth/callback`, `http://localhost:4000/auth/callback`) 미등록.
3. Supabase OAuth 동작: 앱이 `signInWithOAuth({ redirectTo })` 전달 → **Redirect URLs 화이트리스트 매칭 확인** → 매칭 시 그 URL 로 redirect / 매칭 실패 시 **Site URL 로 fallback**. 현재 케이스는 매칭 실패 → Site URL(`localhost:3000`) fallback.
4. **Phase 0-D Auth 완결 판정 시점의 갭**: 로컬 Playwright E2E 9/9 통과 = 로컬 Supabase 인스턴스 또는 Mock 기반. **prod Supabase 의 URL Configuration 실 검증이 포함 안 됐음**. PROGRESS.md "Phase 0-D 완료" 기록은 기술 완료를 증명하지만 **prod end-to-end 로그인 가능성** 은 보장 안 함.
5. Jayden 의 다른 프로젝트(chatsio=3000, teamzero=3100) 와 Next.js 기본 포트 3000 이 겹침 — Supabase 기본값(localhost:3000) 이 Dari(4000) 에는 절대 안 맞음.

**해결**:

1. Supabase Dashboard → `dari` → Authentication → URL Configuration 접속 (Jayden 수동).
2. Site URL = `https://dari-theta.vercel.app` (prod 우선).
3. Redirect URLs 에 2줄 추가: `https://dari-theta.vercel.app/auth/callback`, `http://localhost:4000/auth/callback`.
4. Save → Jayden 재접속 → "Google 로 계속하기" → `/auth/callback?code=...` 정상 redirect → 세션 획득.
5. 이후 Task A-5a 진입 가능.

**규칙** ⭐:

- **prod Supabase 프로젝트 생성 직후 Authentication URL Configuration 설정은 필수 체크리스트 항목**. `phase-1-release-checklist.md` §1 (Vercel 환경 구성) 에 추가: (a) Site URL 설정 (b) Redirect URLs 화이트리스트 (c) prod 실 Google OAuth 로그인 성공 확인.
- **Phase 0-D Auth 완결 판정 기준 보강** — 로컬 Playwright E2E 통과 + **prod 실 Google OAuth end-to-end 로그인 성공** 이 완결의 별도 축. 전자는 코드 정합성, 후자는 외부 설정(Supabase Dashboard) 정합성. Phase 완결은 두 축 모두 녹색.
- **Supabase 기본 Site URL = `localhost:3000`** — Next.js 기본 포트 3000 가정. 다른 포트 사용 프로젝트 (Dari=4000) 는 **반드시 명시 수정**. 포트 기억 만으로 부족, Redirect URLs 화이트리스트까지 함께 등록.
- **OAuth redirect 엉뚱한 URL 로 가는 증상 = 진단 순서 고정**: (1) Supabase Dashboard URL Configuration 확인 (가장 흔함) → (2) 앱 `redirectTo` 코드 확인 → (3) Google Cloud Console OAuth 클라이언트 승인 URI 확인. Dashboard 가 첫 의심 지점.
- **외부 서비스 설정 변경은 코드 검증 불가** — Supabase URL Configuration 은 코드/테스트로 검증 못 함. 운영 체크리스트 + 수동 확인 + prod 실증이 유일한 검증 경로.

---

### 2026-04-21 Phase 전환 계획서 브랜드 가정 ≠ Jayden 실 의도 — Config 작성 전 "실 자산" 감사 필수 (방향 이탈 교정)

**증상**: Task A-5 = "Dairect 5개 embed" 를 시작할 때 PROGRESS.md / phase-2-plan.md 가 가상 Dairect 브랜드 목록(Chatsio / OnboardKit / SellKit / InterviewGenie / PayLoom) 을 가정. 이를 기반으로 `docs/dairect-bot-configs.md` (가상 5개 브랜드별 systemPrompt / color / mode) 를 400줄 작성. Jayden 이 UI 에서 실제로 생성한 5개는 **본인 실제 포트폴리오**(chatsio / findably / dairect / interviewgenie / dari) — 계획서 가정의 3개(OnboardKit / SellKit / PayLoom) 은 Jayden 이 보유/개발하지 않는 **가상 제품** 이었고, 누락된 2개(Findably / Dari self-reference) 는 실제 자산.

**원인**:

1. 이전 세션의 phase-2-plan §5 Task A-5 서술("Chatsio / OnboardKit / SellKit / InterviewGenie / PayLoom") 이 PRD Task 1-6 "Dairect 5개 배포" 를 기계적 해석하여 **가상 브랜드 목록** 으로 확정. PRD 원문은 Jayden 포트폴리오 허브 컨셉이었을 가능성이 높음.
2. Task A-5a 진입 시 내가 Config 문서를 **Jayden 실 자산 확인 없이** 가정 기반으로 400줄 작성. "외부 서비스 선결 조건 사전 체크" 메모리 규칙이 SDK/API 뿐 아니라 **봇 컨텐츠 계획** 에도 적용돼야 했음.
3. Jayden 이 UI 생성 후 "아무거나 5개 만들었어" 라는 말은 실제로는 "**내 실제 포트폴리오 5개**" 라는 의미. 내 가정이 틀렸음을 Jayden 본인도 auto mode 맥락에서 즉시 인지하지 못함.
4. **PROGRESS.md / phase-2-plan §5 가 계획 권위를 가짐** — Phase 전환 계획서가 틀린 가정을 담으면 후속 Task 가 전부 그 가정 위에서 진행.

**해결**:

1. Jayden UI 생성 결과 확인 즉시 Config 문서 **전면 재작성** (실 5개 포트폴리오 기반 ~380줄). 가상 브랜드 삭제, 누락된 2개(findably / dari self-reference) 추가.
2. phase-2-plan §5 Task A-5 → **A-5a (완료 / 포트폴리오 레코드) + A-5b (이월 / 사이트 embed)** 분할.
3. Task A-5a "완료 기준" 을 "사이트 embed 완료" 에서 "DB 5행 확보 + Vercel env 등록" 으로 재정의 (사이트 개발 완료 전까지 진입 불가능한 부분 이월).

**규칙** ⭐:

- **Phase 전환 계획서의 브랜드 이름/외부 자산 목록이 등장하면 Jayden 실 보유·개발 상태 감사 먼저** — "Chatsio / OnboardKit / ..." 같은 구체 목록은 계획서 작성자의 추정일 수 있음. Jayden 확인 전까지 Task 세부 구현 금지.
- **"외부 서비스 선결 조건 사전 체크" 규칙을 봇 컨텐츠/포트폴리오 계획까지 확장** — SDK/API 만이 외부 자산이 아니라, 봇이 운영될 **사이트 5개** 도 외부 자산. 이름·도메인·개발 상태·embed 권한을 Task 진입 전 체크리스트로 확인.
- **계획서 가정 ≠ 현실 확인되면 즉시 재작성** — 진행 중 발견 시 "이 Task 는 보류" 가 아닌 "계획서 수정 + 현실 기반 재계획". 잘못된 가정 유지한 채 진행하면 후속 Task 수정 공수 폭증.
- **Jayden "아무거나 만들었어" 는 literally 해석 금지** — Jayden 은 바이브코딩 방식이라 엄밀한 용어를 쓰지 않음. 실제 생성물 확인 후 의도 역추정. "아무거나 = 내가 바로 생각난 5개 = 내 실 포트폴리오" 일 가능성 높음.
- **PROGRESS.md 기록 신뢰도 가중치** — PROGRESS.md 의 완료 기록은 "그 당시 작성자 인식" 이므로 Phase 전환 시 핵심 가정(특히 외부 자산 목록) 은 Jayden 재확인 거쳐야 함.

---

### 2026-04-21 AI SDK `onFinish` 서버리스 Promise leak → Next 16 `after()` 로 인프라 레벨 보장 (설계 결정)

**증상**: Task A-4 (Vercel AI SDK Data Stream Protocol 전환) 에서 `streamText({ ..., onFinish: async ({ text }) => { await admin.from("messages").insert(...) } })` 패턴을 먼저 구현. 로컬에서는 스트림 완료 후 assistant 메시지 저장 정상. 독립 리뷰 (code H-1 / sec M-2) 가 핵심 이슈 지적: **Vercel 서버리스는 응답 헤더 flush 시점에 함수를 종료할 권한이 있어서 `onFinish` 가 호출 전에 lifecycle 이 잘릴 수 있음**. 결과는 **간헐적 assistant 메시지 누락** — 로컬 재현 불가, prod 운영 중 무작위 대화 기록 불일치로 나타남.

**원인**:

1. Vercel 문서: `waitUntil()` 또는 equivalent 없이 응답 반환 후 실행되는 Promise 는 **실행 보장 없음**. AI SDK `onFinish` 는 stream consumer 종료 후 호출되므로 응답 반환 시점 이후 lifecycle.
2. Node runtime (`runtime=nodejs`) 는 Edge 보다 관대하나, 서버리스 플랫폼이 flush 후 마이크로태스크를 강제 종료할 권한을 가짐.
3. `streamText().toUIMessageStreamResponse()` 는 Response 객체를 **즉시** 반환 — 이때 함수가 "완료" 된 것처럼 보이는 race window.
4. 로컬 dev (`next dev`) 는 프로세스가 계속 살아있어서 이 race 를 재현 못 함 → 검증 갭.

**해결**: `onFinish` 제거 + Next 16 의 `after()` API 사용.

```ts
import { after } from "next/server";

const result = streamText({ ... }); // onFinish 없음

after(async () => {
  try {
    const finalText = await result.text;          // stream 완료 후 resolve, 에러 시 reject
    const adminForAfter = createAdminClient();    // 응답 flush 이후 새 인스턴스 (기존 admin HTTP 연결 정리 race 방어)
    const { error } = await adminForAfter.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: finalText,
    });
    if (error) logger.error({ err: sanitizeLoggableError(error) }, "insert 실패 (after)");
  } catch (err) {
    logger.error({ err: sanitizeLoggableError(err), botId }, "after() 중 예외");
  }
});

return result.toUIMessageStreamResponse({ headers, onError });
```

`after()` 는 Vercel 인프라 레벨에서 응답 flush **이후** 실행을 보장. Node/Edge 양쪽 지원. Next 16.2 에서 `unstable_` prefix 제거된 안정 API.

**규칙** ⭐:

- **서버리스 응답 이후 실행되는 Promise 는 절대 `onFinish` / `.then()` / fire-and-forget 에 의존 금지**. Next 15+ 에서는 `after()` 를, 구 Next 에서는 `waitUntil` (Vercel) 또는 플랫폼 equivalent.
- **`streamText().text` / `.finishReason` / `.usage` 같은 Promise 는 `after()` 안에서 await** — stream 소비가 끝나야 resolve. 에러 시 reject 되므로 반드시 try/catch.
- **`after()` 내부의 DB 클라이언트는 새 인스턴스** — 응답 flush 후 기존 클라이언트의 HTTP keep-alive/연결이 정리됐을 수 있어 reuse 시 500 가능성. cold-start 하나 더 vs 간헐적 실패, 전자가 압도적 이득.
- **로컬 dev 에서 재현 불가능한 lifecycle 이슈 존재 인지** — 리뷰어가 지적하지 않으면 prod 에서만 터짐. AI SDK / 서버리스 관련 설계 결정은 **Vercel 공식 문서 lifecycle 섹션 재확인 필수**.
- **Stream abort 시나리오는 별개 고려** — 클라가 중간에 abort 하면 AI SDK 는 서버 측 파이프를 (플랫폼에 따라) 유지하거나 끊음. `result.text` 가 partial 로 resolve 할 수도, reject 할 수도 있음. try/catch + partial 저장 정책 명시.

---

### 2026-04-21 브라우저 SSE 파서는 buffer/full 상한 필수 — 악성 프록시 MITM 방어 (설계 결정)

**증상**: Task A-4 위젯 `stream-parser.ts` (UIMessageStream SSE pure fn) 초기 구현에선 `buffer += decoder.decode(...)` / `full += delta` 무상한 누적. 보안 리뷰 (sec M-1) 가 CWE-400 (Resource Exhaustion) 지적:

1. **buffer 무상한**: 악성 프록시가 MITM 환경에서 응답 스트림에 `\n` 없는 256 KB chunk 를 반복 주입 → `buffer` 가 수십 MB 로 성장 → 브라우저 탭 크래시.
2. **full 무상한**: 서버 `CHAT_MAX_OUTPUT_TOKENS=2048` 은 **정상 경로** 전제. 악성 서버가 수만 delta 를 보내면 전체 텍스트가 수십 MB 문자열로 누적.

이 두 경로 모두 **서버 측 상한** (token clamp) 이 도와주지 않음. "프록시/중간자/악성 서버" 위협 모델에서 클라가 자기 방어해야 함.

**원인**: 브라우저 SSE 소비자 대부분이 "서버 trust 가정" 으로 작성됨. 네트워크 계층 (TLS) 은 기밀성/무결성 만 담당하지 reader-side DoS 는 별개. 파서가 텍스트를 누적하는 모든 지점에서 상한이 필요.

**해결**: 3 포인트 상한.

```ts
const MAX_BUFFER_BYTES = 64 * 1024; // 한 SSE 이벤트 라인 상한 (정상 이벤트는 < 1KB)
const MAX_FULL_CHARS = 32 * 1024; // 전체 응답 상한 (서버 CHAT_MAX_OUTPUT_TOKENS ≈ 8K chars × 4 여유)
const MAX_ERROR_TEXT_CHARS = 64; // error 이벤트 errorText 상한 (화이트리스트 최장 코드 < 32자)

// 누적 직후 검사
buffer += decoder.decode(value, { stream: true });
if (buffer.length > MAX_BUFFER_BYTES) throw new StreamError("parse_error");

// ... line 파싱 ...
full += delta;
if (full.length > MAX_FULL_CHARS) throw new StreamError("upstream_error");

// error 이벤트
const errorText = raw.slice(0, MAX_ERROR_TEXT_CHARS); // 화이트리스트 정규화 전 slice
```

상한 값은 **서버 상한 × 4 여유** 원칙. 정상 경로는 영향 없고 악성 경로만 차단.

**규칙** ⭐:

- **브라우저에서 스트리밍 소비 시 누적 변수는 상한 필수** — `buffer` / `full text` / `error payload` / 기타 append 지점 전수 점검.
- **상한 값 = 서버 상한 × (3~5 여유)**. 너무 타이트하면 정상 큰 응답이 차단되고, 너무 헐거우면 방어 효과 낮음. 서버에 clamp 있다면 그 값 기반으로 derive.
- **상한 초과는 화이트리스트 에러 코드로 normalize** — raw exception 노출 금지. 사용자에게는 `upstream_error` / `parse_error` 같은 일반 메시지.
- **TLS 있어도 MITM 위협 유효** — 인증서 검증 우회 (사내 프록시, 로컬 디버거, 악성 확장) / 사내 CA rogue 발급 / 클라이언트 호스트 자체 손상 등. "TLS 끝점 외 trust 없음" 가정.
- **파서 unit 테스트에 악성 페이로드 케이스 필수** — 64KB 단일 라인 / 거대 full text / 거대 errorText 각각 별도 테스트. 정상 케이스만 검증은 방어선 무력.
- **서버 상한 + 클라 상한 = 방어선 2중** — 서버 측 `maxOutputTokens` clamp 가 정상 경로를 지키고, 클라 측 상한이 비정상 경로 (MITM / 악성 서버) 를 지킴. 둘 중 하나 빠지면 방어선 깨짐.

---

### 2026-04-21 @sentry/core transitive 의존성 직접 import — 로컬 pnpm hoist 로 은폐된 Vercel strict 빌드 실패 = DEPLOYMENT_NOT_FOUND 실제 원인 (운영 지식 / 설계 결정)

**증상**: Vercel 배포 접속 시 `DEPLOYMENT_NOT_FOUND` 응답. 프로젝트 존재 여부 / Dashboard 레벨 이슈 등 여러 가설을 세웠으나, Jayden 이 **실제 Vercel 빌드 로그 전문** 을 제공한 뒤에야 진짜 원인 확인:

```
./src/core/observability/beforeSend.ts:1:56
Type error: Cannot find module '@sentry/core' or its corresponding type declarations.
> 1 | import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/core";
Next.js build worker exited with code: 1
```

Phase 0-E-3 (Sentry 도입) 부터 잠복. **로컬 pnpm typecheck + pnpm build + vitest 모두 clean** 이라 PROGRESS.md 에 "빌드 14 routes 녹색" 반복 기록. 독립 리뷰 2 에이전트(code + security) 도 "코드/설정 단서 없음" 결론 — 리뷰어가 정확했다(코드 버그가 아님). 이 이슈는 **인프라 계층**(의존성 선언 + 환경 해석 차이) 문제.

**원인**:

1. `beforeSend.ts` + `beforeSend.test.ts` 가 `@sentry/core` 를 직접 type import. 그러나 `package.json` 에는 `@sentry/nextjs` 만 선언, `@sentry/core` 는 직접 의존성 아님 (`pnpm ls @sentry/core` 결과 없음).
2. `@sentry/core` 는 `@sentry/nextjs` 의 **transitive 의존성** — `pnpm-lock.yaml` 에 10.49.0 으로 pinned 되어 물리적으로 `node_modules` 어딘가 존재.
3. **로컬 pnpm 해석**: TypeScript module resolution 이 hoist 된 `node_modules/.pnpm/@sentry+core@10.49.0/.../build/types/index.d.ts` 를 우연히 찾아냄 → typecheck 통과 → "local OK" 착각.
4. **Vercel pnpm strict / 일부 isolation**: 선언되지 않은 transitive 는 resolution 실패. `Next.js build worker` 의 TypeScript 단계에서 TS2307 → `Command "pnpm run build" exited with 1` → **빌드 실패 → 배포 URL 미생성 → 접속 시 DEPLOYMENT_NOT_FOUND**.
5. `DEPLOYMENT_NOT_FOUND` 는 Vercel **플랫폼 레벨 응답** (=이 경로에 연결된 배포가 존재 안 함). 빌드 실패 에러 문자열과 달라서 "프로젝트 미생성" 가설을 먼저 세우기 쉬움 → 가설 드리프트.

**해결**:

1. `beforeSend.ts` + `beforeSend.test.ts` import 경로 `@sentry/core` → `@sentry/nextjs` 로 변경 — 공식 re-export 경로, `package.json` 에 이미 있는 의존성. 2 파일 2 라인 수정.
2. 로컬 재현: `pnpm typecheck` (0 errors) + `pnpm vitest run beforeSend.test.ts` (13/13) + `pnpm build` (14 routes clean).
3. 커밋 + push → Vercel 자동 재배포 트리거.

**규칙** ⭐:

- **TypeScript import 는 반드시 `package.json` 직접 의존성만** — transitive (`pnpm-lock.yaml` 만 존재, `dependencies`/`devDependencies` 부재) 를 import 하면 로컬에선 우연히 해석돼도 strict 환경(Vercel / CI / Docker) 에서 실패. ESLint `import/no-extraneous-dependencies` 룰로 사전 차단 추천. 최소한 ADR 또는 코드 컨벤션에 "외부 타입은 `@sentry/nextjs`/`@supabase/supabase-js` 같은 **최상위 wrapper** 에서만 import" 명시.
- **로컬 `pnpm build` 성공 ≠ Vercel 배포 성공** — pnpm 의 `node_modules` hoist 동작이 로컬/원격 환경에서 미묘하게 다를 수 있음. 특히 macOS 와 Linux, pnpm 버전, `.npmrc` 설정 차이. **CI 에 `pnpm install --frozen-lockfile && pnpm build` 돌려 매 PR 재현성 확보** (현재 CI 는 `npm ci` 라 이 경로 검증 안 됨 → CI 현대화 Backlog 승격).
- **`DEPLOYMENT_NOT_FOUND` 는 "배포 자체 부재" 신호** — 프로젝트 존재 + 도메인 연결 + 최근 빌드 **실패** 조합에서 나타나는 대표 패턴. Vercel Dashboard Deployments 탭의 **실제 빌드 로그** 가 유일한 정확 진단. "프로젝트 미생성" 으로 좁혀선 안 됨. `phase-1-release-checklist.md` 의 Stage 1 체크리스트에 "첫 Vercel 빌드 녹색 확인" 을 §4-6 smoke test 전 선결 조건으로 추가 필요.
- **외부 빌드 서비스 진단 순서** = (1) 빌드 로그 **전문 확보 — 마지막 라인만 아님** → (2) 실패 스택 트레이스 라인 파악 → (3) 로컬에서 동일 실패 재현 시도 → (4) 재현 안 되면 "환경 drift" 의심 → (5) 수정. 로그 없이 유추는 시간 소모, **로그 요청이 최우선**. 이번 세션에서도 Jayden 이 로그 붙여준 이후 2분 내에 정확한 원인 규명.
- **독립 리뷰의 한계 인지** — code-reviewer + security-reviewer 는 "정적 코드/패턴" 을 본다. **의존성 선언 매칭 + 로컬/원격 환경 차이** 같은 인프라 계층 이슈는 리뷰로 못 잡음. 리뷰 Ship 결정이 "문제 없음" 이라고 해서 배포 성공을 보장하지 않는다. **Deployment Verification** (실 배포 상태 확인) 을 별도 검증 축으로 추가 — 이번 세션은 리뷰 직후 실배포 재시도가 원인 규명 트리거였음.
- **Phase 전환 시 Vercel 실배포 성공 확인 = MUST** — `phase-1-release-checklist.md` §6 "Stage 1 Go/No-Go 기준" 이 로컬 검증 + Supabase migration 에 치중. "Vercel prod 첫 배포 녹색 확인" 이 빠져 있어 Phase 1 완결 판정 = "실제 배포 가능" 을 담보 못 함. 체크리스트 갱신 이월.

---

### 2026-04-21 proxy matcher 확장자 제외는 "향후 동적 JS 라우트 추가 위험" 을 동반 — 주석 경고만으로 부족, learnings + 체크리스트 양쪽 명문화 필요 (설계 결정)

**증상**: Task A-3 에서 `src/proxy.ts` matcher 에 `js|css|map|woff|woff2|ttf|eot` 공개 확장자 추가(cross-origin widget.js 로드 버그 수정) 후, 독립 리뷰 **2 에이전트 동일 지적** (code LOW-1 + security LOW-1): "향후 `/config.js` 같은 **동적 JS API 라우트** 추가 시 matcher 가 정적 파일로 오인해 인증 우회 발생 가능". 즉각 위험은 없으나 회귀 위험 명시.

**원인**: Next.js `middleware`/`proxy` matcher 가 **부정 lookahead** 로 "제외 목록" 을 구성하는 구조 — 제외 조건에 포함되는 경로가 모두 공개로 빠짐. 현재 Dari 에선 `.js` 확장자 파일 = `public/widget.js` 단 1개라 안전하나, `/api/config.js`·`/theme/[botId].css`·`/embed/[...slug].js` 같은 **동적 확장자 라우트** 추가 시 자동 인증 밖. 주석 `⚠️ public/ 전용 가정` 이 있으나 enforce 불가능한 휴먼 기억 의존.

**해결**:

1. `src/proxy.ts:84-88` 주석 경고 유지 (Task A-3 추가분).
2. **본 엔트리** 에 명문화 → `/start` 스킬이 세션 시작 시 자동 로드해 관련 결정 시 상기.
3. 미이행(의식적): matcher "부정 제외" → "긍정 허용" 반전은 대규모 리팩토링이라 ROI 낮음 / ESLint 커스텀 룰은 작성 비용 > 발생 빈도.

**규칙** ⭐:

- **matcher 확장자 제외 = "미래 동적 라우트 추가 시 matcher 예외 선언" 의무와 세트** — `.js`/`.css`/`.map`/폰트 공개 제외할 때마다 "이 확장자로 끝나는 **동적 라우트** 를 추가하려면 matcher 부정 lookahead 에 긍정 예외 먼저 추가해야 한다" 는 의무가 따라옴. 코드에서 enforce 불가라 문서 layer 로 고정.
- **"동적 확장자 라우트" 트리거 조건** — `src/app/**/` 하위에 `[slug].js`, `[...path].css`, `config.js/route.ts` 같이 **확장자로 끝나는 동적 세그먼트** 또는 명시 파일 추가 시. 이 때 `src/proxy.ts` matcher 부정 lookahead 에 해당 경로 **긍정 예외** (`(?!api/config\\.js$)` 형태) 먼저 추가.
- **보호/공개 판단을 "파일 확장자" 로 하면 휴먼 의존, "경로 prefix" 로 하면 enforce 가능** — 가능하면 `.js` 같은 확장자 대신 `_next/static/`, `/fonts/`, `/widget.js` 처럼 **구체적 경로 패턴** 으로 공개 목록 구성. 확장자 패턴은 `public/` 정적 자산 한정이며, 동적 라우트 등장 순간 전환 재검토.
- **독립 리뷰 2 에이전트 동일 지적 = 실제 위험 신호** — code + security 둘 다 LOW 등급으로 언급 = "현 상태 안전하나 미래 회귀 가능성". 이런 "쌍 지적" 이면 코드 주석에만 의존하지 말고 learnings + 체크리스트까지 가야 함. 주석은 읽지 않으면 없는 것, learnings 는 세션 시작 시 강제 로드.

---

### 2026-04-21 Next.js proxy/middleware matcher 에 정적 자산 확장자 제외 누락 — widget.js 가 /login 리다이렉트 당하는 cross-origin embed 차단 (운영 지식)

**증상**: Task A-3 Playwright widget-embed smoke 4/4 실패. 모두 `#dari-widget-host` 15초 타임아웃. curl 진단 결과 `http://localhost:4000/widget.js` → **`307 /login?next=%2Fwidget.js`** 리다이렉트. 즉 proxy(auth) 가 widget.js 를 보호 라우트로 판정하고 비로그인 방문자를 로그인 페이지로 튕김. 외부 사이트가 embed 스크립트를 로드하려 하면 로그인 HTML 을 받게 되어 IIFE 실행 실패 → cross-origin 위젯 전체 무력화.

**원인**:

1. `src/proxy.ts:74` matcher 부정 lookahead 에 **이미지 확장자만** (`png|jpg|jpeg|gif|svg|webp|ico`) 제외. `.js`/`.css`/`.map`/폰트 누락.
2. Task 1-6-b (widget scaffolding) 시점에 `public/widget.js` 가 이 매처에 걸리지 않도록 확장자 제외를 추가 안 함. widget.js 는 Next dev/prod 가 `public/` 정적 자산으로 서빙하지만 proxy 가 **먼저** 가로채 redirect 응답.
3. 기존 E2E 는 **same-origin** (localhost:4000) 에서만 실행 → 로그인 된 세션으로 `/widget.js` 요청해도 redirect 없음 → 문제 은폐. **cross-origin embed 시나리오 (익명 방문자)** 를 실측한 적이 없어 Phase 1 내내 잠복.
4. Vercel 배포가 `DEPLOYMENT_NOT_FOUND` 로 접근 불가 상태라 외부 실증 루트도 막혀 있었음.

**해결**:

1. matcher 부정 lookahead 확장 — `js|css|map|woff|woff2|ttf|eot` 추가 + 주석에 "Phase 1 잔존 버그" 이력 기록.
2. `curl -sI localhost:4000/widget.js` → `HTTP/1.1 200 + Content-Type: application/javascript` 확인.
3. Playwright widget-embed 5 projects × 4 tests 20/20 통과.
4. 기존 E2E 회귀 zero (smoke + bot-create 3 + bot-detail 4 = 8/8 통과) → matcher 확장이 보호 라우트 동작에 영향 없음.

**규칙** ⭐:

- **proxy/middleware matcher 정적 자산 제외는 "모든 공개 확장자" 포괄 형태로 처음부터 구성** — 새 자산 추가 시마다 회귀 재발 방지. 기본 템플릿: `png|jpg|jpeg|gif|svg|webp|ico|js|css|map|woff|woff2|ttf|eot|mp4|webm|pdf`. `/_next/static/*` 외에 `public/` 하위가 모두 URL 매핑된다는 점 기억.
- **cross-origin embed 자산(widget/SDK/plugin)은 same-origin E2E 로는 검증 안 됨** — 로그인 세션이 있는 E2E 는 redirect 경로를 타지 않아 문제 은폐. **별도 origin 에서 서빙하는 mock host + Playwright** 로 회귀 테스트 필수. 이번 세션의 `tests/e2e/widget-embed/` 패턴을 SDK 성격 코드 투입 시 항상 따르기.
- **"정적 자산 로드 실패" 진단 1순위**: `curl -sI` 로 HTTP 상태/헤더 확인. **307/302 redirect** 면 거의 proxy/middleware matcher 문제. 404 면 파일 부재 또는 라우팅 문제. **증상 관찰 전에 HTTP 상태만 보면 80% 정확한 원인 추정**. 브라우저 DevTools Network 탭도 동일 판독.
- **"보호 기본 + 공개 예외" 매처는 공개 예외를 포괄적으로** — Dari 는 "비로그인 → /login" 정책 + 공개 경로는 `isPublicPath` + matcher 예외. matcher 가 **request level** 에서 거르는 최후의 방어선이라 여기서 누락되면 앱 전체 경로에 영향. positive-match 가 아니라 negative-lookahead 를 쓰기 때문에 "공개할 것" 을 명시적으로 확장자 기준 추가해야 함.

---

### 2026-04-21 ADR 확정 전 외부 리소스(도메인/계정/청구 권한) 소유 체크 + 기존 코드 주석 전수 Grep 필수 — 3중 URL 드리프트 고착 사례 (설계 결정 / AI 이탈)

**증상**: Task A-1 에서 ADR-009 결정 #1 "CDN 호스트 `dari.kr`" 를 확정 + 272줄 ADR 작성 + 커밋까지 완료 (세션 종료). 같은 세션 직후 Task A-2 진입 시 Jayden 이 "`dari.kr` 미보유 + 현재 `dari-theta.vercel.app` 사용" 알림 → 결정 #1 전면 재작성 필요. 코드 전수 Grep 결과 **호스트 3개가 서로 다른 위치에 공존** 확인:

- `src/app/bots/[slug]/page.tsx:35` `WIDGET_URL = "https://dari.kr/widget.js"` (Task 1-5-c 투입 — 사전 결정 없이)
- `src/widget/config.ts:5` JSDoc 스니펫 예시 `https://dairect.kr/widget.js` (Task 1-6-b 투입)
- `docs/environments.md:17` prod 도메인 `dairect.kr`
- ADR-009 (2026-04-21) `dari.kr`
- 실제 배포 = `dari-theta.vercel.app`

**원인**:

1. Task A-1 ADR 작성 직전 "외부 리소스 선결 조건 체크" 루틴 미실행. 메모리 `feedback_external_service_precheck.md` 가 "SDK/Integration" 에 한정된 해석으로 **도메인/호스트 소유권** 확인이 scope 밖으로 잘못 분류.
2. Task A-1 현황 감사(Read 9파일 병렬)가 `src/widget/` 코드 중심. **`docs/environments.md` + `src/widget/config.ts` JSDoc 의 URL 예시** 는 감사 대상에서 빠짐. 문서 계층 drift 감사 범위 누락.
3. PROGRESS.md 기록의 "§7-1 권장안 `dari.kr`" 이 세션 내 권위로 작용 — 다른 파일이 이미 `dairect.kr` 를 쓰고 있는 사실을 사전 Grep 없이 판단.
4. 권장안 도출 시 "도메인 $15/yr" 비용 계산이 Jayden 의 **실제 의사 결정 자원/의지** 와 무관할 수 있음을 간과. "구입 가능" 과 "구입 결심" 은 별개.

**해결**:

1. Task A-2 **γ 경로** 도입: `NEXT_PUBLIC_WIDGET_CDN_URL` 환경변수화 + Zod default `dari-theta.vercel.app`. 향후 도메인 확보 시 env 교체만으로 스위치. 문서·코드·테스트 모두 env 만 참조.
2. ADR-009 제목 / Context / §9-1 / 다이어그램 / Deploy / Open Q #6 재작성.
3. `phase-2-plan.md` §2 / §5 / §7-1 / §7-7 현실화 (α/β/γ 3경로 비교로 교체).
4. `src/app/bots/[slug]/page.tsx` + `tests/e2e/bot-detail.spec.ts` + `src/widget/config.ts` JSDoc 일관화 (`env.NEXT_PUBLIC_WIDGET_CDN_URL` 참조 또는 주석 표기).
5. `docs/environments.md` prod 도메인 + §5-1 체크리스트 업데이트 — 도메인 연결은 10곳 테스트 후로 미룸.

**규칙** ⭐:

- **ADR 작성 전 자문: "이 결정이 외부 리소스(도메인/계정/권한/API 키/스토어/SDK/청구) 소유를 전제하는가?"** — Yes 면 **Jayden 에게 보유·계획·미보유 3-state 체크리스트 선제시**. 결정 묶은 후 확인하는 역순 금지.
- **"외부 서비스 선결 조건" scope 확장** — 기존 메모리(SDK/Integration) 에 **도메인·호스팅 URL·계정 소유권·청구 계정** 포함. 계약·브랜딩 요소도 "외부 리소스" 로 간주.
- **현황 감사 범위에 문서 계층 전체 포함** — `src/` 외에 `docs/{환경·아키텍처·runbook}.md` + 코드 **JSDoc/주석** + `.env` 템플릿. 이전 세션 요약(PROGRESS.md)만 신뢰하면 drift 누락.
- **URL/호스트/ID/식별자는 Grep 전수 확인 후 ADR 진입** — 후보 키워드(`dari.kr` + `dairect.kr` + `vercel.app`) Grep 병렬 3회 = 5분 투자. ADR 재작성(~1시간) 보다 ROI 12배.
- **권장안 비용 추정은 "Jayden 의 실제 의사 자원" 과 무관할 수 있음** — "$15/yr 저렴" 은 코드 관점 판단. "이 도메인 살 의향 있나?" 를 선제 질문. AI 가 "합리적" 이라고 본 것이 **Jayden 자원 배분** 과 충돌 가능.
- **드리프트 고착 방지 = 환경변수 추상화** — URL/호스트/ID 처럼 변경 가능성 있는 값은 **default 있는 env** 로 추상화. 단일 진실 포인트(env.ts) 를 통해 문서·코드·테스트 모두 같은 값 참조.
- **"AI 방향 이탈" 재발 방지** — 외부 리소스 전제 결정은 Plan 의 **첫 단계에 선결 체크**. Auto mode 여도 이 단계는 반드시 Jayden 확인 대기.

---

### 2026-04-21 Phase 전환 계획서의 "이미 구현된 것 vs 미구현" 구분은 코드 전수 감사로만 확정된다 — 문서 메모만 믿으면 범위가 과대 추정 (설계 결정 / AI 이탈)

**증상**: Phase 2 Epic A (위젯 런타임) 진입 Task A-1 에서 현황 감사 전 `docs/phase-2-plan.md` §2 에 "`src/widget/widget.ts` (현재 42.59% 커버, 실질 빈 스텁) 실구현" 으로 서술. Epic A 예상 규모를 **2~3주 (4~5 Task)** 로 추정. 결정 체크리스트(§7-5 스트리밍, §7-6 세션)도 "쿠키 도입 / fetch-stream 신설" 같은 신규 구축 전제로 권장안 작성.

실제 Task A-1 에서 Read 9 파일 병렬로 탐색해보니:

- `widget/` 9 모듈 모두 production 수준 구현 완료 (Shadow DOM closed + 디자인 시스템 v2 CSS 이식 + 접근성 aria + 모바일 반응형 + AbortController + 제어문자 sanitize + brand 변수 주입 + 에러 바)
- `/api/chat/[botId]` 6중 보안 + RAG + rate limit 완성
- `/api/widget-config/[botId]` 화이트리스트 + 5분 CDN 캐싱 완성
- `origin-check.ts` 와일드카드 / TLD 차단 / IDN punycode / trailing dot 정규화 — 프로덕션급
- `build-widget.mjs` esbuild IIFE + gzip 15KB 목표 + sourcemap dev-only

**원인**: Phase 1 이 7+ 세션에 걸쳐 점진 구현되면서 "위젯 Task 는 Epic 1-8 에 밀림" 식의 요약이 PROGRESS.md 에 기록되었으나, 실제 코드는 **Task 1-6-a/b/c/d 로 진행되어 거의 완성** 된 상태. Phase 2 계획서 작성 시점(2026-04-20)에 이 불일치를 감지 못 하고 "미구현 과제" 로 서술. 결정 권장안도 이 오인식 위에서 구성됨:

- 결정 #5: "fetch-stream 신설 제안" 하지만 2026 표준은 Vercel AI SDK Data Stream Protocol — 외부 조사 없이 1차 권장안 도출.
- 결정 #6: "HTTPOnly Partitioned 쿠키 추가 제안" 하지만 `origin-check.ts` 의 "credentials:true 금지" 주석이 이미 쿠키 도입 차단 논리를 담고 있었음 (현황 감사 전엔 이 주석을 몰랐음).

**해결**:

1. Task A-1 의 첫 단계로 **현황 감사를 명시 수행** — `src/widget/**/*.ts` + 관련 API route + 보안 유틸 전수 Read (병렬).
2. `phase-2-plan.md` §2 Epic A 범위 재작성: "빈 스텁 실구현" → "배포 + smoke test + 스트리밍 전환" (3~5일).
3. §5 Task 분해 5→5 유지하되 A-1 완료 / A-2 배포 중심 / A-4 스트리밍만 신규 / A-5 Dairect 사이트 embed 중심으로 재정의.
4. 결정 #5 변경: Vercel AI SDK Data Stream Protocol 로 재권장 (외부 조사 후).
5. 결정 #6 변경: "쿠키 도입 보류, localStorage + 서버 UUID 현행 유지" (`origin-check.ts` 주석의 `credentials:true 금지` 원칙이 `allowedDomains` allow-all 정책과 불가분 결합 확인 후).
6. ADR-009 에 결정 근거 + 아키텍처 다이어그램 + 데이터 흐름 + 보안 모델 + Open Questions 5건 문서화.

**규칙** ⭐:

- **Phase 전환 계획서 작성 전에 해당 영역 코드 전수 감사 필수** — PROGRESS.md / learnings.md 의 메모만 믿지 말 것. Phase 2 계획서 §2 에 Epic 범위 서술 시 `src/<영역>/**/*` + 관련 API + 관련 util 을 **Read 병렬로 전수 확인** 후 "이미 구현된 것 vs 미구현" 명확 구분. "~42% 커버" 같은 coverage 수치는 **문서화 부족** 의미일 뿐 구현 부재 의미가 아님.
- **결정 권장안 도출 시점에 외부 최신 정보 조사를 선행** — WebSearch + context7 (framework/SDK 공식 문서) 를 결정마다 1~2회 병렬 호출. 특히 스트리밍 / 쿠키 / 브라우저 표준 / AI SDK 같이 **2024~2026 급변 영역** 은 필수. 1차 권장안 도출 전에 최신 정보 수집 → 2차에서 권장안 보정이 드는 시간이 절약.
- **기존 보안 주석 / 설계 주석은 "묵시적 결정 기록" — 무시하면 결정 번복 유발** — `origin-check.ts` 의 "credentials:true 금지" 긴 주석은 단순 경고가 아니라 **이미 정해진 설계 원칙**. 신규 결정이 이 원칙과 충돌하면 신규 결정이 틀린 것. 결정 체크리스트 구성 시 "관련 파일의 주석부터 전수 Read" 가 선결 단계.
- **과대 추정은 Jayden 의 의욕 낭비** — "2~3주 Epic" 이라고 말했다가 실제로 "3~5일" 이면 Jayden 이 착수 결정 시 체감하는 무게가 다름. 계획서의 예상 규모는 **반드시 현황 감사 후** 확정. Phase 1 진행 중엔 대략 추정 OK 이지만 Phase 전환 문서는 정확도 요구 단계.
- **"AI 방향 이탈" 유형** — 선행 조사 없이 "1차 권장안"을 제시하면 권장안이 Plan 에 묶여 변경 비용 발생. Auto mode 여도 **외부 조사 + 현황 감사가 Plan 수립 전 필수 단계** 임을 프롬프트에 명시. 본 세션에서는 Jayden 이 "최신 정보 학습해서 추천" 이라고 2차 지시를 내린 덕분에 재조사 기회가 생겼으나, 원래 첫 Plan 단계에 포함되었어야 함.

---

### 2026-04-20 Playwright HTML 리포트가 ESLint 에 잡혀 "errors 190" 오탐 — artifact 폴더 ignore 누락 (운영 지식)

**증상**: Task 1-8-a 검증 시 `pnpm lint` 가 `3021 problems (190 errors)` 출력. 에러 위치가 `column 17817 / 37960` 같은 비정상 숫자 — minified JS 특성. 직전 세션에는 "기존 3 warnings" 로 clean 이었음. 내 신규 파일(`conversations/*`)에는 한 건도 없음.

**원인**: 직전 세션 Task 1-7-d 에서 Playwright E2E 실행 후 `playwright-report/` 폴더 (내부에 minified trace JS 수천 줄) 가 리포지토리에 잔존. `eslint.config.mjs` 의 `globalIgnores` 에 `.next/` / `coverage/` / `public/widget.js` 는 있으나 `playwright-report/` / `test-results/` 누락. 이 폴더들은 E2E 실행마다 재생성되므로 한번 생긴 뒤로는 lint 가 상시 오염될 운명. CI 는 매번 깨끗한 체크아웃이라 문제 미발현 → 로컬 반복 개발자에서만 드러남.

**해결**: `eslint.config.mjs` globalIgnores 에 `playwright-report/**` + `test-results/**` 추가. 재실행 → `3 warnings (0 errors)` 기존 baseline 복귀.

**규칙** ⭐:

- **테스트/빌드 artifact 폴더는 반드시 linter ignore 에 명시** — 초기 세팅 시 `.next/` / `coverage/` / `dist/` 같이 당연한 것 외에 `playwright-report/` / `test-results/` / `storybook-static/` 등 **테스트 프레임워크 전용 artifact** 까지 일괄 등록. 생성 시점(로컬 dev / CI / E2E)이 다양해 "안 생기는 환경" 에선 안 보임.
- **"baseline clean 이었는데 갑자기 오염" 패턴은 코드 아닌 artifact 의심** — 내 diff 에 해당 파일 없고 에러가 `column 17000+` 같은 minified 표식이면 인프라 문제. `pnpm lint 2>&1 | grep "^/Volumes" | sort -u` 로 파일 경로 목록 먼저 확인.
- **CI 녹색 ≠ 로컬 green 보장** — CI 는 artifact 미보존이라 이 종류 이슈에 취약. 로컬 E2E 첫 실행 시점에 발견되는 경향 → 발견 즉시 ignore 추가.
- **globalIgnores 패턴은 `폴더/**` 재귀 형태로\*\* — 테스트 프레임워크가 하위에 난잡 구조를 만들 수 있어 top-level 만으론 부족.

---

### 2026-04-20 대량 join 쿼리의 `.limit()` 가드는 "정확성 vs DoS 방어" 트레이드오프 — MVP 는 DoS 방어 우선 + warn 로그로 보조 (설계 결정)

**증상**: Task 1-8-a security review MEDIUM-1. conversations 50 건 × 대화당 수천 메시지 상정 시 `messages.in(conversation_ids)` 쿼리가 수만 row 반환 가능 → 서버 메모리·응답 지연. 프리뷰 목록용 조회 비용으로 과도.

**원인**: 프리뷰 목록은 "대화당 첫 user 메시지 1건 + 전체 메시지 수" 만 필요하나, Supabase/PostgREST 만으로 `LATERAL JOIN` 이나 윈도우 함수를 간결히 표현 어려움. 단순 `in()` 은 대화당 메시지 건수에 정비례. 자연 성장만으로도 운영 초기 이후 상한 도달 가능.

**해결 (MVP)**:

1. `.limit(MESSAGES_FETCH_LIMIT = 1000)` 가드 — 50 대화 × 평균 20 메시지 ≈ 1000 기준 보수 추정.
2. 상한 도달 시 `logger.warn({ botId, fetched, limit }, "messages fetch 상한 도달 — 프리뷰/카운트 정확도 하락 가능")` — 운영 신호 수집.
3. 카운트 표시는 정확도 소폭 하락 감수. 정확 fetch 가 필요한 상세 페이지(Task 1-8-b) 에서 별도 처리.
4. RPC / `LATERAL JOIN` / DB view 같은 최적화는 Phase 2 이월. warn 빈도가 높아지면 우선 승격.

**규칙** ⭐:

- **대량 N-to-M 조회는 반드시 `.limit()` 또는 페이지네이션** — `in()` / `any()` 같이 관계 테이블 일괄 조회 시 상위 테이블이 제한되어도 하위 row 수는 무제한 확장 가능. MVP 쿼리라도 상한 가드는 기본.
- **상한 도달은 warn 로그로 모니터링** — `logger.warn` 에 `fetched` / `limit` 기록. 가드만 넣고 모니터링 없으면 조용히 정확도 하락.
- **트레이드오프는 "전체 vs 국소 영향" 기준** — DoS 방어(서버 전체 지연 = 전 사용자 영향) vs 정확도 하락(한 페이지 카운트 소폭 오차). MVP 는 항상 전체 사용자 영향 우선 차단.
- **보안 리뷰 MEDIUM 을 "ROI 낮음" 으로 이월하지 말 것** — `.limit()` 1줄 + warn 로그 1회 = 5분 작업 vs 기대 이익 "프로덕션 장애 1건 회피" = 수시간. 작은 Fix 는 항상 이득.
- **LATERAL JOIN 같은 DB 최적화는 "신호 수집 후" 승격** — 조기 최적화 금지. warn 로그 빈도가 임계 넘으면 승격, 아니면 MVP 상태 유지.

---

### 2026-04-20 표시용 조합키와 삭제용 조합키 — 두 곳에 독립 구현하면 silent 동기화 실패 (설계 결정)

**증상**: Task 1-7-d sources-list.tsx 에서 청크 개수 lookup 시 `counts["manual:manual:inline"]` / `counts[\`url:${u}\`]` / `counts[\`${dbType}:file:${f}\`]`하드코딩 키를 사용. 한편 remove-source.ts 는`mapToDbSource`로`(source_type, source_identifier)` 를 생성해서 RPC 호출 — 두 파일이 동일 매핑 규칙을 **각자 독립 구현**. 독립 code review 에서 M-1 지적: "어느 한 쪽이 바뀌면 다른 쪽이 silent 하게 0을 표시한다".

**원인**: 기능이 "chunks 집계 표시" 와 "chunks 삭제 RPC" 로 분리되면서 같은 조합키 규칙이 두 책임에 독립적으로 구현됨. 표시는 page.tsx→sources-list, 삭제는 actions.ts→remove-source. 두 코드가 다른 폴더에 있어 규칙 변경 시 한 곳만 바꿔도 typecheck/lint/test 가 통과. 표시만 0 으로 나오는 UX 버그는 E2E 없이는 감지 어려움 — "silent 실패 = 회귀 테스트로도 잡히기 어려운 유형".

**해결**: `src/core/knowledge/source-key.ts` 신규 — server+client 공유 가능한 순수 helper 모듈 (`"server-only"` 없음). `mapUiToDb(uiType, identifier)` 과 `chunkKey(uiType, identifier)` 두 함수 export. remove-source.ts 와 sources-list.tsx 가 동일 함수를 import → 규칙 변경 시 한 곳만 수정하면 양쪽 자동 반영. 유닛 테스트 없어도 단일 출처 보장.

**규칙** ⭐:

- **동일 키/식별자 포맷이 표시/저장/삭제 등 2개 이상 책임에 등장하면 공유 helper 로 추출** — 규칙 변경 시 "silent drift" 위험 제거. 헬퍼 함수 하나 추가하는 비용 < 향후 감지 불가능한 버그 비용.
- **server-only vs client 경계 주의** — `remove-source.ts` 가 `"server-only"` 로 선언돼 있어 client 컴포넌트에서 직접 import 불가. 공유 helper 는 **server-only 선언 없는 순수 함수 모듈** 로 분리해야 양쪽에서 사용 가능. `"server-only"` 는 "클라이언트 번들 유출 방지" 안전장치라 제거 대신 분리가 정답.
- **code-reviewer 가 "M-1 silent sync 실패" 지적하면 주석 대신 코드 재배치로 해결** — 주석은 휴먼 의존, 헬퍼 추출은 컴파일러 강제. 사용자 규칙 "가장 단순한 접근법" 에 어긋나 보이지만, "silent failure 예방" 은 단순성 예외 케이스.
- **chunk key 조합 포맷 `${source_type}:${source_identifier}`** — 이 조합이 변경되면 sources-list + page.tsx groupBy + remove-source 세 지점 모두 영향. 향후 포맷 수정 시 반드시 source-key.ts 의 `chunkKey` 만 수정 → 나머지는 전파.

---

### 2026-04-20 Storage 파일 경로는 RLS 단일 방어선에 맡기지 말고 앱 레이어 prefix 검증 2중화 (설계 결정)

**증상**: Task 1-7-d security review MEDIUM-1. `removeKnowledgeSource` 가 받는 `storagePaths` 는 config jsonb(`existingParsed.data`) 에서 추출. 즉 서버가 DB 에서 직접 읽은 신뢰된 값. 그러나 "악의적 owner A 가 자기 봇 config 의 `storagePaths` 에 `{bot_B_id}/secret.pdf` 를 삽입한 뒤 `removeSourceAction` 호출" 시나리오. Storage RLS 0010 이 `storage.foldername(name)[1] = bot_id AND bot.owner = auth.uid()` 로 1차 차단하지만 — **앱 레이어에 prefix 검증 없음** = 방어선이 RLS 단일.

**원인**: config jsonb 는 본인 봇 owner 가 쓸 수 있는 영역(RLS bots_update_owner). 일반 UI 경로(`addFileSourceAction`)는 파이프라인이 올바른 경로만 생성하지만, **미래에 관리자 도구/다른 Server Action/수동 Supabase Studio 편집** 으로 비정상 경로가 주입될 가능성 존재. Defense-in-depth 원칙상 "RLS 가 막는다" 논거만으로는 부족 — RLS 정책 자체가 실수로 완화되거나 버킷 설정 변경으로 우회 가능성 항상 존재.

**해결**:

1. `fileSourceSchema.storagePaths` 에 regex `^[0-9a-f-]{32,40}\/[0-9a-f-]{32,40}\.(pdf|txt|md)$` 추가 → 스키마 레벨에서 임의 문자열 삽입 차단 (sec LOW-1).
2. `removeSourceAction` 에서 `storagePaths.filter(p => p.startsWith("${existing.id}/"))` 로 bot.id prefix 일치만 safeStoragePaths 에 통과 → chunks 삭제는 계속, 불일치 경로는 Storage 삭제 건너뜀(degrade) + `logger.error` (sec MEDIUM-1).

**규칙** ⭐:

- **RLS 는 "최종 방어선" 이지 "유일 방어선" 이 아니다** — 앱 레이어에서도 "내가 믿고 있는 값이 정말 내 owner 범위 안인가?" 를 명시 검증. 특히 Storage 경로·URL·ID 같은 식별자가 config jsonb/메타데이터에서 재사용되는 경우 필수. Defense-in-depth 는 "한 층이 깨져도 나머지 층으로 버틴다" 가 핵심.
- **Storage 경로 스키마는 regex 로 강제** — Zod 같은 스키마에서 "임의 문자열" 을 허용하면 공격 시 경로 조작 벡터 확대. 스키마 자체가 `{uuid}/{uuid}.{ext}` 같은 포맷만 받으면 DB 쓰기 시점에서 1차 필터 + 읽기 시점 regex 재검증 불필요.
- **degrade 전략 선호 — 전체 차단 vs 부분 실패** — 불일치 경로 발견 시 action 전체를 차단하면 chunks 삭제조차 안 됨(UX 퇴행). 안전한 부분만 실행 + 위험한 부분은 skip + logger.error 로 모니터링 → 사용자 경험 유지 + 공격 가시화. 단 `logger.error` 는 알람 대상으로 등록 (warn 이 아니라 error).
- **"Server Action 에서 config jsonb 를 조작값으로 취급" 체크리스트 항목** — 향후 Plan template 의 security checklist 에 추가: "이 action 이 읽는 jsonb 필드가 다른 시스템(Storage/외부 API)의 리소스 식별자로 쓰이는가? YES → prefix/pattern 재검증 필요".

---

### 2026-04-20 E2E 테스트의 외부 API 쿼터 의존성 — Gemini 429 로 text 저장 flow 검증 불가 (운영 지식)

**증상**: Task 1-7-d E2E 실행 시 4 케이스 중 2 케이스 실패 (`text 저장 후 리스트 표시 → 삭제`, `삭제 취소 dialog dismiss`). `page.waitForURL` 60초 timeout. Playwright error-context.md 의 page snapshot 확인 결과 페이지에 `alert: "지식 저장에 실패했어요. 잠시 후 다시 시도해 주세요. (다른 섹션은 저장되지 않았습니다)"` 표시. 이는 `actions.ts:updateBot` 의 `ingestTextKnowledge` try/catch 실패 경로 응답 — 즉 redirect 안 됨. 원인은 **Gemini API 429** (같은 세션 vitest 로그에도 이미 관찰). 로컬 dev server 가 실 Gemini API key 로 호출하는데 직전 세션 이어서 쿼터 소진.

**원인**: Dari 의 지식 파이프라인(1-7-a/b/c/d)이 모두 Gemini 임베딩 의존. E2E 는 Playwright 웹서버로 실 dev 서버를 띄우고 실 API 호출 경로 그대로 → 로컬 Gemini 쿼터와 E2E flakiness 직접 연결. 동일 문제는 1-7-a(text) / 1-7-c(file) spec 에도 잠재. **단위 테스트는 mock 으로 보호되지만 E2E 는 실 네트워크** — 이 비대칭성을 명시 인지 못 한 상태.

**해결**: 이번 Task 는 α 경로 — "smoke + 비로그인 E2E 통과 + 단위테스트 15건 커버 충분" 판정 + text 저장 flow 는 Jayden 수동 검증으로 위임. Gemini 의존 테스트는 추후 `admin()` DB 직접 주입 fixture (γ 경로) 로 재구성 예정.

**규칙** ⭐:

- **외부 API 쿼터 의존 E2E 는 반드시 대안 경로 설계** — 옵션 3가지:
  1. **Mock 계층 주입** — 테스트 전용 env (`E2E_MOCK_EMBEDDING=1`)로 `embedBatch` 가 zero vector 반환하도록 분기. 가장 단순하나 프로덕션 코드에 조건문 추가 필요.
  2. **DB 직접 주입 fixture** — `admin()` 헬퍼로 bot + knowledge_chunks 를 직접 INSERT. embedding 컬럼은 더미 zero vector. Gemini 호출 우회. 가장 정확.
  3. **테스트 격리 — Gemini quota 의존 테스트를 별도 tag (`@slow` / `@external`) 로 분리 + CI 에선 skip + 주간 수동 실행**. 가장 간단.
- **E2E 실패 시 반드시 `error-context.md` 먼저 확인** — Playwright 는 실패 시 page snapshot 을 저장해 "사용자가 본 화면" 을 정확히 재현. 단순히 "timeout" 메시지만 보면 원인 오진. 이번 케이스도 `alert: "지식 저장 실패"` 메시지로 즉시 Gemini 문제 확정.
- **실 E2E 는 Gemini 호출 전제 테스트 당 최소 10~30s 소요** — timeout 기본 30s 로는 Gemini + Supabase + navigation 체인 완주 어려움. `test.setTimeout(90_000)` + `Promise.all([waitForURL, click])` 동시 대기 패턴으로 race 축소. 그러나 이는 쿼터 문제 은폐용일 뿐 — 근본 해결은 위 3 옵션.
- **Task Plan 단계에서 "E2E 외부 API 의존성" 체크리스트 추가** — Plan template 에 "이 Task 가 E2E 로 검증 필요한 flow 에 외부 API 호출이 포함되는가? YES → mock/fixture/tag 중 선택을 Plan 에 명시". 사후 검증 실패로 "검증 불가 판정" 하는 대신 Plan 승인 시점에 결정.

---

### 2026-04-20 보안 리뷰 "고바이트 비율" 권장안의 한글 UTF-8 false positive — 제어문자 비율로 대체 (설계 결정)

**증상**: Task 1-7-c security-reviewer MEDIUM-2 가 TXT/MD 바이너리 판별 강화 권장 — NULL byte 외에 "고바이트(>0x7F) 비율 >90%" 추가 검사. 그러나 한글 UTF-8 은 글자당 3바이트 모두 고바이트(0xE0~0xEF / 0x80~0xBF) 이므로 **고바이트 비율 ~100%**. 순수 한글 TXT 파일 = 항상 바이너리 판정 = 업로드 전원 차단. 한국 시장 타겟 제품 치명적 버그.

**원인**: 보안 권장 코드는 흔히 "바이너리 탐지" 휴리스틱을 영어/ASCII 기준으로 제시. 다국어 UTF-8 특성 고려 부족. 한글 3바이트 / 일본어 3바이트 / 중국어 3바이트 = 고바이트가 정상 텍스트의 지표. 리뷰 권장 그대로 반영하면 역효과.

**해결**: "고바이트 비율" 대신 "비-텍스트 제어문자 비율" 로 대체.

- 제어문자 = `0x01-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F` (허용: tab 0x09 / LF 0x0A / CR 0x0D / printable 0x20+).
- 임계값 5% 초과 → 바이너리 판정.
- 한글/일본/중국 UTF-8 은 제어문자 비율 0% → 통과.
- 순수 0xFF 로 채워진 exotic binary 는 여전히 통과하지만, 실공격 빈도 낮고 임베딩 품질 자체가 무의미 → UX 문제이지 보안 문제 아님.

테스트: 한국어/일본어/중국어 UTF-8 pass + 제어문자 12.5% 샘플 reject 추가.

**규칙** ⭐:

- **보안 리뷰 권장 코드를 "그대로 반영 전에 정상 트래픽 영향 검증"** — 이전 learnings 2026-04-18 "보안 리뷰 권장 코드도 비판적 재검토" 의 다국어 Unicode 버전. 보안 리뷰가 "차단해야 할 공격 시나리오" 에 집중하는 경향이라, "정상 유스케이스가 여전히 통과하나" 를 별도 축으로 검증 필요.
- **다국어 UTF-8 안전 휴리스틱 원칙**: 고바이트 비율 / 비-ASCII 비율 같은 "분포 기반" 판별은 한중일·아랍어·러시아어 등 non-Latin 스크립트에 false positive. **대신 "제어문자 비율" / "UTF-8 validity" (TextDecoder fatal:true) / "NULL byte"** 같은 **구조 기반** 판별 선호.
- **국제화 테스트 고정 세트**: 파일/텍스트 sanitize·판별 함수 테스트에 한/일/중 3언어 UTF-8 샘플 필수 추가 (test 에 pin) → 향후 리뷰가 유사 권장을 하면 실패 테스트로 자동 반려.
- **리뷰 판정 2분법 지양**: "Ship as-is / Fix-then-ship" 중 Fix-then-ship 판정이라도 개별 항목을 "반영 / 변형 반영 / 이월" 3단계로 나눠 검토. 원안 그대로 반영이 항상 정답 아님.

---

### 2026-04-20 Supabase MCP 권한 경계 — `storage.objects` RLS 정책은 일반 권한 불가 (운영 지식)

**증상**: Task 1-7-c Storage RLS 정책 4개를 `apply_migration` 으로 적용 시 `42501: must be owner of relation objects` 실패. `execute_sql` 도 동일 실패. 마이그레이션 0010 의 버킷 생성 SQL(`insert into storage.buckets`) 은 성공, RLS 정책 부분만 권한 부족.

**원인**: Supabase MCP 는 `postgres` superuser 가 아닌 제한된 권한으로 실행. `storage.objects` 테이블은 Supabase 내부 관리 테이블이라 DB owner 만 policy 생성 가능. Supabase Studio 의 SQL Editor 는 내부적으로 더 높은 권한 세션 사용 → UI 로는 가능. `list_projects` / `list_migrations` / `apply_migration` 의 schema=public 테이블은 정상 작동하나 `storage` schema 의 DDL 은 제한.

**해결**: 2단 apply 패턴 정형화.

1. MCP 로 가능한 부분 (`storage.buckets` INSERT + public.\* DDL) 은 `apply_migration`.
2. `storage.objects` RLS 정책은 마이그레이션 파일에 포함은 하되, 실제 apply 는 **Jayden 수동 (Studio SQL Editor)**.
3. 파일 상단에 "MCP 제한 — 정책 부분은 Studio 수동 실행 필요" 주석 필수.
4. Build/파이프라인은 RLS 와 독립 설계 → 병렬 진행 가능 (Claude Step 2/3 vs Jayden SQL).

**규칙** ⭐:

- **Supabase MCP 권한 경계 지도 유지**: 가능(public schema DDL / migration version 관리 / RPC) vs 불가(storage.objects policy / auth.\* DDL / publication 관리). 새 MCP 호출 전 "이 작업이 일반 권한 범위인가" 되묻기. 실패 후 역추적 금지.
- **외부 서비스 선결 체크리스트에 "MCP 불가 영역" 명시**: 메모리 규칙 `feedback_external_service_precheck` 의 체크리스트에 "이 작업에 Jayden 수동 개입이 필요한 부분은?" 항목 명시 — Build 시작 전에 드러내 병렬 진행.
- **마이그레이션 파일 vs 실 apply 분리**: 파일에 전체 SQL 보존 (docs + 재배포 단일 진실) + 실 apply 경로(MCP / Studio / CLI) 를 주석으로 안내. 향후 개발자가 같은 파일을 full run 하려 할 때 "일부는 UI 에서" 안내 받음.
- **병렬 작업 설계**: 차단 영역(수동 개입 대기) 이 있어도 독립 영역(파이프라인 구현, UI, 테스트) 은 그대로 진행 가능하도록 의존성 분리. 차단 종료 시점에 통합 검증만 수행.

---

### 2026-04-20 HTML `<form>` 중첩 금지 해결 — main form 밖 SectionCard + React `key` remount (설계 결정)

**증상**: Task 1-7-b 에서 봇 편집 폼(메인 form = `updateBot` Server Action) 안에 "URL 크롤링 · 추가" 섹션을 두려 했다. URL 추가는 Firecrawl 5~30초 호출이라 즉시 적용 별도 Server Action(`addUrlSourceAction`). 메인 form 내부에 `<form action={addUrlSourceAction}>` 를 중첩하면 HTML 스펙 위반 + 브라우저가 자식 form submit 시 부모 form 도 trigger 가능 + 스펙상 innerform 은 parsing 중 closing 될 수 있어 예측 불가.

**원인**: HTML5 명세가 `<form>` 중첩 명시적 금지. 대안 3가지 존재 — ① React Portal (body 직속 render, CSS 배치 복잡) ② HTML5 `form=` attribute (모든 input 에 `form="edit-bot-form"` 명시 필요, 영향 범위 6 섹션) ③ DOM 구조 자체를 분리 (메인 form 밖에 별도 SectionCard 배치). 1-5-d 편집 폼이 이미 `<form>` 으로 전체 감싸진 구조라 ①·② 는 영향 범위 대비 이익 부족.

또한 URL 추가 성공 후 uncontrolled input(`defaultValue=""`) 이 브라우저 이전 값 유지 → 연쇄 입력 시 오탈자 반복. `useActionState` 는 컴포넌트 식별 기반 상태 유지이므로 form 만 remount 해도 hook state 는 유지됨 — `key={state.success?.url ?? "form-id"}` 로 성공 시에만 form remount 되어 input 초기화 + 성공 메시지 유지 양립.

**해결**:

1. `EditBotForm` 리팩터 — 최상위 `<form>` 을 `<div>` 로 변경 → 내부에 메인 `<form action={updateBot}>` 배치 → 닫은 직후 SectionCard(knowledge-url) 를 form 밖 sibling 으로 추가.
2. SectionNav 앵커에 `knowledge-url` id 포함 (UX 연속성).
3. `KnowledgeUrlSection` 에 자체 `<form action={addUrlSourceAction.bind(null, slug)}>` + `key={state.success?.url}` 적용.
4. 주석으로 "이유 2 가지" 명시 (HTML form 중첩 금지 + 비동기 UX 분리).

**규칙** ⭐:

- **`<form>` 중첩이 필요해 보이면 먼저 "정말 중첩이 필요한가" 되묻기**. 보통은 "메인 제출과 별도 적용 시점" 때문인데, 이건 UX 요구이지 DOM 요구가 아님. DOM 구조를 분리하고 UI 만 시각적 연속성 유지 (SectionCard 두 개를 나란히 배치) 가 최소 변경 해법.
- **HTML5 `form="id"` attribute 는 Last Resort**. 영향 범위(모든 input 수정) 대비 이익 박하면 DOM 분리가 낫다. 단일 섹션에서만 쓰이는 경우에도 유지보수 주의.
- **`useActionState` + uncontrolled input 의 remount 패턴**: `<form key={state.success?.uniqueId}>` 로 form 만 remount → hook state 는 유지되며 input 만 초기화. controlled input 을 피하면서 성공 후 input clear UX 구현하는 React 19 best practice.
- **동일 key 로 재제출하는 엣지 케이스**: 같은 URL 을 다시 제출하면 `state.success.url` 값이 동일 → key 동일 → remount 안 됨 → input 미초기화. MVP 수용. Phase 2 controlled input 전환 시 자연 해소.

---

### 2026-04-20 로깅 URL redact — Pino 필드명 기반 redact 의 구조적 한계 + `origin+pathname` 헬퍼 (설계 결정)

**증상**: Task 1-7-b security 리뷰 LOW. `logger.error({ err, url }, ...)` 에서 url 은 사용자 입력 원본. URL 쿼리스트링에 `?access_token=abc` / `?token=xyz` / `?api_key=...` 가 담긴 페이지(OAuth redirect 후 URL, 내부 관리자 도구 등) 를 크롤링하면 Pino 가 Sentry/로그에 전체 URL 을 기록 → 토큰이 로그 aggregator 에 잔존.

**원인**: Pino `redact` 옵션은 **필드명 기반** (SENSITIVE_FIELD_NAMES 에 `password` / `authorization` / `cookie` 등). `url` 필드는 URL **문자열 자체**가 값이고, 그 문자열 내부에 인라인 시크릿이 포함된 경우 redact 는 감지 불가 — 필드명 매칭이 아닌 값 내부 pattern 스캐닝이 필요하나 Pino 는 기본 미지원. Pino `redact.censor` 함수로 정규식 기반 값 scrubber 가능하지만, URL 마다 토큰 쿼리 이름이 제각각(`access_token`/`api_key`/`session`/`sid`) 이라 정규식 유지보수 비용 높음.

**해결**:

1. `sanitizeUrlForLog(raw: string): string` 헬퍼 신규 — `new URL(raw).origin + pathname` 반환. 쿼리스트링·해시·userInfo(`user:pass@`) 전부 제거. 파싱 실패 시 `"(invalid-url)"` 반환으로 내부 문자열 비노출.
2. `url-fetch.ts` 의 3 로깅 지점 + `ingest-url.ts` 의 3 로깅 지점 모두 `sanitizeUrlForLog(url)` 경유로 교체.
3. 회귀 방지 테스트 3 케이스: 정상 축소 / 쿼리&해시 제거 / invalid URL fallback.

**규칙** ⭐:

- **로깅 시 URL 은 항상 `origin + pathname` 으로 축소** — 쿼리스트링에 토큰이 포함되는 경우가 드물지 않다(OAuth redirect / Google Drive share / 관리자 도구). Pino `redact` 로는 불가능한 영역.
- **`new URL().origin` 은 RFC 6454 기준 scheme+host+port 만 포함, userInfo(`user:pass@`) 제외** — credential 유출 자동 방어 보너스. 명시적 검증 테스트 필수.
- **파싱 실패 fallback 은 `"(invalid-url)"` 같은 **리터럴 상수\*\*\*\* — 원본 문자열을 `logger.warn("parse failed: ${raw}")` 같이 부분 노출하면 sanitize 무효화. fallback 도 정적.
- **"값 내부 시크릿" 은 보통 필드 타입별 전용 헬퍼** — URL 은 `sanitizeUrlForLog`, 전화번호는 `maskPhone`, 이메일은 `maskEmail` 등. Pino 전역 redact 를 정규식으로 오버엔지니어링하지 말고 로깅 시점에 명시 sanitize.
- **Grep 으로 기존 `logger.*({ ..., url, ..., }, ...)` 패턴 전부 조사** — 한 곳만 교체하면 구멍 남음. 이번엔 6 지점 모두 교체 + 회귀 방지는 단위 테스트 (그러나 기존 로깅 지점이 sanitize 경유하는지 검증하는 테스트는 별도 작업, 비용 대비 이익 낮음 — 리뷰 단계 체크리스트로 대체).

---

### 2026-04-20 외부 서비스 공용 API 키 — rate limit 은 MVP 필수 (owner-authed 만으로 부족) (설계 결정)

**증상**: Task 1-7-b Plan 에서 rate limiting 을 Phase 2 로 보류 (결정 #8: "owner-authed 만 호출 → 남용 가능성 낮음"). 1차 security 리뷰가 이 결정을 MEDIUM 으로 재검토 — `FIRECRAWL_API_KEY` 는 **앱 공용 API 키** 라 한 bot owner 의 남용이 다른 bot owner 의 크롤링 실패(402/429) 로 이어진다. 크레딧 플랜이 한도를 공유하는 SaaS 특성이 문제.

**원인**: "owner-authed → 공격 범위 제한" 은 자주 쓰는 논거지만 **공용 자원** 관점을 놓치면 부분 진실. 공용 자원 타입:

- **공용 API 키** (Firecrawl / OpenAI / Anthropic / Upstash 등 SaaS) — 한 owner 의 요청 폭주가 모든 owner 의 요청 실패로 직결.
- **공용 DB 커넥션 풀** — Supabase connection 상한 초과 시 다른 Server Action 동시 실패.
- **공용 외부 이메일/SMS 쿼터** (Resend / Twilio) — 한 owner 의 bulk send 가 평판 점수·도메인 블록으로 전체 영향.

MVP 에서 rate limit 을 보류해도 되는 경우: 사용자당 독립된 자원 (예: 자기 DB row CRUD 만), 원가가 한도가 아니라 O(n) linear 한 경우 (컴퓨트만 사용). 이번 1-7-b 는 둘 다 아님.

**해결**:

1. `src/core/ratelimit/bot-url-ingest-limiter.ts` 신규 — `user.id` 기준 20req/10m sliding window. 기존 `createMemoizedLimiter` / `checkRatelimit` 인프라 재사용.
2. `addUrlSourceAction` 에 세션 검증 직후 → DB 조회/Firecrawl 호출 전 위치에 배치 (인증 없이 rate limit 소비 경로 차단).
3. Upstash 장애 시 fail-open (factory 기본 동작) — rate limit infra 장애가 서비스 중단으로 직결되지 않도록.
4. 한도 설계: 정상 UX 로 URL 을 수동 입력하는 간격(수 초~분) 고려하여 20req/10m. 연쇄 입력·오탈자 수정·브라우저 재시도 수용.

**규칙** ⭐:

- **외부 SaaS API 키가 공용(앱 단일 키) 인 경로는 rate limit MVP 필수**. "owner-authed" 논거가 성립하려면 **자원도 owner-분리** 여야 한다. Firecrawl, OpenAI, Anthropic 등은 owner 별로 key 분리 안 하는 구조(멀티테넌트) 라 공용 한도 소진 경로 존재.
- **rate limit 호출 위치는 세션 검증 **직후**, DB/외부 호출 **전\*\*\*\* — 비인증 요청은 redirect 분기에서 먼저 차단되어야 rate limit slot 을 소비하지 않는다.
- **Upstash fail-open 전략 유지** — rate limit infra 장애 시 서비스 전체 차단보다 통과시키는 쪽이 DoS 회피. factory 가 이미 구현.
- **Plan 결정 #X 이 "Phase 2 보류" 로 적혀있어도 security 리뷰 MEDIUM 은 재검토 대상** — 경로별 risk matrix 를 Plan 에 포함하면 1차 security 리뷰가 MEDIUM 이 아니라 Plan 수락 단계에서 바로 MVP 범위로 올 것. 이번 교훈은 Plan template 에 "외부 SaaS 공용 자원 사용 여부 → 있으면 rate limit MVP" 체크박스 추가 근거.

---

### 2026-04-20 Next.js App Router `_` prefix = private folder (라우팅 완전 제외) (기술 이슈)

**증상**: Phase 4 Sentry 검증용 임시 라우트를 `src/app/api/__sentry-test/route.ts` 에 생성. `/api/__sentry-test` 호출 시 `{"success":false,"error":{"code":"INTERNAL_ERROR","message":"Cannot GET /api/__sentry-test"}}` envelope 응답. 초기에는 포트 4000 을 Docker `pg-system-api` 가 점유하던 문제로 착각(그것도 실제 별개 문제)했으나, 포트 해제 후에도 `_` prefix 라우트는 인식 안 됨. 디렉토리명을 `sentry-test` 로 변경하고 나서야 정상 라우트 등록.

**원인**: Next.js App Router 공식 컨벤션 — `_` 로 시작하는 폴더는 **private folder** 로 취급되어 **라우팅에서 완전 제외**. 설계 의도는 `_components`, `_lib`, `_utils` 같은 "구현 세부사항 네임스페이스" 를 라우트 트리와 분리. `__` (double underscore) 도 `_` 로 시작이므로 동일 규칙 적용. `route.ts` / `page.tsx` 가 존재해도 라우트 미등록.

**해결**: `mv src/app/api/__sentry-test src/app/api/sentry-test` — 내용 유지, `_` 제거.

**규칙** ⭐:

- **`src/app/**/\_\*` 는 Next.js App Router private folder** — 라우팅 제외. 조직화 용도 (`\_components`, `\_lib`).
- 테스트/디버그 라우트라도 `_` prefix 금지. 대안: `debug-*` / `internal-*` 같은 가시적 prefix + `if (process.env.NODE_ENV === "production") return 404` 가드.
- **빌드 로그 라우트 목록에 표시되지 않음** (`pnpm build` 의 `○ (Static)` 리스트에 안 뜸) — "내가 만든 라우트인데 왜 안 되지?" 디버깅 시간 낭비의 주요 원인.
- Dari 에서 `/api/_foo` 호출 시 envelope(`Cannot GET ...`) 응답은 `proxy.ts` 또는 전역 404 경유 — private folder 라서 라우트 매칭 실패 → 일반 404 경로.

---

### 2026-04-20 Vercel Native Integration 은 `NEXT_PUBLIC_SENTRY_DSN` 만 주입 → 서버 config fallback 필수 (설계 결정)

**증상**: Vercel Marketplace 경유 Sentry Native Integration 재설치 후, Environment Variables UI 에 7개 env 자동 주입 (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_PUBLIC_KEY`, `SENTRY_VERCEL_LOG_DRAIN_URL`, `SENTRY_OTLP_TRACES_URL`). 그러나 **`SENTRY_DSN` (non-public) 은 주입 목록에 없음**. `sentry.server.config.ts` + `sentry.edge.config.ts` 가 기존에 `process.env.SENTRY_DSN?.trim()` 만 참조 → 로컬 debug 엔드포인트(`/api/sentry-test?debug=1`) 로 `Sentry.getClient()?.getDsn()` 확인 시 `null` / `clientInitialized: false`. 즉 Vercel 배포 환경에서 **서버/엣지 Sentry 가 no-op**.

**원인**: Vercel Native Integration 의 설계 철학 — **단일 DSN 을 `NEXT_PUBLIC_*` 으로만 주입하고 서버/클라가 공유**하는 가정. Sentry SDK 관례인 "서버 전용 DSN" 패턴 (같은 DSN 값을 non-public env 로도 제공) 을 Integration 이 표준화하지 않음. 반면 로컬 `.env.local` 은 `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` 두 변수 모두 명시 관례. 코드가 `SENTRY_DSN` 에만 의존하면 Vercel 에서 깨진다.

**해결**: `sentry.{server,edge}.config.ts` 에 `process.env.SENTRY_DSN?.trim() ?? process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()` fallback 적용. 서버 런타임에서 `NEXT_PUBLIC_*` env 접근은 안전 (빌드 시 인라인 + 런타임 `process.env` 양쪽 제공).

**규칙** ⭐:

- **Sentry SDK + Vercel Native Integration 조합 시, 서버/엣지 config 는 반드시 `SENTRY_DSN ?? NEXT_PUBLIC_SENTRY_DSN` fallback**. Vercel 이 non-public DSN 을 주입하지 않는 건 버그 아닌 설계 결정. 서버 전용 env 를 기대하면 필연적으로 깨진다.
- **검증 방법은 빌드 로그가 아님**. source map 업로드 메시지만 보면 런타임 SDK init 여부 알 수 없다. 진단 라우트에서 `Sentry.getClient()?.getDsn()` 반환값 확인 필수 (`clientInitialized: true` + `dsnHost` 비null 둘 다).
- 대안 (Vercel 에 `SENTRY_DSN` 수동 등록) 은 Integration 주입 env 와 중복 관리 비용 증가 → 코드 fallback 이 표준 패턴.
- `instrumentation.ts` 는 **서버 부팅 시점에만** 실행 — env 변경 후 Next.js hot reload 는 `process.env` 를 갱신하지만 **Sentry.init 은 재실행되지 않음**. dev 서버 완전 재시작(`Ctrl+C → pnpm dev`) 필수. "env 저장했는데 왜 Sentry 반영 안 되지?" 혼선의 구조적 원인.
- **로컬 `.env.local` 은 두 변수 모두 명시** 관례 유지 — fallback 덕에 하나만 있어도 동작하나, 명시 쪽이 의도 표현 + env-template.md 일관성.

---

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

### 2026-04-20 CSV Injection OWASP 3단 방어 — prefix + wrap + escape 조합 (설계 결정)

**증상**: Task 1-8-d 대화 CSV export. 방문자가 챗봇에 입력한 content 가 그대로 CSV 로 내려가는데, `=HYPERLINK("http://evil.com","click")` 같은 수식이 Excel/Sheets 에서 자동 실행되면 피싱/외부 요청 유발. React escape 는 HTML DOM 용, CSV 환경에선 무력.

**원인**: CSV 는 "포맷" 이지 언어 아님. Excel/Sheets 가 `=`/`+`/`-`/`@` 시작 셀을 수식으로 해석하는 동작은 CSV 파서 레벨이 아닌 spreadsheet 앱의 관행. 따라서 방어는 CSV 작성 시점에서 문자열 조작으로만 가능. 또한 `,` `"` 개행 등 레코드 분리자도 wrap 안 하면 행 구조 자체 파괴.

**해결**: 3단 방어 조합.

1. **prefix** — 첫 글자가 `=,+,-,@,\t,\r,\n` 중 하나면 `'` 를 앞에 붙여 수식 해석 무력화. `\t` 는 Tab Separated 환경 오인 방어. `\r`/`\n` 은 Excel 에서 셀 경계 오인 유발.
2. **wrap** — 셀에 `,`/`"`/`\n`/`\r` 포함되면 `"..."` 로 감싸기. 이렇게 해야 파서가 1 셀로 인식.
3. **escape** — wrap 내부의 `"` 는 `""` 로 이중화 (RFC 4180).

**규칙** ⭐:

- **CSV 는 정규식 escape 로 안전 안 됨** — `content` 가 빈번 변형되는 데이터면 반드시 `escapeCsvCell` 유틸 통과. 인라인 조합 금지.
- **prefix + wrap 은 별개 방어** — prefix 만으로 `,` 행 분리 방어 불가, wrap 만으로 `=` 수식 실행 방어 불가. **둘 다** 필요.
- **\r`/`\n`/`\t` 같은 제어문자도 PREFIX 대상** — 경계 문자뿐 아니라 Excel UX 에서 보이지 않는 셀 경계 오인을 유발. OWASP 권장.
- **UTF-8 BOM (`\uFEFF`) prepend** — Excel 한국어 Windows 에서 기본 인코딩이 CP949 로 잡혀 한글 깨짐. BOM 한 글자로 자동 UTF-8 인식 강제.
- **테스트 케이스는 injection payload 중심** — 정상 문자열은 파서 통과만 확인. `=HYPERLINK`, `+CMD`, `-2+3`, `@example`, `\t`, `\r`, `\n` 각각 별도 케이스. wrap 여부도 명시 (prefix-only vs prefix+wrap).
- **방문자 입력(content) 뿐 아니라 메타(botName, visitorLabel) 도 escape 대상** — 모든 셀이 어트래커의 조작 가능 입력이라 가정.

---

### 2026-04-20 Supabase PostgrestError 는 raw 로 로깅 금지 — `{errCode, errMsg}` 구조 추출만 (설계 결정)

**증상**: Task 1-8-b security review HIGH-1. `logger.error({ err: botErr, ... })` 패턴이 1-8-a 에서 설치됐으나, security 리뷰어가 "Supabase error 의 `details`/`hint` 에 row 파편/PII 섞일 수 있어 `redactDeep` 만으로 불충분" 지적.

**원인**: `@supabase/postgrest-js` 의 `PostgrestError` 는 `{ code, message, details, hint }` 4 필드. `code`/`message` 는 주로 분류용 정적 문자열, `details`/`hint` 는 Postgres 가 뱉는 **동적 진단 문자열** — 실패한 쿼리 변수값, RLS 조건, 위반된 row 일부 포함 가능. 예: `duplicate key value violates unique constraint "..."`. `details="Key (email)=(hidream72@gmail.com) already exists."` 식. 이 문자열 안의 PII/쿼리 파편은 Pino redact 의 "필드명 화이트리스트" 로 잡히지 않음 — 필드명이 `message` 나 `details` 이지 PII 필드명이 아니기 때문.

**해결**: Task 1-8-b/c/d 전반에서 로깅 패턴을 `{errCode: e.code, errMsg: e.message, ...}` 로 통일. `details`/`hint` 는 의도적으로 버림. 필요시 별도 디버그 경로(에러 ID 연동)로만 확인.

**규칙** ⭐:

- **외부 SDK error 객체는 raw 로 `err` 필드에 넣지 않기** — Supabase/Stripe/Resend 등 모두 "부가 진단 필드" 가 있고 그 안에 민감 파편 가능. 명시 필드만 extraction.
- **로깅 시 추출 패턴 고정** — `{errCode, errMsg}` 만 허용. `{err: fullObject}` 는 "디버그 전용, 개발 환경에서만" 으로 분리. 프로덕션 로그 수집 경로와 분리.
- **`redactDeep` 필드명 기반 방어의 한계 인식** — 필드명이 `details`/`hint` 같이 일반어면 민감 여부 자동 판별 불가. 방어선은 "필드 포함 여부" 가 아니라 "필드 포함 자체를 막기".
- **정책을 한 번 정하면 신규 Task 에 **복제 적용\*\*\*\* — 1-8-b/c/d 에서 동일 패턴 확정 후 `page.tsx` 기존 `throw new Error(error.message)` 같은 레거시 패턴은 별도 sweep Task 로 인식 (리뷰어도 권장).
- **주석에 "왜 raw 금지" 명시** — 코드 리뷰어/향후 본인이 `err` 그대로 넣을 유혹을 차단. "details 에 PII 섞임 가능" 한 줄로 충분.

---

### 2026-04-20 상한 도달 truncation 은 파일 + 헤더 양쪽에 투명 표시 — silent failure 방지 (설계 결정)

**증상**: Task 1-8-d code review M-3. CSV export 에 `.limit(5000)` DoS 가드 + `logger.warn` 만 있고, 사용자가 내려받은 CSV 파일 자체에는 truncation 여부가 표시 안 됨. "일부 누락된 사실을 관리자가 모름" 시나리오. 유사 패턴이 Task 1-8-a 목록의 `MESSAGES_FETCH_LIMIT` / 1-8-b 상세의 500 상한 / 1-8-c RPC 실패 0 폴백까지 네 군데 반복.

**원인**: "서버 측 가드 + 서버 측 로그" 만 있으면 서버 운영자는 신호 받지만, **엔드 유저(관리자)는 무지**. 특히 CSV 같은 "오프라인 자료" 는 한번 내려받은 뒤 재요청 없이 계속 쓰이는 특성 → silent truncation 의 피해가 시간에 비례 확대. 단순 `logger.warn` 만으로는 불충분.

**해결**: 투명성 2중 채널.

1. **파일 자체** — CSV 메타 섹션에 "알림" 행 추가 (`알림,메시지 5,000개 상한 도달 — 일부 누락`). 사람이 파일 열면 즉시 보임.
2. **HTTP 헤더** — `X-Truncated: true` + `X-Truncated-Limit: 5000`. 프로그램/스크립트가 분기 가능.
3. **로그** — 기존 `logger.warn` 유지 (운영자용).

1-8-b 상세 페이지도 같은 철학 — `reachedLimit` 배너로 UI 에 표시. 1-8-c RPC 실패 `statsError` flag 로 배너 (실제 0 ↔ 실패 0 구분).

**규칙** ⭐:

- **silent failure 는 사용자 불신의 근원** — 숫자가 작게 보이는데 "실제 0" 인지 "집계 실패" 인지 구분 안 되면 관리자가 대시보드 자체를 믿지 않게 됨. 구분 표시는 UX 가 아니라 **데이터 신뢰성**.
- **투명성은 형식별 적합 채널로** — 웹 UI 면 배너, API 면 헤더, 파일이면 메타 행. 한 채널만으론 대상 자동화 도구에 전달 안 됨.
- **로그는 운영자용, UI/헤더는 사용자용** — 둘을 혼동하지 말 것. "logger.warn 찍었으니 됐다" 는 SRE 관점, 관리자 UX 는 별개.
- **상한 값(매직 넘버)은 노출 수준 결정** — 5000 같은 값을 UI 에 그대로 보이는 것도 정보 노출이지만, 🟡 관리자 전용 도구에서는 수용. 공개 API 라면 일반 메시지로 추상화.
- **이 패턴은 "가드가 있는 모든 경로" 에 복제 필요** — 1-8-a 목록 상한 1000, 1-8-b 상세 상한 500, 1-8-d CSV 상한 5000 모두 동일 철학. Task 별로 잊지 않고 적용 (코드 리뷰 체크리스트).

---

### 2026-04-20 리팩 Task 의 독립 리뷰는 기존 파일의 "누락된 최근 규약" 을 발견하는 기회 (운영 지식)

**증상**: Task 1-8-e (공통화 리팩) 에서 기능 변경 0 을 의도. 독립 리뷰가 sec HIGH-1 로 `bots/page.tsx:42` / `bots/[slug]/page.tsx:103` 의 `throw new Error(error.message)` 패턴 지적. Epic 1-8 (Task 1-8-b/c/d) 에서 확립된 "Postgres 내부 메시지 차단 → `throw new Error("internal_error")` + 구조화 로깅" 규약이 이 두 기존 파일에는 미적용 상태. sec M-2 로 logger.error 의 `err: error` raw 객체 전달도 동일 맥락.

**원인**: Epic 1-8 의 규약은 "신규 파일" 에 강제 적용됐으나, 이미 존재하던 page.tsx 2개는 범위 밖으로 남아있었음. 리팩 Task 는 "중복 제거" 에 집중해 기존 파일의 **미적용 규약** 을 구조적으로 발견하기 어려움. 반면 독립 리뷰(code + security) 는 "지금 이 파일에 있는 모든 위험" 을 flat 하게 본다.

**해결**: 리뷰 Fix 와 같은 commit 에 H-1 + M-2 함께 반영. 리팩 범위 파일이었으므로 "범위 밖" 으로 미루는 것보다 비용 효율적. 미처 못 잡은 유사 지점(bots/[slug]/edit/page.tsx, bots/new/actions.ts 등)은 후속 sweep Task 로 PROGRESS Backlog 에 등록.

**규칙** ⭐:

- **리팩 Task 의 독립 리뷰 프롬프트에 "최근 확립 규약 준수 여부" 체크 명시** — "이번 Task 에서 수정된 파일이 Epic X 에서 확립한 보안/로깅 규약을 따르는지" 항목 추가. 신규 파일뿐 아니라 이번에 건드린 모든 파일 대상.
- **리팩 범위 = "내가 직접 고친 파일" 의 전체 파일 상태** — "import 한 줄만 바꿨어도 그 파일 전체가 리뷰 대상". 리뷰어는 진단을 file 단위로 내므로 우리도 file 단위 책임.
- **규약 미적용 발견 시 "범위 밖" 이월 금지** — 같은 라운드에 일괄 반영. 코드 변경 비용 ≪ 향후 sweep Task 분리 오버헤드 + 보안 창 window 시간.
- **유사 지점 sweep 은 Backlog 등록** — 리뷰가 식별한 "이 패턴이 다른 곳에도 있을 것" 단서를 다음 Task 후보로 명시. 예: "bots/[slug]/edit/page.tsx:53 에서 동일 패턴" → 후속 Task 로.
- **Epic 종결 "후속 리팩" Task 의 제안 범위에 리뷰 여유 확보** — 40~60분 예상 Task 라도 리뷰 반영까지 포함해 1h+ 계획. 리뷰가 추가 Fix 를 요청할 확률 높음.

---

### 2026-04-20 enum Record 완전 매핑 시 fallback 제거는 "types.ts ↔ DB 배포 race" 방어 감소 (설계 결정)

**증상**: Task 1-8-e 에서 `BOT_STATUS_CLASS[bot.status]` 의 fallback `?? "bg-gray-100 text-gray-600 ring-gray-200"` 를 제거 + `CONVERSATION_STATUS_LABEL[conv.status] ?? String(conv.status)` 의 fallback 도 제거. 컴파일 타임 기준 `Record<BotStatus, string>` 은 3종 완전 매핑이라 fallback 이 dead code. 그러나 independent security review 에서 MEDIUM-1 지적: "DB 스키마에서 새 status 값이 마이그레이션 없이 추가되거나, types.ts 가 DB와 일시적으로 불일치하는 배포 직후 순간에 undefined 가 값에 들어가 CSV 에 `\"undefined\"` 문자열로 기록됨."

**원인**: TypeScript 의 `Record<T, U>` 는 컴파일 타임에 T의 모든 키 매핑을 보장하나, 런타임 값이 T 밖의 문자열이어도 TS 는 알 수 없음. 실운영에서 이 상황은 2가지로 발생: (1) DB 마이그레이션 배포가 Next.js 빌드(= types.ts 재생성) 보다 앞서 프로덕션 반영되는 수 분의 race window, (2) 개발자가 types.ts 를 수동 편집 없이 새 enum 값 SQL 만 추가한 경우. 이 window 에서 `undefined` 가 UI/CSV/API 응답으로 흘러가면 사용자 신뢰 훼손 + 디버깅 추적 난이도 증가.

**해결**: 대상별 정책 분리.

1. **UI 즉시 반영 대상 (Tailwind 클래스)** — fallback 제거 유지. race window 에 잠시 스타일 빠져도 자연 복구. `BOT_STATUS_CLASS[bot.status]` 는 스타일만 담당이라 UI 영향이 짧고 재배포 시 자동 정상화.
2. **오프라인 아카이브 대상 (CSV, 로그, 영구 저장 문서)** — fallback 보존. `CONVERSATION_STATUS_LABEL[conv.status] ?? String(conv.status)` 복원. 사용자가 다운로드받은 파일은 재배포해도 원복 불가 → 한 번 "undefined" 기록되면 영구 손상.
3. 주석 명시 — `// fallback 은 TypeScript 유니온 기준으론 unreachable 이나, 마이그레이션으로 새 status 값이 먼저 DB 에 반영되고 types.ts 가 뒤따라 갱신되는 일시적 불일치 구간에서 "undefined" 문자열이 CSV 에 흘러가는 것을 차단한다.`

**규칙** ⭐:

- **fallback 제거의 적절성은 "영구성" 기준** — TS 타입 신뢰로 dead code 제거해도 되는 건 **UI 표면**(자동 복구 가능). 파일·로그·API 응답·DB insert 같이 **영구 기록**되는 값은 fallback 보존.
- **DB enum 에 새 값 추가 시 types.ts 재생성을 항상 동반 커밋** — 마이그레이션 SQL 과 `supabase gen types` 실행을 한 묶음 Task 로. 배포 파이프라인에서도 types 재생성 실패 시 마이그레이션 차단하는 게이트 고려.
- **race window 방어는 비용 낮음 → 기본값** — `?? String(value)` 1줄 추가 vs "undefined 누수 1건" 의 디버깅 시간. fallback 유지가 거의 항상 이득.
- **fallback 복원은 주석으로 의도 남기기** — code-reviewer 가 "dead code" 로 제거 제안할 유혹 차단. "배포 race 방어" 한 줄로 충분.
- **리뷰어가 "어차피 TS 에서 unreachable" 이라 주장해도 "실 운영에서 types.ts vs DB 배포 순서"** 로 반박 가능한 논리 확보 — 이 규칙은 향후 유사 리뷰에서도 재사용.

---

### 2026-04-20 PRD 원안 vs 실제 실행 Epic 구조 불일치는 Phase 전환 시점에 재정렬 (운영 지식)

**증상**: Phase 2 진입 계획서 (`docs/phase-2-plan.md`) 작성 중, PRD §7 "Phase 1 구현 계획" 에 명시된 **Task 1-4 (임베드 위젯 SDK)** 가 여전히 미완임을 뒤늦게 확인. Epic 1-1 부터 1-8 까지 진행하면서 "대화 로그 + 관리 대시보드 = Phase 1 Task 1-4 + 1-5 통합" 으로 흡수됐으나, 실제 PRD Task 1-4 는 **위젯 런타임**. 이름 충돌로 "이미 완료된 것" 처럼 착시. 대시보드에서 스니펫을 보여주지만 실제 `src/widget/widget.ts` 는 42.59% 커버 스텁 상태 — 사용자가 설치해도 작동 안 함.

**원인**: Epic 번호와 PRD Task 번호가 별개로 진화하면서 **이름 재활용 + 의미 이동** 발생. Epic 1-8 은 "대화 로그" 를 다뤘는데 PRD Task 1-4 도 "임베드 위젯 SDK" 로 번호만 다르고 Phase 가 같음. 실행 중 Epic 을 분할하면서 원 Task 1-4 가 **다른 Epic 로 흡수된 것처럼 혼동** + 구현은 뒤로 밀림. PROGRESS.md Backlog 에서 "위젯" 키워드 언급이 없어 "자연 발견" 도 안 됨 (리팩·품질 항목만 쌓임).

**해결**: Phase 전환 시점에 **PRD 원안 Task 목록 전수 대조** 절차 명시.

1. Phase 진입 계획서 작성 초입에 PRD §7 해당 Phase 전체를 체크리스트로 복사.
2. 각 PRD Task 에 실제 완료 Epic/커밋을 명시 매핑 (명시적 연결 없으면 "미완" 으로 가정).
3. 매핑되지 않는 Task 는 **차기 Phase 로 승격** 또는 **현 Phase 내 신규 Epic 으로 긴급 편입** 결정.

이번에는 (3) 중 승격 경로 선택 — Phase 2 Epic A 로 재정렬.

**규칙** ⭐:

- **Phase 완결 선언 전에 PRD 원안 Task 전수 매핑** — "대시보드 완성 = Phase 1 완결" 로 착각 가능. PRD 의 Phase 1 Task 1~6 중 6개 전부 완료 여부 체크리스트로 확인.
- **Epic 번호 ≠ PRD Task 번호** — Epic 은 실행 분할의 결과, PRD Task 는 설계 의도. 둘의 불일치를 허용하되 각 Phase 종결 시점에 정렬.
- **"대체 완료" 와 "실제 완료" 구분** — Epic 1-8 (대화 로그) 이 PRD Task 1-4/1-5 를 "실질 대체" 한 것은 맞으나, PRD Task 1-4 의 원 정의(임베드 위젯 SDK)는 별개. 이름 겹침으로 상대화 금지.
- **Phase 전환 계획서는 "미완 PRD Task" 를 항상 첫 Epic 후보로 명시** — 품질/확장 Backlog 보다 미완 Task 이월이 우선. 본 계획서 (phase-2-plan.md) 가 Epic A 로 위젯을 배치한 근거.
- **프로젝트 README / PRD 간 용어 일관성 관리** — "위젯" / "대시보드" / "관리자 페이지" 등 명확히 구분. 혼동 시 stale 감지 비용 증가.

---

### 2026-04-21 계획서 "수정 X개" 전제 vs 실제 "신규 구현" 필요 — Build 전 파일 실존 검증 필수 (AI 방향 이탈 재발 방지)

**증상**: Epic B Task B-1 Plan 단계에서 `docs/epic-b-task-breakdown.md` §2.B-1 의 기술 — "봇 삭제 UI 에 typed confirmation 추가" + "DELETE `/api/conversations/[id]` 에 rate limit 추가" — 을 읽고 "수정 3~5 파일" 로 Plan 을 작성. 선결 체크 Step 0 에서 Grep/ls 실행 결과:

1. 봇 삭제 기능 자체가 **미구현** — `deleteBot` / `deleteBotAction` / "봇 삭제" 매칭 0건 (`src/app/api/chat/[botId]/route.ts` 의 `dete` FP 제외). "기존 삭제 버튼 교체" 는 실재하지 않는 가정.
2. `DELETE /api/conversations/[conversationId]` 라우트 **부재** — 해당 디렉토리엔 `export/route.ts` 만. 실제 대화 삭제 = Server Action `deleteConversationAction` (`src/app/bots/[slug]/conversations/[conversationId]/actions.ts`).

두 가정이 모두 틀린 상태로 Build 진입했다면 "수정" 이 아닌 "신규 UI + 신규 Server Action" 이 돼야 하므로 범위가 ~1h 이상 증가. Plan 수정 없이 강행하면 "기존 파일이 없으므로 새로 만들 수밖에 없음" 상황으로 자연스럽게 흐르지만 **사용자 UX 결정**(삭제 버튼 위치 / 리다이렉트 / 삭제 정책) 을 Build 중 즉흥 결정하게 됨 — 그 Task 의 **설계 결정이 승인 없이 기본값으로 굳는 위험**.

**원인**:

1. `epic-b-task-breakdown.md` 자체가 `phase-2-plan.md` §2 Epic B bullet 를 해석한 2차 문서였고, bullet 의 표현 ("작은 보안 hardening", "typed confirmation") 을 **실제 파일 구조 확인 없이** 전개했다. 문서 작성자가 같은 AI 라도 "추상 표현 → 구현 단계 Task" 로 옮기는 단계에서 코드 감사를 거치지 않았다.
2. Plan 단계의 표준 선결 체크 항목이 **외부 서비스 계정/env/SDK 버전** 위주 (메모리 규칙: "외부 SDK/Integration 도입 전 Jayden 의 계정·프로젝트·권한·env·결제·권장 설치 순서 체크리스트"). 내부 코드 구조 (파일 존재 / 함수 시그니처 / API 경로) 는 체크리스트에 **부재**.
3. 내가 Plan 작성 시 "추상 bullet 이 코드 구조와 일치할 것" 이라 가정. Grep 1~2회면 발견되는 gap 이었지만 경로 비교표 제시 속도가 우선시됐다.

**해결**:

1. 선결 체크 단계에서 4개 항목 Grep/ls 실행 → 2건 즉시 발견 → Jayden 에게 **3가지 재진입 경로 (α 범위 유지 확장 / β B-1 축소 / γ B-3 이관)** 비교 + 현황 감사 결과표 제시 → 선택 (α) 후 **Plan 수정본** (파일 목록 대체 + UX 4결정 권장안 + 검증 전략 재정리) → 재승인 받고 Build 진입.
2. Build 완료 후에도 `epic-b-task-breakdown.md` §2.B-1 의 "DELETE /api/conversations/[id]" 경로 표기는 미정정 상태로 남김 — B-2 audit log / B-3 soft delete 에서 유사 오기가 있을 가능성이 있어 본 문서 작성 시 재검토 이월.

**규칙** ⭐:

- **Plan 내 "수정 X개" 를 쓰기 전에 각 대상 파일의 실존과 현 기능 상태를 Grep/Read 로 확인**. "계획 문서 = 코드 진실" 가정 금지. 실존 안 하는 "기존 UI" 를 기반 Plan 은 초안이지 확정 안 됨.
- **선결 체크(Step 0) 고정 체크리스트에 "계획서에 언급된 파일/API 경로의 실존 검증" 항목 추가** — 기존 외부 SDK/env/결제 체크에 내부 코드 검증을 병행.
- **Plan 수정 기회를 Build 진입 전에 항상 1회 확보** — 선결 체크 결과로 대안 경로 2~3개 제시 → Jayden 재승인 → Plan 문서화. Task template 화.
- **Epic/Phase 분해 문서 작성 시점에 실제 파일 경로·함수 시그니처 인용** — 추상 bullet ("DELETE /api/...") 그대로 옮기지 말고, 작성 시점의 코드 구조를 Grep 으로 확인 후 기록. 분해 문서가 "가짜 앵커" 가 되지 않도록.
- **Task 의 "범위 확장" 결정은 UX 설계 결정을 동반** — "신규 UI 구현" 이 Plan 변경 사유라면 UX (위치 / 플로우 / 문구) 는 Jayden 승인 대상. Build 중 즉흥 결정 금지.

---

### 2026-04-21 typed confirmation UX 의 비교 기준값 정규화 일관성 — 모든 쓰기 경로에 동일 규약 필수

**증상**: Epic B Task B-1 에서 봇 영구 삭제 typed confirmation 구현 (사용자가 봇 이름 타이핑 → 일치 시 "영구 삭제" 버튼 활성). security 리뷰 M-2 에서 봇 이름 `.trim()` 비일관성 발견:

- **생성 경로** (`src/app/bots/new/actions.ts:66`): `name: String(formData.get("name") ?? "")` — **trim 없음**. DB 에 공백 포함 이름 `"  내 봇  "` 저장 가능.
- **수정 경로** (`src/app/bots/[slug]/edit/actions.ts`): `str()` 헬퍼 — `String(fd.get(k) ?? "").trim()` — trim 적용.
- **삭제 dialog 클라이언트** (`delete-bot-dialog.tsx:56`): `confirmValue.trim() === name` — 양쪽 trim 후 exact match.
- **삭제 서버** (`deleteBotAction:1093, 1150`): `String(formData.get("confirmName") ?? "").trim()` → `confirmName !== existing.name` — 입력은 trim, 기준은 raw DB 값.

결과: 생성 시 공백 포함 이름이 저장된 봇은 소유자 본인이 삭제하려 해도 dialog 에서 input `"내 봇"` → `confirmValue.trim() === "내 봇"` vs `existing.name = "  내 봇  "` → false → 버튼 비활성. 공격 시나리오가 아니라 **소유자 본인의 정상 삭제가 실패하는 UX 버그**. 공격자가 유발할 수도 있지만 시나리오 제한적 (스스로 만든 봇을 본인이 못 지움).

**원인**:

1. Task B-1 설계 시 typed confirmation 기준값 = DB `bots.name` 으로 확정했지만, 비교 규약 (trim 적용 여부 / 대소문자 / 유니코드 정규화) 을 **쓰기 경로 양쪽** 에서 일관되게 적용하는지 검증하지 않음.
2. 2개 action 이 서로 다른 패턴 사용 — 생성은 raw `String(...)`, 수정은 `str()` 헬퍼. 정규화 정책이 **단일 출처 아님**. 생성 경로가 의도적이라기보단 "초기 구현 시 trim 추가를 잊었고 이후 다른 필드도 없어서 드러나지 않음".
3. Zod `createBotSchema` 가 `.min(1)` 만 체크하고 `.trim()` 등 transform 을 안 해서, 스키마 계층에서도 단일 출처 보장 없음.

**해결**: `createBot` 의 4필드 (name / slug / welcomeMessage / systemPrompt) 에 `.trim()` 적용 + 주석에 "typed confirmation 정합성" 명시. 근본 해결은 `createBotSchema` Zod 에 `.transform(s => s.trim())` 또는 `z.string().trim()` 으로 승격 — B-5 백로그.

**규칙** ⭐:

- **exact-match 비교 UX (typed confirmation / slug 검증 / 이름 검색 등) 도입 시, 비교 기준값이 거쳐가는 모든 쓰기 경로 (생성/수정/import/migration) 의 정규화 정책을 동일 규약으로 통일**.
- **schema 계층 정규화 우선** — Zod `z.string().trim()` 또는 `.transform(s => s.trim())` 로 스키마가 정규화하도록 승격. 각 action 에서 수동 `.trim()` 반복은 누락 위험. 단일 출처 = schema.
- **UX 비교 로직 구현 시 "기준값이 이미 정규화된 상태로 저장돼 있는가?" 를 먼저 검증** — UI 측 `value.trim() === ref` 로 해결하려 하면 UX 는 방어되지만 DB 에 비정규 데이터가 축적되는 근본 문제는 남음.
- **쓰기 경로 비대칭 발견 시 schema 승격 Task 자동 백로그** — "create 에 trim 없음 / update 엔 있음" 같은 불일치는 "단기 수동 fix + 중기 schema 승격" 두 단계로 처리. 단기 fix 만 하면 새 필드 추가 시 같은 실수 재발.
- **Zod preprocess 대신 `.trim()` chain 선호** — Zod 4.x 의 `z.string().trim()` 은 transform 을 체인 가능하며 `.min(1)` 이 trim 후 길이 기준으로 동작해 공백만 입력 거부 가능. 두 가지 정규화 (빈값 + 공백) 가 한 줄에 해결.

---

### 2026-04-21 immutable 감사 로그의 entity_id FK 의도적 부재 — 참조 대상 삭제와 증거 보존의 역설 (설계 결정)

**맥락**: Task B-2 (Audit Log) 에서 `audit_logs` 스키마 설계 시 외래 키 구성 결정. `actor_id` 는 `auth.users(id) ON DELETE RESTRICT` 로 참조하지만, `entity_id` (봇/대화 UUID) 는 **FK 없이 uuid 컬럼으로만 기록**. 처음엔 "올바른 관계형 설계 = 모든 참조는 FK" 원칙에 따라 `entity_id → bots(id)` FK 를 고려했다.

**결정 이유**:

1. **FK + CASCADE 의 역설**: `entity_id → bots(id) ON DELETE CASCADE` 로 설정하면 봇 삭제 시 해당 봇의 모든 `audit_logs` row 가 자동 삭제됨. **즉 "봇을 삭제한 사실" 에 대한 감사 증거 자체가 삭제됨** — immutable 감사 로그의 정의와 정면 충돌. 감사 로그는 참조 대상이 사라진 후에도 "언제 누가 삭제했나" 의 증거로 반드시 살아있어야 한다.
2. **FK + RESTRICT 의 역설**: `ON DELETE RESTRICT` 를 걸면 봇 삭제 자체가 불가능해짐 — 감사 로그가 있는 한 봇을 삭제할 수 없다. 이는 Task B-1 (봇 영구 삭제) 요구와 정면 충돌.
3. **FK + SET NULL 의 역설**: `ON DELETE SET NULL` 은 `entity_id` 를 NULL 로 만들지만 `entity_id NOT NULL` 제약과 충돌 + NULL 이 된 감사 로그는 "어떤 엔티티에 대한 이벤트인가" 알 수 없어 무가치.
4. **최종 선택 = FK 없이 uuid 만 기록**: 참조 무결성은 포기하고 "기록 독립성" 을 우선. B-1 permanent delete 시 봇 row 는 제거되지만 해당 봇의 `audit_logs` row 는 그대로 유지 — `entity_id` 는 가리킬 row 가 없는 **dangling uuid** 가 되지만, 감사 관점에서는 그대로가 올바름 (역사적 식별자).
5. **actor_id 는 다름**: 사용자 탈퇴는 "개인정보 삭제" GDPR 요건이고 법적으로 별도 anonymize 스크립트로 처리. `actor_id → auth.users(id) ON DELETE RESTRICT` 로 묶어 탈퇴 시 명시적 처리 요구. `entity_id` 와 비대칭.

**파생된 설계 주의사항**:

- **B-3 soft delete 복구 UI 에서 `audit_logs.entity_id` 를 복구 키로 쓰지 말 것** — permanent delete 시 dangling, soft delete 시만 유효. 복구는 항상 `bots` 테이블 직접 조회 기준. (B-2 security 리뷰 MEDIUM 지적 후 코드 주석 강화).
- **변경 이력 테이블 (Phase 3 `bot_versions`) 은 별도** — 변경 전/후 값 저장은 audit_logs metadata 에 넣지 않고 별도 테이블로. `bot_versions.bot_id → bots(id) ON DELETE CASCADE` 로 감사 로그와 다르게 설계 (변경 이력은 원본과 생사 같이).

**규칙** ⭐:

- **immutable 감사 로그 테이블은 참조 대상과 독립된 생명주기 설계** — FK 대신 uuid 컬럼만. 참조 대상 삭제 후에도 증거가 반드시 남아야 할 경우 FK 의 CASCADE/RESTRICT/SET NULL 모두 부적합.
- **FK 부재로 인한 dangling uuid 는 "그 엔티티는 이제 없음" 의 정확한 기록** — 복구 키로 오용 금지. 감사 조회 UI 는 `entity_id` 로 `bots` 를 조회할 때 null 을 정상 케이스로 처리.
- **"immutable" 테이블은 UPDATE/DELETE 정책 부재 + FK 신중** 두 축이 반드시 함께 — 한 쪽만 빠져도 증거 훼손 경로 발생. 예: UPDATE 정책 있으면 row 수정 가능, FK CASCADE 있으면 row 자동 삭제, FK RESTRICT 있으면 참조 대상 삭제 불가.
- **actor_id 는 예외**: 사용자 탈퇴는 GDPR 요건 + 명시적 anonymize 스크립트가 올바른 처리. FK RESTRICT + 탈퇴 시 스크립트가 `actor_id` 를 sentinel UUID 로 치환하는 설계가 참조 무결성 + 프라이버시 모두 충족.
- **Phase 3 `bot_versions` 같은 변경 이력 테이블은 다른 원리** — 원본과 생사 같이 가도 되는 이력은 FK + CASCADE 로 정합. "감사 증거" 와 "변경 이력" 을 같은 테이블로 묶지 말 것.

---

### 2026-04-22 shared barrel 도입 시 server-only 모듈 포함 barrel 은 barrel 자체에 `import "server-only"` 로 명시 락 (설계 결정)

**맥락**: Task B-5 (코드 품질 sweep) 에서 `src/shared/{bots,conversations,time}/index.ts` barrel 3개 생성. `conversations/index.ts` 가 `csv.ts` + `meta.ts` (둘 다 `import "server-only"`) + 클라/서버 공용 3개 (`mask-email`, `status`, `visitor`) 를 한 barrel 로 묶게 됨. 독립 code 리뷰에서 MEDIUM "barrel 경유 server-only 경계가 tree-shaking 후 silent 우회 가능성" 지적. security 리뷰는 "Next.js 정적 그래프 기반이라 안전" 반박.

**결정 이유**:

1. **두 리뷰의 교차 지점** — security 가 맞다 (Next.js Webpack/Turbopack 은 정적 import 그래프에서 `server-only` 를 만나면 즉시 차단) 하지만, code 리뷰의 "silent 우회" 시나리오는 미래 번들러 변경 / CDN edge 환경 / custom loader 에서 가능성을 남긴다. **Defense-in-depth 관점에서 비용 0 으로 barrel 레이어에 명시 락** 이 견고성을 최대화.
2. **barrel 자체를 `import "server-only"` 로 락하면** 클라이언트 컴포넌트가 실수로 barrel import 시 Next.js 가 barrel 레이어에서 즉시 차단 → 에러 추적 위치가 명확해지고 tree-shaking 종속성 0.
3. **Isomorphic 심볼 (status/visitor/mask-email) 도 barrel 에선 락됨** — 하지만 실제 client consumer 0건이고, 필요 시 세부 경로 (`@/shared/conversations/status`) 로 import 가능하므로 실효 손실 없음. "client 에서 status 를 쓸 일이 있다면 barrel 이 아니라 세부 경로" 가 오히려 명시적.
4. **경계 주석을 함께 추가** — security 리뷰 LOW 의 미래 심볼 충돌 대비 + 기여자 가이드. server-only / isomorphic 블록 구분 주석.

**파생된 import 경로 컨벤션**:

- **같은 폴더에서 2개 이상 심볼 import 하는 consumer = barrel 경로** (import 줄 수 감소)
- **단일 심볼 = 세부 경로 유지 허용** (barrel 전환 이득 없음)
- **isomorphic 심볼을 client 에서 쓸 경우 = 무조건 세부 경로** (barrel 이 server-only 락 되어있을 수 있음)
- 같은 폴더 내에 barrel 소비자와 세부 경로 소비자가 공존 OK — "심볼 개수" 가 기준.

**규칙** ⭐:

- **barrel 에 하나라도 server-only 모듈이 포함되면 barrel 자체를 `import "server-only"` 로 락** — tree-shaking / 번들러 변경 / 미래 환경 변화에 대한 defense-in-depth. 비용 0.
- **server-only / isomorphic 심볼 블록을 주석으로 구분** — 미래 기여자가 barrel 에 모듈 추가할 때 server/client 경계 실수 방지.
- **isomorphic 심볼의 client 소비는 barrel 이 아니라 세부 경로** 원칙을 learnings / CLAUDE.md 에 명시. barrel 은 "server 에서 여러 심볼 편의 import" 가 주목적.
- **config 같은 server/client 분리가 의도된 폴더는 barrel 미생성** — barrel 이 분리 경계를 희석시킬 수 있다. env.server.ts ↔ env.client.ts 는 각각 세부 경로 유지.
- **리뷰에서 code 와 security 판단이 엇갈리면 "비용 0 으로 둘 다 수용 가능한 defense-in-depth" 를 우선** — 이번 경우 barrel 에 `import "server-only"` 추가는 런타임 비용 0 + 미래 위험 차단.

---

## 2026-04-24 — Task B-4: RPC vs 앱 레이어 원가 계산 / Recharts 3.x TooltipProps

**상황**: phase-2-plan §B-4 원 스펙은 "`bot_stats` RPC 확장: `usd_cents bigint` 필드 추가". 즉 Claude 단가를 SQL 내부에서 곱해 반환하도록 설계되어 있었음. Task B-4 구현 단계에서 재검토 결과 다음 2 가지가 문제:

1. Claude 단가 변경 주기 = Anthropic 가격 정책 변경 시마다 = 예측 불가능 (월~분기 단위 가능성).
2. RPC 내부 계산이면 단가 변경 = 마이그레이션 작성 + prod 배포 = 과도한 운영 비용.

**판단**: 스펙 문구보다 운영 편의성이 상위. Plan 단계에서 Jayden 에게 결정 포인트 6건 중 하나로 명시 (6번 결정, "usd_cents 계산 위치") + 권장안 B (앱 레이어) + 스펙 수정 제안. Jayden 승인 후 반영.

**구현**: RPC (`bot_stats_daily`) 는 raw tokens 만 반환 + `src/core/pricing/claude-rates.ts` 하드코딩 상수 + `computeUsdCents(tokens, rate)` 앱 유틸. 단가 변경 = 코드 1 줄 수정. Phase 3 에 env 이관 예정.

**규칙** ⭐:

- **phase-2-plan / PRD / 설계 문서의 문구는 "가이드" 이지 "절대 규율" 이 아님** — 구현 단계에서 운영 편의성 / 변경 비용 관점으로 재평가. 스펙 수정 제안이 정당하면 Plan 단계에서 명시 후 Jayden 결정.
- **"데이터 레이어 = raw 수치, 비즈니스 로직 = 앱 레이어" 원칙** — 단가·세율·비율 등 자주 변경될 수 있는 상수는 DB 레이어 외부. DB 는 집계·필터·조인 등 데이터 변환만 책임.
- **마이그레이션 없이 변경 가능한 값 vs 마이그레이션 필요한 값 구분** — 스키마/제약/인덱스 = 마이그 / 단가/정책/라벨 = 코드 상수 → Phase 후반 env.

---

## 2026-04-24 — Task B-4: Recharts 3.x `TooltipProps` 런타임 속성 미노출 → element form 우회

**상황**: Recharts 3.8.1 의 `TooltipProps<ValueType, NameType>` 타입이 `active` / `payload` / `label` 속성을 공개 타입에 노출하지 않음 (Recharts 2.x 와 다른 동작). 커스텀 Tooltip 컴포넌트 시그니처에 `TooltipProps` 적용 시 TS2339 "Property 'payload' does not exist" 컴파일 에러.

**오답 경로**:

- `any` 캐스팅 — CLAUDE.md 금지 규칙 위반.
- `@ts-ignore` — 타입 안전성 포기.

**정답 경로**: Recharts 공식 API 는 2 가지 content 형태를 지원 — 함수 `content={(props) => ...}` / element `content={<CustomTooltip />}`. element form 을 사용하면 Recharts 가 내부에서 `React.cloneElement` 로 `active` / `payload` / `label` 을 주입 → 컴포넌트 시그니처는 **커스텀 interface** 로 받으면 됨.

```tsx
interface DailyTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DailyChartPoint }>;
  label?: string | number;
}

function DailyTooltip({ active, payload, label }: DailyTooltipProps) { ... }

// JSX:
<Tooltip content={<DailyTooltip />} />
```

**규칙** ⭐:

- **외부 라이브러리가 런타임에 주입하는 속성은 라이브러리 공개 타입에 노출되지 않을 수 있음** — 이때 공개 타입을 강제로 `import` 하지 말고, 런타임 계약(주입 속성의 구조)만 담은 **로컬 interface** 를 정의. any 없이 타입 안전 유지.
- **`cloneElement` / HOC / render prop 기반 라이브러리는 element form 을 우선 고려** — 타입 호환 이슈 회피 + 라이브러리 공식 API 존중.
- **메이저 버전 업 시 TooltipProps 등 내부 타입 형태 변경 가능성 염두** — 다음 Recharts 업데이트 시 이 우회가 여전히 필요한지 재확인 (Backlog).
- **Asia/Seoul 일별 집계는 SQL + JS 양쪽 동일 포맷 생성이 핵심** — SQL `date_trunc('day', ts AT TIME ZONE 'Asia/Seoul')::date` + `to_char('YYYY-MM-DD')` ↔ JS `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })` 둘 다 `YYYY-MM-DD` 반환 → Map 매칭 가능. KR 사용자 "오늘/어제" 직관과 일치 (UTC day 사용 시 KST 자정 근처 메시지가 다음 날로 묶임).

---

## 2026-04-24 — Task B-6: 로컬 Supabase Docker on CI (경로 C) + 비용 0 CI E2E

**상황**: Playwright E2E 를 GitHub Actions 에 도입. Jayden 의 제약 = "현재 지불 중인 서비스 외 추가 비용 없이" + "단순화". Supabase Pro 플랜이지만 **전용 `dari-ci` 프로젝트 생성 = 사용량 과금 증가 가능성** → Pro 플랜도 "추가 비용 0" 경로를 별도 탐색 필요.

**판단**: **경로 C — 로컬 Supabase Docker on CI** 채택. `supabase/setup-cli@v1` + `supabase start` 로 runner 내부에서 전체 스택 (Postgres + Auth + Storage) 기동. 외부 Supabase 트래픽 0 → 사용량 과금 0. CI 시간 +90~120s 증가 (docker image pull + init) 는 수용.

**설계 시너지 발견**:

1. **rate limit 의 `NODE_ENV !== "production"` 자동 통과 설계 (`factory.ts` Phase 0 작성)** 가 CI placeholder env 와 조합되어 **Upstash 외부 호출 완전 회피**. Pino logger 는 `NODE_ENV=development` 에서 rate limit skip → `getRedisClient()` 호출 자체가 일어나지 않음. 원래 dev 편의 설계였으나 CI 에서도 정확히 동일 논리 활용.

2. **Playwright `test.skip(condition, reason)` 파일 최상위 호출** 로 Gemini embedding 의존 spec 2개 (`bot-knowledge-sources`, `bot-knowledge-file`) 파일 전체 skip. `E2E_SKIP_EXTERNAL_API=true` 환경변수 매칭 — 로컬은 default false (실 API 실행), CI 는 true (skip). `admin()` 함수는 lazy 초기화라 skip 시 실 호출 경로 진입 안 함.

3. **`supabase status -o json` 키명 불안정성 리스크** → `-o env` 포맷 선호 (code review HIGH). CLI 버전 간 JSON 필드명이 Go PascalCase 로 달라질 수 있음 (`API_URL` vs `ApiURL`). `-o env` 는 `KEY=VALUE` 포맷이 바이너리 내부 상수로 고정 → 버전 업 내성 + 재현성.

**규칙** ⭐:

- **Pro 플랜이라도 "사용량 과금" 우려 시 로컬 Docker 경로가 유효** — 월 구독료 ≠ 사용량 과금. 새 프로젝트 추가는 월 구독 내지만 storage/compute hours 는 별도 과금 가능. 프로젝트 추가 비용 신중 평가.
- **`checkRatelimit` 의 `NODE_ENV !== "production"` 자동 통과 설계는 CI 에서 "placeholder env 만으로 통과" 를 보장** — 외부 서비스 의존 라이브러리를 사용할 때 "dev/test 에서는 skip" 설계 패턴은 CI 에도 재활용 가능.
- **Playwright 외부 API 의존 spec 은 파일 상단 `test.skip(process.env.X === 'true', reason)` 환경변수 기반 skip** — `describe` 블록 밖 최상위 호출 시 파일 전체 skip (Playwright 공식 지원). `E2E_SKIP_EXTERNAL_API` 같은 명시적 env 이름으로 의도 가시화.
- **Supabase CLI status 추출은 `-o env | grep/cut` 패턴 선호 (`-o json | jq` 비선호)** — json 키명이 CLI 버전 간 달라질 수 있으나 `-o env` 포맷의 `KEY=VALUE` 는 바이너리 내부 상수. 양끝 따옴표 제거 (`${VAR%\"}; ${VAR#\"}`) + 빈 값 검증 + `::error::` 로 조기 실패 필수.
- **`supabase init` 자동 생성 config.toml 의 기본값은 프로젝트 포트 / 정책과 불일치 가능성 점검 필수** — `site_url = http://127.0.0.1:3000` (Next.js 기본) vs Dari 는 `:4000` / `minimum_password_length = 6` vs 앱 Zod `z.string().min(8)` defense-in-depth 불일치. init 직후 수동 점검.
- **artifact (trace/video) 에 로컬 fixture service_role 키 노출 = 실 피해 0** — ephemeral Docker 컨테이너 전용 키. private repo + 1일 보존이면 sec L-2 원래 교훈 (prod 키 노출 위험) 이 이 경로에는 해당 없음. 로컬 E2E 는 여전히 prod Supabase 사용 중 = B-6b 이관 필수.

---

## 2026-04-24 Task β-4 잔여 ① PSL `tldts` 도입 — 라이브러리 도입 작업이 인접 보안 결함을 동시 노출 (origin-check `@` userinfo 주입)

**증상**: PSL `tldts` 강화 작업으로 `isValidOriginEntry` / `matchWildcard` 양 지점에 PSL 차단 추가. 독립 리뷰 단계에서 security-reviewer 가 **PSL 강화 자체와 무관한 기존 결함** 식별:

`https://*.legit.com@evil.com` 형태 entry 입력 시:

1. `WILDCARD_ENTRY_PATTERN = /^(https?):\/\/\*\.(.+)$/i` 가 `(.+)` 로 base 캡처 → `baseHostRaw = "legit.com@evil.com"`
2. `baseHostRaw.includes("*")` false / `includes(".")` true / 숫자-only false → 통과
3. `tldts.parse("legit.com@evil.com")` → `domain: "evil.com"` 반환 → `isPublicSuffixOnly` false → 통과
4. `normalizeOrigin("https://legit.com@evil.com")` → URL API 가 `legit.com` 을 username 으로 해석 → hostname=`evil.com` → `"https://evil.com"` 반환 (not null) → 통과
5. 결과: `isValidOriginEntry` true. 운영자가 의도한 `*.legit.com` 등록이 사실상 `*.evil.com` 등록으로 둔갑.

**원인**:

1. **WILDCARD_ENTRY_PATTERN 의 `(.+)` 가 너무 관대** — 정상 host 문자에는 `@` 가 없지만 정규식 입력 검증이 캡처 단계에서 그 가정을 강제하지 않음.
2. **PSL 차단이 "tldts 가 정상 도메인으로 파싱하는가" 에 의존** — tldts 는 `legit.com@evil.com` 을 "evil.com 도메인" 으로 식별 → PSL 검사 자체가 우회의 일부가 됨.
3. **normalizeOrigin 의 URL API 의존 정책** — userinfo 를 hostname 으로 정규화 (`evil.com` 추출) 은 매칭 시점 안전망이지만, **저장 시점 entry 형태 검증에서는 "운영자 의도" 와 "실 효과" 가 분리됨**. 운영자가 보는 entry 텍스트와 실제 매칭 동작이 불일치.
4. **기존 테스트가 이 케이스 부재** — `normalizeOrigin` 의 userinfo 처리 테스트 + `matchAllowedDomain` 의 evil.com 차단 테스트는 있었으나, **`isValidOriginEntry` 단계의 entry 자체 거부** 케이스는 부재.

**해결**: 3 지점 `@` 차단 + 회귀 테스트 4건.

```ts
// 1. isValidOriginEntry 진입 시점 (저장 시 strict)
if (trimmed.includes("@")) return false;

// 2. matchEntry 진입 시점 (매칭 시 robust, 이중 방어)
if (entry.includes("@")) return false;
```

이 구조로 wildcard / non-wildcard 분기, 저장 시점 / 매칭 시점 모두 단일 가드로 커버.

**규칙** ⭐:

- **외부 라이브러리 도입은 "인접 코드 재검토 기회"** — 새 의존성을 기존 검증 흐름에 끼워넣을 때, 흐름 전체 가드를 한 번 더 훑어볼 것. tldts 가 `legit.com@evil.com` 을 "evil.com 도메인" 으로 파싱한다는 사실을 알게 되어 이미 잠복했던 결함이 노출됨. 라이브러리 검토 = 자연스러운 코드 감사 트리거.
- **정규식 캡처 그룹 `(.+)` 는 의도한 문자 집합으로 좁히거나 캡처 후 명시적 거부 가드 추가** — host 캡처에 `@` 가 들어올 일 없다고 "가정" 하지 말고 명시 거부. 정상 host charset = `[a-z0-9.-]` (대소문자 무관). 보다 엄격 정규식으로 좁히는 것도 가능하나 IDN punycode 등 변형 대응을 위해 "캡처 후 거부" 패턴이 유지보수 단순.
- **저장 시점 strict + 매칭 시점 robust 이중 방어를 표준으로** — 저장 시점 스키마/refine 검증을 우회하는 경로 (DB 직접 UPDATE, migration, 레거시 데이터, admin tool, 외부 sync) 가 항상 존재한다고 가정. 매칭 시점에 한 번 더 차단.
- **운영자 의도와 실 효과의 불일치는 보안 결함 신호** — entry 텍스트 (`*.legit.com@evil.com`) ↔ 실 매칭 동작 (`*.evil.com`) 이 다르면 운영자가 의도하지 않은 origin 을 허용하게 됨. 정규화 로직이 "보이는 것" 과 "동작" 을 분리시키면 무조건 entry 형태 거부 가드 필요.
- **PSL 차단 같은 "선의의 라이브러리" 가 우회의 일부가 될 수 있음** — `isPublicSuffixOnly` 는 PSL 자체 차단이 목적이지만, 입력이 username 포함이면 라이브러리가 정상 도메인 (evil.com) 으로 파싱해서 PSL 검사 자체를 통과시킴. **라이브러리 의존 검증은 그 자체가 우회 벡터가 될 수 있음** → 라이브러리 호출 전 입력 sanitize 필수.
- **보안 리뷰 에이전트는 "PR 범위 밖 인접 결함" 을 적극 식별하도록** — 본 Task 는 PSL 강화였지만 sec H-1 은 PSL 과 무관. 리뷰 prompt 에 "변경 파일의 인접 코드 (같은 함수 내 다른 분기, 같은 파일 다른 함수) 의 결함도 보고" 명시 권장.

---

## 2026-04-24 Task β-4 잔여 ① — 외부 라이브러리 IResult 타입의 `string | null | undefined` nullable 처리 (code H-1, `tldts`)

**증상**: `tldts` 의 `parse()` 반환 타입 `IResult` 의 `domain` / `publicSuffix` 필드가 TypeScript 상 `string | null | undefined` 인데, 초안 구현에서 `=== null` (strict equal) 만 비교 → `undefined` 케이스 통과:

```ts
// 초안 (false negative 가능):
return result.domain === null || result.publicSuffix === baseHost;
```

`tldts` 가 파싱 불가 입력 (예: 비정상 host 형태) 을 받으면 `domain: undefined` 반환 가능 → `=== null` 비교는 false → `publicSuffix === baseHost` 분기 → `publicSuffix` 도 `undefined` 면 `undefined === "co.uk"` false → 차단 함수가 false 반환 → **PSL 차단 무력화**.

**원인**:

1. **TypeScript `string | null | undefined` 패턴은 흔하지만 `===` 비교는 한 쪽만 잡음** — `value === null` 은 `undefined` 를 통과시킴. 외부 라이브러리 반환 타입이 둘 다 가능하면 `==` (loose) 또는 분리 처리 필요.
2. **TypeScript 컴파일러는 "완전 비교" 를 강제 안 함** — `===` 비교가 컴파일 통과해도 런타임 의미가 다른 케이스 놓침. strict 옵션도 이 패턴은 잡지 않음.
3. **외부 라이브러리 .d.ts 의 nullable union 은 종종 unsafe 측에 가까움** — 실제 동작이 `null` 만 반환하더라도 타입은 `undefined` 도 허용. 미래 라이브러리 버전 변경에서 `undefined` 반환이 추가될 수 있음.
4. **첫 코드 작성 시 "안전 측 분기" 누락** — PSL 식별 실패 = "PSL 자체로 간주 = 안전 측 차단" 이어야 하는데, 초안은 "PSL 식별 실패 = 통과" 의 역방향.

**해결**:

```ts
// nullable + 안전 측 차단:
if (result.domain == null) return true; // null + undefined 동시 처리
if (result.publicSuffix == null) return true; // 식별 불가 = 안전 측 차단
return result.publicSuffix === baseHost;
```

세 가지 변경:

1. `==` (loose) 로 null + undefined 동시 처리
2. `publicSuffix == null` 조기 차단 (식별 불가 입력 = PSL 자체 = 차단)
3. 의미 명시 주석 추가 (왜 안전 측 = 차단인가)

**규칙** ⭐:

- **외부 라이브러리 반환 타입이 `T | null | undefined` 이면 `== null` (loose) 또는 분리 처리** — `=== null` 만 쓰면 `undefined` 가 silent 통과. 보안 검증·차단 로직에서는 false negative 직결. ESLint `eqeqeq` 규칙은 `null` 비교 예외 (`{ null: "ignore" }`) 를 허용하므로 활용 가능.
- **"식별 불가 = 안전 측 분기" 패턴 표준** — 차단/검증 함수에서 입력이 비정상이거나 라이브러리가 식별 못 하면 **차단 (true)** 으로 분기. "통과 (false)" 는 식별 성공 + 명시적 통과 케이스만. 보안 결정에서 "모르면 통과" 는 결함.
- **외부 라이브러리 IResult 같은 결과 타입 도입 시 모든 nullable 필드 한 번에 점검** — `IResult` 의 모든 필드 (`hostname`, `subdomain`, `domain`, `publicSuffix`, `domainWithoutSuffix`, `isIp`, `isIcann`, `isPrivate`) 가 어떤 input 에서 어떤 값을 반환하는지 .d.ts 또는 README 로 확인 후 사용. 초기 구현에서 한 필드만 보고 다른 필드 가정 위험.
- **`undefined` 케이스 회귀 테스트 추가 시점** — 외부 라이브러리 반환 타입에 `undefined` 가 union 에 있으면 vitest 케이스에 "라이브러리가 undefined 반환하는 input" 1개 추가. 직접 mock 으로 `undefined` 강제 가능.
- **타입 안전성 vs 런타임 안전성 분리 의식** — 타입은 컴파일 통과 시켜도 런타임 의미가 틀릴 수 있음 (특히 `===` vs `==`). 보안 코드에서는 "타입 통과" 가 "정확성" 을 보장 안 함. 코드 리뷰의 핵심 가치.
- **리뷰어가 "타입 nullable 처리" 같은 미시 디테일을 잡는 것은 보안 코드 리뷰의 정상 기능** — code H-1 처럼 "한 줄 비교 연산자 변경" 이 PSL 차단 무력화 직결. 리뷰 prompt 에 "타입 안전성 (nullable, type narrowing, assertion)" 항목 명시 효과 큼.

---

## 2026-04-24 Task β-4 잔여 ② — 외부 SDK 의 "부분 동작 지원" vs "부분 미지원" 구분 → Phase 이월 결정 패턴

**상황**: Phase 2 백로그 "Task 1-0-a 후속 #2 DariConfig 실패 카운터 복구" 조사 단계에서 Upstash Ratelimit TS SDK 공식 메서드 전수 점검.

**조사 결과**:

- `limit()` / `getRemaining()` / `blockUntilReady()` / `setDynamicLimit()` / `getDynamicLimit()` / `resetUsedTokens()` 6 메서드 존재.
- 부분 환불에 가까운 것은 `resetUsedTokens(identifier)` 단 하나. 그러나 이는 "1 차감" 이 아니라 **해당 식별자의 카운터를 0 으로 전체 리셋**.
- 예: `bot-create-limiter` (5 req/h) 에서 유저가 4회 성공 후 5회째 실패 → `resetUsedTokens` 호출 시 과거 4회 기록까지 지워져 즉시 5회 추가 가능 → **정책 우회 위험**.
- `refund` / 부분 rollback / pending 기반 commit 패턴 **없음**.

**함의**: "SDK 가 관련 메서드를 제공 = 요구사항 해결" 의 naive 매핑은 틀림. 이 경우 메서드는 존재하지만 **의미론이 다른 연산** (전체 리셋 vs 부분 차감) → 본 용도로 쓸 수 없음. SDK 없이 우회 경로 (내부 키 역공학 + `DECR`, Lua 재구현 등) 는 SDK 내부 구현 의존 / 알고리즘 호환성 / race 이슈 전부 상속 → MVP 에서 도입 부적합.

**결정**: **현상 유지 + Phase 3 이월 확정 + ADR-010 기록**. 재평가 트리거 4개 명시 (Phase 3 SaaS 진입 / 유저 불만 N건 / rate limit 타이트닝 / Upstash SDK `refund` 공식 도입).

**규칙** ⭐:

- **외부 SDK 의 메서드 이름과 의미를 분리하여 확인** — "이름이 refund / reset / undo 같아도 실제 동작이 1회 차감인지 전체 리셋인지 세분 확인". `resetUsedTokens` 이름만 보고 "환불 지원" 으로 넘어가면 정책 우회를 내장하는 결함 도입. 공식 문서 한 줄 설명 + 실 동작 테스트 1회 필수.
- **"부분 동작 지원" vs "부분 미지원" 구분** — SDK 가 근접 메서드만 제공하면 둘 중 하나: (1) 부분 동작으로도 충분한 요구사항인지, (2) 전체 동작 vs 부분 동작의 의미 차이가 정책 설계에 치명적인지. (2) 면 **내부 우회 경로는 MVP 금기** + Phase 이월이 정당.
- **내부 구현 우회의 3대 비용** — (a) SDK 내부 키 포맷 / 알고리즘 호환성 = 라이브러리 업그레이드 시 깨짐, (b) 원자성 부재 = race 보정 추가 구현 필요, (c) SDK 재구현 = 유지 비용 영구화. 비용 감수 트리거가 명확하지 않으면 이월이 더 싸다.
- **Phase 이월 결정은 "결정" 그 자체로 가치 있음** — "하지 않기로 결정" + ADR 로 재평가 트리거 4개 명시 = 미래 결정 비용을 선제적으로 지불. `[ ] 미구현` 상태로 방치하면 다음 개발자가 같은 조사를 반복. `[x] 조사 완료 → Phase 3 이월 (ADR-010)` 은 다음 결정 비용 0.
- **과금 카운터 vs abuse protection 카운터 분리 설계는 Phase 3 SaaS 진입 때 통합 재검토** — 지금 보상 카운터 구축 = Phase 3 통합 재설계 때 버려질 가능성. "나중에 어차피 재설계" 가 보이면 지금 짓지 않는 것이 효율.
- **"조사 필요 분리" 백로그 항목은 조사 한 세션 + 결정 한 세션 = 총 2 세션 내 클로징 원칙** — 영구 이월은 "조사 부재 + 결정 부재" 이중 부채. 본 Task 처럼 "조사 완료 → Phase 3 이월 확정 + ADR" 형태로 한 번에 종결하는 것이 효율 + 정신적 부담 감소.

---

## 2026-04-24 Task β-5 — server-only 모듈 내 순수 함수 위치 & 외부 SDK 응답값 유효성 가드 & 이월 LOW 항목 재평가

**상황**: Phase 2 백로그 β-4 이월 cleanup (code L-1 `buildCorsHeaders` 이중 호출 / code L-2 export route `Retry-After` 인라인 / code INFO-1 `withRetryAfter` ↔ `computeRetryAfterSeconds` 통합). 셋 다 LOW 등급이었으나 Plan 전 재평가에서 **판단이 달라진 것 1건** + **보안 리뷰가 새 이슈 발견 1건** + **공통 위치 결정에 설계 근거 필요 1건**.

**발견 1 — server-only 모듈 내 순수 함수가 client 빌드 오염 트리거**:

- `computeRetryAfterSeconds` 는 `Math.max + Math.ceil + Date.now` 만 쓰는 pure function (외부 I/O / env / SDK 의존 0).
- 기존 위치 = `src/core/security/with-allowed-origin.ts` (파일 상단 `import "server-only"`). HOC 자체는 `NextRequest`/DB/rate limiter 의존으로 server-only 정당.
- 하지만 동일 파일에서 export 되는 pure function (`computeRetryAfterSeconds`) 을 `src/shared/messages/rate-limit.ts` (Client Component 에서도 import 가능한 모듈) 이 참조하면 **빌드 체인에 server-only 가 섞임** → 일부 import 경로에서 Next.js "Server-only module was imported from a Client Component" 에러 가능.

**발견 2 — Upstash `rl.reset` 비정상값이 `Retry-After` HTTP 헤더로 그대로 노출**:

- `rl.reset` 은 epoch ms. `Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000))` 로 초 변환.
- **NaN 입력** → `NaN` 반환 → `String(NaN)` → `"NaN"` 헤더 값 삽입.
- **Infinity 입력** → `Infinity` 반환 → `"Infinity"` 헤더 값 삽입.
- RFC 6585 위반 + axios-retry 등 일부 클라이언트 라이브러리가 헤더 파싱 시 예외.
- 트리거: Upstash SDK 비정상 응답 / 시계 skew / serialize 버그.

**발견 3 — "이중 호출" 지적이 실제로는 상호 배타 경로**:

- β-4 리뷰에서 `buildCorsHeaders` 가 `jsonError` + `withAllowedOrigin` 본문 두 곳에서 호출 → "이중 호출" 지적.
- Plan 전 재검토 결과: `jsonError` 는 **실패 경로만**, 본문 line 154 는 **성공 경로만** → 두 경로는 상호 배타 → **런타임 중복 0**.
- 단순 통합 시 실패 경로별 `allowedDomains` 인자 차이 (bot load 실패=`[]` / 나머지=`bot.config.allowedDomains`) 가 손실됨. 정확성 저하.
- 의식적 설계였음 → 주석 1줄 보강으로 "왜 통합 안 했나" 문서화하는 것이 올바른 해소.

**해결**:

1. `src/shared/time/retry-after.ts` 신규 — `computeRetryAfterSeconds(resetMs, now?)` 공용 함수.
   ```typescript
   const MAX_RETRY_AFTER_SEC = 86_400; // 24시간 상한
   export function computeRetryAfterSeconds(resetMs, now = Date.now()) {
     const diff = resetMs - now;
     if (!Number.isFinite(diff)) return 1; // NaN/Infinity/-Infinity 가드
     return Math.min(MAX_RETRY_AFTER_SEC, Math.max(1, Math.ceil(diff / 1000)));
   }
   ```
2. 3 사용처 (`rate-limit.ts` / `export/route.ts` / `with-allowed-origin.ts` 내부) 모두 공용 함수 호출로 일원화.
3. `with-allowed-origin.ts` 는 로컬 선언 제거 + 하위 호환 re-export (Phase 3 제거 후보).
4. `with-allowed-origin.ts` 본문 line 154 근처에 주석 3줄 — "상호 배타, 통합 시 allowedDomains 정확성 손실" 근거 명시.

**규칙** ⭐:

- **server-only 는 "실제로 server-only 의존이 있는 함수에만"** — pure function (산술 / 문자열 조작 / 정렬 등) 은 `@/shared/...` 공용 위치에 두고, server-only 모듈에서 import 해서 쓰는 구조가 올바름. 파일 하나에 섞여 있으면 Client Component 체인에서 우회 없이 참조 불가. server-only 는 "이 함수가 server 전용 리소스 쓴다" 의 의미지, "이 파일에 server-only 가 섞여 있다" 가 아님.
- **외부 SDK 응답값이 네트워크로 재노출되는 경로 (HTTP 헤더 / 응답 body / 리다이렉트 URL / 로깅 등) 에서 유효성 가드 필수** — 최소 `Number.isFinite` / `typeof` / 범위 체크. 특히 RFC 표준 헤더 (`Retry-After`, `Retry-After-Seconds`, `Cache-Control: max-age` 등) 는 클라이언트 라이브러리가 파싱하므로 비표준 문자열 삽입은 downstream 예외 유발.
- **이월 LOW 리뷰 항목은 Plan 전 실 코드 재검토 필수** — 리뷰 시점 이후 다른 Task 에서 이미 해소됐거나 재평가 결과 "의식적 설계" 로 판명될 수 있음. "수정" 이 유일한 정답 아님 — 주석 보강으로 근거 문서화가 더 적절한 경우 많음. β-1 (formatRelative) / β-2 (as ServerEnv) / β-5 (L-1) = 세 세션 연속 자동 해소/재평가 경험 → 이월 항목 처리 표준 절차로 굳히기.
- **pure function 위치 체크리스트** — 함수 하나 만들 때 (1) server-only 리소스 쓰나? → 예: `core/...` / 아니요: `shared/...` / (2) server+client 둘 다에서 쓰일 수 있나? → 예: `shared/` / 아니요: `core/` or `app/`. 애매하면 `shared/` 로 기본값.
- **`pnpm check` (전체 게이트) 를 매 Task 종료 전 1회 실행** — β-3b 교훈 ("format:check 전체 실행") 이 β-5 세션 Ⅶ 에서 재발 (ADR-010 + ADR README 프리티어 drift). 수동 규칙만으로 부족. `pnpm check` = `typecheck && lint && format:check && test` 단일 명령으로 drift 자동 탐지.

---
