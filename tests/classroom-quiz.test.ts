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

describe('judgeQuiz lenient short answers', () => {
  it('ignores trailing units and sentence endings', () => {
    const six = { type: 'short' as const, answer: '6', choices: null }
    expect(judgeQuiz(six, '6개')).toBe(true)
    expect(judgeQuiz(six, '6 개')).toBe(true)
    expect(judgeQuiz(six, '6개입니다')).toBe(true)
    expect(judgeQuiz(six, '6.0')).toBe(true)
    expect(judgeQuiz(six, '7개')).toBe(false)
    expect(judgeQuiz({ type: 'short', answer: '20곳', choices: null }, '20')).toBe(true)
    expect(judgeQuiz({ type: 'short', answer: '상대도수', choices: null }, '상대도수입니다')).toBe(true)
    expect(judgeQuiz({ type: 'short', answer: '0.30', choices: null }, '0.3')).toBe(true)
  })
})

describe('judgeQuiz ranges and inline units', () => {
  const cls = { type: 'short' as const, answer: '30개 이상 40개 미만', choices: null }
  it('treats class-interval spellings as the same answer', () => {
    expect(judgeQuiz(cls, '30이상 40미만')).toBe(true)
    expect(judgeQuiz(cls, '30 이상 40 미만')).toBe(true)
    expect(judgeQuiz(cls, '30~40')).toBe(true)
    expect(judgeQuiz(cls, '30-40')).toBe(true)
    expect(judgeQuiz(cls, '30개부터 40개까지')).toBe(true)
    expect(judgeQuiz(cls, '20 이상 30 미만')).toBe(false)
  })
})
