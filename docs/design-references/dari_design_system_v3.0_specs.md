# Dari Design System v3.0
## 📐 Typography
- **본문 (Korean)**: Pretendard Variable — word-break: keep-all, line-height: 1.8
- **본문 (English)**: DM Sans
- **코드**: JetBrains Mono
- **헤드라인**: DM Sans + Pretendard Variable (혼용 시 한글 크기를 영문 대비 20~30% 축소)
- **금지 폰트**: Inter, Roboto, Poppins, Montserrat, Open Sans, Lato (사용 시 디자인 실패)
- **letter-spacing**: –0.03em ~ 0.06em 범위, 한글에는 넓은 자간 금지
- **대소문자**: 한글 UI에는 UPPERCASE 금지
- **영문 유지 대상**: DAIRECT, Chatsio, Findably, Dari, 모든 숫자
## 🎨 Color (oklch 기반)
- **Primary (Dari 브랜드)**: oklch(0.62 0.15 240) — 신뢰감 있는 블루
- **Widget Primary**: Config 가변 (기본 oklch(0.58 0.12 200) = cyan 계열)
- **Background Light**: oklch(0.99 0 0)
- **Surface**: oklch(0.97 0.005 240)
- **Border**: oklch(0.92 0.005 240)
- **Text Primary**: oklch(0.2 0.01 240)
- **Text Secondary**: oklch(0.5 0.01 240)
- **Success**: oklch(0.65 0.15 145)
- **Warning**: oklch(0.72 0.15 75)
- **Error**: oklch(0.6 0.2 25)
- **⚠️ 금지**: text-opacity 사용. 투명도 대신 실제 색상값 사용.
- **⚠️ 제한**: 다크 배경은 페이지당 최대 1개 섹션만.
## 🔲 Layout
- **패턴**: Bento Grid (비대칭) — 균등 3열 그리드 금지
- **간격**: 4px 기반 스케일 (4, 8, 12, 16, 24, 32, 48, 64, 96)
- **모서리**: 8px (소), 12px (중), 16px (대), 24px (카드)
- **그림자**: Multi-layer shadow Level 0~4 (단일 shadow 금지)
  - L1: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)
  - L2: 0 2px 4px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.08)
  - L3: 0 4px 8px rgba(0,0,0,0.06), 0 8px 16px rgba(0,0,0,0.1)
  - L4: 0 8px 16px rgba(0,0,0,0.08), 0 16px 32px rgba(0,0,0,0.12)
## 🎬 Motion
- IntersectionObserver 기반 순차 등장 애니메이션 (스태거)
- prefers-reduced-motion 존중 — 모션 비활성화 분기 필수
- 마이크로 인터랙션: hover 150ms, focus ring 200ms
## ♿ Accessibility
- WCAG 2.2 AA 준수 (대비율 4.5:1 이상)
- 터치 타겟 최소 24×24px (버튼 권장 44×44px)
- Focus visible ring 필수
- aria-label, aria-live 올바른 사용
## 🎯 UX 원칙
- **Calm Dashboard**: 시각적 소음 최소화, 비필수 요소 기본 숨김
- **AI Fatigue 방지**: "AI Powered" 배지 금지, AI는 결과로만 증명
- **Korean-first**: 모든 UI 텍스트 한국어 기본, 영문은 브랜드명/숫자만
## ✅ 22-Point 완료 체크리스트 (18/22 이상 통과 필수)
1. Bento Grid 비대칭 레이아웃 적용
2. Multi-layer shadow 사용
3. Sequential entrance animation 정의
4. 금지 폰트 미사용
5. Pretendard Variable 본문 적용
6. 한글 word-break: keep-all
7. 한글 line-height 1.8
8. text-opacity 미사용
9. 다크 배경 페이지당 1개 이하
10. 균등 3열 그리드 미사용
11. letter-spacing 범위 준수
12. 한글 UPPERCASE 미사용
13. WCAG 2.2 AA 대비율 준수
14. 터치 타겟 24×24px 이상
15. Focus visible ring 정의
16. prefers-reduced-motion 분기
17. oklch 컬러 토큰 사용
18. 4px 기반 spacing scale
19. 모서리 반경 토큰 사용
20. Calm Design — 불필요 요소 숨김
21. 영문 유지 대상 외 한국어화
22. "AI Powered" 과시적 배지 없음