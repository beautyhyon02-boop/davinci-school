'use client'
import { useState } from 'react'
import { KOREA_MAP } from '@/lib/map/korea'
import { SIDOS, type Sido } from '@/lib/academies/sido'
import type { MapGroups, MapAcademy } from '@/lib/academies/map-group'
import { pages } from '@/content/site'

const copy = pages.franchiseMap

/**
 * 전국 가맹원 지도(설계 2026-10-25 §4.2): 왼쪽 SVG(가맹원 있는 시·도 민트 + 숫자), 오른쪽 전체 수·시·도 칩·이름 목록.
 * 시·도를 고르면(경로 또는 칩) 그 지역만; 고르지 않으면 전체를 시·도별 작은 제목 아래에. 홈페이지 있는 원만 새 창 링크.
 */
export function FranchiseMap({ groups }: { groups: MapGroups }) {
  const [picked, setPicked] = useState<Sido | null>(null)
  const count = (s: Sido) => groups.bySido[s]?.count ?? 0
  const toggle = (s: Sido) => setPicked((p) => (p === s ? null : s))
  const present = SIDOS.filter((s) => count(s) > 0)
  const shown: Sido[] = picked ? (count(picked) > 0 ? [picked] : []) : present

  return (
    <div className="grid gap-8 md:grid-cols-[1.1fr_1fr]">
      <svg viewBox={KOREA_MAP.viewBox} role="group" className="w-full max-w-xl" aria-label={copy.title}>
        {KOREA_MAP.sidos.map((s) => {
          const n = count(s.code)
          const fill = picked === s.code ? 'fill-mint-300' : n > 0 ? 'fill-mint-200 hover:fill-mint-300' : 'fill-ink-100 hover:fill-ink-300/60'
          return (
            <path
              key={s.code}
              d={s.d}
              fillRule="evenodd"
              role="button"
              tabIndex={0}
              aria-label={copy.regionAria(s.code, n)}
              aria-pressed={picked === s.code}
              className={`cursor-pointer stroke-[1.5] outline-none transition focus-visible:stroke-ink-900 focus-visible:stroke-[3] ${fill} ${picked === s.code ? 'stroke-mint-700' : n > 0 ? 'stroke-white' : 'stroke-ink-300'}`}
              onClick={() => toggle(s.code)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s.code) } }}
            />
          )
        })}
        {picked && <path d={KOREA_MAP.sidos.find((s) => s.code === picked)!.d} fillRule="evenodd" className="pointer-events-none fill-none stroke-mint-700 stroke-[2]" />}
        {KOREA_MAP.sidos.filter((s) => count(s.code) > 0).map((s) => (
          <text key={s.code} aria-hidden="true" x={s.label[0]} y={s.label[1]} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-mint-700 text-[22px] font-extrabold">{count(s.code)}</text>
        ))}
        {KOREA_MAP.markers.map((m) => (
          <g key={m.name}>
            <circle cx={m.x} cy={m.y} r={2.5} className="fill-ink-300" />
            <text x={m.x + 5} y={m.y} dominantBaseline="central" className="fill-ink-500 text-[11px]">{copy.dokdo}</text>
          </g>
        ))}
      </svg>
      <div>
        <p className="text-xl font-extrabold">{copy.total(groups.total)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setPicked(null)} aria-pressed={picked === null} className={`rounded-full px-3 py-1 text-sm ${picked === null ? 'bg-mint-700 text-white' : 'bg-ink-100 text-ink-700'}`}>{copy.allChip}</button>
          {present.map((s) => (
            <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={picked === s} className={`rounded-full px-3 py-1 text-sm ${picked === s ? 'bg-mint-700 text-white' : 'bg-ink-100 text-ink-700'}`}>{copy.chip(s, count(s))}</button>
          ))}
        </div>
        <div className="mt-5 space-y-5">
          {picked && count(picked) === 0 && <p className="text-ink-500">{copy.none(picked)}</p>}
          {shown.map((s) => (
            <div key={s}>
              <h3 className="text-sm font-semibold text-ink-500">{copy.chip(s, count(s))}</h3>
              <ul className="mt-1 space-y-1">
                {(groups.bySido[s]?.items ?? []).map((a) => <li key={a.name}><AcademyName a={a} /></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-ink-500">{copy.credit}</p>
      </div>
    </div>
  )
}

function AcademyName({ a }: { a: MapAcademy }) {
  if (!/^https?:\/\//i.test(a.website)) return <span className="text-ink-700">{a.name}</span>
  return (
    <a href={a.website} target="_blank" rel="noopener noreferrer" className="font-semibold text-mint-700 underline-offset-2 hover:underline" title={copy.newWindow}>
      {a.name} <span aria-hidden="true">↗</span>
    </a>
  )
}
