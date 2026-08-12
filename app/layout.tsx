import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";

import { ToastProvider } from "@/components/ui/toast";

import "./globals.css";

/*
 * README "Assets": 폰트는 Google Fonts(IBM Plex Sans KR, IBM Plex Mono)이되
 * 사내 환경에서는 셀프호스팅 권장. next/font는 빌드 시점에 폰트를 내려받아
 * 자체 도메인에서 서빙하므로 런타임에 외부 요청이 발생하지 않는다.
 */
const plexKR = IBM_Plex_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-plex-kr",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "전략 Assistant · To-do Management",
  description: "사장님 지시사항 기록 · 전달 · 진척 추적 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${plexKR.variable} ${plexMono.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
