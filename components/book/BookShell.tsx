import type { ReactNode } from 'react'
import Link from 'next/link'
import { PrintButton } from '@/components/classroom/PrintButton'
import { CloseButton } from './CloseButton'
import type { BookKind } from '@/lib/book/plan'
import { app } from '@/content/site'

const copy = app.book

/**
 * 인쇄 전용 쪽의 틀(app/(book)/… 경로 — 옆 메뉴 없는 최소 화면): 위 막대([인쇄]·[닫기], 인쇄에는 안 나옴) + 종이 모양 칸.
 * 인쇄 규칙은 app/globals.css 의 [data-book]. draft 표시는 책 표지 안에서 한다(StudentBook·TeacherBook 의 draft).
 */
export function BookShell({ kind, backHref, children }: { kind: BookKind; backHref: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-ink-100/40">
      <div className="book-toolbar no-print">
        <span className="text-sm font-semibold text-ink-900">{copy.kindTitle[kind]}</span>
        <span className="book-screen-note text-xs text-ink-500">{copy.pageNumbersNote}</span>
        <div className="ml-auto flex items-center gap-2">
          <PrintButton label={copy.print} />
          <CloseButton label={copy.close} href={backHref} />
        </div>
      </div>
      <div className="book-paper mx-auto my-6 max-w-[210mm] bg-white px-[15mm] py-[20mm] shadow-[0_2px_20px_rgba(31,36,48,0.08)]">{children}</div>
    </main>
  )
}

const linkCls = 'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition bg-transparent text-ink-700 hover:bg-ink-100'

/** 세트 화면의 두 단추 [학생용 교재 인쇄] [교사용 지도서 인쇄] — 새 탭으로 인쇄 전용 쪽을 연다. 원장 문항 화면·본사 세트 화면이 같이 쓴다. */
export function BookButtons({ base }: { base: string }) {
  return (
    <>
      <Link href={`${base}/book/student`} target="_blank" rel="noopener" className={linkCls}>{copy.buttons.student}</Link>
      <Link href={`${base}/book/teacher`} target="_blank" rel="noopener" className={linkCls}>{copy.buttons.teacher}</Link>
    </>
  )
}
