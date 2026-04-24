# ADR-010: Rate limit 실패 카운터 복구 Phase 3 이월

**상태**: Accepted (2026-04-24 Task β-4 잔여 ② 조사 완결)
**작성일**: 2026-04-24
**작성자**: Jayden + Claude

## 맥락 (Context)

Dari 는 `@upstash/ratelimit` 기반으로 11 지점에 rate limit 을 적용한다.

| 레이어 | 호출 지점 | 리미터 |
| ------ | --------- | ------ |
| API Route | `/api/chat/[botId]` | `bot-chat-limiter` |
| API Route | `/api/widget-config/[botId]` | `bot-config-limiter` |
| API Route | `/api/conversations/[id]/export` | `conversation-export-limiter` |
| Server Action | `/bots/new` | `bot-create-limiter` |
| Server Action | `/bots/[slug]/edit` (url/file/remove/delete) | `bot-url-ingest` / `bot-file-ingest` / `bot-source-remove` / `bot-delete` |
| Server Action | `/bots/trash` (purge) | `bot-delete-limiter` |
| Server Action | `/bots/[slug]/conversations/[id]` delete | `conversation-delete-limiter` |
| Server Action | `/login` | `login-limiter` |

`checkRatelimit()` 은 `limiter.limit(key)` 를 호출하는 순간 **카운터가 1 소비**된다. 그 이후 작업(DB 쓰기 / 외부 API 호출 / Storage 업로드 등) 이 실패하면 **유저 관점에서 "작업 미완료 + 할당량 1회 손해"** 가 발생한다. Phase 2 백로그 우선 4 Task 1-0-a 후속 #2 에 "DariConfig 실패 카운터 복구" 로 기록되어 있었고, "조사 필요 분리" 로 이월되어 있던 항목이다.

본 ADR 은 **"실패한 작업의 카운터를 환불할 수 있는가"** 라는 질문에 대한 조사 결과와 결정 근거를 기록한다.

## 결정 (Decision)

**현상 유지 (복구 미구현) + Phase 3 SaaS 수익 모델 진입 시 재설계**.

구체적으로:

- 11 rate limit 호출 지점 모두 **fail-open 유지** (Upstash 호출 실패 시 통과, 실패한 작업 후 카운터 복구 없음).
- Upstash 공식 SDK 의 부분 환불 메서드가 없으므로 **내부 구현 우회 경로 (Redis DECR, Lua 스크립트 재구현 등) 는 MVP 단계에서 도입하지 않는다**.
- 재평가 트리거가 발생하면 Phase 3 SaaS 수익 모델 진입과 **통합하여** 카운터 분리 설계를 검토.

## 조사 (Investigation — Upstash Ratelimit SDK 메서드 검증)

`@upstash/ratelimit` 7.x 공식 문서 기준 지원 메서드 전수 조사:

| 메서드 | 기능 | 부분 환불 가능? |
| ------ | ---- | --------------- |
| `limit(id)` | 카운터 1 소비 + 결과 반환 | — |
| `resetUsedTokens(id)` | 식별자의 카운터를 **0 으로 전체 리셋** | ❌ (전체 리셋, 1회 차감 아님) |
| `getRemaining(id)` | 남은 토큰 + 리셋 시간 조회 | ❌ (조회만) |
| `blockUntilReady(id, timeout)` | 다음 window 까지 대기 | ❌ |
| `setDynamicLimit / getDynamicLimit` | 동적 리밋 조작 | ❌ |
| ~~`refund`~~ | **없음** | ❌ |
| ~~부분 rollback~~ | **없음** | ❌ |

**핵심 발견**: `resetUsedTokens` 는 "1회 환불" 이 아니라 **전체 초기화**. 예: `bot-create-limiter` (5 req/h) 에서 유저가 4회 성공 후 5회째 실패했을 때 `resetUsedTokens` 를 호출하면 **과거 4회 기록까지 모두 지워져** 즉시 5회 추가 가능 → **정책 우회 위험**.

## 대안 (Alternatives Considered)

### 경로 A. `resetUsedTokens` 사용

- **장점**: SDK 공식 지원.
- **단점**: 전체 리셋 = 정책 우회. 5회/시간 리미터에서 1회 실패 시 5회 사용 권리 전체 초기화.
- **평가**: ✖ 부적합.

### 경로 B. Redis `DECR` 직접 호출 (보상 카운터)

- **설명**: Upstash Redis REST 로 `${prefix}:${identifier}` 키 직접 `DECR`.
- **장점**: 부분 환불 가능 (1 차감).
- **단점**:
  - Upstash Ratelimit 내부 키 포맷 의존 — 라이브러리 업그레이드 시 깨짐.
  - **slidingWindow** 은 window 경계에 따라 **2개 키** 유지 (이번 window + 직전 window) → 어느 키를 decr 해야 할지 결정 로직 필요.
  - `limit()` 과 `decr()` 이 분리 호출 → 그 사이 다른 요청이 통과 시 동시성 race.
- **평가**: ✖ SDK 내부 구현 의존 + race + 알고리즘 호환성.

### 경로 C. pending / commit / rollback 추상화

- **설명**: `reserve → commit/rollback` 3단계로 앱 레이어 추상화. 복구 구현은 A 또는 B 에 위임.
- **평가**: ✖ 추상화만 추가, 근본 문제 미해결.

### 경로 D. 현상 유지 + Phase 3 이월 ⭐

- **설명**: 환불 미구현. ADR 로 결정 근거 명시, 재평가 트리거 정의.
- **평가**: ✅ **채택**.

### 경로 E. Lua 스크립트로 reserve/refund 원자적 재구현

- **설명**: SDK 우회 + `slidingWindow` 자체 구현.
- **평가**: ✖ SDK 재구현 부담 (~3h+), 유지 비용 영구.

## 근거 (Rationale)

1. **공식 SDK 부분 환불 부재** — 깨끗한 경로가 존재하지 않는다. 내부 구현 우회 (B/E) 는 SDK 버전 업 / 알고리즘 변경 시 깨질 위험을 영구 상속.

2. **MVP 단계 UX 리스크 낮음** — Dari 는 1인 바이브코딩 포트폴리오 단계. 11 리미터 중 대부분이 관대한 한도 (bot-create 5/h, login 10/h, bot-chat 30/5m 등). 실패로 "1회 손해" 가 유저 체감에 미치는 영향이 제한적이며, 실패 자체의 빈도도 낮다.

3. **Phase 3 에서 통합 재설계 효율** — SaaS 수익 모델 진입 시 "과금 카운터" (billing unit) 와 "rate limit 카운터" (abuse protection) 를 분리하는 큰 설계가 필요. 두 카운터가 분리되면 "실패 시 과금 환불" 은 트랜잭션 레이어에서, "abuse 보호 rate limit" 은 Upstash 그대로 유지하는 식의 이원화가 가능해진다. 현시점에 보상 카운터를 구축하면 Phase 3 진입 시 버려질 코드.

4. **CLAUDE.md 원칙 준수** — "요청받지 않은 기능 추가 금지" / "가장 단순한 구현 우선" / "투기적 기능 · 조기 추상화 금지" 와 일치.

## 결과 (Consequences)

### ✅ 긍정적

- 코드 변경 0 → 유지 비용 0.
- SDK 업그레이드 / 알고리즘 변경에 취약하지 않음.
- Phase 3 통합 재설계 때 깨끗한 출발점 확보.

### ⚠️ 부정적 (수용)

- 유저가 "요청 실패 시 할당량 1회 손해" 를 체감할 수 있다. 예: `bot-create` 중 DB 에러 → 유저가 실패했음에도 할당량이 1 감소.
- 로그인 실패는 상대적으로 민감 (UX 측면) 하나, `login-limiter` 는 정책상 비밀번호 brute force 방어 목적이므로 "실패 카운트 유지" 가 오히려 정책적으로 옳다.
- "챗 API 도중 Anthropic 실패" 의 경우 유저가 재시도 시 `bot-chat` 할당량 1 감소 → `bot-chat` 은 30 req/5m 라 여유가 크다. 실측 영향 미미.

## 재평가 트리거 (Re-evaluation Triggers)

다음 중 하나 이상 해당 시 Phase 3 진입 전이라도 재평가:

1. **Phase 3 SaaS 수익 모델 진입** — 과금 카운터 설계 시 통합 재평가 (1차 트리거).
2. **유저 불만 피드백 3건 이상** — "작업 실패 시 할당량 줄어드는 게 불편" 피드백이 3건 이상 누적.
3. **rate limit 정책 타이트닝** — 현재 관대한 한도 (5/h 등) 가 타이트해져 1회 손해가 실사용에 지장을 줄 때.
4. **Upstash SDK `refund` 메서드 공식 도입** — 업스트림에서 부분 환불이 추가되면 경로 A 재평가 (경로 A 만 부적합했던 이유 = 부분 환불 부재).

## 관련 ADR

- [ADR-006](./ADR-006-observability-stack.md) — 관찰성 스택 (Upstash 실패는 `logger.error` → Sentry bridge 로 기록됨. fail-open 로그 이미 존재).
- `src/core/ratelimit/factory.ts` — `checkRatelimit` 의 fail-open 정책 주석 + 재평가 포인트 명시 (security N-5 라인 100–106).

## 관련 백로그

- `PROGRESS.md` §Phase 2 백로그 우선 4 Task 1-0-a 후속 #2 — 본 ADR 으로 **조사 완료, Phase 3 이월 확정** 상태 전환.
- Phase 2 백로그 우선 2 "rate limit fail-closed 전환" (1-7-c sec LOW-1) 도 동일한 Phase 3 SaaS 신호 트리거에 묶여 있음 — 함께 ADR 작성 시 통합 고려.
