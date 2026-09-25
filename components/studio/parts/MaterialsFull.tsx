import type { z } from 'zod'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Histogram } from '../Histogram'
import { RelativeFreqBars } from '../RelativeFreqBars'
import { detectChart } from '@/lib/studio/charts'
import { cleanMaterialTitle } from '@/lib/studio/materials'
import type { Material as MaterialSchema } from '@/lib/studio/schemas'
import { app } from '@/content/site'
import { arr } from './common'

// 자료 전체 보기 — 제목(출처 표기 낱말 정리)·본문·표 전체(행을 자르지 않음)·자동 그래프·첨부 이미지.
// 원장 패키지 화면(PackageView)·학생 차시 패널(MaterialsSection)·제작소 4단계 탭이 같은 모양을 쓴다(오너 규칙 2026-09-26:
// 단계 탭은 요약이 아니라 학생·원장이 보는 완성본 그대로). 저장된 출력을 그대로 받으므로 모든 필드를 느슨하게 읽는다.

type Material = z.infer<typeof MaterialSchema>
export type MaterialLike = {
  id: string
  title: string
  kind?: string
  body?: string | null
  table?: { columns: string[]; rows: (string | number)[][] } | null
  source?: { kind?: string; attribution?: string | null } | string | null
  images?: string[] | null
}

const copy = app.packageView
const SPLIT_ROWS_OVER = 12

function TableGrid({ columns, rows, className }: { columns: string[]; rows: (string | number)[][]; className: string }) {
  return (
    <table className={className}>
      <thead>
        <tr className="border-b border-ink-100 text-ink-500">
          {columns.map((col, i) => <th key={i} className="px-3 py-1 text-center">{col}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-ink-50">
            {row.map((cell, j) => <td key={j} className={`px-3 py-1 ${typeof cell === 'number' ? 'text-center tabular-nums' : 'text-left'}`}>{String(cell)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function MaterialTable({ material }: { material: MaterialLike }) {
  if (!material.table) return null
  const columns = arr(material.table.columns)
  const rows = arr(material.table.rows)
  // 두 열짜리 긴 표(부스 20개 등)는 반으로 나눠 나란히 — 세로 스크롤을 절반으로(대표님 요청 2026-09-23).
  if (columns.length === 2 && rows.length > SPLIT_ROWS_OVER) {
    const half = Math.ceil(rows.length / 2)
    return (
      <div className="mx-auto mt-2 grid max-w-[560px] grid-cols-2 gap-6 text-sm">
        <TableGrid columns={columns} rows={rows.slice(0, half)} className="w-full" />
        <TableGrid columns={columns} rows={rows.slice(half)} className="w-full" />
      </div>
    )
  }
  return (
    <div className="mt-2 overflow-x-auto">
      {/* 표는 가운데 정렬, 너무 넓지 않게(최대 560px). 머리글·숫자 칸은 가운데, 글자 칸은 왼쪽. */}
      <TableGrid columns={columns} rows={rows} className="mx-auto w-full max-w-[560px] min-w-[320px] text-sm" />
    </div>
  )
}

export function MaterialChart({ material }: { material: MaterialLike }) {
  if (!material.table || !Array.isArray(material.table.rows) || !Array.isArray(material.table.columns)) return null
  // detectChart 는 kind·table·title 만 읽는다
  const spec = detectChart(material as Material)
  if (!spec) return null
  // 그래프는 가운데, 최대 480px — 넓은 화면에서 화면을 다 차지하지 않게(대표님 요청 2026-09-23).
  if (spec.kind === 'histogram') return <div className="mx-auto mt-3 w-full max-w-[480px]"><Histogram values={spec.values} binSize={spec.binSize} title={spec.title} /></div>
  return <div className="mx-auto mt-3 w-full max-w-[480px]"><RelativeFreqBars rows={spec.rows} columns={spec.columns} title={spec.title} /></div>
}

/**
 * 자료 목록(카드 틀 없이). sharedIds = 대주제 공유 자료의 ID — 제작소 4단계 탭에서 세트 자료와 구별해 '공유' 배지를 단다.
 */
export function MaterialsFull({ materials, sharedIds = [] }: { materials: MaterialLike[]; sharedIds?: string[] }) {
  const c = copy.materials
  return (
    <div className="mt-3 space-y-6">
      {materials.map((m) => {
        const source = m.source && typeof m.source === 'object' ? m.source : null
        const images = arr(m.images)
        return (
          <div key={m.id} data-print="material" data-material-id={m.id} className="rounded-xl border border-ink-100 bg-ink-100/30 p-4">
            {/* 자료마다 큰 라벨(자료 A/B…)로 구분이 한눈에 보이게. 공개 자료 출처만 배지로(스펙 §2.4, 2026-09-26 수정). */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-mint-500 px-3 py-1 text-sm font-bold text-white">{c.idLabel} {m.id}</span>
              <p className="text-base font-bold">{cleanMaterialTitle(m.title ?? '')}</p>
              {sharedIds.includes(m.id) && <Badge tone="lavender">{c.sharedBadge}</Badge>}
              {/* 대표님 지시(2026-09-26): 자작·원자료 같은 내부 표지는 화면에 내지 않는다. 공개 자료의 출처만 남긴다(공공누리 표기 의무). */}
              {source?.kind === '공개' && source.attribution && <Badge tone="gray">{c.sourceLabel.공개} · {source.attribution}</Badge>}
            </div>
            {m.body && <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>}
            <MaterialTable material={m} />
            <MaterialChart material={m} />
            {images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={c.imagesAlt(m.title, i + 1)} className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 자료 카드(제목 + 목록). 원장 패키지 화면과 학생 차시 패널이 쓴다 — 문제지 인쇄에도 남는 칸(print="keep"). */
export function MaterialsSection({ materials }: { materials: MaterialLike[] }) {
  if (materials.length === 0) return null
  return (
    <Card print="keep">
      <h2 className="text-lg font-bold">{copy.materialsHeading}</h2>
      <MaterialsFull materials={materials} />
    </Card>
  )
}
