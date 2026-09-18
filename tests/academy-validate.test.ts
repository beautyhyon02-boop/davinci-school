import { describe, it, expect } from 'vitest'
import { parseAcademy } from '@/lib/academies/validate'

function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('parseAcademy', () => {
  it('accepts valid academy and lowercases code', () => {
    const r = parseAcademy(fd({ code: 'Seoul01', name: '다빈치 서울점', region: '서울', director_phone: '01012345678' }))
    expect(r.ok && r.data.code).toBe('seoul01')
  })
  it('rejects code with hyphen', () => {
    expect(parseAcademy(fd({ code: 'seoul-01', name: 'x', region: '', director_phone: '' })).ok).toBe(false)
  })
})
