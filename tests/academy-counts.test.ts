import { describe, it, expect } from 'vitest'
import { countByAcademy } from '@/lib/academies/counts'

describe('countByAcademy', () => {
  it('aggregates teacher and student counts per academy', () => {
    const rows = [
      { academy_id: 'a', role: 'teacher' },
      { academy_id: 'a', role: 'student' },
      { academy_id: 'a', role: 'student' },
      { academy_id: 'b', role: 'teacher' },
      { academy_id: null, role: 'admin' },
      { academy_id: 'a', role: 'admin' },
    ]
    const r = countByAcademy(rows)
    expect(r.a).toEqual({ teachers: 1, students: 2 })
    expect(r.b).toEqual({ teachers: 1, students: 0 })
    expect(r.c).toBeUndefined()
  })

  it('returns empty object for empty input', () => {
    expect(countByAcademy([])).toEqual({})
  })
})
