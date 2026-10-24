import { describe, it, expect } from 'vitest'
import { SIDOS, isSido, toSido } from '@/lib/academies/sido'

// 설계 2026-10-25 §2.1 — 시·도 값은 짧은 이름 17개
describe('시·도', () => {
  it('17개, 겹침 없음, 정해진 순서', () => {
    expect(SIDOS).toEqual(['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'])
    expect(new Set(SIDOS).size).toBe(17)
  })
  it('isSido 는 짧은 이름만 받는다', () => {
    expect(isSido('서울')).toBe(true)
    expect(isSido('서울특별시')).toBe(false)
    expect(isSido('')).toBe(false)
    expect(isSido(null)).toBe(false)
  })
  it('toSido 는 긴 이름·옛 이름·공백을 짧은 이름으로 맞춘다', () => {
    expect(toSido('서울특별시')).toBe('서울')
    expect(toSido(' 경기도 ')).toBe('경기')
    expect(toSido('전라북도')).toBe('전북')
    expect(toSido('전북특별자치도')).toBe('전북')
    expect(toSido('강원특별자치도')).toBe('강원')
    expect(toSido('강원도')).toBe('강원')
    expect(toSido('충청북도')).toBe('충북')
    expect(toSido('충청남도')).toBe('충남')
    expect(toSido('전라남도')).toBe('전남')
    expect(toSido('경상북도')).toBe('경북')
    expect(toSido('경상남도')).toBe('경남')
    expect(toSido('제주특별자치도')).toBe('제주')
    expect(toSido('세종특별자치시')).toBe('세종')
    expect(toSido('부산광역시')).toBe('부산')
    expect(toSido('대구')).toBe('대구')
  })
  it('모르는 이름은 null — 지어내지 않는다', () => {
    expect(toSido('평양')).toBeNull()
    expect(toSido('')).toBeNull()
    expect(toSido('경')).toBeNull()
  })
})
