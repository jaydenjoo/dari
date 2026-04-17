# Architecture Decision Records (ADR)

이 폴더는 Dari 프로젝트의 주요 아키텍처 결정을 기록합니다.

## ADR란?

**Architecture Decision Record** = "왜 이 방식을 선택했는가"를 미래의 나(또는 팀)에게 남기는 메모.
코드는 **무엇을**(what) 보여주지만 ADR은 **왜**(why)를 남깁니다.

## 작성 시점

다음 상황에서 반드시 ADR을 작성합니다:

- 라이브러리/프레임워크 선택
- 중요한 아키텍처 변경
- 기술적 트레이드오프 (A vs B 고민 끝에 결정)
- 기존 방식 폐기 (deprecation)

## 템플릿

새 ADR 작성 시 `ADR-NNN-title.md` 형식으로 저장:

```markdown
# ADR-NNN: 제목

**상태**: Proposed / Accepted / Deprecated / Superseded by ADR-XXX
**작성일**: YYYY-MM-DD
**작성자**: Jayden + Claude

## 맥락 (Context)

어떤 상황/문제에 직면했는가.

## 결정 (Decision)

무엇을 선택했는가.

## 대안 (Alternatives Considered)

- **대안 A**: (장단점)
- **대안 B**: (장단점)

## 근거 (Rationale)

왜 이 선택이 최선인가. 어떤 트레이드오프를 수용했는가.

## 결과 (Consequences)

- ✅ 긍정적 영향
- ⚠️ 부정적 영향 / 감수해야 할 비용

## 관련 ADR

- ADR-XXX
```

## 인덱스

| #                                        | 제목                           | 상태     | 작성일     |
| ---------------------------------------- | ------------------------------ | -------- | ---------- |
| [000](./ADR-000-index.md)                | ADR 시스템 도입                | Accepted | 2026-04-17 |
| [001](./ADR-001-nextjs-16-app-router.md) | Next.js 16.2 + App Router 채택 | Planned  | -          |
| [002](./ADR-002-supabase-drizzle.md)     | Supabase + Drizzle ORM 조합    | Planned  | -          |
| [003](./ADR-003-config-jsonb.md)         | Config JSONB 저장 방식         | Planned  | -          |
| [004](./ADR-004-preact-shadow-dom.md)    | Widget: Preact + Shadow DOM    | Planned  | -          |
| [005](./ADR-005-plugin-interfaces.md)    | Plugin 인터페이스 설계         | Planned  | -          |

> **Planned**: 해당 Epic 진행 시 작성 예정
