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
  it('stage 3 task and rules agree with the Lesson schema on quiz counts', () => {
    expect(buildPrompt(3, ctx).user).toMatch(/논술형을 배치한 차시는 0문항/)
    expect(RULES).toMatch(/논술형을 배치한 차시는 마무리 퀴즈 0문항/)
    expect(RULES).toMatch(/논술형 문항은 정확히 1개/)
    expect(RULES).not.toMatch(/마무리 퀴즈 3문항\(/)
  })
  it('stage 1 task judges the given standards instead of picking from candidates', () => {
    const u = buildPrompt(1, ctx).user
    expect(u).not.toMatch(/후보 중에서/)
    expect(u).toMatch(/적합한지 판단/)
  })
  it('review prompt includes the output and the source standards', () => {
    const r = buildReviewPrompt(2, ctx, { reconstruction: 'X', learning_goals: [], key_question_candidates: [] })
    expect(r.system[0]).toBe(RULES)       // 첫 블록 = 캐시되는 규칙(생성과 동일)
    expect(r.system[1]).toMatch(/검토자/)   // 둘째 블록 = 검토자 지시(캐시 안 함)
    expect(r.user).toContain('"reconstruction": "X"')
    expect(r.user).toContain('[9수04-02]')
    expect(r.fixtureKey).toBe('stage2-review')
  })
})
