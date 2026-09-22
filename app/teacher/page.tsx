import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.dashboard.teacher

export default async function TeacherHome() {
  const supabase = await createClient()
  const [{ count: pending }, { count: assignments }, { count: students }] = await Promise.all([
    supabase.from('gradings').select('id', { count: 'exact', head: true }).eq('status', 'drafted'),
    supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('closed', false),
    supabase.from('students').select('profile_id', { count: 'exact', head: true }).eq('enrolled', true),
  ])
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
