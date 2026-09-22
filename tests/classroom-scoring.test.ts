import { describe, it, expect } from 'vitest'
import { gradeFor, overallFor } from '@/lib/classroom/scoring'

const boundaries = [
  { grade: 1, min: 21, max: 22, band: '상' as const }, { grade: 2, min: 18, max: 20, band: '상' as const },
  { grade: 3, min: 15, max: 17, band: '중' as const }, { grade: 4, min: 11, max: 14, band: '중' as const },
  { grade: 5, min: 8, max: 10, band: '중' as const }, { grade: 6, min: 5, max: 7, band: '하' as const },
  { grade: 7, min: 0, max: 4, band: '하' as const },
]
const items = [{ points: 3 }, { points: 3 }, { points: 16 }]

describe('gradeFor', () => {
  it('maps a total to the boundary row', () => {
    expect(gradeFor(boundaries, 17)).toEqual({ grade: 3, band: '중' })
    expect(gradeFor(boundaries, 0)).toEqual({ grade: 7, band: '하' })
    expect(gradeFor(boundaries, 22)).toEqual({ grade: 1, band: '상' })
  })
  it('returns null outside the table', () => {
    expect(gradeFor(boundaries, 23)).toBeNull()
    expect(gradeFor(boundaries, -1)).toBeNull()
  })
})

describe('overallFor', () => {
  it('sums confirmed scores and reports completeness', () => {
    expect(overallFor(items, [2, 3, 12])).toEqual({ total: 17, max: 22, complete: true })
    expect(overallFor(items, [2, null, 12])).toEqual({ total: 14, max: 22, complete: false })
  })
})
