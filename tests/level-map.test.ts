// tests/level-map.test.ts
import { describe, it, expect } from 'vitest'
import { levelMapFor, levelRefFor, GRADE_TABLE_22 } from '@/lib/studio/level-map'

describe('levelMapFor', () => {
  it('splits 16 points by the KICE cuts, E reaches 0', () => {
    expect(levelMapFor(16).map((l) => [l.level, l.min, l.max])).toEqual([['A', 15, 16], ['B', 13, 14], ['C', 12, 12], ['D', 10, 11], ['E', 0, 9]])
  })
  it('handles 3 points without overlaps and covers 0..3', () => {
    expect(levelMapFor(3).map((l) => [l.level, l.min, l.max])).toEqual([['A', 3, 3], ['B', 2, 2], ['C', 1, 1], ['D', 0, 0], ['E', 0, 0]])
  })
  it('grade table is contiguous 0..22 with reference levels', () => {
    const rows = [...GRADE_TABLE_22].sort((a, b) => a.min - b.min)
    expect(rows[0].min).toBe(0); expect(rows[6].max).toBe(22)
    for (let i = 1; i < rows.length; i++) expect(rows[i].min).toBe(rows[i - 1].max + 1)
    expect(levelRefFor(7)).toBe('A'); expect(levelRefFor(3)).toBe('E'); expect(levelRefFor(1)).toBe('E 미만')
  })
})
