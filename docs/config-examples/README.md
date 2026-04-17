# Dari Config 샘플 모음

"Config 하나 = 챗봇 하나"를 실제로 보여주는 3개 예시.

각 파일은 **완전한 Config**이며, Dari 엔진에 그대로 주입할 수 있다.

## 예시 목록

| 파일                     | 봇 ID               | mode    | 지식 소스 | 용도                    |
| ------------------------ | ------------------- | ------- | --------- | ----------------------- |
| `chatsio.json`           | `chatsio-support`   | support | url       | 카페24 쇼핑몰 고객응대  |
| `onboardkit.json`        | `onboardkit-faq`    | faq     | file      | 신입사원 온보딩 FAQ     |
| `dairect-portfolio.json` | `dairect-portfolio` | sales   | url+text  | Dairect 포트폴리오 안내 |

## 공통 구조

```
botId        — 고유 식별자 (kebab-case, 3~64자)
version      — 스키마 버전 (현재 "1.0")
identity     — 이름·아바타·인사말·placeholder
ai           — 모델·systemPrompt·temperature
knowledge    — 지식 소스 배열 (url/file/text)
behavior     — mode·fallback·collectEmail·handoff
appearance   — 색·위치·폰트
analytics    — enabled·webhookUrl
allowedDomains — 위젯 허용 도메인 (보안)
```

## 새 봇 만들기 (5분 레시피)

1. 위 3개 중 mode 맞는 것 하나 복사
2. `botId`, `identity.name`, `ai.systemPrompt` 교체
3. `knowledge.sources` 를 실제 지식으로 교체
4. `appearance.primaryColor` 를 브랜드 색으로
5. `allowedDomains` 에 설치할 사이트 도메인 추가
6. 대시보드에서 임포트 → Done

## 검증

모든 샘플은 `src/core/config/schema.ts` 의 Zod 검증을 통과한다.
새 샘플 추가 시 반드시:

```ts
import { dariConfigSchema } from "@/core/config";
import sample from "./new-sample.json";

dariConfigSchema.parse(sample); // 실패 시 던짐
```
