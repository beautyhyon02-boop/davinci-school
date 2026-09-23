// tests/checks.test.ts
import { describe, it, expect } from 'vitest'
import { staticIssues } from '@/lib/studio/checks'
import { assessmentV2, lessonV2 } from './studio-schemas.test'

const standards = [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }, { code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' }]
const materials = [{ id: 'A', title: 't', kind: 'table', body: null, table: { columns: ['부스', '개수'], rows: [[1, 18]] }, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: [] }]

describe('staticIssues', () => {
  it('stage 2: every reconstructed_text is fidelity-checked; original must match DB text', () => {
    const out = { standards: [
      { code: '[9수04-02]', original_text: standards[0].text, reconstruction_type: '유지', reconstructed_text: standards[0].text, reason: ['4~6차시 압축'], merged_with: [], learning_elements: ['도수분포표'] },
      { code: '[9수04-03]', original_text: '다른 원문', reconstruction_type: '재조정', reconstructed_text: '학생은 통계청 자료로 상대도수를 구할 수 있다.', reason: ['학원 60분 최적화'], merged_with: [], learning_elements: ['상대도수'] } ],
      reconstruction: '자료를 나타내고 상대도수를 구하고 해석할 수 있다.', learning_goals: [], level_anchor: [], key_question_candidates: [] }
    const issues = staticIssues(2, out, { standards, prior: {} })
    expect(issues.some((i) => i.kind === 'fidelity' && i.detail.includes('[9수04-03]'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('원문 불일치'))).toBe(true)
  })
  it('stage 3: coverage, placement order, mergeable adjacency, quiz answer in choices, main ≥ 2 steps', () => {
    const lessons = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no, standards: ['[9수04-02]'], assessment: no === 3 ? '서술형1' : no === 4 ? '서술형2' : no === 5 ? '논술형' : null, formative_check: { quiz: no === 5 ? [] : lessonV2.formative_check.quiz }, mergeable_with: no === 1 ? 4 : null }))
    const out = { unit_plan: { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [{ lesson_no: 3, kind: '서술형1' }, { lesson_no: 4, kind: '서술형2' }, { lesson_no: 5, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }, lessons }
    const issues = staticIssues(3, out, { standards, prior: {} })
    expect(issues.some((i) => i.kind === 'coverage' && i.detail.includes('[9수04-03]'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('병합'))).toBe(true)
    const wrongQuiz = { ...out, lessons: out.lessons.map((l) => l.no === 1 ? { ...l, mergeable_with: 2, formative_check: { quiz: l.formative_check.quiz.map((q) => ({ ...q, answer: '없는 보기' })) } } : l) }
    expect(staticIssues(3, wrongQuiz, { standards, prior: {} }).some((i) => i.kind === 'quiz')).toBe(true)
  })
  it('stage 4: size conventions and raw-data leakage hints', () => {
    const big = { materials: [{ ...materials[0], table: { columns: ['a'], rows: Array.from({ length: 30 }, (_, i) => [i]) } }] }
    expect(staticIssues(4, big, { standards, prior: {} }).some((i) => i.detail.includes('25행'))).toBe(true)
    const pub = { materials: [{ ...materials[0], source: { kind: '공개', attribution: '통계청', ai_assisted: true } }] }
    expect(staticIssues(4, pub, { standards, prior: {} }).some((i) => i.kind === 'source')).toBe(true)
  })
  it('stage 5: materials referenced must exist and include raw; adverb-only scale steps are flagged; 서술형 needs a partial exemplar', () => {
    const prior = { stage4: { materials }, stage3: { lessons: [] } }
    expect(staticIssues(5, assessmentV2, { standards, prior })).toEqual([])
    const missing = structuredClone(assessmentV2); missing.items[0].materials_used = ['Z']
    expect(staticIssues(5, missing, { standards, prior }).some((i) => i.detail.includes('Z'))).toBe(true)
    const adverb = structuredClone(assessmentV2)
    adverb.items[2].rubric.criteria[0].scale = [0, 1, 2, 3, 4].map((p) => ({ points: p, descriptor: ['무응답', '다소 정확하게 인용함', '대체로 정확하게 인용함', '정확하게 인용함', '매우 정확하게 인용함'][p], example: null }))
    expect(staticIssues(5, adverb, { standards, prior }).some((i) => i.kind === 'level')).toBe(true)
    const noPartial = structuredClone(assessmentV2); Object.assign(noPartial.items[0].exemplar_answers[1], noPartial.items[0].exemplar_answers[0])
    expect(staticIssues(5, noPartial, { standards, prior }).some((i) => i.detail.includes('부분점수'))).toBe(true)
  })
  it('stage 6/7: merge pairs must match lessons; notice plan lint', () => {
    const lessons = [1, 2, 3, 4].map((no) => ({ ...lessonV2, no, mergeable_with: no === 1 ? 2 : null }))
    const guide = { general: { materials: [], schedule_note: 's', purpose: 'p' }, glossary: [], merge_guide: [{ lessons: [3, 4], skip_activities: ['x'], time_budget_120: { intro_min: 10, main_min: 90, wrapup_min: 20 } }], grading_guide: { common_errors: [], review_tips: [], retry_guidance: '' }, per_lesson: [] }
    expect(staticIssues(6, guide, { standards, prior: { stage3: { lessons } } }).some((i) => i.detail.includes('병합'))).toBe(true)
    const plan = { per_lesson: [{ lesson_no: 1, topic_summary: '표를 못한다.', preview: '다음', home_study_suggestion: '더 열심히', quiz_notes: [], criteria_phrases: null }], footer_disclaimer: '' }
    const issues = staticIssues(7, plan, { standards, prior: {} })
    expect(issues.some((i) => i.kind === 'notice' && i.detail.includes('못한다'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('청유형'))).toBe(true)
  })
})
