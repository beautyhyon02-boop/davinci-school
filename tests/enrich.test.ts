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
    // 문항 2개(서술형 4차시 · 논술형 5차시, 대표 2026-09-26) — 문항마다 그 차시 첫 성취기준의 E 문장
    const prior = { stage3: { lessons: [{ no: 2, standards: ['[9수04-02]'] }, { no: 4, standards: ['[9수04-03]'] }, { no: 5, standards: ['[9수04-02]'] }] } }
    const out = enrichOutput(5, structuredClone(assessmentV2), { standards, prior }) as typeof assessmentV2
    expect(out.items[0].min_competency).toContain('상대도수')
    expect(out.items[1].min_competency).toContain('부분적으로')
    const given = structuredClone(assessmentV2); Object.assign(given.items[0], { min_competency: '이미 있음' })
    expect((enrichOutput(5, given, { standards, prior }) as typeof assessmentV2).items[0].min_competency).toBe('이미 있음')
  })
  it('stage 5: two items on one 단원 평가 차시 take that lesson\'s standards in item order (서술형 → 첫째, 논술형 → 둘째)', () => {
    const prior = { stage3: { lessons: [{ no: 6, standards: ['[9수04-03]', '[9수04-02]'] }] } }
    const both = structuredClone(assessmentV2); both.items.forEach((it) => { it.lesson_no = 6 })
    const out = enrichOutput(5, both, { standards, prior }) as typeof assessmentV2
    expect(out.items[0].min_competency).toContain('상대도수')
    expect(out.items[1].min_competency).toContain('부분적으로')
    // 성취기준이 하나뿐이면 두 문항 모두 그것
    const one = enrichOutput(5, structuredClone(both), { standards, prior: { stage3: { lessons: [{ no: 6, standards: ['[9수04-03]'] }] } } }) as typeof assessmentV2
    expect(one.items.map((i) => i.min_competency)).toEqual([out.items[0].min_competency, out.items[0].min_competency])
  })
  it('other stages pass through', () => { const o = { a: 1 }; expect(enrichOutput(4, o, { standards, prior: {} })).toBe(o) })
})
