# ADR-003: Config jsonb 저장 + types 수동 유지

**상태**: Accepted
**작성일**: 2026-04-17
**작성자**: Jayden + Claude

## 맥락 (Context)

`bots.config` (봇 구성) = Zod 스키마 기반 `DariConfig` (nested 4 레벨). `messages.sources` = `MessageSource[]` 배열. 두 가지 결정이 필요했다 — (1) jsonb 단일 컬럼 저장 vs 정규화 분리, (2) Supabase types 자동 생성 vs 수동 유지.

## 결정 (Decision)

1. **jsonb 저장**: 단일 컬럼 유지. 정규화 분리하지 않음.
2. **Types 수동 유지**: `src/core/db/types.ts` + `src/core/config/schema.ts` (Zod) 가 단일 진실 공급원. `supabase gen types typescript` 자동 생성 **보류**.

## 대안 (Alternatives Considered)

- **정규화 분리** (`bot_configs`, `bot_behaviors` 등 별도 테이블): 관계형 무결성 강, 쿼리 복잡도↑, 마이그레이션 부담↑. 현 유스케이스(봇 생성/수정은 단건 writes)에 과잉.
- **자동 생성 types**: 모든 jsonb 컬럼이 `Json` 범용 타입으로 평탄화 → `config.behavior.collectEmail` 같은 깊은 필드 접근의 타입 안전성 **완전 상실**.
- **하이브리드** (자동 생성 + `Database['public']['Tables']['bots']['Row']['config']` 를 `DariConfig` 로 override): 가능. 자동 생성 파이프라인 정착 비용 필요. Epic 1 이후 재평가 여지.

## 근거 (Rationale)

- Dari 앱 코드가 `config.behavior.collectEmail`, `config.ai.model` 등 **깊은 필드를 전역에서 직접 참조**. `Json` 평탄화는 곧 런타임 에러.
- Zod 스키마(`schema.ts`) + TS types(`types.ts`) + DB check 제약 = **3중 검증** → 테이블 추가 시 수동 동기화 비용 낮음 (1~2분).
- 샘플 config 3종 (`docs/config-examples/`) + Zod `.parse({})` 기본값 패턴이 수동 유지 비용을 더 낮춤.

## 결과 (Consequences)

- ✅ 깊은 필드 타입 안전성 유지
- ✅ Zod 스키마를 client 코드에서도 동일 import 가능 (런타임 검증 공유)
- ⚠️ 테이블/컬럼 추가 시 수동 동기화 필요 — 코드 리뷰 체크리스트로 관리
- ⚠️ Epic 1 이후 jsonb 비중 감소 시 하이브리드 전환 재평가 (Post-Phase-1 TODO)

## 관련 ADR

- ADR-002 (@supabase/ssr 일원화)
- `docs/learnings.md`: "Supabase types 자동 생성 보류 결정"
