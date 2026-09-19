import { describe, it, expect } from 'vitest'
import { Reconstruction, Lessons, Assessment, Review, STAGE_SCHEMAS } from '@/lib/studio/schemas'

describe('studio schemas', () => {
  it('accepts a valid reconstruction and rejects wrong goal count', () => {
    const ok = Reconstruction.safeParse({
      reconstruction: '자료를 도수분포표로 나타내고 해석할 수 있다.',
      learning_goals: ['a', 'b', 'c'],
      key_question_candidates: ['q1', 'q2'],
    })
    expect(ok.success).toBe(true)
    expect(Reconstruction.safeParse({ reconstruction: 'x', learning_goals: ['a'], key_question_candidates: ['q'] }).success).toBe(false)
  })
  it('requires exactly 3 quiz items per lesson', () => {
    const lesson = { no: 1, standards: ['[9수04-02]'], key_question: 'q', goal: 'g',
      flow: { intro: 'i', main: 'm', wrapup: 'w' }, materials: ['A'],
      quiz: [{ q: '?', type: 'choice', choices: ['a','b'], answer: 'a', explanation: 'e' }], assessment: null, mergeable_with: null }
    expect(Lessons.safeParse({ lessons: [lesson] }).success).toBe(false)
    lesson.quiz = [lesson.quiz[0], lesson.quiz[0], lesson.quiz[0]]
    expect(Lessons.safeParse({ lessons: [lesson] }).success).toBe(true)
  })
  it('assessment: extended item needs 4 criteria with 5 bands', () => {
    const r = Assessment.safeParse({
      items: [{ kind: '논술형', lesson_no: 5, stem: 's', conditions: { length: '300자', required: ['수치 2개'], format: '~다' }, points: 16,
        rubric: { criteria: [{ name: 'c1', bands: { '4': 'a', '3': 'b', '2': 'c', '1': 'd', '0': 'e' } }] } }],
      grade_boundaries: [{ grade: 7, min: 21, max: 22, band: '상' }],
      exemplars: [{ level: '상', text: 't', scores: [4,4,4,3], total: 15, grade: 7 }],
      feedback_templates: { 상: 'a', 중: 'b', 하: 'c' },
    })
    expect(r.success).toBe(false)  // criteria must be 4
  })
  it('review shape', () => {
    expect(Review.parse({ pass: false, issues: [{ kind: 'fidelity', detail: 'x' }] }).issues).toHaveLength(1)
    expect(Object.keys(STAGE_SCHEMAS)).toEqual(['0', '1', '2', '3', '4', '5', '6'])
  })
})
