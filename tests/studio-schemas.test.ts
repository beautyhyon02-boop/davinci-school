// tests/studio-schemas.test.ts
import { describe, it, expect } from 'vitest'
import { Reconstruction, Lesson, LessonDesign, Lessons, Material, Assessment, NoticePlan, Review, STAGE_SCHEMAS, AXES } from '@/lib/studio/schemas'

const quiz = (q: string) => ({ q, type: 'choice' as const, choices: ['가', '나'], answer: '가', explanation: '표에서 센다.' })
export const lessonV2 = {
  no: 1, standards: ['[9수04-02]'], topic: '도수분포표 만들기',
  key_question: '자료를 계급으로 나누면 무엇이 보이는가?', goal: '자료를 계급으로 나누어 도수분포표로 나타낼 수 있다.',
  time_budget: { intro_min: 10, main_min: 40, wrapup_min: 10 },
  flow: { intro: ['자료 A 훑어보기'], main: [{ step_label: '계급 나누기', minutes: 20, activities: ['계급 크기 정하기'] }, { step_label: '표 완성', minutes: 20, activities: ['도수 세기'] }], wrapup: ['퀴즈'] },
  teacher_script: { questions: [{ prompt: '계급의 크기는?', expected_answer: '10', if_stuck: '표 왼쪽 칸을 보자' }, { prompt: '도수의 합은?', expected_answer: '20', if_stuck: '부스 수를 세어 보자' }] },
  materials_used: ['A'], materials_needed: ['활동지'], caution_notes: ['도수 합 검산'],
  worksheet: { tasks: [
    { no: 1, prompt: '계급 30~40의 도수는?', tier: '기본', level_ref: 'D~E', answer_space: 'short', expected: '6' },
    { no: 2, prompt: '표를 완성하시오', tier: '표준', level_ref: 'C', answer_space: 'table', expected: '6행' },
    { no: 3, prompt: '가장 많은 계급을 문장으로', tier: '도전', level_ref: 'A~B', answer_space: 'lines', expected: '30 이상 40 미만' } ], self_check: ['표를 혼자 완성했다'] },
  formative_check: { quiz: [quiz('문항 1'), quiz('문항 2'), quiz('문항 3')] },
  assessment: null, mergeable_with: null, merge_note: null, images: [],
}
const criterion = (name: string, max: number) => ({ name, axis: '과정·기능', condition_nos: [1], max,
  scale: Array.from({ length: max + 1 }, (_, p) => ({ points: p, descriptor: p === 0 ? '무응답 또는 시도했으나 관련 내용 없음' : `${name} ${p}단계 충족`, example: null })) })
const short = (lesson_no: number) => ({ kind: '서술형', lesson_no, points: 3, evaluation_elements: ['상대도수 구하기'], situation: null, materials_used: ['A'],
  stem: '자료 A의 상대도수를 구하고 이유를 쓰시오. [3점]',
  // C-32(대표 2026-09-26): 서술형에는 조건(items)을 두지 않는다 — 분량·형식만. 채점 요소의 condition_nos 는 빈 배열.
  conditions: { items: [] as { no: number; text: string; verb: string; points: number | null; category: string }[],
    length: '문장 1개', format: '~다', answer_mode: 'screen', overflow_rule: null },
  rubric: { criteria: [{ ...criterion('계산', 2), condition_nos: [] as number[] }, { ...criterion('이유', 1), condition_nos: [] as number[] }], holistic: null, notes: ['반올림 오차 허용'] },
  exemplar_answers: [{ level: null, points: 3, scores: [2, 1], assumed_short_points: null, text: '0.24와 0.30이며 총합이 달라 비율로 비교한다.', rationale: '두 조건 모두 충족' }, { level: null, points: 2, scores: [2, 0], assumed_short_points: null, text: '0.24와 0.30이다. 그냥 비교했다.', rationale: '값은 맞으나 이유 조건을 충족하지 못함' }, { level: null, points: 1, scores: [1, 0], assumed_short_points: null, text: '0.24는 맞고 0.28이다. 이유는 없다.', rationale: '값 하나만 맞고 이유가 없음' }],
  level_map: [{ level: 'A', min: 3, max: 3, trait: '모두 정확' }, { level: 'B', min: 2, max: 2, trait: '계산 정확' }, { level: 'C', min: 1, max: 1, trait: '부분' }, { level: 'D', min: 0, max: 0, trait: '시도' }, { level: 'E', min: 0, max: 0, trait: '미도달' }],
  min_competency: null, references: [] })
const essay = { ...short(5), kind: '논술형', points: 16, stem: '자료 A·B를 근거로 줄일 품목을 정하시오. [16점]',
  situation: { role: '학생회 위원', audience: '축제 준비위', purpose: '감축 품목 결정', product: '제안 글' },
  // 논술형 조건은 지침만 2~4개(C-32)
  conditions: { items: [{ no: 1, text: '근거를 두 가지 이상 들 것. (2점)', verb: '들다', points: 2, category: '내용' }, { no: 2, text: '"~다"로 끝나는 문장으로 쓸 것. (1점)', verb: '쓰다', points: 1, category: '형식' }],
    length: '300자 내외', format: '문단', answer_mode: 'screen', overflow_rule: null },
  rubric: { criteria: [criterion('자료 정리', 4), criterion('근거', 4), { ...criterion('제안', 4), axis: '가치·태도' }, { ...criterion('구성', 4), condition_nos: [2] }], holistic: { 상: '수치 정확·근거 충분', 중: '수치 일부 오류', 하: '근거 없음' }, notes: ['표현 차이 감점 없음'] },
  exemplar_answers: [{ level: '상', points: 15, scores: [4, 4, 4, 3], assumed_short_points: 6, text: 'x'.repeat(40), rationale: '네 요소를 대부분 충족하고 구성만 일부 부족함' }, { level: '중', points: 10, scores: [3, 2, 3, 2], assumed_short_points: 5, text: 'y'.repeat(40), rationale: '자료 정리는 되었으나 근거 연결이 부족함' }, { level: '하', points: 5, scores: [2, 1, 1, 1], assumed_short_points: 2, text: 'z'.repeat(40), rationale: '자료의 수치를 잘못 읽어 근거가 약함' }],
  level_map: [{ level: 'A', min: 15, max: 16, trait: '' }, { level: 'B', min: 13, max: 14, trait: '' }, { level: 'C', min: 12, max: 12, trait: '' }, { level: 'D', min: 10, max: 11, trait: '' }, { level: 'E', min: 0, max: 9, trait: '' }] }
export const assessmentV2 = { items: [short(2), short(4), essay],
  grade_boundaries: [[7, 21, 22, '상', 'A'], [6, 18, 20, '상', 'B'], [5, 15, 17, '중', 'C'], [4, 11, 14, '중', 'D'], [3, 8, 10, '중', 'E'], [2, 5, 7, '하', 'E 미만'], [1, 0, 4, '하', 'E 미만']]
    .map(([grade, min, max, band, level_ref]) => ({ grade, min, max, band, level_ref })),
  feedback_templates: { 상: '잘했어요', 중: '조금만 더', 하: '함께 다시' } }

describe('schemas v2', () => {
  it('reconstruction needs all three axes and 유지 keeps the original text', () => {
    const base = { standards: [
      { code: '[9수04-02]', original_text: '자료를 나타내고 해석할 수 있다.', reconstruction_type: '유지', reconstructed_text: '자료를 나타내고 해석할 수 있다.', reason: ['4~6차시 압축'], learning_elements: ['도수분포표'] },
      { code: '[9수04-03]', original_text: '상대도수를 구할 수 있다.', reconstruction_type: '재조정', reconstructed_text: '학생은 자료를 가지고 상대도수를 구해 비교할 수 있다.', reason: ['학원 60분 최적화'], learning_elements: ['상대도수'] } ],
      reconstruction: '자료를 정리하고 상대도수로 비교할 수 있다.',
      learning_goals: [{ text: '도수분포표의 뜻을 설명할 수 있다.', axis: '지식·이해' }, { text: '상대도수를 구할 수 있다.', axis: '과정·기능' }, { text: '통계의 유용성을 인식한다.', axis: '가치·태도' }],
      key_question_candidates: ['자료는 무엇을 먼저 줄이라고 말하는가?', '왜 비율로 비교하는가?'] }
    expect(Reconstruction.safeParse(base).success).toBe(true)
    expect(Reconstruction.parse(base).level_anchor).toEqual([])
    expect(Reconstruction.safeParse({ ...base, learning_goals: base.learning_goals.slice(0, 2).concat({ text: 'x가 있다.', axis: '지식·이해' }) }).success).toBe(false)
    expect(Reconstruction.safeParse({ ...base, standards: [{ ...base.standards[0], reconstructed_text: '다른 문장이다.' }, base.standards[1]] }).success).toBe(false)
    expect(AXES).toEqual(['지식·이해', '과정·기능', '가치·태도'])
  })
  it('lesson: 60-minute budget, main minutes add up, three tiers, quiz 3/0', () => {
    expect(Lesson.safeParse(lessonV2).success).toBe(true)
    expect(Lesson.safeParse({ ...lessonV2, time_budget: { intro_min: 10, main_min: 45, wrapup_min: 10 } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, flow: { ...lessonV2.flow, main: [{ step_label: '전개', minutes: 30, activities: ['a'] }] } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, worksheet: { ...lessonV2.worksheet, tasks: lessonV2.worksheet.tasks.slice(0, 2) } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, assessment: '논술형' }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, assessment: '논술형', formative_check: { quiz: [] } }).success).toBe(true)
  })
  it('lesson design = unit_plan + 4~6 lessons; Lessons alias kept', () => {
    const lessons = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no, assessment: no === 5 ? '논술형' : no === 3 ? '서술형1' : no === 4 ? '서술형2' : null, formative_check: { quiz: no === 5 ? [] : lessonV2.formative_check.quiz } }))
    const unit_plan = { set_title: '자료의 정리와 해석', set_key_question: '자료는 무엇을 말하는가?', lesson_map: lessons.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic })),
      assessment_plan: { formative: '차시별 퀴즈 3문항', summative_placement: [{ lesson_no: 3, kind: '서술형1' }, { lesson_no: 4, kind: '서술형2' }, { lesson_no: 5, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }
    expect(LessonDesign.safeParse({ unit_plan, lessons }).success).toBe(true)
    expect(Lessons).toBe(LessonDesign)
    expect(LessonDesign.safeParse({ unit_plan, lessons: lessons.slice(0, 3) }).success).toBe(false)
  })
  it('material source is an object and role defaults to raw', () => {
    const m = Material.parse({ id: 'A', title: 't', kind: 'table', body: null, table: { columns: ['부스', '개수'], rows: [[1, 18]] }, source: { kind: '자작', attribution: null, ai_assisted: false } })
    expect(m.role).toBe('raw'); expect(m.images).toEqual([])
    expect(Material.safeParse({ id: 'A', title: 't', kind: 'text', body: 'b', table: null, source: { kind: '공개', attribution: null, ai_assisted: false } }).success).toBe(false)
    expect(Material.safeParse({ id: 'A', title: 't', kind: 'text', body: 'b', table: null, source: '자작' }).success).toBe(false)
  })
  it('assessment: 3+3+16, unified rubric, scale continuity, condition refs, paper<=1, exemplar bands', () => {
    expect(Assessment.safeParse(assessmentV2).error?.issues ?? []).toEqual([])
    const bad = (patch: (a: typeof assessmentV2) => unknown) => Assessment.safeParse(patch(structuredClone(assessmentV2))).success
    expect(bad((a) => { a.items[0].points = 4; return a })).toBe(false)
    expect(bad((a) => { a.items[0].rubric.criteria[0].scale.splice(1, 1); return a })).toBe(false)
    expect(bad((a) => { a.items[0].rubric.criteria[1].condition_nos = [1]; return a })).toBe(false)
    expect(bad((a) => { a.items[2].rubric.criteria[1].condition_nos = [3]; return a })).toBe(false)
    expect(bad((a) => { a.items[0].conditions.answer_mode = 'paper'; a.items[1].conditions.answer_mode = 'paper'; return a })).toBe(false)
    expect(bad((a) => { a.items[2].rubric.holistic = null; return a })).toBe(false)
    expect(bad((a) => { a.items[2].exemplar_answers[0].points = 20; return a })).toBe(false)
    expect(bad((a) => { a.items[2].exemplar_answers[2].points = 15; a.items[2].exemplar_answers[2].scores = [4, 4, 4, 3]; return a })).toBe(false)
    expect(bad((a) => { a.items[0].stem = '자료 A의 상대도수를 구하시오. (3점)'; return a })).toBe(false)
    expect(bad((a) => { a.grade_boundaries[6].min = 1; return a })).toBe(false)
  })
  it('conditions: 0~4 items (C-32) and a criterion may point at no condition', () => {
    const issues = (patch: (a: typeof assessmentV2) => unknown) => Assessment.safeParse(patch(structuredClone(assessmentV2))).error?.issues.map((i) => i.message) ?? []
    expect(assessmentV2.items[0].conditions.items).toEqual([]); expect(assessmentV2.items[0].rubric.criteria[0].condition_nos).toEqual([])
    expect(issues((a) => a)).toEqual([])
    const cond = (no: number) => ({ no, text: `요건 ${no}을 지킬 것`, verb: '지키다', points: null, category: no % 2 ? '내용' : '형식' })
    expect(issues((a) => { a.items[2].conditions.items = [1, 2, 3, 4].map(cond); a.items[2].rubric.criteria[3].condition_nos = [1, 2, 3, 4]; return a })).toEqual([])
    expect(issues((a) => { a.items[2].conditions.items = [1, 2, 3, 4, 5].map(cond); a.items[2].rubric.criteria[3].condition_nos = [1, 2, 3, 4, 5]; return a })).not.toEqual([])
  })
  it('notice plan and review kinds and stage list', () => {
    const plan = { per_lesson: [1, 2, 3, 4].map((n) => ({ lesson_no: n, topic_summary: '표 만들기를 배웠습니다.', preview: '다음 시간에는 그래프를 배워요.', home_study_suggestion: '틀린 문항 하나를 다시 풀어 봅시다.', quiz_notes: [{ quiz_no: 1, wrong_note: '계급 폭을 다시 보면 됩니다' }], criteria_phrases: null })),
      footer_disclaimer: '본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.' }
    expect(NoticePlan.safeParse(plan).success).toBe(true)
    expect(Review.parse({ pass: false, issues: [{ kind: 'level', detail: 'x' }, { kind: 'notice', detail: 'y' }] }).issues).toHaveLength(2)
    expect(Object.keys(STAGE_SCHEMAS)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
  })
})
