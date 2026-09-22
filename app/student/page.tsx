import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student

type Row = { id: string; open_lessons: number; due_at: string | null; item_set_id: string; item_set_version: number; item_sets: { subject: string; themes: { title: string } | null } | null }

export default async function StudentHome() {
  const s = await getSessionProfile()
  const supabase = await createClient()
  const { data } = await supabase.from('assignments').select('id, open_lessons, due_at, item_set_id, item_set_version, item_sets(subject, themes(title))').eq('student_id', s.userId).order('created_at', { ascending: false })
  const rows = (data ?? []) as unknown as Row[]
  const ids = rows.map((r) => r.id)
  const [{ data: quiz }, { data: answers }, { data: results }] = await Promise.all([
    supabase.from('quiz_responses').select('assignment_id, lesson_no').in('assignment_id', ids),
    supabase.from('answers').select('assignment_id, submitted_at').in('assignment_id', ids),
    supabase.from('student_gradings').select('answer_id, status'),
  ])
  const quizDone = (aid: string) => new Set((quiz ?? []).filter((q) => q.assignment_id === aid).map((q) => q.lesson_no)).size
  const answerDone = (aid: string) => (answers ?? []).filter((x) => x.assignment_id === aid && x.submitted_at).length
  const confirmedCount = (results ?? []).length

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.listTitle}</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const submitted = answerDone(r.id)
          const badge = confirmedCount > 0 ? copy.card.done : submitted > 0 ? copy.card.reviewing : copy.card.todo
          return (
            <Card key={r.id}>
              <p className="text-lg font-bold">{r.item_sets?.themes?.title}</p>
              <div className="mt-1 flex gap-1"><Badge tone="gray">{r.item_sets?.subject}</Badge><Badge tone="lemon">{badge}</Badge></div>
              <p className="mt-2 text-sm text-ink-500">{copy.card.progress(r.open_lessons, quizDone(r.id), r.open_lessons, submitted, 3)}{r.due_at ? ` · ${copy.card.due(r.due_at.slice(0, 10))}` : ''}</p>
              <div className="mt-3"><Button href={`/student/assignments/${r.id}`}>{copy.card.open}</Button></div>
            </Card>
          )
        })}
      </div>
      {rows.length === 0 && <p className="mt-8 text-ink-500">{copy.empty}</p>}
    </>
  )
}
