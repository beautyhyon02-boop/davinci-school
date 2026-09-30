import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadAssignmentView, type InquiryViewer } from '@/lib/inquiry/data'
import { visibleSources } from '@/lib/inquiry/publish-gate'
import { InquiryWriter } from './InquiryWriter'
import { app } from '@/content/site'

const copy = app.inquiry.student
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 학생 쓰기 화면: 과제 제목·부제 → 칸들(InquiryWriter). 본인 배정만(loadAssignmentView 가 먼저 확인). */
export default async function StudentInquiryPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  if (!UUID.test(assignmentId)) notFound()
  const s = await getSessionProfile()
  if (s.role !== 'student') notFound()
  const viewer: InquiryViewer = { role: 'student', userId: s.userId, academyId: s.academyId }
  const db = await createClient()
  const loaded = await loadAssignmentView(db, viewer, assignmentId)
  const back = <Link href="/student/inquiry" className="text-sm text-mint-700 underline">{copy.page.back}</Link>
  if (!loaded.ok) {
    if (loaded.reason === 'not-found' || loaded.reason === 'forbidden') notFound()
    return <>{back}<p className="mt-4 rounded-xl bg-lemon-50 p-3 text-base">{loaded.reason === 'unavailable' ? app.inquiry.unavailable : copy.errors.saveFailed}</p></>
  }
  const { view } = loaded
  if (!view.task.task) notFound()
  const task = view.task.task
  // 학생에게는 확인함 표시가 있는 자료만(Q-6). 발췌·쉬운 요약·링크만 넘기고 비고(교사용)는 비운다.
  const sources = visibleSources(task).map((src) => ({ ...src, note: '' }))
  return (
    <>
      <div className="no-print">
        {back}
        <h1 className="mt-2 text-2xl font-bold">{task.title}</h1>
        {task.subtitle && <p className="mt-1 text-lg text-ink-700">{task.subtitle}</p>}
        <p className="mt-1 text-sm text-ink-500">{copy.page.subjectsLine(task.subjects)}</p>
        <p className="mt-2 text-base text-ink-500">{copy.page.help}</p>
      </div>
      <InquiryWriter
        key={`${view.assignment.status}:${view.assignment.outline.method}:${view.assignment.outline.career}`}
        assignmentId={assignmentId}
        task={{ title: task.title, subtitle: task.subtitle, subjects: task.subjects, questions: task.questions, section_guides: task.section_guides }}
        outline={view.assignment.outline} sources={sources} initial={view.report} status={view.assignment.status}
        studentName={view.studentName} academyName={view.academyName}
      />
    </>
  )
}
