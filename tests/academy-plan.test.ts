import { describe, it, expect } from 'vitest'
import { canUseRed, isPlan, DEFAULT_PLAN } from '@/lib/academies/plan'
import { parseAcademy } from '@/lib/academies/validate'

// PRD 2026-10-20 「RED 이용 권한 분리」
describe('plan', () => {
  it('isPlan 은 두 값만 받는다', () => {
    expect(isPlan('davinci')).toBe(true)
    expect(isPlan('essay_only')).toBe(true)
    expect(isPlan('premium')).toBe(false)
    expect(isPlan(null)).toBe(false)
  })
  it('RED 는 관리자, 또는 다빈치스쿨 가맹 원장만', () => {
    expect(canUseRed('admin', null)).toBe(true)
    expect(canUseRed('teacher', 'davinci')).toBe(true)
    expect(canUseRed('teacher', 'essay_only')).toBe(false)
    expect(canUseRed('teacher', null)).toBe(false)
    expect(canUseRed('student', 'davinci')).toBe(false)
    expect(canUseRed(null, null)).toBe(false)
  })
})

describe('parseAcademy 의 plan', () => {
  const fd = (plan?: string) => {
    const f = new FormData(); f.set('code', 'abc123'); f.set('name', '테스트원')
    if (plan !== undefined) f.set('plan', plan)
    return f
  }
  it('비어 있으면 서논술 전용(essay_only)', () => {
    const r = parseAcademy(fd())
    expect(r.ok && r.data.plan).toBe(DEFAULT_PLAN)
    const r2 = parseAcademy(fd(''))
    expect(r2.ok && r2.data.plan).toBe('essay_only')
  })
  it('davinci 를 고르면 그대로', () => {
    const r = parseAcademy(fd('davinci'))
    expect(r.ok && r.data.plan).toBe('davinci')
  })
  it('모르는 값은 거절', () => {
    expect(parseAcademy(fd('gold')).ok).toBe(false)
  })
})
