import { z } from 'zod'
import { Material as MaterialSchema } from './schemas'

type Material = z.infer<typeof MaterialSchema>

export interface HistogramBin {
  from: number
  to: number
  count: number
}

/**
 * 값 목록을 계급 구간으로 나눠 도수를 센다. 구간은 [from, to) 반열림이며,
 * 마지막 구간은 최댓값을 포함한다 (경계값이 새 구간의 시작과 겹쳐도 마지막 구간에 합산).
 */
export function histogramBins(values: number[], binSize: number, start?: number): HistogramBin[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const startValue = start ?? Math.floor(min / binSize) * binSize
  const binCount = Math.max(1, Math.ceil((max - startValue) / binSize))
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    from: startValue + i * binSize,
    to: startValue + (i + 1) * binSize,
    count: 0,
  }))
  for (const v of values) {
    let idx = Math.floor((v - startValue) / binSize)
    if (idx < 0) idx = 0
    if (idx >= bins.length) idx = bins.length - 1
    bins[idx].count++
  }
  return bins
}

export interface RelativeFrequencyRow {
  label: string
  rel: number[]
}

export interface RelativeFrequencyResult {
  rows: RelativeFrequencyRow[]
  totals: number[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 행별 도수를 열 합계로 나눠 상대도수를 구한다 (소수 둘째 자리 반올림). 열 합계도 함께 반환한다.
 * 값이 셀 단위로 반올림되므로, 한 행의 rel 값 합이 정확히 1이 되지 않을 수 있다.
 */
export function relativeFrequencies(rows: { label: string; counts: number[] }[]): RelativeFrequencyResult {
  const colCount = rows.reduce((max, r) => Math.max(max, r.counts.length), 0)
  const totals = Array.from({ length: colCount }, (_, col) =>
    rows.reduce((sum, r) => sum + (r.counts[col] ?? 0), 0)
  )
  const outRows = rows.map((r) => ({
    label: r.label,
    rel: r.counts.map((c, col) => (totals[col] ? round2(c / totals[col]) : 0)),
  }))
  return { rows: outRows, totals }
}

export type ChartSpec =
  | { kind: 'histogram'; values: number[]; binSize: number; title: string }
  | { kind: 'relbars'; rows: { label: string; counts: number[] }[]; columns: string[]; title: string }
  | null

const SUM_ROW_RE = /^(합계|총계|total)$/i

function isNumber(v: unknown): v is number {
  return typeof v === 'number'
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

/**
 * 자료 표에서 어떤 그래프를 그릴 수 있는지 판별한다.
 * - 숫자 값이 10개 이상인 단일 숫자 열(맨 앞에 '부스'처럼 라벨/번호 열이 있어도 됨) 또는 단일 숫자 행 → histogram
 * - 첫 열이 문자열 라벨이고 숫자 열이 2개 이상, 행이 12개 이하 → relbars (합계/총계 행은 제외)
 * - 그 외 → null
 */
export function detectChart(material: Material): ChartSpec {
  if (material.kind !== 'table' || !material.table) return null
  const { columns, rows } = material.table
  if (rows.length === 0) return null

  // 단일 숫자 행: 표가 한 행이고 숫자 값이 10개 이상 (가로로 나열된 값)
  if (rows.length === 1 && rows[0].length >= 10 && rows[0].every(isNumber)) {
    return { kind: 'histogram', values: rows[0] as number[], binSize: 10, title: material.title }
  }

  // 단일 숫자 열: 열이 1개(값만) 또는 2개(라벨/번호 열 + 값 열)이고 행이 10개 이상
  if (rows.length >= 10) {
    if (columns.length === 1 && rows.every((r) => isNumber(r[0]))) {
      return { kind: 'histogram', values: rows.map((r) => r[0] as number), binSize: 10, title: material.title }
    }
    if (columns.length === 2 && rows.every((r) => isNumber(r[1]))) {
      return { kind: 'histogram', values: rows.map((r) => r[1] as number), binSize: 10, title: material.title }
    }
  }

  // 상대도수 막대: 첫 열이 문자열 라벨, 숫자 열이 2개 이상, 합계/총계 행은 제외하고 12행 이하
  let dataRows = rows
  const lastRow = rows[rows.length - 1]
  if (lastRow && isString(lastRow[0]) && SUM_ROW_RE.test(lastRow[0].trim())) {
    dataRows = rows.slice(0, -1)
  }
  const numericColCount = columns.length - 1
  const isRelbarsShape =
    dataRows.length >= 1 &&
    dataRows.length <= 12 &&
    numericColCount >= 2 &&
    dataRows.every((r) => isString(r[0]) && r.slice(1).every(isNumber))
  if (isRelbarsShape) {
    return {
      kind: 'relbars',
      rows: dataRows.map((r) => ({ label: r[0] as string, counts: r.slice(1) as number[] })),
      columns: columns.slice(1),
      title: material.title,
    }
  }

  return null
}
