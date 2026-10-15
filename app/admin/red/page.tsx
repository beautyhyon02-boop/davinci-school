import { createClient } from '@/lib/supabase/server'
import { app } from '@/content/site'
import { RedUploadForm } from './RedUploadForm'
import { RedAdminTable } from './RedAdminTable'
import type { RedReportRow } from '@/lib/red/reports'

const copy = app.adminRed
export const dynamic = 'force-dynamic'

/** 본사 「RED 보고서」(대표 2026-10-15): 올리기 + 올린 목록(숨기기·지우기). 0018 전이면 열이 없어 목록을 못 읽는다 — 안내만. */
export default async function AdminRedPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('resources').select('id, filename, category, kind, series, subject, title, report_date, storage_path, hidden, size_bytes, uploaded_at')
    .not('category', 'is', null).order('report_date', { ascending: false }).order('uploaded_at', { ascending: false })
  const rows = (data ?? []) as RedReportRow[]
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <div className="mt-4"><RedUploadForm /></div>
      {error && <p className="mt-4 rounded-xl bg-lemon-100 p-3 text-sm text-ink-900">{copy.migrationNote}</p>}
      <RedAdminTable rows={rows} />
    </>
  )
}
