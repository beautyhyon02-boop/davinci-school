import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'
import { SUBJECTS } from '@/lib/studio/schemas'
import { verifyStandard } from './actions'

const copy = app.adminStandards
const LEVELS = ['초', '중', '고'] as const
const PAGE_SIZE = 100

type SearchParams = { level?: string; subject?: string; q?: string; page?: string }
type StandardRow = {
  id: string
  code: string
  text: string
  source_page: number | null
  verified_at: string | null
}

export default async function StandardsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const level = sp.level ?? ''
  const subject = sp.subject ?? ''
  const q = (sp.q ?? '').trim()
  const page = Math.max(1, Number(sp.page) || 1)

  const supabase = await createClient()

  const applyFilters = <T,>(query: T) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q2: any = query
    if (level) q2 = q2.eq('level', level)
    if (subject) q2 = q2.eq('subject', subject)
    if (q) {
      const safeQ = q.replace(/[,()%]/g, '')
      q2 = q2.or(`text.ilike.%${safeQ}%,code.ilike.%${safeQ}%`)
    }
    return q2
  }

  const listQuery = applyFilters(supabase.from('standards').select('*', { count: 'exact' }))
    .order('code')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  const verifiedQuery = applyFilters(
    supabase.from('standards').select('id', { count: 'exact', head: true }).not('verified_at', 'is', null),
  )

  const [{ data: rawRows, count: total }, { count: verified }] = await Promise.all([listQuery, verifiedQuery])
  const rows = (rawRows ?? []) as StandardRow[]

  const totalPages = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE))
  const qsFor = (p: number) => {
    const params = new URLSearchParams()
    if (level) params.set('level', level)
    if (subject) params.set('subject', subject)
    if (q) params.set('q', q)
    params.set('page', String(p))
    return `/admin/standards?${params.toString()}`
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>

      <form className="mt-4 flex flex-wrap items-end gap-3" action="/admin/standards">
        <label className="text-sm">
          <span className="block text-ink-500">{copy.filters.levelLabel}</span>
          <select name="level" defaultValue={level} className="mt-1 rounded-lg border border-ink-100 px-3 py-2 text-sm">
            <option value="">{copy.filters.levelAll}</option>
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-ink-500">{copy.filters.subjectLabel}</span>
          <select name="subject" defaultValue={subject} className="mt-1 rounded-lg border border-ink-100 px-3 py-2 text-sm">
            <option value="">{copy.filters.subjectAll}</option>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-ink-500">{copy.filters.searchLabel}</span>
          <input name="q" defaultValue={q} placeholder={copy.filters.searchPlaceholder} className="mt-1 rounded-lg border border-ink-100 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-full bg-mint-500 px-5 py-2 text-sm font-semibold text-white hover:bg-mint-600">{copy.filters.submit}</button>
      </form>

      <p className="mt-4 text-sm text-ink-500">{copy.summary(verified ?? 0, total ?? 0)}</p>

      <div className="mt-2 overflow-hidden rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-100/60 text-left">
            <tr>
              <th className="p-3">{copy.columns.code}</th>
              <th className="p-3">{copy.columns.text}</th>
              <th className="p-3">{copy.columns.page}</th>
              <th className="p-3">{copy.columns.status}</th>
              <th className="p-3">{copy.columns.action}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isVerified = !!r.verified_at
              return (
                <tr key={r.id} className="border-t border-ink-100 align-top">
                  <td className="p-3 whitespace-nowrap font-mono text-xs">{r.code}</td>
                  <td className="p-3 max-w-lg whitespace-pre-wrap">{r.text}</td>
                  <td className="p-3">{r.source_page ?? '-'}</td>
                  <td className="p-3">
                    <Badge tone={isVerified ? 'mint' : 'gray'}>{isVerified ? copy.statusLabel.verified : copy.statusLabel.unverified}</Badge>
                  </td>
                  <td className="p-3">
                    <form action={verifyStandard.bind(null, r.id, !isVerified)}>
                      <button className="text-xs text-ink-500 underline">{isVerified ? copy.actions.unverify : copy.actions.verify}</button>
                    </form>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 text-center text-ink-500">{copy.empty}</p>}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          {page > 1 && <Link href={qsFor(page - 1)} className="text-mint-700 underline">{copy.pagination.prev}</Link>}
          <span className="text-ink-500">{copy.pagination.pageOf(page, totalPages)}</span>
          {page < totalPages && <Link href={qsFor(page + 1)} className="text-mint-700 underline">{copy.pagination.next}</Link>}
        </div>
      )}
    </>
  )
}
