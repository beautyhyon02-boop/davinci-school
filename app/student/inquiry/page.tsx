import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadStudentAssignments } from '@/lib/inquiry/data'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.inquiry.student
const TONE = { assigned: 'lemon', submitted: 'mint', reopened: 'lemon' } as const

/** 학생: 내 탐구보고서 목록. 카드 하나에 제목(크게) → 부제 → 과목·상태 → 쓴 칸 수 → [쓰기]/[보기]. */
export default async function StudentInquiryListPage() {
  const s = await getSessionProfile()
  const db = await createClient()
  const list = await loadStudentAssignments(db, s.userId)
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="mt-1 text-base text-ink-500">{copy.help}</p>
      {!list.available && <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-base">{app.inquiry.unavailable}</p>}
      {list.loadFailed && <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-base">{copy.errors.saveFailed}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {list.rows.map((r) => (
          <Card key={r.assignmentId}>
            <p className="text-lg font-bold">{r.title}</p>
            {r.subtitle && <p className="mt-1 text-base text-ink-700">{r.subtitle}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {r.subjects.map((sub) => <Badge key={sub} tone="gray">{sub}</Badge>)}
              <Badge tone={TONE[r.status]}>{app.inquiry.assignmentStatus[r.status]}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink-500">{copy.card.progress(r.progress.filled, r.progress.total)}</p>
            <div className="mt-3"><Button href={`/student/inquiry/${r.assignmentId}`}>{r.status === 'submitted' ? copy.card.view : copy.card.write}</Button></div>
          </Card>
        ))}
      </div>
      {list.available && !list.loadFailed && list.rows.length === 0 && <p className="mt-8 text-ink-500">{copy.empty}</p>}
    </>
  )
}
