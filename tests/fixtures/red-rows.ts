import type { RedReportRow } from '@/lib/red/reports'

/** RED 줄 하나(시험용 기본값 — 게시된 BASIC·E 교사용). */
export const redRow = (over: Partial<RedReportRow>): RedReportRow => ({
  id: 'r', filename: 'f.docx', category: 'BASIC', kind: 'teacher', red_type: 'E', series: '사물놀이', subject: '물리', title: '01 줄로 떠 있는 구조물(텐세그리티)',
  summary: '', source_links: [], report_date: '2026-10-15', storage_path: 'red/x', status: 'published', hold_note: '', published_at: '2026-10-15T00:00:00Z',
  created_by: 'a1', size_bytes: 1, uploaded_at: '2026-10-15T00:00:00Z', ...over,
})
