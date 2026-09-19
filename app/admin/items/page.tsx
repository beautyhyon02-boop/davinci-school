import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.studio.themes

type ThemeRow = {
  id: string
  title: string
  level: string
  grade: number
  subjects: string[] | null
}

type SetCounts = { total: number; published: number }

function countBySetTheme(sets: { theme_id: string; status: string }[]): Record<string, SetCounts> {
  const result: Record<string, SetCounts> = {}
  for (const s of sets) {
    const entry = (result[s.theme_id] ??= { total: 0, published: 0 })
    entry.total += 1
    if (s.status === 'published') entry.published += 1
  }
  return result
}

export default async function AdminItemsPage() {
  const supabase = await createClient()
  const [{ data: themes }, { data: sets }] = await Promise.all([
    supabase.from('themes').select('id, title, level, grade, subjects').order('created_at', { ascending: false }),
    supabase.from('item_sets').select('theme_id, status'),
  ])
  const counts = countBySetTheme(sets ?? [])
  const rows = (themes ?? []) as ThemeRow[]

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <Button href="/admin/items/new">{copy.newButton}</Button>
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-100/60 text-left">
            <tr>
              <th className="p-3">{copy.columns.title}</th>
              <th className="p-3">{copy.columns.level}</th>
              <th className="p-3">{copy.columns.subjects}</th>
              <th className="p-3">{copy.columns.setCount}</th>
              <th className="p-3">{copy.columns.publishedCount}</th>
              <th className="p-3">{copy.columns.action}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const c = counts[t.id] ?? { total: 0, published: 0 }
              return (
                <tr key={t.id} className="border-t border-ink-100 align-top">
                  <td className="p-3 font-semibold">{t.title}</td>
                  <td className="p-3">{t.level} {t.grade}학년</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {(t.subjects ?? []).map((s) => <Badge key={s} tone="lavender">{s}</Badge>)}
                    </div>
                  </td>
                  <td className="p-3">{c.total}</td>
                  <td className="p-3">{c.published}</td>
                  <td className="p-3">
                    <Button href={`/admin/items/${t.id}`} variant="ghost">{copy.open}</Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 text-center text-ink-500">{copy.empty}</p>}
      </div>
    </>
  )
}
