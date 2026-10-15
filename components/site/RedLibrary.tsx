'use client'
import { useMemo, useState, useTransition } from 'react'
import { pages } from '@/content/site'
import { Button } from '@/components/ui/Button'
import { groupRedSets, type RedCategory, type RedKind, type RedReportRow, type RedSet } from '@/lib/red/reports'

const copy = pages.redReports
const CATEGORIES: RedCategory[] = ['BASIC', 'ADVANCED']

/**
 * 탐구보고서 페이지의 RED 보고서 목록(로그인한 원장·본사용). BASIC/ADVANCED 탭 → 세트(교사용 + 학생용) 한 줄씩, 최신이 위.
 * 내려받기는 서버 액션이 역할을 확인하고 짧은 서명 URL 을 만들어 준다(비공개 저장소) — 주소가 새어도 곧 만료된다.
 */
export function RedLibrary({ rows, requestUrl }: { rows: RedReportRow[]; requestUrl: (id: string) => Promise<{ url?: string; error?: string }> }) {
  const [category, setCategory] = useState<RedCategory>('BASIC')
  const [series, setSeries] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const sets = useMemo(() => groupRedSets(rows, category), [rows, category])
  const seriesOptions = useMemo(() => [...new Set(sets.map((s) => s.series).filter(Boolean))], [sets])
  const shown = series ? sets.filter((s) => s.series === series) : sets

  const download = (id: string) => start(async () => {
    setError(null)
    const r = await requestUrl(id)
    if (r.url) window.location.assign(r.url)
    else setError(r.error ?? copy.downloadFailed)
  })

  return (
    <div data-red-library>
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => { setCategory(c); setSeries('') }} aria-pressed={category === c}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${category === c ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700'}`}>
            {copy.tabs[c]}
          </button>
        ))}
        <span className="text-sm text-ink-500">{copy.count(shown.length)}</span>
        {seriesOptions.length > 1 && (
          <select value={series} onChange={(e) => setSeries(e.target.value)} className="ml-auto rounded-lg border border-ink-100 px-2 py-1 text-sm" aria-label={copy.columns.series}>
            <option value="">{copy.filterAll}</option>
            {seriesOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">{copy.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink-100 rounded-2xl bg-white">
          {shown.map((s) => <SetRow key={s.key} set={s} pending={pending} onDownload={download} />)}
        </ul>
      )}
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  )
}

function SetRow({ set, pending, onDownload }: { set: RedSet; pending: boolean; onDownload: (id: string) => void }) {
  const file = (kind: RedKind, row: RedReportRow | null) => row
    ? <Button type="button" variant={kind === 'student' ? 'accent' : 'primary'} disabled={pending} onClick={() => onDownload(row.id)} className="px-4 py-1.5 text-xs">{copy.download[kind]}</Button>
    : <span className="text-xs text-ink-400">{copy.missing[kind]}</span>
  return (
    <li data-red-set={set.key} className="flex flex-wrap items-center gap-3 p-4">
      <span className="w-24 text-sm text-ink-500">{set.date}</span>
      <span className="rounded-full bg-mint-50 px-2 py-0.5 text-xs text-mint-700">{set.series}{set.subject ? ` · ${set.subject}` : ''}</span>
      <span className="min-w-0 flex-1 font-semibold">{set.title}</span>
      <span className="flex gap-2">{file('student', set.student)}{file('teacher', set.teacher)}</span>
    </li>
  )
}
