import { describe, it, expect } from 'vitest'
import { Reconstruction, Lesson, Lessons, Assessment, Review, STAGE_SCHEMAS } from '@/lib/studio/schemas'

describe('studio schemas', () => {
  it('accepts a valid reconstruction and rejects wrong goal count', () => {
    const ok = Reconstruction.safeParse({
      reconstruction: '자료를 도수분포표로 나타내고 해석할 수 있다.',
      learning_goals: [
        '자료를 계급으로 나누어 도수분포표로 나타낼 수 있다.',
        '도수분포표를 히스토그램으로 나타낼 수 있다.',
        '히스토그램을 보고 자료의 분포를 해석할 수 있다.',
      ],
      key_question_candidates: [
        '자료를 계급으로 나누면 무엇이 보이는가?',
        '히스토그램은 표와 무엇이 다른가?',
      ],
    })
    expect(ok.success).toBe(true)
    expect(Reconstruction.safeParse({ reconstruction: 'x', learning_goals: ['a'], key_question_candidates: ['q'] }).success).toBe(false)
  })
  it('requires exactly 3 quiz items per non-논술형 lesson, 0 for a 논술형 lesson, and 4-6 lessons per set', () => {
    const quizItem = {
      q: '계급 30개 이상 40개 미만의 도수는?',
      type: 'choice',
      choices: ['a', 'b'],
      answer: 'a',
      explanation: '표에서 세어 본다.',
    }
    const lesson = {
      no: 1,
      standards: ['[9수04-02]'],
      key_question: '자료를 계급으로 나누면 무엇이 보이는가?',
      goal: '자료를 계급으로 나누어 도수분포표로 나타낼 수 있다.',
      flow: { intro: 'i', main: 'm', wrapup: 'w' },
      materials: ['A'],
      quiz: [quizItem],
      assessment: null,
      mergeable_with: null,
    }
    expect(Lesson.safeParse(lesson).success).toBe(false)
    lesson.quiz = [quizItem, quizItem, quizItem]
    expect(Lesson.safeParse(lesson).success).toBe(true)

    const fourLessons = [1, 2, 3, 4].map((no) => ({ ...lesson, no }))
    expect(Lessons.safeParse({ lessons: fourLessons.slice(0, 3) }).success).toBe(false)
    expect(Lessons.safeParse({ lessons: fourLessons }).success).toBe(true)

    const essayLesson = { ...lesson, no: 5, assessment: '논술형' as const, quiz: [] as typeof quizItem[] }
    expect(Lesson.safeParse(essayLesson).success).toBe(true)
    expect(Lesson.safeParse({ ...essayLesson, quiz: [quizItem, quizItem, quizItem] }).success).toBe(false)
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
