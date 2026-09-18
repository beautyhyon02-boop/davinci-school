import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '다빈치스쿨',
  description: '탐구보고서와 서논술형 수업, 전국 가맹원 네트워크 다빈치스쿨',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  )
}
