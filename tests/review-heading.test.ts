// 대표 2026-10-12(설명회 전날): 「답안·검수」가 퀴즈 표의 "1차시 최종 확인" 아래 붙어 있어 1차시 것으로 오해 — 제목에 단원 평가(마지막 차시)를 밝히고 한 줄 안내
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { app } from '@/content/site'

describe('배정 상세 「답안·검수」 제목 (대표 2026-10-12)', () => {
  it('제목이 단원 평가(마지막 차시)의 것임을 밝히고, 안내 한 줄이 있다', () => {
    const c = app.classroom.review
    expect(c.answersHeading).toBe('단원 평가(마지막 차시) 답안·검수')
    expect(c.answersNote).toContain('마지막 차시')
    expect(c.answersNote).toContain('비어 있습니다')
  })
  it('배정 상세 화면이 제목 바로 아래에 그 안내를 그린다', () => {
    const src = readFileSync('app/teacher/assignments/[setId]/page.tsx', 'utf8')
    const h = src.indexOf('review.answersHeading'); const n = src.indexOf('review.answersNote')
    expect(h).toBeGreaterThan(-1); expect(n).toBeGreaterThan(h)
    expect(src.slice(h, n)).not.toContain('<section')
  })
})
