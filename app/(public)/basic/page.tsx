import { redirect } from 'next/navigation'

/** PRD 2026-10-16 의 /basic — 목록은 탐구보고서 페이지의 BASIC 탭 하나로 둔다. */
export default function BasicRedirect() {
  redirect('/programs/inquiry?tab=basic')
}
