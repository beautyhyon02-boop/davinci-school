import { describe, it, expect } from 'vitest'
import { KOREA_MAP } from '@/lib/map/korea'
import { SIDOS } from '@/lib/academies/sido'

// 설계 2026-10-25 §3 — Natural Earth 변환 결과. 17개 모두, 경로 비지 않음, 숫자 자리 두 수.
describe('korea-sido.json', () => {
  it('17개 시·도가 한 번씩, 코드는 SIDOS 와 같다', () => {
    expect(KOREA_MAP.sidos.map((s) => s.code).sort()).toEqual([...SIDOS].sort())
    expect(new Set(KOREA_MAP.sidos.map((s) => s.code)).size).toBe(17)
  })
  it('경로는 비지 않고 M 으로 시작, 숫자 자리는 viewBox 안', () => {
    const [, , w, h] = KOREA_MAP.viewBox.split(' ').map(Number)
    for (const s of KOREA_MAP.sidos) {
      expect(s.d.length).toBeGreaterThan(20)
      expect(s.d.startsWith('M')).toBe(true)
      const [x, y] = s.label
      expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(w)
      expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(h)
    }
  })
  it('경기는 서울 자리가 구멍으로 뚫려 있고(M 이 여럿) 숫자는 서울 숫자와 15px 이상 떨어져 있다', () => {
    const g = KOREA_MAP.sidos.find((s) => s.code === '경기')!
    const seoul = KOREA_MAP.sidos.find((s) => s.code === '서울')!
    expect(g.d.split('M').length - 1).toBeGreaterThan(1)
    expect(Math.hypot(g.label[0] - seoul.label[0], g.label[1] - seoul.label[1])).toBeGreaterThan(15)
  })
  it('viewBox 는 너비 600, 출처는 Natural Earth, 독도 표식이 있다', () => {
    expect(KOREA_MAP.viewBox).toMatch(/^0 0 600 \d+$/)
    expect(KOREA_MAP.source).toContain('Natural Earth')
    expect(KOREA_MAP.markers.map((m) => m.name)).toContain('독도')
  })
  it('파일 크기가 200KB 아래(공개 페이지 무게)', () => {
    expect(JSON.stringify(KOREA_MAP).length).toBeLessThan(200_000)
  })
})
