import { describe, it, expect } from 'vitest'
import { groupSetsByTheme, type PublishedSetRow } from '@/lib/classroom/items-by-theme'

// 원장 「문항 찾기」 두 단계(대표 2026-11-06): 대주제 상자 → 과목 카드. 과목 순서는 국어·영어·수학·과학·사회, 옛 한국사·세계사는 사회로 묶는다.
const rows: PublishedSetRow[] = [
  { id: 's-math', subject: '수학', level: '중', grade: null, version: 2, theme_id: 't-cup', themes: { title: '학교 축제, 일회용품을 줄이자' } },
  { id: 's-kor', subject: '국어', level: '중', grade: null, version: 9, theme_id: 't-cup', themes: { title: '학교 축제, 일회용품을 줄이자' } },
  { id: 's-hist', subject: '한국사', level: '중', grade: null, version: 1, theme_id: 't-cup', themes: { title: '학교 축제, 일회용품을 줄이자' } },
  { id: 's-lib-eng', subject: '영어', level: '중', grade: 2, version: 1, theme_id: 't-lib', themes: { title: '우리 학교 도서관, 모두가 편하게 이용하자' } },
  { id: 's-lib-kor', subject: '국어', level: '중', grade: 2, version: 1, theme_id: 't-lib', themes: { title: '우리 학교 도서관, 모두가 편하게 이용하자' } },
]

describe('groupSetsByTheme', () => {
  it('대주제마다 상자 하나 — 제목·학교급·학년·과목 목록(국어→영어→수학→과학→사회 순)', () => {
    const themes = groupSetsByTheme(rows)
    expect(themes.map((t) => t.id)).toEqual(['t-lib', 't-cup'])   // 제목 가나다: 우리… → 학교…
    const cup = themes[1]
    expect(cup.title).toBe('학교 축제, 일회용품을 줄이자')
    expect(cup.level).toBe('중'); expect(cup.grade).toBeNull()
    expect(cup.subjects.map((s) => s.subject)).toEqual(['국어', '수학', '사회'])
    expect(cup.subjects[2].sets.map((s) => s.id)).toEqual(['s-hist'])   // 한국사 → 사회 묶음
    expect(themes[0].subjects.map((s) => s.subject)).toEqual(['국어', '영어'])
    expect(themes[0].grade).toBe(2)
  })
  it('같은 대주제·과목에 게시 판이 둘이면 둘 다 — 버전 높은 것 먼저', () => {
    const themes = groupSetsByTheme([
      ...rows,
      { id: 's-math-old', subject: '수학', level: '중', grade: null, version: 1, theme_id: 't-cup', themes: { title: '학교 축제, 일회용품을 줄이자' } },
    ])
    const math = themes[1].subjects.find((s) => s.subject === '수학')!
    expect(math.sets.map((s) => [s.id, s.version])).toEqual([['s-math', 2], ['s-math-old', 1]])
  })
  it('대주제 순서는 제목 가나다, 대주제 제목이 없으면 빈 제목 대신 "-"', () => {
    const themes = groupSetsByTheme([{ id: 'x', subject: '국어', level: '초', grade: 4, version: 1, theme_id: 't-x', themes: null }])
    expect(themes[0].title).toBe('-')
  })
  it('비어 있으면 빈 목록', () => {
    expect(groupSetsByTheme([])).toEqual([])
  })
})
