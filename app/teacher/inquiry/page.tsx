import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadTasks, countAssignmentsByTask, type InquiryViewer } from '@/lib/inquiry/data'
import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'

const copy = app.inquiry.teacher

/** 원장: 게시된 탐구보고서 과제 목록. 과제 한 줄에 하나: 제목(크게) → 부제 → 과목 → 대상 → 우리 원 배정 수 → [학생 배정]. */
export default async function TeacherInquiryPage() {
  const s = await getSessionProfile()
  const viewer: InquiryViewer = { role: s.role, userId: s.userId, academyId: s.academyId }
  const db = await createClient()
  const [list, counts] = await Promise.all([loadTasks(db, { publishedOnly: true }), countAssignmentsByTask(db, viewer)])
  const rows = list.rows.filter((t) => t.task)
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="mt-1 text-sm text-ink-500">{copy.help}</p>
      {!list.available && <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{app.inquiry.unavailable}</p>}
      {list.loadFailed && <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{copy.errors.saveFailed}</p>}
      {list.available && !list.loadFailed && rows.length === 0 && <p className="mt-8 text-ink-500">{copy.empty}</p>}
      <ul className="mt-6 space-y-4">
        {rows.map((t) => {
          const task = t.task!
          const n = counts.get(t.id) ?? 0
          return (
            <li key={t.id} className="rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)]">
              <h2 className="text-xl font-bold text-ink-900">{task.title}</h2>
              {task.subtitle && <p className="mt-1 text-base text-ink-700">{task.subtitle}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {task.subjects.map((sub) => <Badge key={sub} tone="lavender">{sub}</Badge>)}
                <Badge tone="gray">{app.inquiry.level[task.level]}</Badge>
              </div>
              <p className="mt-2 text-sm text-ink-500">{copy.assignedCount(n)}</p>
              <p className="mt-3"><Link href={`/teacher/inquiry/${t.id}`} className="inline-flex items-center justify-center rounded-full bg-mint-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-mint-600">{copy.assignButton}</Link></p>
            </li>
          )
        })}
      </ul>
    </>
  )
}
