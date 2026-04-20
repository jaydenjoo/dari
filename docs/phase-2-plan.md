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

### Epic A — 🔴 위젯 런타임 (PRD Task 1-4 이월)

**목표**: 사이트에 `<script src="/widget.js" data-bot-slug="..."></script>` 1줄만 넣으면 챗봇이 뜨는 런타임.

**범위**:

- `src/widget/widget.ts` (현재 42.59% 커버, 실질 빈 스텁) 실구현
- CORS + `allowedDomains` 검증 (`origin-check.ts` 활용)
- 플로팅 버튼 + 채팅 패널 UI (Config.appearance 기반 테마)
- 스트리밍 응답 표시 + 세션 관리 (visitor_id 쿠키)
- `/api/chat/[botId]` 엔드포인트 프로덕션 대응 (rate limit, CORS)
- iframe sandbox vs inline — 보안 결정
- CDN 배포 (Vercel Edge or Cloudflare)

**예상 규모**: 2~3주 (4~5 Task). 🔴 — Phase 1 "출시 가능한 MVP" 의 **마지막 퍼즐 조각**.

**선결 조건**:

- CORS allowedDomains 정책 (이미 `origin-check.ts` 있음)
- widget.js CDN 경로 결정 (`dari.kr/widget.js` vs `cdn.dairect.kr/widget.js`)
- `SUPABASE_SERVICE_ROLE_KEY` 없이 anon key 로 작동하는 chat API 검증

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

## 5. Epic A 진입 시 Task 분해 초안 (권장안 채택 시)

> 본 절은 Jayden 이 Epic A 를 승인하면 바로 착수할 수 있도록 **Task 레벨 뼈대** 만 제시. 각 Task 별 상세 Plan 은 진입 시점에 별도 작성.

### Epic A: 위젯 런타임

- **Task A-1: 현황 탐색 + 설계 결정** (2h)
  - `src/widget/widget.ts` 현재 스텁 읽기
  - CDN 경로 결정: `dari.kr/widget.js` vs `dairect.kr/widget.js`
  - iframe sandbox vs inline 선택 (보안 vs UX)
  - Config.appearance 필드 최종 확인
  - ADR-009 (widget architecture) 초안

- **Task A-2: `/api/chat/[botId]` 프로덕션 대응** (1일)
  - CORS origin 검증 (`allowedDomains` 매칭)
  - rate limit (bot 단위 + visitor 단위)
  - 비로그인 방문자 세션 (visitor_id 쿠키 + 익명 conversation 생성)
  - anon key 로 작동 검증 (service_role 쓰지 않도록)

- **Task A-3: widget.js 런타임 구현** (2~3일)
  - Vanilla JS + esbuild (기존 `scripts/build-widget.mjs` 확장)
  - 플로팅 버튼 + 채팅 패널 (shadow DOM 격리)
  - Config.appearance 테마 주입 (CSS variable)
  - 스트리밍 응답 표시 (SSE or fetch-stream)
  - 세션 관리 (localStorage + 쿠키)

- **Task A-4: 보안 검증** (1일)
  - XSS 방어 (content escape)
  - CSP 호환 검증 (nonce / unsafe-inline 금지)
  - iframe sandbox 옵션 테스트
  - 독립 리뷰 (code + security)

- **Task A-5: CDN 배포 + smoke test** (0.5일)
  - Vercel Edge (또는 Cloudflare) CDN 설정
  - `/bots/[slug]` 스니펫 URL 갱신
  - Dairect 1개 사이트에 설치 → 실동작 확인

**Epic A 예상 총 소요**: 5~7일. Phase 1 "MVP 출시 가능" 완결 시점.

---

## 6. Phase 3 (미래) 신호

아래 조건 충족 시 Phase 3 (SaaS) 재논의:

- 실사용자 50명 이상 (Dairect 통합 Dogfooding 포함)
- SI 계약 3건 이상 (월 유지보수 수익 있음)
- Dari 로 생성된 봇 10개 이상 (한 owner 복수 봇 사용 패턴 정착)
- Epic C (멀티테넌트) 착수 필수성 증가

---

## 7. 의사 결정 체크리스트 (Jayden 용)

- [ ] Epic A (위젯) 를 **첫 Phase 2 Epic** 으로 확정할 것인가?
- [ ] 위젯 CDN 호스트: `dari.kr` / `dairect.kr` / Vercel Edge 기본 도메인 중 택 1
- [ ] 위젯 스타일 격리: Shadow DOM vs iframe sandbox (각각 트레이드오프 있음)
- [ ] Epic A 소요 2~3주 수용 가능 여부 (Phase 1 출시 지연 감수)
- [ ] Epic B (운영 품질) 를 A 와 병렬 진행할지 / A 완료 후 순차 할지
- [ ] Backlog 중 A/B 진입 전 반드시 먼저 처리할 것 (예: `tsconfig.json.backup` 정리 같은 작은 것)

> 본 계획서는 Phase 2 의 **전체 지도** 를 제공. 첫 Epic 진입 승인 후 각 Task 는 글로벌 규칙에 따라 **Plan → Approve → Build** 사이클 개별 적용.
