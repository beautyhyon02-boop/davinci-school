import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadReportSource, type ReportViewer } from '@/lib/classroom/report-data'
import { buildUnitReport } from '@/lib/classroom/report'
import { editsFromStored, reportDataKey, restrictReport } from '@/lib/classroom/report-edit'
import { todayKst } from '@/lib/classroom/notice'
import { Badge } from '@/components/ui/Badge'
import { ReportEditor } from './ReportEditor'
import { app } from '@/content/site'

const copy = app.classroom.report
const pg = copy.page
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 학생별 단원 리포트(설계 2026-09-29 §5.4): 넣을 과목 → 미리보기 → 문장 고치기 → 초안 저장·확정 → 인쇄. AI 를 부르지 않는다(R-8).
 * 레이아웃이 원장만 들이지만 여기서도 역할과 학생의 원을 다시 본다. 읽기는 로그인한 사람의 클라이언트(RLS).
 * 마이그레이션 0014 전이면 퀴즈 최종 확인·저장된 리포트를 "없음"으로 읽고 안내 줄만 보인다.
 */
export default async function UnitReportPage({ params }: { params: Promise<{ themeId: string; studentId: string }> }) {
  const { themeId, studentId } = await params
  if (!UUID.test(themeId) || !UUID.test(studentId)) notFound()
  const s = await getSessionProfile()
  if (s.role !== 'teacher' && s.role !== 'admin') notFound()
  const viewer: ReportViewer = { role: s.role, userId: s.userId, academyId: s.academyId }
  const supabase = await createClient()
  const loaded = await loadReportSource(supabase, viewer, themeId, studentId)

  if (!loaded.ok) {
    const why = loaded.reason === 'forbidden' ? pg.notReady.forbidden : loaded.reason === 'not-found' ? pg.notReady.notFound : pg.notReady.noAssignments
    return (
      <>
        <Link href="/teacher/reports" className="text-sm text-mint-700 underline">{pg.back}</Link>
        <h1 className="mt-2 text-2xl font-bold">{pg.notReady.heading}</h1>
        <p className="mt-3 text-ink-700">{why}</p>
      </>
    )
  }

  const src = loaded.source
  const fresh = buildUnitReport(src.input, copy.build)
  const storedBody = src.stored?.body ?? null
  const stored = src.stored && storedBody ? { status: src.stored.status, body: storedBody, confirmedAt: src.stored.confirmedAt } : null
  const stale = stored ? reportDataKey(stored.body) !== reportDataKey(restrictReport(fresh, stored.body.included_subjects, copy.build)) : false
  const initialEdits = stored ? editsFromStored(stored.body, fresh, copy.build) : {}
  const status = stored?.status ?? 'none'

  return (
    <>
      <div className="no-print">
        <Link href="/teacher/reports" className="text-sm text-mint-700 underline">{pg.back}</Link>
        <p className="mt-2 text-sm font-semibold text-ink-500">{src.theme.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{pg.title(src.student.name)}</h1>
          <Badge tone={status === 'confirmed' ? 'mint' : status === 'draft' ? 'lemon' : 'gray'}>{pg.status[status]}</Badge>
        </div>
        {stored?.status === 'confirmed' && stored.confirmedAt && <p className="mt-1 text-sm text-ink-500">{pg.confirmedAt(stored.confirmedAt.slice(0, 16).replace('T', ' '))}</p>}
        {!src.finalizeAvailable && <p className="mt-3 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{pg.finalizeUnavailable}</p>}
      </div>
      <ReportEditor
        key={`${status}:${src.stored?.updatedAt ?? ''}`}
        themeId={themeId} studentId={studentId} academyName={src.academyName} today={todayKst()}
        subjects={src.subjects} fresh={fresh} stored={stored} initialEdits={initialEdits} stale={stale}
        reportsAvailable={src.reportsAvailable}
      />
    </>
  )
}
