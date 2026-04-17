# 교훈 기록 (Compound Engineering)

> **기록 원칙**: 증상 → 원인 → 해결 → **규칙** (규칙이 핵심)
>
> **기록 트리거**:
>
> - 에러 2회 이상 반복
> - 30분 이상 소요된 문제
> - AI가 방향을 이탈한 케이스
> - 설계 결정 (왜 이 방식을 선택했나)
>
> **기록 안 함**: 단순 오타, 1분 해결, 일회성 환경 문제

---

## 템플릿

### [날짜] 제목

**증상**: 무엇이 어떻게 잘못됐는가

**원인**: 왜 그랬는가 (근본 원인까지)

**해결**: 어떻게 고쳤는가

**규칙** ⭐: 다음엔 이렇게 하면 재발 방지

- 규칙 1
- 규칙 2

---

## 기록

### 2026-04-17 계획 수립 시 3대 우선순위 명시적 검증 필요 (설계 결정)

**증상**: 초기 마스터 플랜 v1.0은 기능 나열 중심이었으나, 안정성(P1) 40점으로 치명적 부실.
테스트 전략 없음 / 에러 처리 아키텍처 없음 / 로깅·관찰성 없음 / Rate limiting 없음 / Prompt Injection 방어 없음 / CORS·도메인 화이트리스트 없음 등 12개 누락.

**원인**: 기능 중심(MoSCoW) 사고에 갇혀 비기능 요구사항(NFR = 안정성·유지보수·확장성)을 뒤로 미룸. "구현 먼저, 안정성은 나중에" 마인드는 나중에 벽을 뜯어야 하는 재공사로 이어짐.

**해결**: Jayden의 3대 우선순위 확인(1. 안정성 > 2. 유지보수 > 3. 확장성)에 맞춰 마스터 플랜 v3.0 재설계.

- Epic 0-E (안정성 기반) 추가: Vitest/Playwright/Pino/Sentry/Health check
- Epic 0-F (유지보수 기반) 추가: ADR/CI/환경 분리/모듈 README
- Epic 0-G (확장성 기반) 추가: Plugin 인터페이스/EventBus
- Task 1-0 (보안 기반) 추가: Rate limit/CORS/Prompt Injection 방어

**규칙** ⭐:

- 계획 수립 시 **항상 P1/P2/P3에 대해 명시적 검증 섹션을 포함**할 것. "기능 나열 → 끝"은 부실 계획.
- 각 Task 종료 기준에 **"테스트 작성 + 에러 처리 + 로깅"을 공통 필수**로 편입.
- 안정성·관찰성 장치는 **Phase 0에 선배선**. 기능 다 올린 후 박아넣기는 불가능에 가까움.

---

### 2026-04-17 개발 완료와 공개 공지 분리 사고의 함정 (설계 결정)

**증상**: 프로젝트 완료 후 데모 별도 제작하려는 사고 패턴 확인됨. 이는 완벽주의 함정 → 영영 공개 못 함.

**원인**: "개발 ≠ 공개" 이분법. 실제로는 **실배포가 곧 검증 수단**이며, 혼자만의 완성 기준은 끝없이 올라감.

**해결**: Soft Launch 4 Stage 전략을 플랜에 편입.

- Stage 1 (사일런트 배포, Day 14): dairect.kr 1개 봇 본인만 사용
- Stage 2 (클로즈드 베타, Day 15): 3개 봇 + 지인 5~10명
- Stage 3 (소프트 오픈, Day 17~18): 랜딩 공개 + 블로그
- Stage 4 (퍼블릭 런칭, Day 18): 포트폴리오 등록 + SI 영업 개시

**규칙** ⭐:

- 개발과 공개를 **한 로드맵에 병합**할 것. Phase 1.5부터 실배포 시작.
- "완성의 기준"을 **Go/No-Go 기준으로 고정**. 감정적 완벽주의 방지.
  예: Stage 1 → 2: "내가 3일 사용해보고 싫지 않다", Stage 2 → 3: "테스터 10명 중 6명 '또 쓰겠다'"
- 데모는 별도 제작물이 아님. **실배포된 인스턴스 = 라이브 데모**. 별도 제작 비용 0.

---

### 2026-04-17 Write 도구가 `.env*` 파일 생성 차단 (기술 이슈)

**증상**: `.env.example` 생성 시 Write + Bash heredoc 모두 `Permission denied`.

**원인**: Claude Code 보안 정책이 모든 `.env*` 파일 생성을 원천 차단 (실제 비밀 유출 방지 목적). 내용이 템플릿이어도 차단됨.

**해결**: `docs/env-template.md` 로 대체 — 기능 동일, 관례만 다름. `.gitignore`에 `!.env.example` 예외 규칙은 미리 추가해둠 (미래 대비).

**규칙** ⭐:

- `.env*` 파일은 Claude가 **생성 불가**. 실제 값은 **Jayden이 직접 생성** 필수.
- 환경변수 템플릿은 `docs/env-template.md` 에 작성 → Jayden 이 복사해서 `.env.local` 만듦.
- 관례(`.env.example`)를 지키지 못할 때는 **명시적 대체 문서 + 이유 주석** 남길 것.

---

### 2026-04-17 Zod 4.x `.default({})` 엄격 타입 체크 (기술 이슈)

**증상**: nested Zod schema에 `.default({})` 사용 시 TS2769 에러 5개 발생.
예: `behaviorSchema.default({})` → "Argument of type '{}' is not assignable..."

**원인**: Zod 4.x는 `.default()`의 값 타입을 output 타입으로 엄격 검증. inner 필드 모두에 default가 있어도 TS 입장에선 output 타입에 **모든 필드가 필수로 표기**됨.

**해결**: `schema.default(schema.parse({}))` 패턴 — 모듈 로드 시 각 default가 합쳐진 완전한 객체를 생성해 전달.

```ts
// ❌ Zod 4.x에서 타입 에러
behavior: behaviorSchema.default({}),

// ✅ 모듈 로드 시 완전한 default 객체 생성
behavior: behaviorSchema.default(behaviorSchema.parse({})),
```

**규칙** ⭐:

- Zod 4.x에서 **nested object에 빈 default**를 주려면 `schema.default(schema.parse({}))` 패턴 사용.
- 각 inner 필드에 default가 모두 있어야 `parse({})`가 성공 → 이 전제가 깨지면 모듈 로드 단계에서 실패 감지 가능 (좋은 조기 경고).
- 함수형 default `default(() => schema.parse({}))` 도 가능하나, 값 default가 TS 추론과 더 잘 맞음.

---
