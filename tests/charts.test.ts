import { describe, it, expect } from 'vitest'
import { histogramBins, relativeFrequencies, detectChart, binnedFromTable, parseClassLabel } from '@/lib/studio/charts'
import fixture from '@/data/studio-fixtures/stage4-generate.json'
import type { z } from 'zod'
import type { Material } from '@/lib/studio/schemas'

// 차트 검출은 table 만 읽는다 — 자료 모양은 v2 Material 타입으로 본다(fixture 는 T6에서 v2로 재생성)
const materials = (fixture as { materials: unknown[] }).materials as z.infer<typeof Material>[]

// 그래프는 kind 'chart' 자료에만 그린다(2026-10-01) — fixture 의 표 자료를 chart 로 바꿔 검출 모양만 본다
const materialA = { ...materials.find((m) => m.id === 'A')!, kind: 'chart' as const }
const materialB = { ...materials.find((m) => m.id === 'B')!, kind: 'chart' as const }

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

  it('returns null for a table material — 표는 표로만 보인다(학생이 만들 그래프를 미리 보여 주지 않는다)', () => {
    expect(detectChart(materials.find((m) => m.id === 'A')!)).toBeNull()
    expect(detectChart(materials.find((m) => m.id === 'B')!)).toBeNull()
  })

  it('returns null for a text material', () => {
    const textMaterial = {
      id: 'C',
      title: '설명',
      kind: 'text' as const,
      body: '그냥 설명 문구입니다.',
      table: null,
      source: { kind: '자작' as const, attribution: null, ai_assisted: false },
      role: 'raw' as const,
      images: [] as string[],
    }
    expect(detectChart(textMaterial)).toBeNull()
  })

  it('detects a histogram when values are laid out as a single numeric row', () => {
    const rowMaterial = {
      id: 'E',
      title: '가로로 나열된 값',
      kind: 'chart' as const,
      body: null,
      table: {
        columns: Array.from({ length: 12 }, (_, i) => `값${i + 1}`),
        rows: [[18, 23, 27, 29, 31, 33, 35, 36, 38, 39, 41, 42]],
      },
      source: { kind: '자작' as const, attribution: null, ai_assisted: false },
      role: 'raw' as const,
      images: [] as string[],
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
      source: { kind: '자작' as const, attribution: null, ai_assisted: false },
      role: 'raw' as const,
      images: [] as string[],
    }
    expect(detectChart(oddMaterial)).toBeNull()
  })
})

// 2026-10-03 수학 세트 자료 E: kind 'chart' + 이미 센 도수분포표(계급 이름 + 도수) → 완성된 히스토그램(+ 도수분포다각형)
describe('binned chart (읽기용 완성 그래프)', () => {
  const E = {
    id: 'E', title: '올해 축제 부스별 일회용컵 사용 개수의 히스토그램·도수분포다각형', kind: 'chart' as const, body: '직사각형 윗변의 중점을 이은 도수분포다각형이 함께 그려져 있다.',
    table: { columns: ['컵 사용 개수(개)', '부스 수(도수)'], rows: [['10 이상 20 미만', 1], ['20 이상 30 미만', 3], ['30 이상 40 미만', 6], ['40 이상 50 미만', 5], ['50 이상 60 미만', 4], ['60 이상 70 미만', 1]] as (string | number)[][] },
    source: { kind: '자작' as const, attribution: null, ai_assisted: false }, role: 'raw' as const, images: [] as string[],
  }
  it('detects the bins and the polygon flag', () => {
    const spec = detectChart(E)
    expect(spec?.kind).toBe('binned')
    if (spec?.kind === 'binned') {
      expect(spec.bins.map((b) => b.count)).toEqual([1, 3, 6, 5, 4, 1])
      expect(spec.bins[0]).toEqual({ from: 10, to: 20, count: 1 })
      expect(spec.polygon).toBe(true)
    }
  })
  it('reads "10~20" labels, skips a 합계 row, and needs contiguous equal classes', () => {
    expect(binnedFromTable(['계급', '도수'], [['10~20', 2], ['20~30', 5], ['합계', 7]])?.map((b) => b.count)).toEqual([2, 5])
    expect(binnedFromTable(['계급', '도수'], [['10~20', 2], ['30~40', 5]])).toBeNull()      // 이어지지 않음
    expect(binnedFromTable(['계급', '도수'], [['10~20', 2], ['20~40', 5]])).toBeNull()      // 크기가 다름
    expect(binnedFromTable(['품목', '개수'], [['종이컵', 2], ['플라스틱컵', 5]])).toBeNull() // 계급 이름이 아님
    expect(parseClassLabel('10 이상 20 미만')).toEqual({ from: 10, to: 20 })
  })
  it('a table-kind material with the same shape draws nothing (표는 표로만)', () => {
    expect(detectChart({ ...E, kind: 'table' as const })).toBeNull()
  })
})
