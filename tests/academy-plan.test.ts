import { describe, it, expect } from 'vitest'
import { PLANS, canUseRed, canUseEssay, isPlan, DEFAULT_PLAN } from '@/lib/academies/plan'
import { parseAcademy } from '@/lib/academies/validate'

// 없앤 옛 상품 값 — 글자를 쪼개 둔다(코드 쪽에 옛 값 글자가 남지 않았는지 grep 으로 확인하기 위해)
const OLD_PLAN = 'essay_only'

// 대표 2026-10-29 「가맹 상품 두 단계」: 다빈치올(RED·서논술) / 다빈치 베이직(RED 만)
describe('plan', () => {
  it('PLANS 는 다빈치올·다빈치 베이직 둘, 기본은 베이직', () => {
    expect(PLANS).toEqual(['davinci', 'davinci_basic'])
    expect(DEFAULT_PLAN).toBe('davinci_basic')
    expect(isPlan('davinci')).toBe(true)
    expect(isPlan('davinci_basic')).toBe(true)
    expect(isPlan(OLD_PLAN)).toBe(false)
    expect(isPlan('premium')).toBe(false)
    expect(isPlan(null)).toBe(false)
  })
  it('RED 는 관리자, 또는 두 상품 원장 모두', () => {
    expect(canUseRed('admin', null)).toBe(true)
    expect(canUseRed('teacher', 'davinci')).toBe(true)
    expect(canUseRed('teacher', 'davinci_basic')).toBe(true)
    expect(canUseRed('teacher', null)).toBe(false)
    expect(canUseRed('student', 'davinci')).toBe(false)
    expect(canUseRed(null, null)).toBe(false)
  })
  it('서논술은 관리자, 또는 다빈치올 원장만', () => {
    expect(canUseEssay('admin', null)).toBe(true)
    expect(canUseEssay('teacher', 'davinci')).toBe(true)
    expect(canUseEssay('teacher', 'davinci_basic')).toBe(false)
    expect(canUseEssay('teacher', null)).toBe(false)
    expect(canUseEssay('student', 'davinci')).toBe(false)
    expect(canUseEssay(null, null)).toBe(false)
  })
})

describe('parseAcademy 의 plan', () => {
  const fd = (plan?: string) => {
    const f = new FormData(); f.set('code', 'abc123'); f.set('name', '테스트원')
    if (plan !== undefined) f.set('plan', plan)
    return f
  }
  it('비어 있으면 다빈치 베이직(davinci_basic)', () => {
    const r = parseAcademy(fd())
    expect(r.ok && r.data.plan).toBe(DEFAULT_PLAN)
    const r2 = parseAcademy(fd(''))
    expect(r2.ok && r2.data.plan).toBe('davinci_basic')
  })
  it('davinci 를 고르면 그대로', () => {
    const r = parseAcademy(fd('davinci'))
    expect(r.ok && r.data.plan).toBe('davinci')
  })
  it('옛 값과 모르는 값은 거절', () => {
    expect(parseAcademy(fd(OLD_PLAN)).ok).toBe(false)
    expect(parseAcademy(fd('gold')).ok).toBe(false)
  })
})
