import { redirect } from 'next/navigation'

/** PRD 2026-10-16 의 /advanced — 탐구보고서 페이지의 ADVANCED 탭으로. */
export default function AdvancedRedirect() {
  redirect('/programs/inquiry?tab=advanced')
}
