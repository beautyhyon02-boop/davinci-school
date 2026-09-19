import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'
import { SUBJECTS, LEVELS } from '@/lib/studio/schemas'

const copy = app.teacherItems

type SearchParams = { level?: string; subject?: string }
type Row = { id: string; subject: string; level: string; grade: number; version: number; themes: { title: string } | null }

// RLS(스펙 §4.4): item_sets는 status='published'일 때만 원장(authenticated)이 읽을 수 있고, 원 구분 없이 전체 공개다.
export default async function TeacherItemsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const level = sp.level ?? ''
  const subject = sp.subject ?? ''

  const supabase = await createClient()

  const applyFilters = <T,>(query: T) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q2: any = query
    if (level) q2 = q2.eq('level', level)
    if (subject) q2 = q2.eq('subject', subject)
    return q2
  }

  const { data } = await applyFilters(
    supabase.from('item_sets').select('id, subject, level, grade, version, themes(title)').eq('status', 'published'),
  )
    .order('level')
    .order('grade')
  const rows = (data ?? []) as unknown as Row[]

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>

      <form className="mt-4 flex flex-wrap items-end gap-3" action="/teacher/items">
        <label className="text-sm">
          <span className="block text-ink-500">{copy.filters.levelLabel}</span>
          <select name="level" defaultValue={level} className="mt-1 rounded-lg border border-ink-100 px-3 py-2 text-sm">
            <option value="">{copy.filters.levelAll}</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-ink-500">{copy.filters.subjectLabel}</span>
          <select name="subject" defaultValue={subject} className="mt-1 rounded-lg border border-ink-100 px-3 py-2 text-sm">
            <option value="">{copy.filters.subjectAll}</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-full bg-mint-500 px-5 py-2 text-sm font-semibold text-white hover:bg-mint-600">{copy.filters.submit}</button>
      </form>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <h2 className="text-base font-bold">{r.themes?.title ?? '-'}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="gray">{r.subject}</Badge>
              <Badge tone="gray">{copy.card.meta(r.level, r.grade)}</Badge>
              <Badge tone="mint">{copy.card.versionLabel(r.version)}</Badge>
            </div>
            <div className="mt-3">
              <Link href={`/teacher/items/${r.id}`} className="text-sm font-semibold text-mint-700 underline">{copy.card.open}</Link>
            </div>
          </Card>
        ))}
      </div>

      {rows.length === 0 && <p className="mt-8 text-center text-ink-500">{copy.empty}</p>}
    </>
  )
}
