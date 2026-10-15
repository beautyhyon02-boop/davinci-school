import { ProgramPage } from '@/components/site/ProgramPage'
import { Section } from '@/components/site/Section'
import { RedLibrary } from '@/components/site/RedLibrary'
import { RedGate } from '@/components/site/RedGate'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { pages, app } from '@/content/site'
import { RED_COLUMNS, type RedCategory, type RedReportRow } from '@/lib/red/reports'

const copy = pages.redReports
// 로그인 여부에 따라 달라지므로 요청마다 그린다
export const dynamic = 'force-dynamic'

/**
 * 홈페이지 탐구보고서 페이지(대표 2026-10-15): 소개 아래에 「RED 보고서」 칸. 가맹 원장·본사로 로그인하면 BASIC/ADVANCED 목록과 내려받기,
 * 로그인 전·학생 계정이면 안내만(파일 이름도 보이지 않는다). 줄은 사용자 클라이언트로 읽는다 — RLS 가 원장에게 게시된 줄만 준다. 내려받기는 /api/red/download/[id].
 * ?tab=advanced 로 오면 ADVANCED 탭부터(/basic·/advanced 가 이리로 온다 — PRD 2026-10-16).
 */
export default async function InquiryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const initialCategory: RedCategory = tab?.toLowerCase() === 'advanced' ? 'ADVANCED' : 'BASIC'
  const s = await getSessionProfileOrNull()
  const canSee = s?.role === 'teacher' || s?.role === 'admin'
  let rows: RedReportRow[] = []
  let loadError = false
  if (canSee) {
    const supabase = await createClient()
    const { data, error } = await supabase.from('resources').select(RED_COLUMNS)
      .not('category', 'is', null).eq('status', 'published').order('report_date', { ascending: false }).order('uploaded_at', { ascending: false })
    rows = (data ?? []) as unknown as RedReportRow[]
    loadError = !!error
  }
  return (
    <ProgramPage slug="inquiry" extra={
      <Section>
        <p className="text-sm font-semibold text-lavender-600">{copy.eyebrow}</p>
        <h2 className="mt-1 text-2xl font-bold">{copy.heading}</h2>
        <div className="mt-4">
          {loadError && s?.role === 'admin' && <p className="mb-3 rounded-xl bg-lemon-100 p-3 text-sm text-ink-900">{app.adminRed.migrationNote}</p>}
          {canSee ? <RedLibrary rows={rows} initialCategory={initialCategory} /> : <RedGate role={s ? 'student' : null} />}
        </div>
      </Section>
    } />
  )
}
