import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.assign

type Row = { item_set_id: string; item_set_version: number; open_lessons: number; due_at: string | null; item_sets: { subject: string; themes: { title: string } | null } | null }

export default async function TeacherAssignmentsPage() {
  const supabase = await createClient()
  const [{ data: rows }, { data: pending }] = await Promise.all([
    supabase.from('assignments').select('item_set_id, item_set_version, open_lessons, due_at, item_sets(subject, themes(title))').order('created_at', { ascending: false }),
    supabase.from('gradings').select('answer_id, answers(assignment_id, assignments(item_set_id))').eq('status', 'drafted'),
  ])
  const pendingBySet: Record<string, number> = {}
  for (const g of pending ?? []) {
    const setId = (g.answers as unknown as { assignments: { item_set_id: string } | null } | null)?.assignments?.item_set_id
    if (setId) pendingBySet[setId] = (pendingBySet[setId] ?? 0) + 1
  }
  const groups = new Map<string, { row: Row; count: number; minOpen: number }>()
  for (const r of (rows ?? []) as unknown as Row[]) {
    const g = groups.get(r.item_set_id)
    if (g) { g.count += 1; g.minOpen = Math.min(g.minOpen, r.open_lessons) } else groups.set(r.item_set_id, { row: r, count: 1, minOpen: r.open_lessons })
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.listTitle}</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...groups.values()].map(({ row, count, minOpen }) => (
          <Card key={row.item_set_id}>
            <p className="font-bold">{row.item_sets?.themes?.title}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge tone="gray">{row.item_sets?.subject}</Badge>
              <Badge tone="gray">{app.teacherItems.card.versionLabel(row.item_set_version)}</Badge>
              {pendingBySet[row.item_set_id] ? <Badge tone="lemon">{copy.card.pending(pendingBySet[row.item_set_id])}</Badge> : null}
            </div>
            <p className="mt-2 text-sm text-ink-500">{copy.card.students(count)} · {copy.card.open(minOpen)}{row.due_at ? ` · ${copy.card.due(row.due_at.slice(0, 10))}` : ''}</p>
            <div className="mt-3"><Button href={`/teacher/assignments/${row.item_set_id}`} variant="ghost">{copy.card.openButton}</Button></div>
          </Card>
        ))}
      </div>
      {groups.size === 0 && <p className="mt-8 text-center text-ink-500">{copy.listEmpty} <Link href="/teacher/items" className="underline">{app.teacherItems.title}</Link></p>}
    </>
  )
}
