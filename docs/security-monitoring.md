# 보안 모니터링

> Dari 🟡 보안 등급 기준 정기 감사 가이드.
> 최종 업데이트: 2026-04-24 (Task β-3a)

## 1. 의존성 감사 (월 1회)

### 실행

```bash
# production 의존성만 (기본 권장)
pnpm audit
# → package.json "scripts.audit" 등록. 내부적으로 `pnpm audit --prod`.

# devDependencies 포함 전체 감사 (prod + dev 모두)
pnpm audit:full
# → `pnpm audit` (flag 없음 = prod+dev devDependencies 전체).
```

### 스케줄

- **매월 1일** (또는 월초 첫 평일) 수동 실행.
- CRITICAL / HIGH 취약점이 보고되면:
  1. `docs/learnings.md` 에 증상·원인·해결 기록.
  2. Phase 2 backlog (`PROGRESS.md`) 에 Fix Task 추가.
  3. 의존성 업데이트 또는 우회 전략 수립.

### 특별 주시 대상

| 라이브러리                                     | 이유                                                      | 리스크 경로                                          |
| ---------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| `unpdf` `^1.6.0`                               | `pdf-parse` fork — 상류 CVE 동기화 확인 필요              | Task 1-7-c 파일 업로드 → PDF 파싱 (사용자 입력 파서) |
| `@anthropic-ai/sdk`, `@ai-sdk/anthropic`, `ai` | LLM SDK — rate-limit / retry / streaming 로직 취약점 가능 | Task 1-6-a `/api/chat/[botId]`                       |
| `@supabase/ssr`, `@supabase/supabase-js`       | 인증·세션·RLS 의존                                        | Task 0-D Auth / proxy.ts                             |
| `@upstash/ratelimit`, `@upstash/redis`         | rate limit 인프라 — bypass CVE 시 API 보호 해제           | 전 limiter 경로                                      |
| `pino`, `@sentry/nextjs`                       | 관찰성 — 로그 주입 / SSRF 가능성                          | 로그 포맷 / Sentry webhook                           |

### 결과 기록 템플릿 (learnings.md)

```md
### YYYY-MM-DD 월간 의존성 감사 결과

**도구**: pnpm audit --prod
**결과**: CRITICAL N / HIGH M / MEDIUM K / LOW L
**조치**: <패치 적용 / Phase 2 backlog 등록 / 우회>
**규칙**: <재발 방지 규칙 또는 "특이사항 없음">
```

## 2. 수동 체크 항목 (Phase 2 단계)

GitHub Actions / Dependabot 자동화는 별도 Task (외부 연동 필요).
현재는 수동 운영으로 유지하며 아래 항목을 월 1회 함께 확인:

- **Supabase**: Authentication URL Configuration, RLS 정책 변경 여부 (Dashboard).
- **Vercel**: 환경변수 만료 · 외부 API 키 rotation 필요성.
- **Upstash Redis**: rate limit 통계 (이상 트래픽 패턴 감지).
- **Sentry**: 프로덕션 에러 빈도 · PII 누출 의심 이벤트 확인.

## 3. Phase 3 이후 자동화 후보

현재 🚫 이월. 실사용자 확보 및 SaaS 수익 모델 결정 후 재평가.

- **Dependabot** (GitHub): 월 자동 PR 생성 → 자동 감사 보완.
- **Renovate**: 세분화 스케줄 + grouping 가능.
- **GitHub Actions `pnpm audit` 월 cron**: 실패 시 Issue 자동 생성.
- **Snyk / Socket**: SCA 심층 분석 (유료).

의존: (a) CI 크레딧 비용 수용 결정 (b) 운영자 이슈 트리아지 여력 (c) 자동 PR 검토 프로세스 확립.
