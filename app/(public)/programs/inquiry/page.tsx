import { ProgramPage } from '@/components/site/ProgramPage'
import { Section } from '@/components/site/Section'
import { RedLibrary } from '@/components/site/RedLibrary'
import { RedGate } from '@/components/site/RedGate'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { pages } from '@/content/site'
import type { RedReportRow } from '@/lib/red/reports'

const copy = pages.redReports
// 로그인 여부에 따라 달라지므로 요청마다 그린다
export const dynamic = 'force-dynamic'

/**
 * 홈페이지 탐구보고서 페이지(대표 2026-10-15): 소개 아래에 「RED 보고서」 칸. 가맹 원장·본사로 로그인하면 BASIC/ADVANCED 목록과 내려받기,
 * 로그인 전·학생 계정이면 안내만(파일 이름도 보이지 않는다). 줄은 사용자 클라이언트로 읽는다 — RLS 가 원장 읽기만 허용한다. 내려받기는 /api/red/download/[id].
 */
export default async function InquiryPage() {
  const s = await getSessionProfileOrNull()
  const canSee = s?.role === 'teacher' || s?.role === 'admin'
  let rows: RedReportRow[] = []
  if (canSee) {
    const supabase = await createClient()
    const { data } = await supabase.from('resources').select('id, filename, category, kind, series, subject, title, report_date, storage_path, hidden, size_bytes, uploaded_at')
      .not('category', 'is', null).eq('hidden', false).order('report_date', { ascending: false }).order('uploaded_at', { ascending: false })
    rows = (data ?? []) as RedReportRow[]
  }
  return (
    <ProgramPage slug="inquiry" extra={
      <Section>
        <p className="text-sm font-semibold text-lavender-600">{copy.eyebrow}</p>
        <h2 className="mt-1 text-2xl font-bold">{copy.heading}</h2>
        <div className="mt-4">
          {canSee ? <RedLibrary rows={rows} /> : <RedGate role={s ? 'student' : null} />}
        </div>
      </Section>
    } />
  )
}
