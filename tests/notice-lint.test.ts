import { describe, it, expect } from 'vitest'
import { lintNotice } from '@/lib/classroom/notice-lint'
import type { NoticeT } from '@/lib/classroom/notice-schema'

const base: NoticeT = { student_name: '김OO', lesson_no: 2, date: '2026-09-29',
  lesson_context: { key_question: 'q', goal: 'g', topic_summary: '도수분포표 활동에서 표 만들기를 배웠습니다.' },
  participation: { quiz: { correct: 2, total: 3, items: [{ q: 'a', is_correct: true, note: null }, { q: 'b', is_correct: false, note: '계급은 정확히 찾았으나 도수 세기가 헷갈렸어요' }, { q: 'c', is_correct: true, note: null }] }, director_comment: null },
  essay_result: { kind: '서술형', confirmed_score: 2, total_points: 3, band: '중', criteria_feedback: [{ criterion_name: '표 완성', band_score: 2, max: 3, good_point: '표 완성 활동에서 계급을 정확하게 나눔', improve_point: '도수는 세웠으나 합계를 빠뜨림 — 다음에는 합계를 먼저 확인해 봅시다' }], retry: null },
  next_lesson: { preview: '다음 시간에는 히스토그램을 배워요.', home_study_suggestion: '오늘 틀린 문항과 같은 유형 1개를 다시 풀어 봅시다.' },
  director_message: null, footer_disclaimer: '본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.' }

describe('lintNotice', () => {
  it('passes a clean notice', () => { expect(lintNotice(base, ['박OO'])).toEqual([]) })
  it('flags negative verbs, rankings, other students, improve without good, non-suggestive home study, score over max', () => {
    const bad = structuredClone(base)
    bad.participation.quiz.items[1].note = '도수를 못 셌다'
    bad.essay_result!.criteria_feedback[0].good_point = ''
    bad.essay_result!.criteria_feedback[0].improve_point = '박OO보다 등수가 낮음'
    bad.next_lesson.home_study_suggestion = '더 열심히'
    bad.essay_result!.confirmed_score = 5
    const issues = lintNotice(bad, ['박OO'])
    expect(issues.some((i) => i.includes('못'))).toBe(true); expect(issues.some((i) => i.includes('등수'))).toBe(true)
    expect(issues.some((i) => i.includes('박OO'))).toBe(true); expect(issues.some((i) => i.includes('잘한 점'))).toBe(true)
    expect(issues.some((i) => i.includes('청유형'))).toBe(true); expect(issues.some((i) => i.includes('만점'))).toBe(true)
  })
  it('checks the director fields too, flags a lone verdict ending and an empty good point, ignores the student own name', () => {
    const bad = structuredClone(base)
    bad.director_message = '오늘 수업 태도는 보통.'
    bad.participation.director_comment = '김OO 학생이 상위 10% 안에 들었습니다'
    bad.essay_result!.criteria_feedback[0].good_point = ''; bad.essay_result!.criteria_feedback[0].improve_point = null
    const issues = lintNotice(bad, ['김OO', '', '박OO'])
    expect(issues.some((i) => i.startsWith('원장 한마디') && i.includes('보통'))).toBe(true)
    expect(issues.some((i) => i.startsWith('참여 관찰') && i.includes('상위 10%'))).toBe(true)
    expect(issues.some((i) => i.includes('잘한 점이 비어'))).toBe(true)
    expect(issues.some((i) => i.includes('다른 학생'))).toBe(false)
  })
  it('does not flag the long negation inside a factual quiz note ("분해하지 못하기 때문")', () => {
    const ok = structuredClone(base); ok.participation.quiz.items[1].note = '미생물이 분해하지 못하기 때문이에요'
    expect(lintNotice(ok, [])).toEqual([])
  })
})
