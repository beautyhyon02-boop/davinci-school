import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import { enrolledOnly } from '@/lib/students/withdraw'
import { getSessionProfile } from '@/lib/auth/session'
import { canUseEssay } from '@/lib/academies/plan'

const copy = app.dashboard.teacher

export default async function TeacherHome() {
  const s = await getSessionProfile()
  // 다빈치 베이직: 서논술 카드 셋(검수·배정·학생) 대신 안내와 RED 자료실 단추만(대표 2026-10-29)
  if (!canUseEssay(s.role, s.plan)) {
    return (
      <>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <Card className="mt-4"><p className="text-ink-700">{copy.basicNote}</p><div className="mt-3"><Button href="/programs/inquiry">{copy.basicRedLink}</Button></div></Card>
      </>
    )
  }
  const supabase = await createClient()
  // 퇴원(enrolled=false) 학생의 배정·채점은 세지 않는다(대표 2026-10-15) — 원 하나의 줄 수는 작으니 읽어서 센다
  const [{ data: drafted }, { data: open }, { count: students }] = await Promise.all([
    supabase.from('gradings').select('id, answers(assignments(students!assignments_student_id_fkey(enrolled)))').eq('status', 'drafted'),
    supabase.from('assignments').select('id, students!assignments_student_id_fkey(enrolled)').eq('closed', false),
    supabase.from('students').select('profile_id', { count: 'exact', head: true }).eq('enrolled', true),
  ])
  type Nested = { answers: { assignments: { students: { enrolled: boolean } | null } | null } | null }
  const pending = ((drafted ?? []) as unknown as Nested[]).filter((g) => g.answers?.assignments?.students?.enrolled !== false).length
  const assignments = enrolledOnly((open ?? []) as unknown as { students: { enrolled: boolean } | null }[]).length
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Card className={pending ? 'ring-2 ring-lemon-300' : ''}><p className="text-xl font-bold">{copy.stats.pending(pending ?? 0)}</p><div className="mt-2"><Button href="/teacher/assignments" variant="ghost">{copy.links.review}</Button></div></Card>
        <Card><p className="text-xl font-bold">{copy.stats.assignments(assignments ?? 0)}</p><div className="mt-2"><Button href="/teacher/items" variant="ghost">{copy.links.assign}</Button></div></Card>
        <Card><p className="text-xl font-bold">{copy.stats.students(students ?? 0)}</p><div className="mt-2"><Button href="/teacher/students" variant="ghost">{copy.links.students}</Button></div></Card>
      </div>
    </>
  )
}
