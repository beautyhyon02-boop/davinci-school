import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildGradingPrompt, GRADING_RULES } from '@/lib/classroom/grading-prompt'
import { upgradeSnapshot } from '@/lib/studio/publish'

// 수학 fixture 로 스냅샷을 조립한다(5단계 평가 = stage5-generate.json). fixture 가 아직 v1 이므로(T6 전) 채점 경로(grade.ts)와 같이
// upgradeSnapshot 으로 v2 모양으로 올린 뒤 넘긴다.
const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const snapshot = upgradeSnapshot({ cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '',
  learning_goals: [], key_question: '', lessons: [], materials: [], assessment, teacher_guide: null, generated_with: { models: [] } })

describe('buildGradingPrompt', () => {
  it('puts the fixed rules first (cacheable) and the item/rubric/answer in user', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: '올해 플라스틱컵이 405개로 가장 많이 늘었다.' })
    expect(p.system[0]).toBe(GRADING_RULES)
    expect(p.user).toContain(snapshot.assessment!.items[0].stem)
    expect(p.user).toContain('올해 플라스틱컵이 405개로')
    expect(p.user).toContain('1학년')
    expect(p.fixtureKey).toBe('grading-서술형')
  })
  it('uses the extended rubric and 논술형 fixture for item 3', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 3, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.fixtureKey).toBe('grading-논술형')
    expect(p.user).toContain(assessment.items[2].rubric.criteria[0].name)
  })
  it('includes the item\'s own exemplar answers with their scores and each criterion\'s max', () => {
    const item = snapshot.assessment!.items[0]
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.user).toContain(item.exemplar_answers[0].text)
    expect(p.user).toContain(`총점 ${item.exemplar_answers[0].points}`)
    expect(p.user).toContain(`(max=${item.rubric.criteria[0].max})`)
    expect(p.user).not.toContain(snapshot.assessment!.items[2].exemplar_answers[0].text)
  })
})
