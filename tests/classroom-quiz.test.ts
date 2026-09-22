import { describe, it, expect } from 'vitest'
import { normalizeShort, judgeQuiz } from '@/lib/classroom/quiz'

describe('normalizeShort', () => {
  it('removes spaces, lowercases, trims punctuation at the ends', () => {
    expect(normalizeShort('  상대 도수 ')).toBe('상대도수')
    expect(normalizeShort('Histogram.')).toBe('histogram')
    expect(normalizeShort('4 (개)')).toBe('4(개)')
  })
})

describe('judgeQuiz', () => {
  const choice = { type: 'choice' as const, answer: '③', choices: ['①', '②', '③', '④'] }
  const short = { type: 'short' as const, answer: '상대도수', choices: null }
  it('choice: exact marker match only', () => {
    expect(judgeQuiz(choice, '③')).toBe(true)
    expect(judgeQuiz(choice, '3')).toBe(false)
    expect(judgeQuiz(choice, ' ③ ')).toBe(true)
  })
  it('short: normalized comparison', () => {
    expect(judgeQuiz(short, '상대 도수')).toBe(true)
    expect(judgeQuiz(short, '도수')).toBe(false)
    expect(judgeQuiz(short, '')).toBe(false)
  })
  it('short: accepts any of "A / B" alternatives in the answer key', () => {
    expect(judgeQuiz({ type: 'short', answer: '히스토그램 / 도수분포다각형', choices: null }, '도수분포다각형')).toBe(true)
  })
})
