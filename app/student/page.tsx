import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import { answerProgress } from '@/lib/classroom/lessons'

const copy = app.classroom.student

type Row = { id: string; open_lessons: number; due_at: string | null; item_set_id: string; item_set_version: number; item_sets: { subject: string; themes: { title: string } | null } | null }

export default async function StudentHome() {
  const s = await getSessionProfile()
  const supabase = await createClient()
  const { data } = await supabase.from('assignments').select('id, open_lessons, due_at, item_set_id, item_set_version, item_sets(subject, themes(title))').eq('student_id', s.userId).order('created_at', { ascending: false })
  const rows = (data ?? []) as unknown as Row[]
  const ids = rows.map((r) => r.id)
  const setIds = [...new Set(rows.map((r) => r.item_set_id))]
  const [{ data: quiz }, { data: answers }, { data: results }, { data: versions }] = await Promise.all([
    supabase.from('quiz_responses').select('assignment_id, lesson_no').in('assignment_id', ids),
    supabase.from('answers').select('id, assignment_id, item_no, submitted_at').in('assignment_id', ids),
    supabase.from('student_gradings').select('answer_id'),
    // 답안 칸 분모 = 배정 판의 문항 수(옛 판 3, 지금 구조 2). 판 전체 대신 문항 배열만 읽는다.
    supabase.from('item_set_versions').select('item_set_id, version, items:snapshot->assessment->items').in('item_set_id', setIds),
  ])
  const itemCountOf = (r: Row) => {
    const v = ((versions ?? []) as { item_set_id: string; version: number; items: unknown }[]).find((x) => x.item_set_id === r.item_set_id && x.version === r.item_set_version)
    return Array.isArray(v?.items) ? v.items.length : null
  }
  const quizDone = (aid: string) => new Set((quiz ?? []).filter((q) => q.assignment_id === aid).map((q) => q.lesson_no)).size
  const progressOf = (r: Row) => answerProgress(itemCountOf(r), (answers ?? []).filter((x) => x.assignment_id === r.id))
  // student_gradings 는 answer_id 만 가지고 있어 assignment_id 로 못 거른다 — 이미 불러온 answers 로 매핑한다.
  // (전체 배정을 통틀어 confirmed 가 하나만 있어도 모든 카드가 "결과 나옴"으로 뜨는 결함을 막는다.)
  const confirmedAnswerIds = new Set((results ?? []).map((r) => r.answer_id))
  const confirmedCount = (aid: string) => (answers ?? []).filter((x) => x.assignment_id === aid && confirmedAnswerIds.has(x.id)).length

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.listTitle}</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const progress = progressOf(r)
          const badge = confirmedCount(r.id) > 0 ? copy.card.done : progress.done > 0 ? copy.card.reviewing : copy.card.todo
          return (
            <Card key={r.id}>
              <p className="text-lg font-bold">{r.item_sets?.themes?.title}</p>
              <div className="mt-1 flex gap-1"><Badge tone="gray">{r.item_sets?.subject}</Badge><Badge tone="lemon">{badge}</Badge></div>
              <p className="mt-2 text-sm text-ink-500">{copy.card.progress(r.open_lessons, quizDone(r.id), r.open_lessons, progress.done, progress.total)}{r.due_at ? ` · ${copy.card.due(r.due_at.slice(0, 10))}` : ''}</p>
              <div className="mt-3"><Button href={`/student/assignments/${r.id}`}>{copy.card.open}</Button></div>
            </Card>
          )
        })}
      </div>
      {rows.length === 0 && <p className="mt-8 text-ink-500">{copy.empty}</p>}
    </>
  )
}
