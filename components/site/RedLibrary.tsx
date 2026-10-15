'use client'
import { useMemo, useState } from 'react'
import { pages } from '@/content/site'
import { groupRedSets, type RedCategory, type RedKind, type RedReportRow, type RedSet } from '@/lib/red/reports'

const copy = pages.redReports
const CATEGORIES: RedCategory[] = ['BASIC', 'ADVANCED']
const btn = 'inline-flex items-center justify-center rounded-full px-4 py-1.5 text-xs font-semibold transition'
const BTN_STYLE: Record<RedKind, string> = { student: `${btn} bg-lemon-300 text-ink-900 hover:bg-lemon-400`, teacher: `${btn} bg-mint-500 text-white hover:bg-mint-600` }

/**
 * 탐구보고서 페이지의 RED 보고서 목록(로그인한 원장·본사용). BASIC/ADVANCED 탭 → 세트(교사용 + 학생용) 한 줄씩, 최신이 위.
 * 내려받기는 /api/red/download/[id] 링크 — 서버가 역할을 확인하고 한글 파일 이름 그대로 내려준다(비공개 저장소).
 */
export function RedLibrary({ rows }: { rows: RedReportRow[] }) {
  const [category, setCategory] = useState<RedCategory>('BASIC')
  const [series, setSeries] = useState<string>('')
  const sets = useMemo(() => groupRedSets(rows, category), [rows, category])
  const seriesOptions = useMemo(() => [...new Set(sets.map((s) => s.series).filter(Boolean))], [sets])
  const shown = series ? sets.filter((s) => s.series === series) : sets

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
          {shown.map((s) => <SetRow key={s.key} set={s} />)}
        </ul>
      )}
    </div>
  )
}

function SetRow({ set }: { set: RedSet }) {
  const file = (kind: RedKind, row: RedReportRow | null) => row
    ? <a href={`/api/red/download/${row.id}`} className={BTN_STYLE[kind]} title={row.filename}>{copy.download[kind]}</a>
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
