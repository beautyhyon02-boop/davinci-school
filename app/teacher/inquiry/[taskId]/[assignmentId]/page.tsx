import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadAssignmentView, type InquiryViewer } from '@/lib/inquiry/data'
import { visibleSources } from '@/lib/inquiry/publish-gate'
import { kstDateTime } from '@/lib/inquiry/time'
import { Badge } from '@/components/ui/Badge'
import { PrintButton } from '@/components/classroom/PrintButton'
import { InquiryReportView } from '@/components/inquiry/InquiryReportView'
import { ReopenButton } from './ReopenButton'
import { app } from '@/content/site'

const copy = app.inquiry.teacher
const rp = copy.report
const inquiry = app.inquiry
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TONE = { assigned: 'gray', submitted: 'mint', reopened: 'lemon' } as const

/** 원장: 학생 보고서 읽기 전용 + [인쇄] + [다시 쓰게 하기]. 제출 전에도 지금까지 쓴 내용을 보고 인쇄할 수 있다(아무것도 막지 않음). */
export default async function TeacherInquiryReportPage({ params }: { params: Promise<{ taskId: string; assignmentId: string }> }) {
  const { taskId, assignmentId } = await params
  if (!UUID.test(taskId) || !UUID.test(assignmentId)) notFound()
  const s = await getSessionProfile()
  if (s.role !== 'teacher' || !s.academyId) notFound()
  const viewer: InquiryViewer = { role: 'teacher', userId: s.userId, academyId: s.academyId }
  const db = await createClient()
  const loaded = await loadAssignmentView(db, viewer, assignmentId)
  const back = <Link href={`/teacher/inquiry/${taskId}`} className="text-sm text-mint-700 underline">{rp.back}</Link>
  if (!loaded.ok) {
    if (loaded.reason === 'not-found') notFound()
    const why = loaded.reason === 'forbidden' ? copy.errors.forbidden : loaded.reason === 'unavailable' ? inquiry.unavailable : copy.errors.saveFailed
    return <>{back}<p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{why}</p></>
  }
  const { view } = loaded
  if (view.assignment.taskId !== taskId || !view.task.task) notFound()
  const task = view.task.task
  const status = view.assignment.status

  return (
    <>
      <div className="no-print">
        {back}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{rp.title(view.studentName)}</h1>
          <Badge tone={TONE[status]}>{inquiry.assignmentStatus[status]}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-500">{rp.help}</p>
        {view.report.submitted_at
          ? <p className="mt-1 text-sm text-ink-500">{copy.page.submittedAt(kstDateTime(view.report.submitted_at))}</p>
          : <p className="mt-1 text-sm text-ink-500">{view.hasReport ? rp.notSubmitted : rp.empty}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PrintButton label={rp.print} />
          {status === 'submitted' && <ReopenButton taskId={taskId} assignmentId={assignmentId} />}
        </div>
      </div>
      <div className="mt-6">
        <InquiryReportView task={task} outline={view.assignment.outline} report={view.report} sources={visibleSources(task)} studentName={view.studentName} academyName={view.academyName} />
      </div>
    </>
  )
}
