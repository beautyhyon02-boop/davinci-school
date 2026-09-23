import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildGradingPrompt, GRADING_RULES } from '@/lib/classroom/grading-prompt'
import { GRADING_PROMPT_RULES } from '@/lib/studio/prompts/rules/grading'
import { upgradeSnapshot, type Snapshot } from '@/lib/studio/publish'

// 수학 fixture(5단계 = v2)로 스냅샷을 조립한다. 채점 경로(grade.ts)와 같이 upgradeSnapshot 을 거친다(schema_version 2 라 그대로 통과).
const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const snapshot: Snapshot = upgradeSnapshot({ schema_version: 2, cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '', reconstruction_detail: [],
  learning_goals: [], key_question: '', unit_plan: null, lessons: [], materials: [], assessment, teacher_guide: null, notice_plan: null, references: [], generated_with: { models: [] } })

describe('buildGradingPrompt v2', () => {
  it('rules block first; item, per-criterion scale with max, notes, conditions, and the item\'s own exemplars in user', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: '올해 플라스틱컵이 405개로 가장 많이 늘었다.' })
    expect(p.system[0]).toBe(GRADING_RULES); expect(GRADING_RULES).toBe(GRADING_PROMPT_RULES)
    expect(p.user).toContain(assessment.items[0].stem)
    expect(p.user).toContain(assessment.items[0].rubric.notes[0])
    expect(p.user).toContain(assessment.items[0].exemplar_answers[0].text.slice(0, 20))
    expect(p.user).not.toContain(assessment.items[2].exemplar_answers[0].text.slice(0, 20))
    expect(p.user).toMatch(/max=\d/); expect(p.user).toMatch(/A~E 예상 구간/); expect(p.fixtureKey).toBe('grading-서술형')
  })
  it('논술형 lists 4 criteria names with max=4 and the holistic bands', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 3, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.fixtureKey).toBe('grading-논술형')
    for (const c of assessment.items[2].rubric.criteria) expect(p.user).toContain(`${c.name}(max=4`)
    expect(p.user).toContain(assessment.items[2].rubric.holistic.상)
  })
  it('numbers every condition and states the axis, condition numbers and exemplar rationale', () => {
    const item = assessment.items[2]
    const p = buildGradingPrompt({ snapshot, itemNo: 3, studentGrade: 1, answer: 'x'.repeat(60) })
    for (const c of item.conditions.items) expect(p.user).toContain(`${c.no}. ${c.text}`)
    expect(p.user).toContain(`${item.rubric.criteria[2].name}(max=4, ${item.rubric.criteria[2].axis}, 조건 ${item.rubric.criteria[2].condition_nos.join('·')})`)
    expect(p.user).toContain(item.exemplar_answers[0].rationale)
    expect(p.user).toContain(`분량 ${item.conditions.length}`)
    expect(p.user).toContain('1학년')
    expect(p.user).toContain('x'.repeat(60))
  })
  it('G-03: every A~E range, and the order rubric < notes < A~E < exemplars < answer', () => {
    const item = assessment.items[0]
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: 'ANSWER_MARK' })
    for (const lv of item.level_map) expect(p.user).toContain(`${lv.level}: ${lv.min}~${lv.max}점`)
    const at = (s: string) => p.user.indexOf(s)
    expect(at('채점표(')).toBeGreaterThan(-1)
    expect(at('채점표(')).toBeLessThan(at('채점 시 유의점'))
    expect(at('채점 시 유의점')).toBeLessThan(at('A~E 예상 구간'))
    expect(at('A~E 예상 구간')).toBeLessThan(at('예시 답안(이 문항)'))
    expect(at('예시 답안(이 문항)')).toBeLessThan(at('ANSWER_MARK'))
  })
  it('서술형 has no holistic line', () => {
    expect(buildGradingPrompt({ snapshot, itemNo: 2, studentGrade: 1, answer: 'x'.repeat(60) }).user).not.toContain('총체적 기준')
  })
})

describe('grading fixtures follow the v2 math items (mock mode)', () => {
  const draft = (k: string) => JSON.parse(readFileSync(`data/studio-fixtures/grading-${k}.json`, 'utf8'))
  it('서술형 fixture criteria = item 1 criteria names and max', () => {
    const d = draft('서술형')
    expect(d.criteria.map((c: { name: string; max: number }) => [c.name, c.max])).toEqual(assessment.items[0].rubric.criteria.map((c: { name: string; max: number }) => [c.name, c.max]))
  })
  it('논술형 fixture criteria = item 3 criteria names and max, score = sum', () => {
    const d = draft('논술형')
    expect(d.criteria.map((c: { name: string; max: number }) => [c.name, c.max])).toEqual(assessment.items[2].rubric.criteria.map((c: { name: string; max: number }) => [c.name, c.max]))
    expect(d.score).toBe(d.criteria.reduce((s: number, c: { points: number }) => s + c.points, 0))
  })
})
