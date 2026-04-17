# Features — Feature-Based 아키텍처 (v9.3)

## 절대 규칙 ⭐

1. **비즈니스 기능은 반드시 이 폴더 아래 배치**
2. **외부 노출은 각 feature의 `index.ts`만** (Public API 경계)
3. **다른 feature의 내부 파일 직접 import 금지**
   - ✅ `import { LoginForm } from '@/features/auth'`
   - ❌ `import { LoginForm } from '@/features/auth/components/LoginForm'`

## 표준 폴더 구조

```
features/{name}/
├── components/           UI (React 컴포넌트)
├── actions/              서버 액션 (또는 api/ Route Handler)
├── hooks/                React 훅
├── lib/                  feature 내부 헬퍼
├── types.ts              타입 정의
├── schema.ts             zod 검증 스키마
└── index.ts              ⭐ Public API (외부 노출 창구)
```

## Feature 경계 판단 기준

**features/에 들어가는 것**:

- 비즈니스 기능 (auth, payment, dashboard 등)
- 특정 도메인의 UI + 로직 묶음
- 다른 feature 없이도 독립 작동 (인프라 제외)

**shared/에 들어가는 것**:

- 여러 feature가 공유하는 UI 컴포넌트 (Button, Input)
- 순수 유틸 함수 (formatDate, cn)
- 환경변수, 설정 (config/env.ts)

**가이드**: 2개 이상 feature가 쓰면 → shared/로 이동

## 의존 방향

```
app/ (페이지)
  ↓ 사용
features/{name}/index.ts
  ↓ 내부 사용
features/{name}/components, hooks, lib, ...
  ↓ 공통 인프라
shared/ui, shared/lib, shared/config
  ↓
외부 라이브러리 (react, next, zod, ...)
```

**금지**: features → 다른 features (단, auth는 인프라 예외)
**금지**: shared → features

## 관련 문서

- 바이브코딩 통합가이드 v9.3 Part B #13~#15
- 모듈 카탈로그 v1.0 (재사용 가능한 feature 템플릿)
