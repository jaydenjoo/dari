// Pretendard 한글/영문 공통 본문. dynamic-subset 은 호출 페이지 기준으로 필요 글리프만
// 서브셋 로드 → 번들 최소화. 기본 `font-display: swap` 로 FOUT 단기 허용 (CLS 최소화).
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";

import "./globals.css";

// 디스플레이 폰트 — 히어로/섹션 제목 전용 (디자인 시스템 v2 기준).
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// 고정폭 — 코드 스니펫 / slug 입력 인라인 등.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dari",
  description: "노코드 봇 빌더 — 10분 안에 우리 가게 봇을 만드세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
