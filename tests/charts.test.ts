import { describe, it, expect } from 'vitest'
import { histogramBins, relativeFrequencies, detectChart } from '@/lib/studio/charts'
import fixture from '@/data/studio-fixtures/stage4-generate.json'

const materials = (fixture as { materials: unknown[] }).materials as Array<{
  id: string
  title: string
  kind: 'table' | 'text' | 'chart'
  body: string | null
  table: { columns: string[]; rows: (string | number)[][] } | null
  source: '자작'
}>

const materialA = materials.find((m) => m.id === 'A')!
const materialB = materials.find((m) => m.id === 'B')!

describe('histogramBins', () => {
  it('bins 자료 A values (20 values, binSize 10) into the expected frequencies', () => {
    const values = materialA.table!.rows.map((r) => r[1] as number)
    const bins = histogramBins(values, 10)
    expect(bins.map((b) => b.count)).toEqual([1, 3, 6, 5, 4, 1])
    expect(bins.map((b) => [b.from, b.to])).toEqual([
      [10, 20],
      [20, 30],
      [30, 40],
      [40, 50],
      [50, 60],
      [60, 70],
    ])
  })

  it('defaults start to floor(min/binSize)*binSize', () => {
    const bins = histogramBins([12, 15, 22], 10)
    expect(bins[0].from).toBe(10)
  })

  it('includes the max value in the last bin even when it lands on a boundary', () => {
    const bins = histogramBins([10, 20, 30, 70], 10, 10)
    expect(bins[bins.length - 1]).toMatchObject({ from: 60, to: 70, count: 1 })
  })

  it('returns an empty array for no values', () => {
    expect(histogramBins([], 10)).toEqual([])
  })
})

describe('relativeFrequencies', () => {
  it('computes 자료 B relative frequencies rounded to 2 decimals, with column totals', () => {
    const rows = materialB.table!.rows
      .filter((r) => r[0] !== '합계')
      .map((r) => ({ label: r[0] as string, counts: [r[1] as number, r[2] as number] }))
    const result = relativeFrequencies(rows)
    expect(result.totals).toEqual([1200, 1350])
    const plastic = result.rows.find((r) => r.label === '플라스틱컵')!
    expect(plastic.rel).toEqual([0.24, 0.3])
  })
})

describe('detectChart', () => {
  it('detects a histogram for 자료 A (a single value column with a 부스 index column, 20 rows)', () => {
    const spec = detectChart(materialA)
    expect(spec?.kind).toBe('histogram')
    if (spec?.kind === 'histogram') {
      expect(spec.values).toHaveLength(20)
      expect(spec.binSize).toBe(10)
    }
  })

  it('detects relbars for 자료 B (string labels, 2 numeric columns, skipping the 합계 row)', () => {
    const spec = detectChart(materialB)
    expect(spec?.kind).toBe('relbars')
    if (spec?.kind === 'relbars') {
      expect(spec.rows).toHaveLength(5)
      expect(spec.rows.some((r) => r.label === '합계')).toBe(false)
      expect(spec.columns).toEqual(['작년 (부스 16곳)', '올해 (부스 20곳)'])
    }
  })

  it('returns null for a text material', () => {
    const textMaterial = {
      id: 'C',
      title: '설명',
      kind: 'text' as const,
      body: '그냥 설명 문구입니다.',
      table: null,
      source: '자작' as const,
    }
    expect(detectChart(textMaterial)).toBeNull()
  })

  it('detects a histogram when values are laid out as a single numeric row', () => {
    const rowMaterial = {
      id: 'E',
      title: '가로로 나열된 값',
      kind: 'table' as const,
      body: null,
      table: {
        columns: Array.from({ length: 12 }, (_, i) => `값${i + 1}`),
        rows: [[18, 23, 27, 29, 31, 33, 35, 36, 38, 39, 41, 42]],
      },
      source: '자작' as const,
    }
    const spec = detectChart(rowMaterial)
    expect(spec?.kind).toBe('histogram')
    if (spec?.kind === 'histogram') {
      expect(spec.values).toHaveLength(12)
    }
  })

  it('returns null for a table that is neither shape', () => {
    const oddMaterial = {
      id: 'D',
      title: '이상한 표',
      kind: 'table' as const,
      body: null,
      table: { columns: ['a', 'b', 'c'], rows: [[1, 2, 3]] },
      source: '자작' as const,
    }
    expect(detectChart(oddMaterial)).toBeNull()
  })
})
