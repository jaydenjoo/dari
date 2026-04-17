# ADR-008: 환경 분리 전략 — 2환경 Lean (local + prod) + Vercel Preview

**상태**: Accepted
**작성일**: 2026-04-17
**작성자**: Jayden + Claude

## 맥락 (Context)

Dari 는 Phase 0 유지보수 기반(Epic 0-F) 마무리 단계. Soft Launch Stage 1 (dairect.kr 본인 1봇) 진입을 앞두고 **배포 환경 전략**을 선배선해야 한다. 늦추면:

- 환경변수 실수로 prod 데이터 오염 위험
- AI 키 공유 시 비용 폭발
- stg ↔ prod migration 반영 순서 혼선

그러나 **오버엔지니어링 리스크**도 크다. Dari 는 현재:

- 1인 운영 (Jayden 단독)
- 실사용자 0명, Soft Launch Stage 1 에 본인 1명 예정
- Supabase Free tier (프로젝트당 월 \$0, 유휴 일시 정지)

3환경 Full (dev / stg / prod) 을 처음부터 구축하면 **관리 복잡도 +3, 월 고정비 상승, stg DB 동기화 부담** 이 생기는데 **현 단계의 이득이 거의 없다**.

## 결정 (Decision)

**경로 A — 2환경 Lean** 을 채택한다.

- **`local`** (개발 PC) + **`prod`** (Vercel Production @ dairect.kr) 두 환경만 공식 관리
- **`preview`** 는 Vercel Preview URL 로 자동 제공. 별도 DB 없이 `dari-dev` Supabase 프로젝트를 공유
- `stg` 는 **도입하지 않음**. 대신 [docs/environments.md §10](../environments.md) 에 **재평가 기준 5개** 명시. 3개 이상 충족 시 ADR-008 갱신하며 `dari-stg` 프로젝트 추가.

## 대안 (Alternatives Considered)

### 대안 A — 2환경 Lean (local + prod) + Vercel Preview (**선택**)

- **장점**
  - Supabase 프로젝트 2개 (Free tier 내), 월 고정비 \$0
  - Vercel Preview 가 stg 역할 90% 대체 (PR 별 자동 URL, Vercel Edge 성능 실측 가능)
  - 관리 복잡도 최소. 1인 운영 규모에 적정
  - migration 반영 순서 단순: local → prod 1단계
- **단점**
  - Preview 가 `dari-dev` DB 공유 → 여러 PR 동시 작업 시 데이터 충돌 가능
  - Schema breaking change 시 prod 반영 전 검증할 "같은 스키마 + 더미 데이터" 환경 없음

### 대안 B — 3환경 Full (local + stg + prod)

- **장점**
  - Enterprise 표준. prod 배포 전 stg 에서 완전 격리된 검증
  - Schema migration 반영 전 stg 에서 실 트래픽과 유사한 환경 체크 가능
  - 팀 협업 시 명확한 책임 분리
- **단점**
  - Supabase 프로젝트 3개 (Free tier 가능하지만 유휴 정지 잦음. Pro 로 가면 \$25/월 × 2 = stg+prod)
  - stg ↔ prod 간 migration 동기화 절차 필요 (반영 누락 사고 자주 발생)
  - AI 키/Redis/Sentry 3개 환경 각각 관리 → 토큰 로테이션 부담 3배
  - **현 단계(1인, 0 사용자)에 과잉**

### 대안 C — 1환경 (local only) + prod 예고 문서만

- **장점**
  - 지금 당장 부담 제로
- **단점**
  - Task 0-F-3 취지(선배선) 정면 위배
  - Stage 1 진입 시 환경변수 혼선 재발 위험
  - "ADR-006 Sentry · 0-F-2 CI" 기반에 environment 태그가 비어 있으면 관찰성 체계 불완전

## 근거 (Rationale)

1. **규모 일치 원칙**: Dari 의 Soft Launch 4-Stage 로드맵(PROGRESS.md)은 Stage 2 에서 "지인 5~10명" 이 최대. 이 규모에 3환경은 **명백한 과잉**. 경로 B 의 모든 이득은 "팀 협업" / "실트래픽 10만+" / "SLA 가 존재하는 서비스" 에서만 회수된다.

2. **Vercel Preview 의 대체 효과**: Next.js + Vercel 조합에서 Preview URL 은 **사실상 stg**. Edge 런타임 실성능, Vercel 환경변수 격리, 빌드 로그 모두 prod 와 동일 인프라. 차이점은 DB 공유뿐인데, Dari 의 schema 변경 빈도(Phase 1~2 초반에 집중, 이후 안정화)는 "공유 DB + 재현 시나리오 문서" 로 충분히 관리 가능.

3. **비용 비대칭**: 경로 B 의 고정비는 `stg Pro 필요 시점` 에 \$25/월 발생. 경로 A 는 Stage 4(퍼블릭 런칭) 이후 실데이터 축적 전까지 \$0 유지. **"필요할 때 추가"** 가 **"처음부터 3개 준비"** 보다 안전.

4. **재평가 기준을 문서화**: 경로 A 의 유일한 실질적 리스크는 "stg 가 필요한 시점을 놓치는 것". 이를 [environments.md §10](../environments.md) 의 **5개 기준** 으로 **객관화**. 3개 이상 충족 시 자동 재평가 트리거.

5. **조기 추상화 금지 원칙** (글로벌 CLAUDE.md): "나중에 필요할 수 있으니" 미리 만드는 코드·인프라 금지. stg 는 **필요 신호가 명확해졌을 때** 도입.

## 결과 (Consequences)

### ✅ 긍정적 영향

- 월 고정비 \$0 유지 (Stage 1~3 구간)
- 관리할 환경변수 세트 2개만 (Vercel Dashboard UI 로 충분)
- migration 반영 절차 단순 (local → prod 1단계)
- Vercel Preview 가 PR 리뷰 시 live URL 제공 → 코드 리뷰 효율 ↑

### ⚠️ 부정적 영향 / 감수해야 할 비용

- Preview 에서 `dari-dev` DB 공유 → 여러 PR 동시 작업 시 충돌 가능
  - **완화책**: 각 PR 당 test user 분리 규칙 운영 (testing-accounts.md 참조)
- Schema breaking change 시 prod 반영 전 완전 격리 검증 불가
  - **완화책**: migration 을 reversible 하게 작성 (롤백 SQL 포함 — Supabase 규칙). 신중한 2단계 migration (expand → contract) 패턴 적용.
- prod 전용 키 (AI, Redis) 는 Stage 1 진입 시 신규 발급 필요
  - **완화책**: [environments.md §5-1](../environments.md) 체크리스트로 Stage 1 셋업 가이드 제공

### 🔄 재평가 트리거

다음 중 **3개 이상** 충족 시 이 ADR 을 갱신하고 `dari-stg` 추가:

1. 실사용자 10명 이상 + 유료 전환 존재
2. Schema 변경이 prod 트래픽과 충돌한 사건 3회 이상
3. PR 당 QA 소요 시간 > 1시간 (preview 로 커버 불가 시나리오 증가)
4. 팀 인원 Jayden 외 추가
5. 외부 파트너/SI 고객이 사전 승인 환경 요구

## 관련 ADR

- [ADR-001](./ADR-001-nextjs-16-app-router.md) — Next.js 16.2 + Vercel 배포 가정 (preview URL 자동 생성의 전제)
- [ADR-002](./ADR-002-supabase-ssr.md) — Supabase 일원화 (프로젝트 분리의 기반)
- [ADR-006](./ADR-006-observability-stack.md) — Sentry environment 태그로 환경 구분
- [ADR-007](./ADR-007-testing-strategy.md) — Playwright 보류 (stg 환경 필요 시점과 연동 재평가)
