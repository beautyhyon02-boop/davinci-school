// tests/checks.test.ts
import { describe, it, expect } from 'vitest'
import { staticIssues } from '@/lib/studio/checks'
import { assessmentV2, lessonV2, assessmentSession } from './studio-schemas.test'

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
  it('stage 3: coverage, placement, mergeable adjacency, quiz answer in choices, main ≥ 2 steps', () => {
    const lessons = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no, standards: ['[9수04-02]'], mergeable_with: no === 1 ? 4 : null })).concat({ ...assessmentSession(6), standards: ['[9수04-02]'], mergeable_with: null })
    const out = { unit_plan: { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }, lessons }
    const issues = staticIssues(3, out, { standards, prior: {} })
    expect(issues.some((i) => i.kind === 'coverage' && i.detail.includes('[9수04-03]'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('병합'))).toBe(true)
    const wrongQuiz = { ...out, lessons: out.lessons.map((l) => l.no === 1 ? { ...l, mergeable_with: 2, formative_check: { quiz: l.formative_check.quiz.map((q) => ({ ...q, answer: '없는 보기' })) } } : l) }
    expect(staticIssues(3, wrongQuiz, { standards, prior: {} }).some((i) => i.kind === 'quiz')).toBe(true)
    expect(staticIssues(3, out, { standards, prior: {} }).filter((i) => i.detail.includes('단원 평가') || i.detail.includes('교수 차시'))).toEqual([])
    // 단원 평가 차시는 병합하지 않는다
    const mergedSession = { ...out, lessons: out.lessons.map((l) => (l.no === 5 ? { ...l, mergeable_with: 6 } : l)) }
    expect(staticIssues(3, mergedSession, { standards, prior: {} }).some((i) => i.detail.includes('단원 평가 차시는 병합하지 않는다'))).toBe(true)
  })
  it('stage 3 (대표 2026-09-26 보완, L-09): 교수 차시마다 퀴즈, 서·논술형은 마지막 교수 차시 뒤 단원 평가 차시에서 함께', () => {
    const one = [standards[0]]
    const design = (lessons: unknown[]) => ({ unit_plan: { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }, lessons })
    const coverage = (lessons: unknown[]) => staticIssues(3, design(lessons), { standards: one, prior: {} }).filter((i) => i.kind === 'coverage').map((i) => i.detail).join(' | ')
    const teaching = (no: number) => ({ ...lessonV2, no })
    expect(coverage([1, 2, 3, 4, 5].map(teaching).concat(assessmentSession(6)))).toBe('')
    expect(coverage([1, 2, 3, 4, 5].map(teaching))).toMatch(/정확히 1개/)
    expect(coverage([assessmentSession(1), ...[2, 3, 4, 5].map(teaching)])).toMatch(/마지막/)
    // 옛 배치(교수 차시에 서술형, 마지막 차시에 논술형만)는 걸린다
    const legacy = coverage([1, 2, 3].map(teaching).concat({ ...teaching(4), assessment: ['서술형'] }, { ...assessmentSession(5), assessment: ['논술형'] }))
    expect(legacy).toMatch(/4차시: 교수 차시에는/); expect(legacy).toMatch(/서술형 → 논술형을 함께/)
    // 옛 모양(문자열 라벨)도 읽어서 잡는다
    expect(coverage([1, 2, 3].map(teaching).concat({ ...teaching(4), assessment: '서술형2' as never }, { ...assessmentSession(5), assessment: '논술형' as never }))).toMatch(/교수 차시에는/)
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
    adverb.items[1].rubric.criteria[0].scale = [0, 1, 2, 3, 4].map((p) => ({ points: p, descriptor: ['무응답', '다소 정확하게 인용함', '대체로 정확하게 인용함', '정확하게 인용함', '매우 정확하게 인용함'][p], example: null }))
    expect(staticIssues(5, adverb, { standards, prior }).some((i) => i.kind === 'level')).toBe(true)
    const noPartial = structuredClone(assessmentV2); Object.assign(noPartial.items[0].exemplar_answers[1], noPartial.items[0].exemplar_answers[0])
    expect(staticIssues(5, noPartial, { standards, prior }).some((i) => i.detail.includes('부분점수'))).toBe(true)
  })
  it('stage 5: 문항 구조 = 서술형 1(6점) + 논술형 1(16점), 두 문항 모두 총체적 기준 — [TS] 도 같은 문구로 잡는다(옛 판 v1 업그레이드 검토)', () => {
    const prior = { stage4: { materials }, stage3: { lessons: [] } }
    const structure = (a: unknown) => staticIssues(5, a, { standards, prior }).filter((i) => i.detail.includes('문항 구조'))
    expect(structure(assessmentV2)).toEqual([])
    const legacy = structuredClone(assessmentV2); legacy.items = [structuredClone(legacy.items[0]), ...legacy.items]
    expect(structure(legacy).map((i) => i.kind)).toEqual(['rubric'])
    const noHolistic = structuredClone(assessmentV2); noHolistic.items[0].rubric.holistic = null
    expect(staticIssues(5, noHolistic, { standards, prior }).some((i) => i.detail.includes('총체적'))).toBe(true)
  })
  it('stage 5: grade_boundaries level_ref must follow the 7등급↔수준 table', () => {
    const prior = { stage4: { materials }, stage3: { lessons: [] } }
    const wrongRef = structuredClone(assessmentV2); wrongRef.grade_boundaries[0].level_ref = 'B'
    const issues = staticIssues(5, wrongRef, { standards, prior })
    expect(issues).toEqual([{ kind: 'rubric', detail: '등급 7의 level_ref(B)가 7등급↔수준 대응표(A)와 다름' }])
  })
  it('stage 5: 서술형 exemplars must cover every score 1..points (6점이면 6·5·4·3·2·1, C-14)', () => {
    const prior = { stage4: { materials }, stage3: { lessons: [] } }
    const full = structuredClone(assessmentV2)
    expect(full.items[0].exemplar_answers.map((e) => e.points)).toEqual([6, 5, 4, 3, 2, 1])
    expect(staticIssues(5, full, { standards, prior }).filter((i) => i.detail.includes('부분점수'))).toEqual([])
    const noOne = structuredClone(assessmentV2); noOne.items[0].exemplar_answers.splice(5, 1)
    const issues = staticIssues(5, noOne, { standards, prior }).filter((i) => i.detail.includes('부분점수'))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'rubric' }); expect(issues[0].detail).toContain('문항 1'); expect(issues[0].detail).toContain('(1점 단계)')
  })
  it('stage 5: items[].lesson_no must match the stage 3 summative_placement, and every placement needs an item', () => {
    const placement = (short: number, essay: number) => ({ stage4: { materials }, stage3: { lessons: [], unit_plan: { assessment_plan: { summative_placement: [{ lesson_no: short, kind: '서술형' }, { lesson_no: essay, kind: '논술형' }] } } } })
    const lessonNoIssues = (prior: Record<string, unknown>, out = assessmentV2) => staticIssues(5, out, { standards, prior }).filter((i) => i.detail.includes('lesson_no') || i.detail.includes('평가 계획'))
    expect(lessonNoIssues(placement(4, 5))).toEqual([])
    const wrong = lessonNoIssues(placement(3, 5))
    expect(wrong).toHaveLength(2)
    expect(wrong.every((i) => i.kind === 'coverage')).toBe(true)
    expect(wrong[0].detail).toContain('문항 1'); expect(wrong[0].detail).toContain('4')
    expect(wrong[1].detail).toContain('서술형'); expect(wrong[1].detail).toContain('3차시')
    expect(lessonNoIssues(placement(4, 6)).map((i) => i.detail).join('|')).toMatch(/문항 2.*\|.*논술형\(6차시\)/)
    // 옛 라벨(서술형1)로 적힌 계획도 종류로 짝짓는다
    const legacyLabel = { stage4: { materials }, stage3: { lessons: [], unit_plan: { assessment_plan: { summative_placement: [{ lesson_no: 4, kind: '서술형1' }, { lesson_no: 5, kind: '논술형' }] } } } }
    expect(lessonNoIssues(legacyLabel)).toEqual([])
  })
  describe('stage 5: conditions are guidelines, not solving hints (C-32, 대표 2026-09-26)', () => {
    const matB = { ...materials[0], id: 'B', table: { columns: ['품목', '작년 (부스 16곳)', '올해 (부스 20곳)'], rows: [['플라스틱컵', 290, 405], ['합계', 1200, 1350]] } }
    const prior = { stage4: { materials: [...materials, matB] }, stage3: { lessons: [] } }
    const withEssayCondition = (text: string) => {
      const a = structuredClone(assessmentV2); a.items[1].materials_used = ['A', 'B']
      a.items[1].conditions.items[0].text = text
      return a
    }
    const hintIssues = (a: unknown) => staticIssues(5, a, { standards, prior }).filter((i) => i.detail.includes('C-32'))
    it.each([
      ['arithmetic with numbers + rounding', '290 ÷ 1200을 소수 둘째 자리까지 구해 적는다'],
      ['step order', '먼저 도수분포표를 만들고 다음에 최빈 계급을 찾는다'],
      ['procedure words', '각 품목의 개수를 합계로 나누어 비율을 구한다'],
      ['a value from the referenced material', '플라스틱컵 405개를 기준으로 줄일 개수를 밝힌다'],
    ])('flags %s', (_why, text) => {
      const issues = hintIssues(withEssayCondition(text))
      expect(issues).toHaveLength(1); expect(issues[0].kind).toBe('other'); expect(issues[0].detail).toContain('문항 2 조건 1')
    })
    it.each([
      ['a material to cite', '자료 B의 수치를 근거로 든다'],
      ['counts of 근거, length and points', '근거를 2개 이상 들고 200자 내외로 쓴다 (2점)'],
      ['"가장 먼저" as the topic, not a step', '가장 먼저 줄일 일회용품 한 가지를 정한다'],
    ])('passes %s', (_why, text) => {
      expect(hintIssues(withEssayCondition(text))).toEqual([])
    })
    it('서술형 carries no conditions; 논술형 carries 2~4', () => {
      expect(hintIssues(assessmentV2)).toEqual([])
      const short = structuredClone(assessmentV2)
      short.items[0].conditions.items = [{ no: 1, text: '이유를 한 문장으로 쓸 것', verb: '쓰다', points: null, category: '형식' }]
      expect(hintIssues(short).map((i) => i.detail)).toEqual([expect.stringMatching(/문항 1\(서술형\): 조건 1개/)])
      const one = structuredClone(assessmentV2); one.items[1].conditions.items.splice(1, 1)
      expect(hintIssues(one).map((i) => i.detail)).toEqual([expect.stringMatching(/문항 2\(논술형\): 조건 1개/)])
      const five = structuredClone(assessmentV2)
      five.items[1].conditions.items = [1, 2, 3, 4, 5].map((no) => ({ no, text: `요건 ${no}을 지킬 것`, verb: '지키다', points: null, category: '내용' }))
      expect(hintIssues(five).map((i) => i.detail)).toEqual([expect.stringMatching(/문항 2\(논술형\): 조건 5개/)])
    })
  })
  it('stage 3: the 단원 평가 차시 needs a 논술형 writing step of 35+ minutes and a 서술형 writing step', () => {
    const plan = { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }
    const lessons = (main: typeof lessonV2.flow.main) => [1, 2, 3].map((no) => ({ ...lessonV2, no })).concat({ ...assessmentSession(4), flow: { ...assessmentSession(4).flow, main } })
    const details = (main: typeof lessonV2.flow.main) => staticIssues(3, { unit_plan: plan, lessons: lessons(main) }, { standards, prior: {} }).map((i) => i.detail).join(' | ')
    expect(details(lessonV2.flow.main)).toMatch(/35분/)
    expect(details([{ step_label: '논술형 작성', minutes: 30, activities: ['쓰기'] }, { step_label: '서술형 작성', minutes: 20, activities: ['쓰기'] }])).toMatch(/35분/)
    expect(details([{ step_label: '서술형 작성', minutes: 15, activities: ['쓰기'] }, { step_label: '논술형 작성', minutes: 35, activities: ['쓰기'] }])).not.toMatch(/35분|서술형 작성 단계/)
    expect(details([{ step_label: '안내', minutes: 15, activities: ['읽기'] }, { step_label: '논술형 작성', minutes: 35, activities: ['쓰기'] }])).toMatch(/서술형 작성 단계/)
  })
  it('stage 6/7: merge pairs must match lessons; notice plan lint', () => {
    const lessons = [1, 2, 3, 4].map((no) => ({ ...lessonV2, no, mergeable_with: no === 1 ? 2 : null }))
    const guide = { general: { materials: [], schedule_note: 's', purpose: 'p' }, glossary: [], merge_guide: [{ lessons: [3, 4], skip_activities: ['x'], time_budget_120: { intro_min: 10, main_min: 90, wrapup_min: 20 } }], grading_guide: { common_errors: [], review_tips: [], retry_guidance: '' }, per_lesson: [] }
    expect(staticIssues(6, guide, { standards, prior: { stage3: { lessons } } }).some((i) => i.detail.includes('병합'))).toBe(true)
    // 흔한 오답의 문항 번호는 5단계 문항 수(2) 안
    const withErrors = { ...guide, merge_guide: [], grading_guide: { ...guide.grading_guide, common_errors: [1, 2, 3].map((item_no) => ({ item_no, error: '오답', how_to_read: '0점 서술' })) } }
    expect(staticIssues(6, withErrors, { standards, prior: { stage5: assessmentV2 } }).map((i) => i.detail)).toEqual([expect.stringMatching(/문항 3.*2개/)])
    const plan = { per_lesson: [{ lesson_no: 1, topic_summary: '표를 못한다.', preview: '다음', home_study_suggestion: '더 열심히', quiz_notes: [], criteria_phrases: null }], footer_disclaimer: '' }
    const issues = staticIssues(7, plan, { standards, prior: {} })
    expect(issues.some((i) => i.kind === 'notice' && i.detail.includes('못한다'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('청유형'))).toBe(true)
  })
})
