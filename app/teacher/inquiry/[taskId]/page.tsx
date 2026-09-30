import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadTask, loadTaskAssignments, type InquiryViewer } from '@/lib/inquiry/data'
import { visibleSources } from '@/lib/inquiry/publish-gate'
import { kstDateTime } from '@/lib/inquiry/time'
import { Badge } from '@/components/ui/Badge'
import { AssignPanel, type StudentOption } from './AssignPanel'
import { OutlinePanel } from './OutlinePanel'
import { app } from '@/content/site'

const copy = app.inquiry.teacher
const pg = copy.page
const inquiry = app.inquiry
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TONE = { assigned: 'gray', submitted: 'mint', reopened: 'lemon' } as const

/**
 * 원장의 과제 화면(설계 §3): 과제 내용(탐구 문제·자료·지도 팁) → 학생 배정 → 목차 확인 → 작성 현황 → [보고서 보기].
 * 위에서 아래로 한 줄에 하나. 배정·목차는 자기 원만(서버 동작이 다시 확인한다).
 */
export default async function TeacherInquiryTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  if (!UUID.test(taskId)) notFound()
  const s = await getSessionProfile()
  if (s.role !== 'teacher' || !s.academyId) notFound()
  const viewer: InquiryViewer = { role: 'teacher', userId: s.userId, academyId: s.academyId }
  const db = await createClient()
  const [loaded, list, students] = await Promise.all([
    loadTask(db, taskId),
    loadTaskAssignments(db, viewer, taskId),
    db.from('students').select('profile_id, profiles(name)').eq('academy_id', s.academyId).eq('enrolled', true).order('seq'),
  ])
  if (!loaded.available) {
    return (
      <>
        <Link href="/teacher/inquiry" className="text-sm text-mint-700 underline">{pg.back}</Link>
        <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{inquiry.unavailable}</p>
      </>
    )
  }
  if (!loaded.row || !loaded.row.task) notFound()
  const task = loaded.row.task
  const sources = visibleSources(task)
  const byStudent = new Map(list.rows.map((r) => [r.studentId, r]))
  const options: StudentOption[] = ((students.data ?? []) as unknown as { profile_id: string; profiles: { name: string } | null }[]).map((st) => ({
    id: st.profile_id, name: st.profiles?.name ?? '', assignedStatus: byStudent.get(st.profile_id)?.status ?? null,
  }))

  return (
    <>
      <Link href="/teacher/inquiry" className="text-sm text-mint-700 underline">{pg.back}</Link>
      <h1 className="mt-2 text-2xl font-bold">{task.title}</h1>
      {task.subtitle && <p className="mt-1 text-base text-ink-700">{task.subtitle}</p>}
      <p className="mt-1 text-sm text-ink-500">{copy.subjectsLine(task.subjects)} · {copy.levelLine(inquiry.level[task.level])}</p>
      <p className="mt-2 text-sm text-ink-500">{pg.help}</p>
      {loaded.row.status !== 'published' && <p className="mt-3 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{copy.errors.notPublished}</p>}
      {list.loadFailed && <p className="mt-3 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{copy.errors.saveFailed}</p>}

      <div className="mt-6 space-y-6">
        {/* 과제 내용 */}
        <section className="rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)]">
          <h2 className="text-lg font-bold">{pg.taskHeading}</h2>
          <p className="mt-3 text-sm font-bold text-mint-700">{pg.questionsHeading}</p>
          <ul className="mt-1 space-y-2">
            {task.questions.map((q) => (
              <li key={q.key}>
                <p className="text-base font-semibold">{inquiry.questionLabel(q.key)}. {q.text}</p>
                {q.lens && <p className="text-sm text-ink-500">{q.lens}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm font-bold text-mint-700">{pg.sourcesHeading}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {sources.map((src) => (
              <li key={src.id}>
                <span className="font-semibold">{pg.sourceLine(inquiry.kind[src.kind], src.title)}</span>
                <span className="block text-ink-500">{src.for_questions.map((k) => inquiry.questionLabel(k)).join(' · ')}{src.note ? ` · ${src.note}` : ''}</span>
              </li>
            ))}
          </ul>
          {task.teacher_tips.length > 0 && (
            <>
              <p className="mt-4 text-sm font-bold text-mint-700">{pg.tipsHeading}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-700">{task.teacher_tips.map((t) => <li key={t}>{t}</li>)}</ul>
            </>
          )}
        </section>

        <AssignPanel taskId={taskId} students={options} />
        <OutlinePanel key={list.rows.map((r) => `${r.assignmentId}:${r.outline.method}:${r.outline.career}`).join('|')} taskId={taskId} targets={list.rows.map((r) => ({ assignmentId: r.assignmentId, studentName: r.studentName, outline: r.outline }))} />

        {/* 작성 현황 */}
        <section className="rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)]">
          <h2 className="text-lg font-bold">{pg.progressHeading}</h2>
          {list.rows.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">{pg.noProgress}</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {list.rows.map((r) => (
                <li key={r.assignmentId} className="py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold">{r.studentName}</span>
                    <Badge tone={TONE[r.status]}>{inquiry.assignmentStatus[r.status]}</Badge>
                  </p>
                  <p className="mt-1 text-sm text-ink-500">{pg.progressLine(r.progress.filled, r.progress.total)}</p>
                  {r.submittedAt ? <p className="text-sm text-ink-500">{pg.submittedAt(kstDateTime(r.submittedAt))}</p>
                    : r.updatedAt ? <p className="text-sm text-ink-500">{pg.updatedAt(kstDateTime(r.updatedAt))}</p> : null}
                  <p className="mt-2"><Link href={`/teacher/inquiry/${taskId}/${r.assignmentId}`} className="text-sm font-semibold text-mint-700 underline">{pg.openReport}</Link></p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
