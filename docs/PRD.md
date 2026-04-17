# PRD: Dari — 범용 AI 챗봇 엔진

> **프로젝트명:** Dari — 초기 설정만으로 어떤 프로젝트에든 배포되는 AI 챗봇 엔진
> **포트폴리오 번호:** Portfolio #4 (전면 재설계)
> **버전:** 2.0
> **작성일:** 2026-04-17
> **보안 등급:** 🟡 부분 보안 (고객 대화 데이터 포함)
> **핵심 원칙:** "한 번 만들고, 설정만 바꿔서 무한 복제"

---

## 1. Executive Summary

### 한줄 정의

**하나의 챗봇 엔진**을 만들고, JSON 설정 파일 하나만 바꾸면 쇼핑몰 고객응대·SaaS 온보딩 안내·면접 코칭·사내 FAQ 등 **어떤 프로젝트에든 5분 안에 배포**되는 범용 AI 챗봇 플랫폼

### Dari의 핵심 아이디어 — "챗봇의 워드프레스"

```
워드프레스: 하나의 엔진 + 테마/플러그인 설정 = 어떤 웹사이트든

Dari: 하나의 챗봇 엔진 + 설정(Config) = 어떤 챗봇이든

  Config 1개만 바꾸면:
    ├─ Chatsio용 → 카페24 쇼핑몰 고객응대 챗봇
    ├─ OnboardKit용 → 신입사원 온보딩 FAQ 봇
    ├─ InterviewGenie용 → 면접 코칭 대화 봇
    ├─ SellKit용 → 상품 안내 + 구매 유도 봇
    ├─ dairect.kr용 → 포트폴리오 소개 봇
    ├─ 고객사 A → 학원 수강 상담 봇
    ├─ 고객사 B → 병원 진료 예약 봇
    └─ 고객사 C → 부동산 매물 안내 봇
```

### 왜 이렇게 설계하는가?

**1. Jayden의 실제 문제 해결**
Jayden은 6개 이상의 프로젝트를 동시에 진행합니다. 각 프로젝트마다 챗봇을 처음부터 만들면 6배의 시간이 소요됩니다. Dari 엔진 하나를 만들고 Config만 바꾸면 **모든 프로젝트에 5분 안에 챗봇 추가**.

**2. SI 수주의 킬러 데모**
고객사 미팅에서 "여러분의 비즈니스에 맞는 AI 챗봇을 지금 바로 만들어드리겠습니다" → 미팅 중에 Config 입력 → 5분 후 동작하는 챗봇 시연. 이것만으로 계약 성사 가능.

**3. SaaS 확장성**
하나의 멀티테넌트 플랫폼으로 여러 고객사에게 동시 서비스 → 월 구독 수익.

---

## 2. 문제 정의

### 현재 문제 — 프로젝트마다 챗봇을 새로 만든다

```
프로젝트 A에 챗봇 필요:
  → 프롬프트 설계 (2시간)
  → UI 컴포넌트 개발 (4시간)
  → API 연동 (3시간)
  → 테스트 (2시간)
  → 총 11시간

프로젝트 B에도 챗봇 필요:
  → 또 프롬프트 설계 (2시간)
  → 또 UI 개발 (4시간)  ← 거의 같은 UI를 또 만듦
  → 또 API 연동 (3시간)  ← 거의 같은 API를 또 만듦
  → 또 테스트 (2시간)
  → 총 11시간

6개 프로젝트 = 66시간 = 약 2주

Dari 방식:
  엔진 1번 개발 (20시간) + Config 6개 (각 30분) = 23시간
  → 시간 절약: 65% (43시간 절감)
```

---

## 3. 타겟 사용자

### 사용자 1: Jayden 본인 (내부 사용)

- 모든 Dairect 프로젝트에 챗봇 위젯 삽입
- Config만 바꿔서 프로젝트별 맞춤 챗봇 즉시 배포

### 사용자 2: SI 고객사 (B2B)

- "우리 사이트에 AI 챗봇 넣어주세요" → Config 작성 → 5분 배포
- 월 유지보수 계약 → 반복 매출

### 사용자 3: 셀프서비스 사용자 (Phase 3)

- 대시보드에서 직접 설정 → 코드 복사 → 사이트에 붙여넣기
- SaaS 구독 모델

---

## 4. 핵심 설계 — Config 기반 범용 엔진

### Config 구조 — 이것 하나가 챗봇의 정체성을 결정한다

```json
{
  "botId": "chatsio-support",
  "version": "1.0",

  "identity": {
    "name": "챗시오 도우미",
    "avatar": "https://cdn.example.com/chatsio-avatar.png",
    "welcomeMessage": "안녕하세요! 챗시오 AI 도우미입니다. 쇼핑몰 운영에 관해 궁금한 점을 물어보세요.",
    "placeholder": "질문을 입력하세요...",
    "language": "ko"
  },

  "ai": {
    "model": "claude-sonnet-4-6",
    "systemPrompt": "당신은 챗시오(Chatsio) 고객 지원 AI입니다. 카페24 기반 쇼핑몰 운영자의 질문에 친절하고 정확하게 답변합니다. 모르는 질문은 '담당자에게 연결해드리겠습니다'라고 안내합니다.",
    "temperature": 0.7,
    "maxTokens": 1024,
    "ragEnabled": true
  },

  "knowledge": {
    "sources": [
      {
        "type": "url",
        "urls": ["https://chatsio.kr/docs", "https://chatsio.kr/faq"]
      },
      {
        "type": "file",
        "files": ["chatsio-manual.pdf", "pricing-guide.md"]
      },
      {
        "type": "text",
        "content": "챗시오 요금: Basic 월 49,000원, Pro 월 99,000원..."
      }
    ]
  },

  "behavior": {
    "mode": "support",
    "fallbackMessage": "죄송합니다, 이 질문에 대해서는 담당자에게 연결해드리겠습니다.",
    "collectEmail": true,
    "collectEmailPrompt": "더 자세한 안내를 위해 이메일을 남겨주시겠어요?",
    "businessHours": {
      "enabled": true,
      "timezone": "Asia/Seoul",
      "hours": "09:00-18:00",
      "offHoursMessage": "현재 업무 시간이 아닙니다. 남겨주시면 익일 답변드리겠습니다."
    },
    "handoff": {
      "enabled": true,
      "trigger": "상담원 연결",
      "channel": "kakao"
    }
  },

  "appearance": {
    "theme": "light",
    "primaryColor": "#0891b2",
    "position": "bottom-right",
    "buttonSize": 56,
    "borderRadius": 16,
    "fontFamily": "Pretendard"
  },

  "analytics": {
    "enabled": true,
    "webhookUrl": "https://n8n.dairect.kr/webhook/dari-analytics"
  }
}
```

### Config만 바꿔서 다른 프로젝트에 적용하는 예시

#### Chatsio용 (쇼핑몰 고객응대)

```json
{
  "identity": { "name": "챗시오 도우미" },
  "ai": {
    "systemPrompt": "카페24 쇼핑몰 운영자의 질문에 답변합니다...",
    "ragEnabled": true
  },
  "knowledge": {
    "sources": [{ "type": "url", "urls": ["https://chatsio.kr/docs"] }]
  },
  "behavior": { "mode": "support", "collectEmail": true },
  "appearance": { "primaryColor": "#0891b2" }
}
```

#### OnboardKit용 (신입사원 FAQ)

```json
{
  "identity": {
    "name": "온보딩 도우미",
    "welcomeMessage": "환영합니다! 입사 관련 궁금한 점을 물어보세요."
  },
  "ai": {
    "systemPrompt": "신입사원의 입사 관련 질문에 답변합니다. 회사 규정, 복리후생, IT 장비, 교육 일정...",
    "ragEnabled": true
  },
  "knowledge": {
    "sources": [{ "type": "file", "files": ["company-handbook.pdf"] }]
  },
  "behavior": { "mode": "faq", "collectEmail": false },
  "appearance": { "primaryColor": "#2a9d5c" }
}
```

#### 고객사 학원용 (수강 상담)

```json
{
  "identity": {
    "name": "수강 상담 봇",
    "welcomeMessage": "안녕하세요! 수강 상담 도우미입니다."
  },
  "ai": {
    "systemPrompt": "영어 학원의 수강 상담을 도와줍니다. 레벨 테스트, 수업 시간표, 수강료...",
    "ragEnabled": true
  },
  "knowledge": {
    "sources": [
      { "type": "text", "content": "초급반 월 30만원, 중급반 월 35만원..." }
    ]
  },
  "behavior": {
    "mode": "sales",
    "collectEmail": true,
    "handoff": { "enabled": true, "channel": "kakao" }
  },
  "appearance": { "primaryColor": "#2b7cff" }
}
```

---

## 5. 핵심 기능 (MoSCoW)

### Must Have

#### M1. 챗봇 엔진 코어

```
아키텍처:

┌─────────────────────────────────────────────┐
│              Dari Engine                 │
│                                             │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Config  │→│ Prompt   │→│  Claude   │  │
│  │ Loader  │  │ Builder  │  │  API      │  │
│  └─────────┘  └──────────┘  └───────────┘  │
│       ↓            ↑              ↓         │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │Knowledge│  │ Context  │  │ Response  │  │
│  │   RAG   │  │ Manager  │  │ Formatter │  │
│  └─────────┘  └──────────┘  └───────────┘  │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │         Widget (Embed SDK)          │    │
│  │  <script src="dari.js">         │    │
│  │  Dari.init({ configUrl: "..." })│    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │         Analytics & Logs            │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘

동작 순서:
  1. Widget이 configUrl에서 Config JSON 로드
  2. Config의 identity로 챗봇 외형/인사말 렌더링
  3. 사용자가 질문 입력
  4. Config의 knowledge로 RAG 검색 (관련 문서 추출)
  5. Config의 ai.systemPrompt + RAG 결과 + 대화 히스토리 조합
  6. Claude API 호출 → 응답 생성
  7. Config의 behavior에 따라 후처리 (이메일 수집, 상담원 연결 등)
  8. 응답을 Widget에 표시
  9. Analytics로 대화 로그 전송
```

#### M2. 지식 베이스 (RAG)

```
Config의 knowledge.sources로 지식 주입:

type: "url"
  → URL 크롤링 → 텍스트 추출 → 청킹 → 임베딩 → 벡터 DB 저장
  → 자동 갱신: 24시간마다 재크롤링 (선택)

type: "file"
  → PDF/MD/TXT 업로드 → 텍스트 추출 → 청킹 → 임베딩
  → 파일 교체 시 자동 재인덱싱

type: "text"
  → 직접 입력한 텍스트 → 청킹 → 임베딩
  → FAQ, 가격표, 정책 등 짧은 정보에 적합

RAG 파이프라인:
  질문 → 벡터 검색 (pgvector) → 상위 5개 청크 추출
  → systemPrompt + 청크 + 질문 → Claude API
  → 답변 생성 (출처 표시 선택 가능)
```

#### M3. 임베드 위젯 SDK

```
설치 (2줄):
  <script src="https://cdn.dari.kr/widget.js"></script>
  <script>
    Dari.init({
      botId: "chatsio-support",
      apiKey: "tf_pub_xxxxx"
    });
  </script>

위젯 UI:
  ┌──────────────────────────┐
  │ 💬 챗시오 도우미          │  ← Config.identity.name
  │ ──────────────────────── │
  │                          │
  │   AI: 안녕하세요! 챗시오  │  ← Config.identity.welcomeMessage
  │   도우미입니다.           │
  │                          │
  │   User: 요금이 얼마예요?  │
  │                          │
  │   AI: 챗시오 요금은       │  ← RAG 기반 답변
  │   Basic 월 49,000원,     │
  │   Pro 월 99,000원입니다.  │
  │                          │
  │ ┌──────────────────────┐ │
  │ │ 질문을 입력하세요...  │ │  ← Config.identity.placeholder
  │ └──────────────────────┘ │
  └──────────────────────────┘
                         [💬] ← 플로팅 버튼 (Config.appearance)

지원 환경:
  - 모든 웹사이트 (HTML/JS)
  - React/Next.js (@dari/react)
  - Webflow/Wix/Bubble (HTML embed)
  - 카페24/고도몰 (스크립트 삽입)
```

#### M4. Behavior 모드 (4종)

```
mode: "support" — 고객 지원
  → 지식 기반 답변 + 모르면 상담원 연결 안내
  → 이메일 수집 옵션
  → 업무 시간 외 안내

mode: "sales" — 판매/상담 유도
  → 상품 안내 + 구매 유도 멘트
  → CTA 버튼 ("지금 신청하기" 링크)
  → 리드 수집 (이메일, 전화번호)

mode: "faq" — FAQ 응답 전문
  → 지식 베이스에 없으면 "해당 정보가 없습니다" 명확 응답
  → 관련 FAQ 추천
  → 간결한 답변 스타일

mode: "coaching" — 대화형 코칭
  → 사용자에게 질문을 던지는 방식 (면접 코칭, 학습 등)
  → 답변 평가 + 피드백
  → InterviewGenie 연동용
```

#### M5. 관리 대시보드

```
┌────────────────────────────────────────────┐
│ 📊 Dari 관리 대시보드                   │
│                                            │
│ 내 봇 목록:                                │
│ ├─ 챗시오 도우미 (support) — 활성 ✅        │
│ ├─ 온보딩 FAQ (faq) — 활성 ✅              │
│ ├─ 포트폴리오 안내 (sales) — 비활성 ⏸      │
│ └─ [새 봇 만들기 →]                        │
│                                            │
│ 📈 전체 통계 (이번 주):                     │
│ 총 대화: 234건 | 평균 만족도: 4.2/5        │
│ 답변 불가: 12건 (5.1%) | 상담원 연결: 8건   │
│                                            │
│ 🔥 자주 묻는 질문 TOP 5:                    │
│ 1. "요금이 얼마예요?" (45회)                │
│ 2. "환불 정책이 뭐예요?" (32회)             │
│ 3. "사용 방법 알려주세요" (28회)            │
│ 4. "상담원 연결해주세요" (21회)             │
│ 5. "무료 체험 있나요?" (18회)               │
│                                            │
│ ⚠️ 답변 실패 목록 (지식 보강 필요):         │
│ "API 연동 가이드 어디에 있나요?" — 3회       │
│ → [지식 추가하기]                           │
└────────────────────────────────────────────┘
```

#### M6. 분석 + 웹훅 연동

```
자동 수집 데이터:
  - 대화 수, 메시지 수, 평균 대화 길이
  - 답변 만족도 (👍👎 피드백)
  - 답변 불가 질문 목록 (지식 베이스 개선 힌트)
  - 상담원 연결 빈도
  - 사용자 리드 (이메일, 전화번호 — 수집 시)
  - 시간대별 사용 패턴

웹훅 연동 (n8n):
  - 새 대화 시작 → 알림
  - 답변 불가 발생 → Slack 알림
  - 리드 수집 → CRM/스프레드시트 자동 저장
  - 상담원 연결 요청 → 카카오톡 알림
```

### Should Have — Phase 2

| 기능                   | 설명                                            |
| ---------------------- | ----------------------------------------------- |
| S1. 카카오톡 채널 연동 | 카카오 비즈메시지 API → 카톡에서도 동일 봇 응답 |
| S2. 멀티테넌트 관리    | 고객사별 독립 워크스페이스, 데이터 격리         |
| S3. 대화 히스토리 검색 | 관리자가 과거 대화 검색/필터링                  |
| S4. A/B 테스트         | 프롬프트 변형 → 어떤 버전이 만족도 높은지 비교  |
| S5. 자동 지식 갱신     | URL 소스 주기적 재크롤링 + 변경 감지            |

### Could Have — Phase 3

| 기능                   | 설명                                   |
| ---------------------- | -------------------------------------- |
| C1. 음성 챗봇          | STT/TTS 연동 → 음성 대화               |
| C2. 이미지 분석        | 사용자가 이미지 업로드 → 멀티모달 분석 |
| C3. 다국어 자동 감지   | 사용자 언어 감지 → 자동 번역 응답      |
| C4. Slack/Discord 연동 | 사내 메신저에서도 동일 봇 동작         |

---

## 6. 만들지 않을 것 (Not Doing)

- ❌ **자체 LLM 훈련은 하지 않는다** — Claude API 활용
- ❌ **결제/구독 시스템은 Phase 1에서 구현하지 않는다** — 무료 + 수동 관리
- ❌ **모바일 네이티브 앱은 개발하지 않는다** — 웹 위젯 + 반응형
- ❌ **실시간 상담원 채팅(라이브챗)은 구현하지 않는다** — 상담원 "연결 안내"만
- ❌ **채널톡/Intercom 수준의 고객 관리 CRM은 구현하지 않는다** — 챗봇 엔진에 집중
- ❌ **자체 임베딩 모델을 호스팅하지 않는다** — Gemini embedding API 사용

---

## 7. Phase별 구현 계획

### Phase 0: 기반 — 1일

```
Task 0-1: 프로젝트 세팅 (Next.js + Supabase + Vercel)
Task 0-2: DB 스키마 (bots, knowledge_chunks, conversations, messages)
Task 0-3: Config 스키마 정의 (TypeScript 타입)
```

### Phase 1: 엔진 코어 — 5~7일

```
Task 1-1: Config Loader
  - JSON Config 파싱 + 검증
  - 봇 생성/수정 API

Task 1-2: Knowledge RAG 파이프라인
  - URL 크롤링 → 텍스트 추출 (Firecrawl or cheerio)
  - 파일 업로드 → 텍스트 추출 (PDF: pypdf, MD: 직접)
  - 텍스트 → 청킹 (500자 단위, 100자 오버랩)
  - 청킹 → Gemini embedding → pgvector 저장
  - 질문 → 벡터 검색 → 상위 5개 반환

Task 1-3: 대화 엔진
  - systemPrompt + RAG 결과 + 대화 히스토리 조합
  - Claude API 스트리밍 응답
  - Behavior 모드별 후처리 (support/sales/faq/coaching)
  - 대화 저장 (conversations + messages)

Task 1-4: 임베드 위젯 SDK
  - widget.js (VanillaJS, CDN 배포)
  - @dari/react (npm)
  - Config.appearance 기반 테마 적용
  - 플로팅 버튼 + 채팅 패널
  - 스트리밍 응답 표시

Task 1-5: 관리 대시보드
  - 봇 목록 + CRUD
  - Config 에디터 (JSON 또는 폼 UI)
  - 지식 소스 관리 (추가/삭제/재인덱싱)
  - 대화 로그 열람
  - 기본 통계 (대화 수, 답변 불가율)

Task 1-6: Dairect 프로젝트 5개에 배포
  - dairect.kr 포트폴리오 안내 봇
  - Chatsio 고객 지원 봇 (Config 작성)
  - OnboardKit FAQ 봇 (Config 작성)
  - SellKit 상품 안내 봇 (Config 작성)
  - InterviewGenie 코칭 모드 테스트
```

### Phase 2: 고급 기능 + SI 배포 — 3~5일

```
Task 2-1: 카카오톡 채널 연동
Task 2-2: 웹훅 + n8n 연동 (리드 수집, 알림)
Task 2-3: 멀티테넌트 (고객사별 워크스페이스)
Task 2-4: 랜딩페이지 + 데모 위젯
Task 2-5: dairect.kr 포트폴리오 등록
```

---

## 8. 기술 스택

| 영역              | 기술                                   | 비고                  |
| ----------------- | -------------------------------------- | --------------------- |
| 프론트 (대시보드) | Next.js 16.2                           | 관리 대시보드         |
| 위젯 SDK          | VanillaJS (CDN) + React wrapper        | 경량, 어디든 삽입     |
| UI                | shadcn/ui + Tailwind                   | 대시보드용            |
| DB                | Supabase (PostgreSQL + pgvector + RLS) | 지식 벡터 + 대화 저장 |
| ORM               | Drizzle ORM                            |                       |
| AI                | Claude Sonnet 4.6                      | 대화 생성             |
| 임베딩            | Gemini embedding-001 (768차원)         | 한국어 최적           |
| 크롤링            | Firecrawl API or cheerio               | URL 지식 수집         |
| 자동화            | n8n                                    | 웹훅, 알림, 리드 수집 |
| CDN               | Vercel Edge / Cloudflare               | widget.js 배포        |
| 배포              | Vercel                                 |                       |

### DB 스키마

```sql
bots (
  id UUID PK,
  owner_id UUID FK → users.id,
  bot_id TEXT UNIQUE NOT NULL,       -- "chatsio-support"
  name TEXT NOT NULL,
  config JSONB NOT NULL,             -- 전체 Config JSON
  is_active BOOLEAN DEFAULT true,
  api_key_public TEXT UNIQUE,        -- "tf_pub_xxxxx"
  api_key_secret TEXT UNIQUE,        -- "tf_sec_xxxxx" (서버용)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

knowledge_chunks (
  id UUID PK,
  bot_id UUID FK → bots.id,
  source_type TEXT,                  -- url/file/text
  source_ref TEXT,                   -- URL or 파일명
  chunk_text TEXT NOT NULL,
  chunk_index INT,
  embedding vector(768),             -- pgvector
  created_at TIMESTAMPTZ
)

conversations (
  id UUID PK,
  bot_id UUID FK → bots.id,
  visitor_id TEXT,                   -- 익명 방문자 ID (쿠키 기반)
  visitor_email TEXT,                -- 수집된 경우
  channel TEXT DEFAULT 'widget',     -- widget/kakao/slack
  message_count INT DEFAULT 0,
  satisfaction INT,                  -- 1~5 (피드백 시)
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
)

messages (
  id UUID PK,
  conversation_id UUID FK → conversations.id,
  role TEXT CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  rag_sources JSONB,                 -- 사용된 지식 청크 참조
  token_count INT,
  created_at TIMESTAMPTZ
)
```

---

## 9. 수익 모델

### 내부 사용 (Jayden 프로젝트)

- 비용: Claude API 호출료만 (메시지당 ~$0.005~0.02)
- 가치: 6개 프로젝트 × 11시간 절감 = 43시간 절감

### SI 수주

- 고객사 챗봇 구축: Config 작성 + 지식 베이스 구성 = 건당 100~500만원
- 월 유지보수: 지식 갱신 + 프롬프트 튜닝 = 월 10~30만원

### SaaS (Phase 3)

| 플랜       | 가격       | 포함                                    |
| ---------- | ---------- | --------------------------------------- |
| Free       | ₩0         | 봇 1개, 월 100 메시지, 지식 3개 소스    |
| Starter    | ₩29,000/월 | 봇 3개, 월 1,000 메시지, 지식 10개 소스 |
| Pro        | ₩79,000/월 | 봇 10개, 무제한, 카카오톡, 웹훅         |
| Enterprise | 문의       | 무제한, 커스텀, 전용 지원               |

---

## 10. Dairect 프로젝트 통합 계획

Dari가 완성되면 아래 프로젝트에 Config만 작성하여 즉시 배포:

| 프로젝트       | 봇 역할                     | 모드     | 지식 소스             |
| -------------- | --------------------------- | -------- | --------------------- |
| dairect.kr     | 포트폴리오 안내 + 문의 유도 | sales    | 포트폴리오 페이지 URL |
| Chatsio        | 쇼핑몰 운영 지원            | support  | 도움말 문서 + FAQ     |
| OnboardKit     | 신입 온보딩 FAQ             | faq      | 회사 핸드북 PDF       |
| SellKit        | 상품 안내 + 구매 유도       | sales    | 상품 설명 텍스트      |
| InterviewGenie | 면접 코칭 대화              | coaching | 면접 질문 DB          |
| PayLoom        | 결제 연동 가이드            | faq      | 개발자 문서           |

---

## 11. 경쟁사 분석

| 서비스     | 타겟                  | 한계                          | Dari 차별화                 |
| ---------- | --------------------- | ----------------------------- | --------------------------- |
| 채널톡     | B2B 고객 상담         | 월 수십만원, 라이브챗 중심    | 가볍고 저렴, AI 챗봇 전문   |
| ChatBotKit | 화이트라벨 플랫폼     | 영어 중심, 한국어 최적화 없음 | 한국어 + 한국 서비스 연동   |
| Botpress   | 오픈소스 챗봇 빌더    | 기술 난이도 높음              | Config JSON 하나로 5분 배포 |
| Stammer AI | 에이전시용 화이트라벨 | 월 $70+, 영어                 | 한국어 + Jayden 내부 사용   |

### Dari의 핵심 경쟁 우위

```
1. Config 하나 = 챗봇 하나 (5분 배포)
2. Jayden이 직접 6개 프로젝트에 사용 = 살아있는 포트폴리오
3. 한국어 + 카카오톡 + 한국 서비스 최적화
4. Claude + Gemini 임베딩 = 한국어 AI 품질 최상
5. SI 미팅 중 라이브 데모 → 즉시 계약
```

---

## 12. 완료 기준

### Phase 0~1 완료

- [ ] Config JSON 작성 → 챗봇 생성 → 위젯 배포 전체 플로우
- [ ] URL/파일/텍스트 3가지 지식 소스 모두 RAG 동작
- [ ] 4가지 behavior 모드 (support/sales/faq/coaching) 동작
- [ ] 위젯 SDK: HTML 2줄로 어떤 사이트든 삽입 가능
- [ ] Dairect 프로젝트 최소 3개에 실제 배포

### Phase 2 완료

- [ ] 카카오톡 채널 연동 동작
- [ ] 고객사 1곳에 챗봇 납품
- [ ] dairect.kr 포트폴리오 등록 + 라이브 데모

### "이 제품이 성공했다"의 정의

SI 미팅에서 "여러분 사업에 맞는 AI 챗봇을 지금 만들어드리겠습니다" → 미팅 중 Config 입력 → 5분 후 동작하는 챗봇 시연 → "이거 우리 사이트에 바로 넣어주세요" 계약 성사

---

_— End of PRD: Dari v2.0 —_
_"한 번 만들고, 설정만 바꿔서 무한 복제 — 챗봇의 워드프레스"_
