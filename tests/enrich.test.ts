// tests/enrich.test.ts
import { describe, it, expect } from 'vitest'
import { enrichOutput } from '@/lib/studio/enrich'
import { assessmentV2 } from './studio-schemas.test'

const standards = [{ code: '[9수04-02]', text: 't1' }, { code: '[9수04-03]', text: 't2' }]
describe('enrichOutput', () => {
  it('stage 2: fills level_anchor with C statements per standard', () => {
    const out = enrichOutput(2, { standards: [], reconstruction: 'r', learning_goals: [], level_anchor: [], key_question_candidates: [] }, { standards, prior: {} }) as { level_anchor: { code: string; level: string; statement: string }[] }
    expect(out.level_anchor.map((a) => [a.code, a.level])).toEqual([['[9수04-02]', 'C'], ['[9수04-03]', 'C']])
    expect(out.level_anchor[0].statement).toContain('주어진 자료')
  })
  it('stage 5: fills min_competency (E) from the lesson standard when null, keeps a given value', () => {
    const prior = { stage3: { lessons: [{ no: 2, standards: ['[9수04-02]'] }, { no: 4, standards: ['[9수04-03]'] }, { no: 5, standards: ['[9수04-03]'] }] } }
    const out = enrichOutput(5, structuredClone(assessmentV2), { standards, prior }) as typeof assessmentV2
    expect(out.items[0].min_competency).toContain('부분적으로')
    expect(out.items[1].min_competency).toContain('상대도수')
    const given = structuredClone(assessmentV2); Object.assign(given.items[0], { min_competency: '이미 있음' })
    expect((enrichOutput(5, given, { standards, prior }) as typeof assessmentV2).items[0].min_competency).toBe('이미 있음')
  })
  it('other stages pass through', () => { const o = { a: 1 }; expect(enrichOutput(4, o, { standards, prior: {} })).toBe(o) })
})
