# Phase 2 진입 계획 (Epic 후보 비교 + 권장 순서)

> **역할**: Phase 1 MVP 완결 직후, Phase 2 첫 Epic 을 결정하기 위한 선택지 비교서.
> **작성**: 2026-04-20 (Task 1-8-e 리팩 + 17지점 로깅 sweep 직후)
> **대상 버전**: v0.1.0 → v0.2.0
> **관련 문서**: [PRD.md §7](./PRD.md), [PROGRESS.md](../PROGRESS.md) Backlog, [phase-1-release-checklist.md](./phase-1-release-checklist.md)

---

## 1. 현재 상태 재정리

**완료된 것 (Phase 0 + Phase 1 일부)**:

- ✅ Phase 0: 프로젝트 세팅 + DB 스키마 + Config 스키마
- ✅ Phase 1 Task 1-1: Config Loader
- ✅ Phase 1 Task 1-2: Knowledge RAG 파이프라인 (text/URL/file)
- ✅ Phase 1 Task 1-3: 대화 엔진 (Claude + RAG + system prompt)
- ✅ Phase 1 Task 1-4 (대화 로그) + Task 1-5 (관리 대시보드) — Epic 1-8 로 통합
- ✅ 후속 리팩 Task 1-8-e + 17지점 로깅 sweep

**미완 (Phase 1 안에 있어야 할 것)**:

- ⏸️ **PRD Task 1-4 (임베드 위젯 SDK)** — `widget.js` + `@dari/react` — **Phase 1 에 있었어야 하나 Epic 1-8 에 밀림**
- ⏸️ **PRD Task 1-6 (Dairect 5개 배포)** — 위젯 완성 후 가능

> **핵심 인사이트**: 위젯 런타임 이 **Phase 1 Task 1-4** 에 있었다는 사실은 쉽게 놓친다. "대시보드에서 설치 코드 스니펫을 보여주지만 실제 위젯은 없음" — 현재 `/bots/[slug]` 페이지의 베타 뱃지가 이 간극을 가리키고 있다.

---

## 2. Phase 2 Epic 후보 4종

PRD §7 Phase 2 원안 + Backlog(운영 품질) + 미완(위젯) 을 통합해 4개 Epic 으로 재정리.

### Epic A — 🔴 위젯 런타임 — 배포 + 스트리밍 전환

> **현황 재조사 결과 (Task A-1, 2026-04-21)**: Phase 1 에서 위젯 런타임은 **거의 다 구현되어 있음**. Epic A 의 실체는 "빈 스텁 실구현" 이 아니라 **"실 CDN 배포 + smoke test + 스트리밍 전환"**.

**Phase 1 완성 상태 (이미 구현)**:

- `src/widget/` **9 모듈** — widget.ts / chat.ts / ui.ts / config.ts / widget-config-client.ts / index.ts + 테스트 3건
- Shadow DOM **closed mode** + CSS 격리 + 디자인 시스템 v2 raw token 이식
- 접근성 (`role="dialog"` / `aria-modal` / `role="log"` / `aria-live="polite"` / focus 관리)
- 모바일 반응형 (`@media max-width 480px` — 풀스크린 패널)
- `scripts/build-widget.mjs` — esbuild IIFE es2020 minify. gzip **15KB 목표**. sourcemap prod OFF (sec H-2).
- `/api/chat/[botId]` **6중 보안** (bot 조회 / Origin 검증 / rate limit / 소유권 재검증 / 응답 masking / enumeration 방지)
- `/api/widget-config/[botId]` 화이트리스트 응답 + **5분 CDN 캐싱**
- `origin-check.ts` 프로덕션급 (와일드카드 `https://*.example.com`, TLD 단독 차단, IP-style 차단, trailing dot 정규화, IDN punycode)
- Prompt Injection 1차 방어 (`sanitizeUserInput` 제어문자 + 방향 문자 제거)

**Phase 2 에서 남은 것**:

- 🎯 **A-2 실 CDN 배포 (γ 경로)**: `NEXT_PUBLIC_WIDGET_CDN_URL` 환경변수화 + Vercel 기본 호스트(`dari-theta.vercel.app`) 프로덕션 검증 + `/bots/[slug]` 설치 스니펫 env 주입. **10곳 업체 테스트 완료 후** `dairect.kr` 커스텀 도메인 연결은 env 한 줄 교체로 스위치.
- 🎯 **A-3 실사이트 smoke test**: `dairect.kr` (Jayden 보유 기존 사이트) 등에 스크립트 삽입 + 데스크톱/모바일 수동 QA
- ⚙️ **A-4 스트리밍 전환**: JSON 단일 → **Vercel AI SDK Data Stream Protocol** (결정 #5 확정)
- ✨ **A-5 Dairect 4개 배포**: Chatsio / OnboardKit / SellKit / InterviewGenie / PayLoom Config 작성 + embed

**예상 규모**: **3~5일** (Phase 1 구현 선행분 반영. 기존 "2~3주" 추정치 대폭 단축).

**선결 조건**: 본 문서 §7 결정 6건 확정 (Task A-1 에서 완료).

---

### Epic B — 🟡 운영 품질 Hardening (Backlog 통합)

**목표**: 실사용자 오픈 전 "운영 안정성" 확보. PRD 에 없으나 Task 1-8 리뷰에서 누적된 Backlog 정리.

**범위** (Task 1-8 리뷰에서 식별된 건 중심):

- **audit log** — 봇 수정/삭제 이벤트 기록 (📆 RGPD/DPIA 방어)
- **soft delete** — 대화/봇 삭제 시 tombstone (`deleted_at` 컬럼) — 실 삭제는 30일 후 cron
- **rate limit 통합** — 현재 `bot-file-ingest-limiter` / `login-limiter` 만 있음. `delete conversation` / `CSV export` 등에 누락 (🟡 abuse 가능)
- **typed confirmation** — 삭제 시 "봇 이름 입력" (🟡 Epic 1-8 에서 제외한 것)
- **원가 환산** — `bot_stats` RPC 에 `usd_cents` 추가 (Claude 토큰 × 단가)
- **일별 차트** — `/bots/[slug]` KPI 섹션에 14일 차트 (Chart.js or recharts)
- **CI 현대화** — pnpm action / Playwright E2E job / coverage threshold (phase-1-release-checklist §3-3)
- **shared barrel index.ts** — 리뷰 code M-2 에서 이월

**예상 규모**: 1~2주 (6~8 Task). 🟡 — 출시 안정성 + 1-8 리뷰 부채 완결.

**선결 조건**: 없음. 즉시 착수 가능.

---

### Epic C — 🟡 멀티테넌트 기초 (PRD Task 2-3 일부)

**목표**: 한 owner 가 여러 봇을 운영하는 현재 구조 → "한 owner 가 여러 워크스페이스(고객사) 를 관리" 로 확장.

**범위**:

- `workspaces` 테이블 신규 + `bots.workspace_id` FK
- 워크스페이스 전환 UI (`/workspaces/[id]`)
- RLS 재설계 (`workspace_members` 테이블 + 권한 레벨)
- 멤버 초대 (이메일 + 역할)
- 기존 봇 기본 워크스페이스 이관 마이그레이션

**예상 규모**: 3~4주 (8~10 Task). 🟡 — 스키마 변경 광범위, 기존 데이터 이관 필요.

**선결 조건**:

- SaaS 수익 모델 결정 (Phase 3 대기 중)
- 실사용자 몇 명이라도 먼저 확보 후 결정 (현재는 overkill 위험)

---

### Epic D — 🟢 카카오톡 채널 연동 (PRD Task 2-1)

**목표**: 위젯 외 카카오톡 비즈니스 채널에서도 동일 봇 동작.

**범위**:

- Kakao i Open Builder 또는 Kakao Business API 연동 조사
- 카톡 callback → `/api/chat/[botId]` 중계 어댑터
- 카톡 메시지 포맷 ↔ Dari message 변환
- 카톡 채널 인증 토큰 관리 (env + DB)

**예상 규모**: 2주 (3~4 Task). 🟢 — 외부 API 의존. 위젯 완성 후에만 의미 있음.

**선결 조건**:

- Epic A (위젯) 완료 — 카톡은 "추가 채널" 이라 core 채팅 API 안정화 후 붙이기
- 카카오 비즈니스 채널 개설 + API 키 발급 (Jayden 개인 계정 필요)

---

## 3. 비교표 (경로 선택 판단용)

| 경로  | 범위        | 예상 규모 | 리스크                  | 출시 기여도                  | Jayden 이득                |
| ----- | ----------- | --------- | ----------------------- | ---------------------------- | -------------------------- |
| **A** | 위젯 런타임 | 2~3주     | 높음 (CDN/CORS 새 영역) | ⭐⭐⭐ "Dari 가 비로소 동작" | Dairect 5개 즉시 배포 가능 |
| **B** | 운영 품질   | 1~2주     | 낮음 (기존 코드 보강)   | ⭐ 안정성만                  | 1-8 리뷰 부채 청산         |
| **C** | 멀티테넌트  | 3~4주     | 높음 (스키마 큰 변경)   | ⭐ 확장성 준비               | Phase 3 (SaaS) 대비        |
| **D** | 카카오톡    | 2주       | 중 (외부 API)           | ⭐⭐ 채널 확장               | SI 데모 킬러 기능          |

---

## 4. 권장 순서 (Jayden 결정용)

### 권장 경로: **A → B → D → C** (출시 우선 + 안정화 + 확장)

```
1. Epic A (위젯)        ─ 2~3주 ─ Phase 1 완결, Stage 1 진입 가능
2. Epic B (운영 품질)   ─ 1~2주 ─ 출시 이후 운영 부담 감소
3. Epic D (카카오톡)    ─ 2주   ─ SI 데모 무기
4. Epic C (멀티테넌트)  ─ 3~4주 ─ 실사용자 확보 후에 결정
```

**근거**:

1. **A 를 먼저** — 현재 "대시보드만 있고 실 봇 없음". Dairect 포트폴리오 5개에 배포하려면 반드시 필요. Phase 1 "MVP" 의 실 의미가 여기서 완성.
2. **B 를 두 번째** — A 출시 후 실사용 데이터가 쌓이면 audit log / rate limit 의 가치 명확화. 선제 방어.
3. **D 는 A 이후만** — 카톡 어댑터가 호출할 "core chat API" 가 A 에서 쓸만해짐.
4. **C 는 실사용자 확보 후** — 멀티테넌트는 고객사 요청 없이 선작업 시 overkill. Jayden 개인 + Dairect 5개는 현재 "owner = workspace 동치" 로 충분.

### 대안 경로: B → A (안정 우선)

A 를 바로 가면 CORS/CDN 등 새 영역 리스크 동시 폭발. B 를 먼저 해서 1-8 리뷰 부채를 청산하고 기반을 다지는 접근. 다만 "실 위젯 없이 또 1-2주" 는 동기 부여 측면에서 risk.

### 반대 경로 (권장 안 함): C → A

멀티테넌트를 먼저 하면 위젯 개발 중 RLS 재설계와 교차. 의존성 폭발. 실사용자 0인 상태에서 멀티테넌트 선행은 YAGNI.

---

## 5. Epic A Task 분해 (결정 6건 확정 반영)

> **현실화 기준**: Phase 1 이 이미 위젯 구현 90% 완성 상태. Epic A 는 **배포 + smoke test + 스트리밍 전환**이 핵심.

### Epic A: 위젯 런타임 — 배포 + 스트리밍 전환

- **Task A-1: ADR-009 + 현황 감사** (2~3h) ✅ **완료** (2026-04-21)
  - Phase 1 위젯 코드 전수 탐색 (9 모듈 + API 2종 + origin-check)
  - 결정 6건 최신 정보 재검토 (CHIPS Safari 18.4 / AI SDK 6 / esbuild IIFE / Shadow DOM 2026)
  - ADR-009 (위젯 아키텍처) 작성
  - 본 문서 §2 / §5 / §7 현실화

- **Task A-2: 위젯 CDN γ 경로 — env 주입 + Vercel 기본 호스트 검증** (0.5일)
  - `NEXT_PUBLIC_WIDGET_CDN_URL` 환경변수화 (Zod default `https://dari-theta.vercel.app/widget.js`)
  - `/bots/[slug]` 설치 스니펫 = `env.NEXT_PUBLIC_WIDGET_CDN_URL` 주입 (하드코딩 제거)
  - Vercel Preview/Production 환경변수 등록
  - `public/widget.js` 프로덕션 빌드 체인 검증 + HTTPS 인증서 자동 발급 확인
  - Cache-Control 전략 결정 (immutable hash vs latest short-TTL) — ADR-009 Open Q #1
  - **미포함** (별도 Task, 10곳 테스트 완료 후 트리거): `dairect.kr` Vercel 커스텀 도메인 연결 + DNS 설정 + env 값 교체

- **Task A-3: Playwright cross-origin smoke + CSP 매트릭스** (0.5일) ✅ **완료** (2026-04-21)
  - Jayden 정정 반영: `dairect.kr` 는 **별개 프로젝트** (`jaydenjoo/dairect`) — Dari smoke 는 로컬 cross-origin 목업으로 재현
  - **Playwright 5 projects × 4 tests = 20 passed**: Chromium + Firefox + WebKit (데스크톱 3) + Mobile Chrome (Pixel 5) + Mobile Safari (iPhone 13)
  - 시나리오: (A) widget.js 로드·Shadow DOM host 생성 (B) Shadow DOM 격리 (host 공격적 CSS 무영향) (C) CSP strict 차단 (D) CSP permissive 허용
  - **Phase 1 잔존 버그 발견·수정**: `src/proxy.ts` matcher 에 `.js/.css/.map/폰트` 확장자 제외 누락 → `widget.js` 가 `/login` 리다이렉트되어 cross-origin embed 무력화. 확장자 제외 규칙 포괄화.
  - CSP 호환성 실측 결과 ADR-009 Open Q #4 에 기록 (Strict `script-src 'self'` → 차단 / Permissive `script-src 'self' <widget-host>` → 허용)
  - iOS virtual keyboard 상호작용 (Open Q #3) 은 device emulation 한계로 Task A-5 실기기 smoke 로 이월
  - **의식적 범위 밖**: Vercel 실배포 smoke (`dari-theta.vercel.app`) — 현재 `DEPLOYMENT_NOT_FOUND` 상태, Jayden Vercel Dashboard 수동 복구 필요

- **Task A-4: 스트리밍 전환 (Vercel AI SDK Data Stream Protocol)** (1~2일)
  - `@ai-sdk/anthropic` + `ai` 의존성 추가
  - `/api/chat/[botId]` → `streamText()` + `toUIMessageStreamResponse()` (Anthropic 네이티브 `messages.stream()` 은 SDK 내부에서 호출)
  - `widget/chat.ts` → vanilla fetch + ReadableStream 으로 SSE 포맷 파싱
  - 에러 코드 white-list 유지 (stream 중간 drop / parse_error)
  - 회귀 테스트 (network_error / 중간 disconnect / invalid JSON chunk)

- **Task A-5a: Jayden 포트폴리오 5개 봇 prod 레코드 + Vercel env** (~1~2h, 이번 세션 진행)
  - ✅ dari prod `bots` 테이블 5행 확보 (Jayden UI `/bots/new` 수동 생성, 2026-04-21)
    - `chatsio` / `findably` / `dairect` / `interviewgenie` / `dari` — **Jayden 실제 포트폴리오** (초기 가상 Dairect 브랜드 가정은 폐기)
  - ✅ Supabase `Site URL` / `Redirect URLs` 등록 (prod OAuth 로그인 성공 확인)
  - ⏳ `NEXT_PUBLIC_WIDGET_CDN_URL = https://dari-theta.vercel.app/widget.js` Vercel Production + Preview 명시 등록 (ADR-009 §9-1 γ 이행)
  - 의식적 이월: 5개 봇 Config 정교화 (systemPrompt 확장 / primaryColor / mode / allowedDomains) — 사이트 개발 완료 후 일괄 편집이 효율적. 상세 가이드 → [`dairect-bot-configs.md`](./dairect-bot-configs.md)

- **Task A-5b: 각 사이트 embed + prod smoke** (이월, 사이트 개발 완료 후 진입)
  - 각 봇 `/bots/<slug>/edit` 에서 Config 정교화 (dairect-bot-configs.md §2 가이드)
  - 5개 사이트 `<head>` 에 위젯 스니펫 삽입
  - Playwright MCP 로 각 사이트 prod SSE smoke (5/5 목표)
  - iOS 실기기 smoke (iPhone 확보 후 또는 ADR-009 Open Q #3 영구 이월)
  - PRD Task 1-6 완결

**Epic A 예상 총 소요**: **3~5일** (A-5a 까지 포함 ~3일 예상, A-5b 는 사이트 개발과 병렬).

---

## 6. Phase 3 (미래) 신호

아래 조건 충족 시 Phase 3 (SaaS) 재논의:

- 실사용자 50명 이상 (Dairect 통합 Dogfooding 포함)
- SI 계약 3건 이상 (월 유지보수 수익 있음)
- Dari 로 생성된 봇 10개 이상 (한 owner 복수 봇 사용 패턴 정착)
- Epic C (멀티테넌트) 착수 필수성 증가

---

## 7. 의사 결정 체크리스트 (Jayden 용)

> 각 결정마다 2~3 경로 비교 + 장단점 + 권장안 + `- [ ]` 선택란. Jayden 이 확정하면 **Task A-1 (설계 + ADR-009) 즉시 착수** 가능.
>
> 규칙: 기술 선택 지점마다 2~3 경로 비교표 + 권장안 명시 (Dari 프로젝트 feedback 규칙).

---

### 7-0. 메타 결정 — Epic A 진입 확정

- [ ] Epic A (위젯) 를 Phase 2 첫 Epic 으로 확정 (권장, 근거: §4 + PRD §7 Task 1-4)
- [ ] Epic A 소요 **5~7일** 수용 가능 (§5 Task 분해 기준; 본문 §2 의 "2~3주" 는 보수 추정)
- [ ] A 진입 전 저위험 Backlog **선처리 허용** (예: `tsconfig.json.backup.*` 정리, `package-lock.json` 삭제) — 본 세션에서 병행 처리

---

### 7-1. 결정 #1 — 위젯 CDN 호스트 (재작성 2026-04-21, γ 확정)

> **재작성 배경**: 초기 권장안 `dari.kr` 은 **Jayden 미보유 도메인**. 현황 감사 결과 실제 배포는 `dari-theta.vercel.app`, 기존 코드 주석은 `dairect.kr` (보유) — 3중 드리프트 발견 → `NEXT_PUBLIC_WIDGET_CDN_URL` 환경변수 추상화로 해소.

| 경로                               | 호스트 구성                                                      | 장점                                                                                                      | 단점                                                                                       | 비용 | 구현    |
| ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---- | ------- |
| **α. Vercel 기본 고정**            | `dari-theta.vercel.app/widget.js` 하드코딩                       | 즉시 작동. 추가 비용 0                                                                                    | 미래 도메인 확보 시 코드 수정 필요. 프로젝트 rename 시 URL 무효                            | 0    | 0분     |
| **β. `dairect.kr` 로 통일**        | `dairect.kr/widget.js` 하드코딩                                  | Jayden 보유. 기존 `config.ts` JSDoc / `environments.md` 와 일치. 브랜딩                                   | **10곳 업체 테스트 단계부터** "Dairect 포트폴리오 산하" 인상. Dari 독립 제품 포지셔닝 약화 | 0    | 30분    |
| **γ. env 주입 (기본 α, 나중에 β)** | `NEXT_PUBLIC_WIDGET_CDN_URL` Zod default `dari-theta.vercel.app` | 테스트 단계 즉시 작동 + 10곳 검증 후 env 1줄 교체로 `dairect.kr` 스위치. 코드·테스트·ADR 단일 진실 포인트 | env 1개 추가 관리                                                                          | 0    | 20~30분 |

**권장**: **γ** — Jayden 의 실제 타임라인("10곳 업체 테스트 → 실서비스") 과 정렬. α 의 즉시성 + β 의 브랜드 전환 유연성 양립.

**결정 근거**:

- `dari.kr` 미보유 확인(2026-04-21) — 초기 권장안 근거 `$15/yr` 비용 계산은 **Jayden 의사 결정 자원과 무관** (구입 가능 vs 구입 결심 별개).
- `dairect.kr` 보유이나 브랜드 모호성(Dairect 포트폴리오) 때문에 10곳 검증 완료 전 전환 보류.
- Vercel 기본 호스트 `dari-theta.vercel.app` 은 **프로젝트 rename 금지** 원칙 유지 시 수명 안정.
- 환경변수 추상화로 **URL 유출 지점 단일화** — `page.tsx` / `e2e spec` / `config.ts` JSDoc 모두 env 만 참조.

- [ ] α. Vercel 기본 고정
- [ ] β. `dairect.kr` 즉시 전환
- [x] **γ. `NEXT_PUBLIC_WIDGET_CDN_URL` + 기본값 `dari-theta.vercel.app` (권장, 확정 2026-04-21)**

---

### 7-2. 결정 #2 — 스타일 격리 기법

| 경로                  | 장점                                                     | 단점                                                                              | 브라우저                                | UX     | 보안   |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- | ------ | ------ |
| **a. Shadow DOM**     | 네이티브 CSS 격리. DOM 얕음. native 이벤트 (키보드·입력) | CSP `style-src` 정책과 충돌 가능. closed mode 도 완벽 격리는 아님                 | Chrome 53+ / FF 63+ / Safari 10+ (99%+) | ⭐⭐⭐ | ⭐⭐   |
| **b. iframe sandbox** | 완벽 격리 (CSS/JS/쿠키). origin 경계 확고. CSP 호환 쉬움 | iframe 리사이즈 postMessage 필요. 모바일 가상 키보드 이슈. 추가 네트워크 1 라운드 | 모든 환경 (IE 포함)                     | ⭐⭐   | ⭐⭐⭐ |

**권장**: **a. Shadow DOM** — Dari 위젯은 **대화 위젯** (결제·신분 없음). 완벽 격리의 과잉. UX 우선. 보안은 content escape + CSP `script-src 'self'` + `allowedDomains` origin 화이트리스트 3중 방어.

**예외**: 고객사가 금융·의료 사이트면 iframe 옵션 제공 — Phase 3 SaaS 시 `Config.appearance.isolation: 'iframe'` 플래그로 토글.

- [ ] a. Shadow DOM (권장)
- [ ] b. iframe sandbox

---

### 7-3. 결정 #3 — Epic A vs Epic B 병렬 여부

| 경로              | 총 소요                          | 장점                                 | 단점                                                          |
| ----------------- | -------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| **a. A → B 순차** | 6~9일 (A 5~7일 + B 1~2일 앞부분) | 단일 집중. 리뷰·커밋 깔끔. 실패 격리 | B 착수 1주 지연                                               |
| **b. A + B 병렬** | 5~7일 (A 만큼)                   | B 가 A 완료 시점에 이미 진척         | 컨텍스트 스위칭. git 브랜치 2개. 실수 유발. 1인 작업에 부적합 |

**권장**: **a. 순차** — 글로벌 CLAUDE.md "한 번에 1~2 기능만" 원칙. 1인 바이브코딩에 병렬은 오버헤드만 추가. B 는 A 완료 직후 연속 착수.

- [ ] a. 순차 (권장)
- [ ] b. 병렬

---

### 7-4. 결정 #4 — 위젯 빌드 툴

| 경로                  | 장점                                                           | 단점                                                                                         | 구현          |
| --------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------- |
| **a. esbuild (기존)** | 이미 동작 (`scripts/build-widget.mjs`). 의존성 0. ms 단위 빌드 | Vanilla JS 한정. React wrapper (`@dari/react`) 는 별도 빌드 설정 필요                        | 확장만 (30분) |
| **b. Vite lib mode**  | React wrapper 까지 동일 툴체인. HMR 지원                       | 신규 설정. 의존성 추가. 위젯은 IIFE 단일 번들이라 Vite 이점 약함. HMR 은 embed 테스트 무의미 | 신규 (2~3h)   |

**권장**: **a. esbuild 확장** — 이미 동작. 위젯은 외부 의존성 없는 IIFE 번들 하나. `@dari/react` 는 위젯 완성 후 별도 패키지로 분리 (이번 Epic 범위 밖).

- [ ] a. esbuild 확장 (권장)
- [ ] b. Vite lib mode

---

### 7-5. 결정 #5 — 스트리밍 전송 방식 (최신 정보 재검토 반영)

> **원래 이분법 "SSE vs fetch-stream" 은 outdated**. 2026 표준은 **Vercel AI SDK Data Stream Protocol** — SSE 포맷을 쓰지만 POST body 로 메시지 전송 (기존 SSE 의 GET 한계 해결). `x-vercel-ai-ui-message-stream: v1` 헤더로 CORS 경계 표준화. 미래 `@dari/react` 의 `useChat` 재사용 가능.

| 경로                                             | 장점                                                                                                                                                                            | 단점                                                                                                        | 구현 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---- |
| **a. SSE (`EventSource`)**                       | 브라우저 네이티브 auto-reconnect. `Last-Event-ID` 재연결 표준                                                                                                                   | **GET 전용** — POST body 전송 불가 → 선행 POST + 후속 GET SSE 2단계 필요. 쿼리스트링 매개변수 길이 제약     | 중   |
| **b. fetch + ReadableStream 직접**               | POST body 자연. 최소 의존성                                                                                                                                                     | 자체 포맷 정의 필요 → 미래 `@dari/react` + `useChat` 재호환 불가. Tool call / reasoning 블록 확장 시 재설계 | 낮음 |
| **c. Vercel AI SDK Data Stream Protocol** (신규) | 2026 표준. POST body + SSE 혼합. `useChat` 호환. 내부에서 Anthropic `messages.stream()` 사용. Tool call / reasoning block 확장성. `x-vercel-ai-ui-message-stream: v1` CORS 표준 | `@ai-sdk/anthropic` + `ai` 의존성 2개 추가                                                                  | 중   |

**권장**: **c. Vercel AI SDK Data Stream Protocol** — 2026 표준 + 미래 `@dari/react` 호환성 + Tool call 확장성.

**현재 구현은 JSON 단일 응답** (Phase 1 Task 1-6-a — `{conversationId, message}`). 전환 시 서버(`/api/chat/[botId]`) + 위젯(`widget/chat.ts`) 둘 다 수정 필요. Epic A 후순위 **Task A-4** 로 분리 — 배포(A-2) + smoke test(A-3) 가 우선.

- [ ] a. SSE
- [ ] b. fetch-stream 직접
- [x] **c. Vercel AI SDK Data Stream Protocol (권장, 확정 2026-04-21)**

---

### 7-6. 결정 #6 — 익명 방문자 세션 관리 (현황 재고찰)

> **Phase 1 현재 구현**: 위젯은 `localStorage.dari.widget.cid.<botId>` 에 `conversationId` 저장. 서버 `/api/chat/[botId]` 는 첫 요청 시 `visitor_id` UUID 를 발급해 DB 에 저장하고 `conversationId` 를 응답으로 반환. **쿠키 미사용**.

**원래 권장 "localStorage + HTTPOnly Partitioned 쿠키" 재고찰 결과 — 쿠키 도입 보류**:

- 쿠키 도입 시 **CORS `credentials: true`** 가 필요한데 `origin-check.ts` 가 명시적으로 금지:
  - > "`Access-Control-Allow-Credentials: true` 금지 — 위젯은 anon 전제이며 credentials 허용 시 **allow-all (빈 배열) + 동적 Allow-Origin 조합이 쿠키 탈취 벡터로 전환**"
- `allowedDomains` 빈 배열 allow-all 정책은 MVP UX 의 핵심 — 쿠키 도입 시 포기해야 함
- CHIPS Partitioned 도입 시 Safari <18.4 ITP 플래그 fallback 로직 추가 필요
- **대화 UX 관점**: `conversationId` 는 랜덤 UUID — XSS 로 탈취해도 `bot_id` 소유권 재검증(`route.ts` L264)으로 타인 대화 훔치기 불가. **쿠키 도입의 보안 이득이 미미**

| 경로                                       | Phase 1 현 구현 | 쿠키 도입 시 비용                                                                     | 세션 UX 이득 |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------- | ------------ |
| **a. localStorage + 서버 UUID** (**현행**) | ✅ 이미 동작    | —                                                                                     | 기본         |
| **b. + HTTPOnly Partitioned 쿠키**         | —               | `credentials: true` 필요 → `allowedDomains` allow-all 포기 + CHIPS fallback 로직 추가 | 미미         |

**권장**: **a. 현행 유지** — 쿠키 도입 보류. Phase 3 (멀티테넌트 + 인증) 시점에 사용자 로그인 기반 세션 설계와 함께 재평가.

> **변경점 근거**: Task A-1 현황 감사에서 `origin-check.ts` 의 "credentials 금지" 원칙이 MVP `allowedDomains` allow-all 정책과 불가분 결합된 것을 확인 → 원래 권장 "쿠키 추가" 는 이 보안 계층을 깨뜨림. 현 구현이 최적.

- [x] **a. localStorage + 서버 UUID (현행 유지, 확정 2026-04-21)**
- [ ] b. + HTTPOnly Partitioned 쿠키

---

### 7-7. 결정 확정표 (2026-04-21)

| #   | 결정          | Jayden 선택                                                                                                                         | 확정일     |
| --- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0   | Epic A 진입   | ✅ 진행 (5~3일 — Phase 1 구현 선행분 반영 단축)                                                                                     | 2026-04-21 |
| 1   | CDN 호스트    | **γ. `NEXT_PUBLIC_WIDGET_CDN_URL` env + 기본 `dari-theta.vercel.app`** (10곳 테스트 후 `dairect.kr` 스위치) — **재작성 2026-04-21** | 2026-04-21 |
| 2   | 스타일 격리   | **a. Shadow DOM (closed mode)** — Phase 1 구현 유지                                                                                 | 2026-04-21 |
| 3   | A/B 병렬      | **a. 순차** (A → B)                                                                                                                 | 2026-04-21 |
| 4   | 빌드 툴       | **a. esbuild 확장** — 이미 동작 중 (`scripts/build-widget.mjs`)                                                                     | 2026-04-21 |
| 5   | 스트리밍 방식 | **c. Vercel AI SDK Data Stream Protocol** — 2026 표준 (권장 변경)                                                                   | 2026-04-21 |
| 6   | 세션 관리     | **a. localStorage + 서버 UUID** — 현행 유지 (쿠키 도입 보류)                                                                        | 2026-04-21 |

> **다음 단계**: Task A-2 γ 경로 (env 주입 + Vercel 기본 호스트 검증) — 본 세션에서 구현 진입. ADR-009 에 본 결정 7건 전체 근거 기록.

---

> 본 계획서는 Phase 2 의 **전체 지도** 를 제공. 첫 Epic 진입 승인 후 각 Task 는 글로벌 규칙에 따라 **Plan → Approve → Build** 사이클 개별 적용.
