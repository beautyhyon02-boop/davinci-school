import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FranchiseMap } from '@/components/site/FranchiseMap'
import { groupBySido } from '@/lib/academies/map-group'
import { pages } from '@/content/site'

// 설계 2026-10-25 §4.2 — 서버 렌더(고르기 전 = 전체 보기)
const copy = pages.franchiseMap
const rows = [
  { name: '하늘원', sido: '경기' as const, website: 'https://a.example.com/' },
  { name: '가온원', sido: '경기' as const, website: '' },
  { name: '바다원', sido: '부산' as const, website: 'https://b.example.com/' },
]
const html = renderToStaticMarkup(createElement(FranchiseMap, { groups: groupBySido(rows) }))

describe('FranchiseMap', () => {
  it('17개 시·도 경로를 그리고 가맹원 있는 곳에 숫자를 찍는다', () => {
    expect(html.split('<path').length - 1).toBe(17)
    expect(html).toContain(`aria-label="${copy.regionAria('경기', 2)}"`)
    expect(html).toContain(`aria-label="${copy.regionAria('부산', 1)}"`)
    expect(html).toContain(`aria-label="${copy.regionAria('서울', 0)}"`)
    expect(html).toMatch(/<text[^>]*>2<\/text>/)
  })
  it('전체 수·시·도 칩(있는 곳만)·이름 한 줄에 하나', () => {
    expect(html).toContain(copy.total(3))
    // 칩·소제목은 요소 글자로만 비교(지도 aria-label '서울 0곳' 에 걸리지 않게 > < 로 감싼다)
    expect(html).toContain(`>${copy.chip('경기', 2)}<`)
    expect(html).toContain(`>${copy.chip('부산', 1)}<`)
    expect(html).not.toContain(`>${copy.chip('서울', 0)}<`)
    expect(html.indexOf('가온원')).toBeLessThan(html.indexOf('하늘원'))
  })
  it('홈페이지 있는 원만 새 창 링크', () => {
    expect(html).toContain('href="https://a.example.com/" target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('href="https://b.example.com/"')
    expect(html).not.toContain('href="https://b.example.com/x')
    expect(html).toMatch(/<li[^>]*>\s*<span[^>]*>가온원<\/span>/)
  })
  it('출처와 독도 표식', () => {
    expect(html).toContain(copy.credit)
    expect(html).toContain(copy.dokdo)
  })
  it('연락처·코드 같은 칸은 애초에 받지 않는다', () => {
    expect(html).not.toMatch(/010-|director|code/)
  })
})
