import type { Metadata } from 'next'
import './globals.css'
import { site } from '@/content/site'

export const metadata: Metadata = {
  title: site.name,
  description: site.metaDescription,
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
