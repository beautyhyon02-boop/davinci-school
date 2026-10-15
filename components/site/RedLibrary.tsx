'use client'
import { useMemo, useState } from 'react'
import { pages } from '@/content/site'
import { groupRedSets, RED_TYPES, type RedCategory, type RedKind, type RedReportRow, type RedSet, type RedType } from '@/lib/red/reports'

const copy = pages.redReports
const CATEGORIES: RedCategory[] = ['BASIC', 'ADVANCED']
export const RED_PAGE_SIZE = 20
const btn = 'inline-flex items-center justify-center rounded-full px-4 py-1.5 text-xs font-semibold transition'
const BTN_STYLE: Record<RedKind, string> = { student: `${btn} bg-lemon-300 text-ink-900 hover:bg-lemon-400`, teacher: `${btn} bg-mint-500 text-white hover:bg-mint-600` }
const chip = (on: boolean) => `rounded-full px-3 py-1 text-xs font-semibold ${on ? 'bg-lavender-500 text-white' : 'bg-lavender-100 text-lavender-700'}`

/**
 * 탐구보고서 페이지의 RED 보고서 목록(로그인한 원장·본사용). BASIC/ADVANCED 탭 → 종류(R/E/D) 칩·과목·제목 검색 → 세트(교사용 + 학생용) 카드, 최신이 위, 20개씩 더 보기.
 * 내려받기는 /api/red/download/[id] 링크 — 서버가 역할을 확인하고 한글 파일 이름 그대로 내려준다(비공개 저장소). 게시된 줄만 들어온다(RLS + groupRedSets).
 */
export function RedLibrary({ rows, initialCategory = 'BASIC' }: { rows: RedReportRow[]; initialCategory?: RedCategory }) {
  const [category, setCategory] = useState<RedCategory>(initialCategory)
  const [redType, setRedType] = useState<RedType | ''>('')
  const [subject, setSubject] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(RED_PAGE_SIZE)
  const sets = useMemo(() => groupRedSets(rows, category), [rows, category])
  const subjects = useMemo(() => [...new Set(sets.map((s) => s.subject).filter(Boolean))].sort(), [sets])
  const q = query.trim().toLowerCase()
  const shown = sets.filter((s) => (!redType || s.redType === redType) && (!subject || s.subject === subject) && (!q || s.title.toLowerCase().includes(q)))
  const visible = shown.slice(0, limit)
  const pick = (c: RedCategory) => { setCategory(c); setSubject(''); setLimit(RED_PAGE_SIZE) }

  return (
    <div data-red-library>
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => pick(c)} aria-pressed={category === c}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${category === c ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700'}`}>
            {copy.tabs[c]}
          </button>
        ))}
        <span className="text-sm text-ink-500">{copy.count(shown.length)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setRedType('')} aria-pressed={redType === ''} className={chip(redType === '')}>{copy.typeAll}</button>
        {RED_TYPES.map((t) => <button key={t} type="button" onClick={() => setRedType(t)} aria-pressed={redType === t} className={chip(redType === t)}>{copy.redType[t]}</button>)}
        <select value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded-lg border border-ink-100 px-2 py-1 text-sm" aria-label={copy.columns.subject}>
          <option value="">{copy.filterAll}</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchPlaceholder}
          className="min-w-0 flex-1 rounded-lg border border-ink-100 px-3 py-1 text-sm sm:max-w-xs" />
      </div>
      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">{copy.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink-100 rounded-2xl bg-white">
          {visible.map((s) => <SetRow key={s.key} set={s} />)}
        </ul>
      )}
      {shown.length > limit && (
        <div className="mt-3 text-center">
          <button type="button" onClick={() => setLimit(limit + RED_PAGE_SIZE)} className="rounded-full bg-ink-100 px-4 py-1.5 text-sm font-semibold text-ink-700">{copy.more(shown.length - limit)}</button>
        </div>
      )}
    </div>
  )
}

function SetRow({ set }: { set: RedSet }) {
  const file = (kind: RedKind, row: RedReportRow | null) => row
    ? <a href={`/api/red/download/${row.id}`} className={BTN_STYLE[kind]} title={row.filename}>{copy.download[kind]}</a>
    : <span className="text-xs text-ink-400">{copy.missing[kind]}</span>
  return (
    <li data-red-set={set.key} className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-sm text-ink-500">{set.date}</span>
        <span className="rounded-full bg-lavender-100 px-2 py-0.5 text-xs text-lavender-700">{copy.redType[set.redType]}</span>
        <span className="rounded-full bg-mint-50 px-2 py-0.5 text-xs text-mint-700">{set.series}{set.subject ? ` · ${set.subject}` : ''}</span>
        <span className="w-full font-semibold sm:w-auto sm:min-w-0 sm:flex-1">{set.title}</span>   {/* 좁은 화면(390px)에서는 제목이 한 줄을 다 쓴다(PRD US-008) */}
        <span className="flex gap-2">{file('student', set.student)}{file('teacher', set.teacher)}</span>
      </div>
      {set.summary && <p className="mt-2 text-sm text-ink-700">{set.summary}</p>}
      {set.sourceLinks.length > 0 && (
        <p className="mt-1 text-xs text-ink-500">
          {copy.links}: {set.sourceLinks.map((l, i) => <span key={l.url}>{i > 0 && ' · '}<a href={l.url} target="_blank" rel="noopener noreferrer" className="underline">{l.label}</a></span>)}
        </p>
      )}
    </li>
  )
}
