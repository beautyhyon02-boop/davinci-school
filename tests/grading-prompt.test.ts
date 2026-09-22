import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildGradingPrompt, GRADING_RULES } from '@/lib/classroom/grading-prompt'
import type { Snapshot } from '@/lib/studio/publish'

// 수학 fixture 로 스냅샷을 조립한다(5단계 평가 = stage5-generate.json)
const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const snapshot = { cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '',
  learning_goals: [], key_question: '', lessons: [], materials: [], assessment, teacher_guide: null, generated_with: { models: [] } } as unknown as Snapshot

describe('buildGradingPrompt', () => {
  it('puts the fixed rules first (cacheable) and the item/rubric/answer in user', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: '올해 플라스틱컵이 405개로 가장 많이 늘었다.' })
    expect(p.system[0]).toBe(GRADING_RULES)
    expect(p.user).toContain(assessment.items[0].stem)
    expect(p.user).toContain('올해 플라스틱컵이 405개로')
    expect(p.user).toContain('1학년')
    expect(p.fixtureKey).toBe('grading-서술형')
  })
  it('uses the extended rubric and 논술형 fixture for item 3', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 3, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.fixtureKey).toBe('grading-논술형')
    expect(p.user).toContain(assessment.items[2].rubric.criteria[0].name)
  })
  it('includes exemplars with their scores', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.user).toContain(String(assessment.exemplars[0].total))
  })
})
