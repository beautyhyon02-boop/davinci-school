import { describe, it, expect } from 'vitest'
import { stemWithPoints, repairAssessment, repairOutput } from '@/lib/studio/repair'

// 2026-10-01 영어 세트 5단계가 "문두는 "[16점]"으로 끝나야 함"으로 두 번 실패 — 배점 표기만 기계적으로 맞춘다
describe('stemWithPoints', () => {
  it('appends the points tag when missing', () => {
    expect(stemWithPoints('자료 1과 2를 읽고 부스 안내문을 영어로 쓰시오.', 16)).toBe('자료 1과 2를 읽고 부스 안내문을 영어로 쓰시오. [16점]')
  })
  it('keeps a correct tag as is (trimmed)', () => {
    expect(stemWithPoints('  …쓰시오. [6점]  ', 6)).toBe('…쓰시오. [6점]')
  })
  it('replaces a wrong or differently written tag', () => {
    expect(stemWithPoints('…쓰시오. [6점]', 16)).toBe('…쓰시오. [16점]')
    expect(stemWithPoints('…쓰시오. (16점)', 16)).toBe('…쓰시오. [16점]')
    expect(stemWithPoints('…쓰시오. 16점', 16)).toBe('…쓰시오. [16점]')
    expect(stemWithPoints('…쓰시오.［16점］', 16)).toBe('…쓰시오. [16점]')
  })
  it('does not touch numbers inside the stem', () => {
    expect(stemWithPoints('2점 차이가 나는 까닭을 쓰시오.', 6)).toBe('2점 차이가 나는 까닭을 쓰시오. [6점]')
  })
})

describe('repairAssessment / repairOutput', () => {
  it('fixes every item stem and leaves everything else untouched', () => {
    const raw = { items: [{ stem: 'A', points: 6, kind: '서술형' }, { stem: 'B [16점]', points: 16 }, { stem: 'C', points: 'x' }, null], other: 1 }
    expect(repairAssessment(raw)).toEqual({ items: [{ stem: 'A [6점]', points: 6, kind: '서술형' }, { stem: 'B [16점]', points: 16 }, { stem: 'C', points: 'x' }, null], other: 1 })
  })
  it('passes through non-objects and other stages', () => {
    expect(repairAssessment(null)).toBeNull()
    expect(repairAssessment({ items: 'no' })).toEqual({ items: 'no' })
    const raw = { items: [{ stem: 'A', points: 6 }] }
    expect(repairOutput(3, raw)).toBe(raw)
    expect(repairOutput(5, raw)).toEqual({ items: [{ stem: 'A [6점]', points: 6 }] })
  })
})
