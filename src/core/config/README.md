# `@/core/config` — Config 스키마 모듈

Dari 챗봇의 **정체성**(이름·프롬프트·지식·외형)을 JSON 하나로 표현한다.
이 모듈이 Config 스키마 정의, 타입 export, 버전 마이그레이션을 담당한다.

## 파일

| 파일            | 역할                                                |
| --------------- | --------------------------------------------------- |
| `schema.ts`     | Zod 스키마 + TS 타입 (`DariConfig`, `BehaviorMode`) |
| `migrations.ts` | 버전간 Config 변환 (v1.0 → v2.0 등)                 |
| `index.ts`      | re-export                                           |

## 사용법

```ts
import { dariConfigSchema, migrateAndValidate } from "@/core/config";

// 1. 새 Config 검증 (정상 경로)
const config = dariConfigSchema.parse(rawJson);

// 2. 버전 섞인 legacy Config 검증 (마이그레이션 포함)
const config2 = migrateAndValidate(legacyJson);
```

## 샘플 Config

`docs/config-examples/` 참고:

- `chatsio.json` — support mode (쇼핑몰 고객응대)
- `onboardkit.json` — faq mode (신입 온보딩)
- `dairect-portfolio.json` — sales mode (포트폴리오 안내)

## 스키마 변경 시

1. `schema.ts` 수정
2. `CURRENT_CONFIG_VERSION` 상수 bump (1.0 → 1.1 등)
3. `migrations.ts` 에 이전 버전 → 새 버전 변환 함수 추가
4. ADR 작성 (`docs/adr/ADR-NNN-config-schema-vN.md`)

## 공개 API

```ts
import {
  dariConfigSchema,
  migrateAndValidate,
  CURRENT_CONFIG_VERSION,
  type DariConfig,
  type BehaviorMode,
  type AIModel,
} from "@/core/config";
```

`index.ts` 는 `schema.ts` + `migrations.ts` 전체 re-export. 서브 스키마 (`identitySchema`, `aiSchema`, `behaviorSchema`, `appearanceSchema` 등) 와 세부 타입 (`Identity`, `Behavior`, `Appearance` …) 도 동일 경로에서 접근 가능.

## 의존성

- `zod` — 스키마 검증
- 내부: 없음 (standalone 모듈)

## 관련 ADR

- [ADR-003](../../../docs/adr/ADR-003-config-jsonb.md) — Config jsonb 저장 + types 수동 유지

## 제약·주의사항

- **`bots.config` jsonb 컬럼에 저장** — DB 스키마 변경이 아니라 Config 버전 bump 로 진화 (ADR-003)
- Zod 4.x nested default 패턴: `schema.default(schema.parse({}))` 필수 ([learnings.md](../../../docs/learnings.md) — "Zod 4.x `.default({})` 엄격 타입 체크" 교훈)
- 마이그레이션 함수는 reversible 하게 작성 (롤백 가능성 고려)
- 새 버전 도입 시 `docs/config-examples/` 3종 샘플 테스트 통과 확인
