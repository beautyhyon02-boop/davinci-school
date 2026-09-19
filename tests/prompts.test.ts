import { describe, it, expect } from 'vitest'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { RULES } from '@/lib/studio/prompts/rules'

const ctx = { theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학',
  standards: [{ code: '[9수04-02]', text: '자료를 … 해석할 수 있다.' }], prior: {} }

describe('prompts', () => {
  it('system is the rules block (stable for caching) and user carries the context', () => {
    const p = buildPrompt(2, ctx)
    expect(p.system).toBe(RULES)
    expect(p.user).toContain('[9수04-02]')
    expect(p.user).toContain('중학교 1학년')
    expect(p.fixtureKey).toBe('stage2-generate')
  })
  it('review prompt includes the output and the source standards', () => {
    const r = buildReviewPrompt(2, ctx, { reconstruction: 'X', learning_goals: [], key_question_candidates: [] })
    expect(r.user).toContain('"reconstruction": "X"')
    expect(r.user).toContain('[9수04-02]')
    expect(r.fixtureKey).toBe('stage2-review')
  })
})
