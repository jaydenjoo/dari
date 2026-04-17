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
