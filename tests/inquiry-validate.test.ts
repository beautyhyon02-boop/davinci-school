import { describe, it, expect } from 'vitest'
import { parseInquiry } from '@/lib/inquiries/validate'

function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('parseInquiry', () => {
  it('accepts a valid inquiry and normalizes phone', () => {
    const r = parseInquiry(fd({ name: '김원장', phone: '010 1234 5678', region: '경기 성남', message: '문의합니다' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.phone).toBe('010-1234-5678')
  })
  it('rejects missing name', () => {
    const r = parseInquiry(fd({ name: '', phone: '01012345678', region: '서울' }))
    expect(r.ok).toBe(false)
  })
  it('rejects bad phone', () => {
    const r = parseInquiry(fd({ name: '김', phone: '12', region: '서울' }))
    expect(r.ok).toBe(false)
  })
})
