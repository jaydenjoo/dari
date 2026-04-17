# `@/core/db` — Supabase 데이터베이스 클라이언트 모듈

Supabase 클라이언트를 **실행 환경별로 분리**해 런타임 실수를 방지한다. Drizzle 등 ORM 은 사용하지 않으며 `@supabase/ssr` + `@supabase/supabase-js` 로 일원화 (ADR-002).

## 파일

| 파일                | 역할                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `client-browser.ts` | 브라우저 런타임 (`NEXT_PUBLIC_*` 키만 사용) — `createClient()`                |
| `client-server.ts`  | SSR / Route Handler / Server Action (쿠키 기반 세션) — `async createClient()` |
| `client-admin.ts`   | 관리자 전용 (`SUPABASE_SERVICE_ROLE_KEY`, RLS 우회) — `createAdminClient()`   |
| `types.ts`          | Supabase CLI 자동 생성 `Database` 타입 + 수동 유지 enum/RPC 타입              |
| `index.ts`          | **타입만** re-export (런타임 클라이언트는 환경별 직접 import 강제)            |

## 공개 API

```ts
// 타입 (어디서나)
import type {
  Database,
  BotStatus,
  ConversationStatus,
  MessageRole,
  MessageSource,
  KnowledgeSourceType,
  KnowledgeChunkMatch,
} from "@/core/db";

// 런타임 클라이언트 — 경로로 환경 구분 (함수 이름 `createClient` 는 동일).
// 실무 권장: 한 파일에서 둘 다 참조 시 `as` alias 로 혼동 방지.
import { createClient as createBrowserClient } from "@/core/db/client-browser";
import { createClient as createServerClient } from "@/core/db/client-server"; // async
import { createAdminClient } from "@/core/db/client-admin";
```

## 의존성

- `@supabase/ssr` — 쿠키 기반 세션 (브라우저/서버 클라이언트)
- `@supabase/supabase-js` — 관리자 클라이언트, 타입
- `@/shared/config/env` — 키 검증

## 타입 생성 규칙

```bash
# DB 스키마 변경 후
supabase gen types typescript --project-id <ref> > src/core/db/types.ts
```

- CLI 자동 생성 + **수동 augmentation**: `BotStatus`, `MessageRole`, `KnowledgeChunkMatch` 등 enum / RPC 반환 타입은 수동 유지 (ADR-003)
- 타입 갱신 후 `pnpm tsc --noEmit` 으로 전체 호환성 확인

## 관련 ADR

- [ADR-002](../../../docs/adr/ADR-002-supabase-ssr.md) — Drizzle 제외, @supabase/ssr 일원화
- [ADR-003](../../../docs/adr/ADR-003-config-jsonb.md) — Config 는 `bots.config` jsonb 저장

## 제약·주의사항

- **`client-admin` 은 서버 런타임에서만 호출**. 브라우저 번들에 섞이면 `SUPABASE_SERVICE_ROLE_KEY` 노출 → DB 전체 장악 위험
- RLS 정책은 `supabase/migrations/0006_rls.sql` (Epic 0-B-Post, Auth 완료 후 활성화) 예정. 현재 미활성화 — [environments.md §9](../../../docs/environments.md) RLS 경고 준수
- `select('*')` 금지 — 필요한 컬럼만 명시 (글로벌 규칙)
- 반환값은 항상 `{ data, error }` 구조분해 후 `error` 체크 (글로벌 규칙)
- `client-server` 의 `createClient` 는 **async** — 호출 시 `await` 필수
