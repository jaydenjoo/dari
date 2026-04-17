# ADR-001: Next.js 16.2 + App Router + Turbopack

**상태**: Accepted
**작성일**: 2026-04-17
**작성자**: Jayden + Claude

## 맥락 (Context)

Dari 는 한 저장소에서 세 가지를 동시에 서빙해야 한다 — (1) React 기반 SSR, (2) API Routes / Server Actions, (3) 임베드 가능한 위젯 JS. 웹 프레임워크 선택이 필요.

## 결정 (Decision)

**Next.js 16.2 + App Router (Server Component 기본) + Turbopack (dev/build 기본 번들러)** 채택.

## 대안 (Alternatives Considered)

- **Remix**: 데이터 loader 강점. 하지만 AI SDK / Supabase / shadcn 생태계가 Next 중심으로 움직여 통합 비용 증가.
- **SvelteKit**: 번들 크기 경량. React 생태계(shadcn/ui, lucide-react 등) 포기 시 디자인 시스템 자체 재구축 부담.
- **Next 15 Pages Router**: 안정. 그러나 2026년 기준 App Router 가 공식 권장, Server Component 이점 (client bundle 최소화) 포기.

## 근거 (Rationale)

- React 19 + Server Actions + Server Component 가 RAG 파이프라인 (서버 → 모델 → UI 직렬화) 에 자연스러움.
- Turbopack = Next 16 부터 dev/build 모두 안정화. webpack 대비 체감 10~30배 빠름 (HMR 2~3초).
- Vercel / Supabase / Anthropic SDK 가 Next 15~16 기준 생태계 최우선 지원.
- 프로젝트 루트 `AGENTS.md` 가 Next 16 breaking change 를 명시 → 팀/세션 지식 일원화.

## 결과 (Consequences)

- ✅ Server Component 기본 → client bundle 최소 / RAG 응답의 서버 측 직렬화 자연스러움
- ✅ Turbopack dev 생산성 확보 (HMR 2~3초, 빌드 10분 미만 목표)
- ⚠️ Turbopack 이 일부 Sentry 옵션 (`disableLogger`) 미지원 → 부분 tree-shake 손실 감수 (ADR-006 와 연동)
- ⚠️ Next 16 breaking change 학습 필수 — 새 세션/기여자는 `AGENTS.md` 를 반드시 먼저 읽음

## 관련 ADR

- ADR-006 (관찰성 스택)
- ADR-004 Planned (Widget: Preact + Shadow DOM — Phase 1)
