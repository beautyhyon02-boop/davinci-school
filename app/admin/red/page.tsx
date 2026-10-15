import { createClient } from '@/lib/supabase/server'
import { app } from '@/content/site'
import { RedUploadForm } from './RedUploadForm'
import { RedAdminTable } from './RedAdminTable'
import { RED_COLUMNS, RED_STATUSES, type RedReportRow, type RedStatus } from '@/lib/red/reports'

const copy = app.adminRed
export const dynamic = 'force-dynamic'

/** 본사 「RED 자료실」(대표 2026-10-15 + PRD 2026-10-16): 올리기(검수대기) + 검수대기/게시됨/보류 탭. 0018·0019 전이면 열이 없어 목록을 못 읽는다 — 안내만. */
export default async function AdminRedPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const initialTab = (RED_STATUSES as string[]).includes(tab ?? '') ? (tab as RedStatus) : 'pending'
  const supabase = await createClient()
  const { data, error } = await supabase.from('resources').select(RED_COLUMNS)
    .not('category', 'is', null).order('report_date', { ascending: false }).order('uploaded_at', { ascending: false })
  const rows = (data ?? []) as unknown as RedReportRow[]
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <div className="mt-4"><RedUploadForm /></div>
      {error && <p className="mt-4 rounded-xl bg-lemon-100 p-3 text-sm text-ink-900">{copy.migrationNote}</p>}
      <RedAdminTable rows={rows} initialTab={initialTab} />
    </>
  )
}
