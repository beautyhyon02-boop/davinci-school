// tests/studio-schemas.test.ts
import { describe, it, expect } from 'vitest'
import { Reconstruction, Lesson, LessonDesign, PublishedLessonDesign, Lessons, Material, Assessment, PublishedAssessment, NoticePlan, Review, STAGE_SCHEMAS, AXES, ASSESSMENT_KINDS } from '@/lib/studio/schemas'

// 대표 2026-09-26: 퀴즈는 단답형만(객관식 폐지) — 새 세트 fixture 도 단답형이다
const quiz = (q: string) => ({ q, type: 'short' as 'short' | 'choice', choices: null as string[] | null, answer: '6', explanation: '표에서 센다.' })
const choiceQuiz = (q: string) => ({ q, type: 'choice' as 'short' | 'choice', choices: ['가', '나'] as string[] | null, answer: '가', explanation: '표에서 센다.' })
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
  assessment: [] as string[], mergeable_with: null, merge_note: null, images: [],
}
/** 단원 평가 차시(대표 2026-09-26 보완): 마지막 교수 차시 뒤, 서술형 15분 + 논술형 35분, 퀴즈·활동지·발문 없음. */
export const assessmentSession = (no: number) => ({
  ...lessonV2, no, kind: 'assessment', topic: '단원 평가', key_question: '단원에서 배운 것으로 문제를 해결할 수 있는가?', goal: '서술형과 논술형 문항에 답하며 배운 것을 스스로 정리한다.',
  time_budget: { intro_min: 5, main_min: 50, wrapup_min: 5 },
  flow: { intro: ['평가 안내'], main: [{ step_label: '서술형 작성', minutes: 15, activities: ['서술형 답안 작성'] }, { step_label: '논술형 작성', minutes: 35, activities: ['논술형 답안 작성'] }], wrapup: ['답안 점검'] },
  teacher_script: { questions: [] as typeof lessonV2.teacher_script.questions }, worksheet: { tasks: [] as typeof lessonV2.worksheet.tasks, self_check: [] as string[] },
  materials_needed: [], caution_notes: ['작성 시간을 안내한다'], formative_check: { quiz: [] as typeof lessonV2.formative_check.quiz },
  assessment: ['서술형', '논술형'],
})
const criterion = (name: string, max: number) => ({ name, axis: '과정·기능', condition_nos: [1], max,
  scale: Array.from({ length: max + 1 }, (_, p) => ({ points: p, descriptor: p === 0 ? '무응답 또는 시도했으나 관련 내용 없음' : `${name} ${p}단계 충족`, example: null })) })
const noCond = (c: ReturnType<typeof criterion>) => ({ ...c, condition_nos: [] as number[] })
const exemplar = (points: number, scores: number[], text: string) => ({ level: null, points, scores, assumed_short_points: null, text, rationale: `요소별 ${scores.join('·')}점으로 ${points}점 단계에 해당함` })
// 대표 2026-09-26: 세트 끝 = 서술형 1(6점) + 논술형 1(16점). 서술형도 분석적(요소 2~3개, max 합 6) + 총체적 상/중/하.
// C-32: 서술형에는 조건(items)을 두지 않는다 — 분량·형식만. 채점 요소의 condition_nos 는 빈 배열.
const short = (lesson_no: number) => ({ kind: '서술형', lesson_no, points: 6, evaluation_elements: ['상대도수 구하기'], situation: null, materials_used: ['A'],
  stem: '자료 A의 상대도수를 구하고 변화와 이유를 쓰시오. [6점]',
  conditions: { items: [] as { no: number; text: string; verb: string; points: number | null; category: string }[],
    length: '값 2개와 문장 2개', format: '~다', answer_mode: 'screen', overflow_rule: null },
  rubric: { criteria: [noCond(criterion('계산', 2)), noCond(criterion('해석', 2)), noCond(criterion('이유', 2))],
    holistic: { 상: '두 값·변화·이유를 모두 정확히 씀', 중: '값이나 변화 가운데 일부가 틀리거나 이유가 막연함', 하: '값·변화·이유 가운데 한 가지만 씀' } as { 상: string; 중: string; 하: string } | null, notes: ['반올림 오차 허용'] },
  exemplar_answers: [
    exemplar(6, [2, 2, 2], '0.24와 0.30이고 비율이 늘었으며 총합이 달라 비율로 비교한다.'),
    exemplar(5, [2, 2, 1], '0.24와 0.30이고 비율이 늘었다. 비교가 쉬워서 쓴다.'),
    exemplar(4, [2, 1, 1], '0.24와 0.30이다. 플라스틱컵이 늘었다. 편해서 쓴다.'),
    exemplar(3, [1, 1, 1], '0.24와 0.35이다. 플라스틱컵이 늘었다. 편해서 쓴다.'),
    exemplar(2, [0, 0, 2], '두 해의 전체 개수가 달라서 개수로만 비교하면 안 된다.'),
    exemplar(1, [1, 0, 0], '0.24는 맞고 0.28이다. 변화와 이유는 쓰지 않았다.'),
  ] as { level: string | null; points: number; scores: number[]; assumed_short_points: number | null; text: string; rationale: string }[],
  level_map: [{ level: 'A', min: 6, max: 6, trait: '모두 정확' }, { level: 'B', min: 5, max: 5, trait: '계산 정확' }, { level: 'C', min: 4, max: 4, trait: '부분' }, { level: 'D', min: 3, max: 3, trait: '시도' }, { level: 'E', min: 0, max: 2, trait: '미도달' }],
  min_competency: null, references: [] })
const essay = { ...short(5), kind: '논술형', points: 16, stem: '자료 A·B를 근거로 줄일 품목을 정하시오. [16점]',
  situation: { role: '학생회 위원', audience: '축제 준비위', purpose: '감축 품목 결정', product: '제안 글' },
  // 논술형 조건은 지침만 2~4개(C-32)
  conditions: { items: [{ no: 1, text: '근거를 두 가지 이상 들 것. (2점)', verb: '들다', points: 2, category: '내용' }, { no: 2, text: '"~다"로 끝나는 문장으로 쓸 것. (1점)', verb: '쓰다', points: 1, category: '형식' }],
    length: '300자 내외', format: '문단', answer_mode: 'screen', overflow_rule: null },
  rubric: { criteria: [criterion('자료 정리', 4), criterion('근거', 4), { ...criterion('제안', 4), axis: '가치·태도' }, { ...criterion('구성', 4), condition_nos: [2] }], holistic: { 상: '수치 정확·근거 충분', 중: '수치 일부 오류', 하: '근거 없음' } as { 상: string; 중: string; 하: string } | null, notes: ['표현 차이 감점 없음'] },
  exemplar_answers: [{ level: '상', points: 15, scores: [4, 4, 4, 3], assumed_short_points: 6, text: 'x'.repeat(40), rationale: '네 요소를 대부분 충족하고 구성만 일부 부족함' }, { level: '중', points: 10, scores: [3, 2, 3, 2], assumed_short_points: 5, text: 'y'.repeat(40), rationale: '자료 정리는 되었으나 근거 연결이 부족함' }, { level: '하', points: 5, scores: [2, 1, 1, 1], assumed_short_points: 2, text: 'z'.repeat(40), rationale: '자료의 수치를 잘못 읽어 근거가 약함' }] as { level: string | null; points: number; scores: number[]; assumed_short_points: number | null; text: string; rationale: string }[],
  level_map: [{ level: 'A', min: 15, max: 16, trait: '' }, { level: 'B', min: 13, max: 14, trait: '' }, { level: 'C', min: 12, max: 12, trait: '' }, { level: 'D', min: 10, max: 11, trait: '' }, { level: 'E', min: 0, max: 9, trait: '' }] }
const gradeBoundaries = [[7, 21, 22, '상', 'A'], [6, 18, 20, '상', 'B'], [5, 15, 17, '중', 'C'], [4, 11, 14, '중', 'D'], [3, 8, 10, '중', 'E'], [2, 5, 7, '하', 'E 미만'], [1, 0, 4, '하', 'E 미만']]
  .map(([grade, min, max, band, level_ref]) => ({ grade, min, max, band, level_ref }))
export const assessmentV2 = { items: [short(4), essay], grade_boundaries: gradeBoundaries, feedback_templates: { 상: '잘했어요', 중: '조금만 더', 하: '함께 다시' } }
/** 2026-09-26 이전 판의 모양(서술형 3점 × 2 + 논술형 16점). 게시 판을 읽을 때만 받아들인다(PublishedAssessment). */
const legacyShort = (lesson_no: number) => ({ ...short(lesson_no), points: 3, stem: '자료 A의 상대도수를 구하고 이유를 쓰시오. [3점]',
  rubric: { criteria: [noCond(criterion('계산', 2)), noCond(criterion('이유', 1))], holistic: null as { 상: string; 중: string; 하: string } | null, notes: ['반올림 오차 허용'] },
  exemplar_answers: [exemplar(3, [2, 1], '0.24와 0.30이며 총합이 달라 비율로 비교한다.'), exemplar(2, [2, 0], '0.24와 0.30이다. 그냥 비교했다.'), exemplar(1, [1, 0], '0.24는 맞고 0.28이다. 이유는 없다.')],
  level_map: [{ level: 'A', min: 3, max: 3, trait: '모두 정확' }, { level: 'B', min: 2, max: 2, trait: '계산 정확' }, { level: 'C', min: 1, max: 1, trait: '부분' }, { level: 'D', min: 0, max: 0, trait: '시도' }, { level: 'E', min: 0, max: 0, trait: '미도달' }] })
export const legacyAssessment = { ...assessmentV2, items: [legacyShort(2), legacyShort(4), essay] }

describe('schemas v2', () => {
  it('reconstruction needs all three axes; 유지 also writes the template sentence (not the original verbatim) and still parses', () => {
    const base = { standards: [
      // 유지여도 reconstructed_text는 틀 문장이다(TASKS[2]) — original_text만 원문 그대로.
      { code: '[9수04-02]', original_text: '자료를 나타내고 해석할 수 있다.', reconstruction_type: '유지', reconstructed_text: '학생은 자료를 가지고 나타내고 해석하는 것을 해서 해석 결과를 할 수 있다.', reason: ['4~6차시 압축'], learning_elements: ['도수분포표'] },
      { code: '[9수04-03]', original_text: '상대도수를 구할 수 있다.', reconstruction_type: '재조정', reconstructed_text: '학생은 자료를 가지고 상대도수를 구해 비교할 수 있다.', reason: ['학원 60분 최적화'], learning_elements: ['상대도수'] } ],
      reconstruction: '자료를 정리하고 상대도수로 비교할 수 있다.',
      learning_goals: [{ text: '도수분포표의 뜻을 설명할 수 있다.', axis: '지식·이해' }, { text: '상대도수를 구할 수 있다.', axis: '과정·기능' }, { text: '통계의 유용성을 인식한다.', axis: '가치·태도' }],
      key_question_candidates: ['자료는 무엇을 먼저 줄이라고 말하는가?', '왜 비율로 비교하는가?'] }
    expect(Reconstruction.safeParse(base).success).toBe(true)
    expect(Reconstruction.parse(base).level_anchor).toEqual([])
    // 유지의 reconstructed_text가 original_text와 글자 그대로 같아도(옛 판 모양) 여전히 통과한다 — 같으라는 요구도, 달라야 한다는 요구도 없다
    expect(Reconstruction.safeParse({ ...base, standards: [{ ...base.standards[0], reconstructed_text: base.standards[0].original_text.padEnd(12, ' 것') }, base.standards[1]] }).success).toBe(true)
    expect(Reconstruction.safeParse({ ...base, learning_goals: base.learning_goals.slice(0, 2).concat({ text: 'x가 있다.', axis: '지식·이해' }) }).success).toBe(false)
    // 세트 핵심질문 후보는 2~3개
    expect(Reconstruction.safeParse({ ...base, key_question_candidates: ['한 개뿐인 후보'] }).success).toBe(false)
    expect(Reconstruction.safeParse({ ...base, key_question_candidates: [...base.key_question_candidates, '세 번째 후보는 무엇인가?'] }).success).toBe(true)
    expect(AXES).toEqual(['지식·이해', '과정·기능', '가치·태도'])
  })
  it('lesson: 60-minute budget, main minutes add up, three tiers, quiz 3/0', () => {
    expect(Lesson.safeParse(lessonV2).success).toBe(true)
    expect(Lesson.safeParse({ ...lessonV2, time_budget: { intro_min: 10, main_min: 45, wrapup_min: 10 } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, flow: { ...lessonV2.flow, main: [{ step_label: '전개', minutes: 30, activities: ['a'] }] } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, worksheet: { ...lessonV2.worksheet, tasks: lessonV2.worksheet.tasks.slice(0, 2) } }).success).toBe(false)
    // 교수 차시(기본 kind)는 언제나 퀴즈 3문항(대표 2026-09-26: 마지막 교수 차시 포함), 평가 차시는 0
    expect(Lesson.parse(lessonV2).kind).toBe('teaching')
    expect(Lesson.safeParse({ ...lessonV2, formative_check: { quiz: [] } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, assessment: ['논술형'], formative_check: { quiz: [] } }).success).toBe(false)
    expect(Lesson.safeParse(assessmentSession(6)).error?.issues ?? []).toEqual([])
    expect(Lesson.safeParse({ ...assessmentSession(6), formative_check: lessonV2.formative_check }).success).toBe(false)
    expect(Lesson.safeParse({ ...assessmentSession(6), assessment: [] }).success).toBe(false)
    // 평가 차시가 아니면 활동지·발문이 필요하다(평가 차시만 비울 수 있다)
    expect(Lesson.safeParse({ ...lessonV2, worksheet: { tasks: [], self_check: [] } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, teacher_script: { questions: [] } }).success).toBe(false)
  })
  it('lesson design = 교수 차시 + 단원 평가 차시(서술형 1 → 논술형 1, 대표 2026-09-26); Lessons alias kept', () => {
    expect(ASSESSMENT_KINDS).toEqual(['서술형', '논술형'])
    const lessons = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no })).concat(assessmentSession(6))
    const planOf = (ls: { no: number; standards: string[]; topic: string }[], placement: { lesson_no: number; kind: string }[]) => ({ set_title: '자료의 정리와 해석', set_key_question: '자료는 무엇을 말하는가?', lesson_map: ls.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic })),
      assessment_plan: { formative: '교수 차시마다 퀴즈 3문항', summative_placement: placement, rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } })
    const unit_plan = planOf(lessons, [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }])
    expect(LessonDesign.safeParse({ unit_plan, lessons }).error?.issues ?? []).toEqual([])
    expect(Lessons).toBe(LessonDesign)
    expect(LessonDesign.safeParse({ unit_plan, lessons: lessons.slice(0, 3) }).success).toBe(false)
    // 평가 차시가 없거나, 서·논술형을 교수 차시에 두면(옛 배치) 새 세트에서 받지 않는다
    const inLessons = [1, 2, 3].map((no) => ({ ...lessonV2, no })).concat({ ...lessonV2, no: 4, assessment: ['서술형'] }, { ...assessmentSession(5), assessment: ['논술형'] })
    expect(LessonDesign.safeParse({ unit_plan: planOf(inLessons, [{ lesson_no: 4, kind: '서술형' }, { lesson_no: 5, kind: '논술형' }]), lessons: inLessons }).success).toBe(false)
    const noSession = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no }))
    expect(LessonDesign.safeParse({ unit_plan: planOf(noSession, []), lessons: noSession }).success).toBe(false)
    // 계획과 차시 배치가 어긋나면 안 된다
    expect(LessonDesign.safeParse({ unit_plan: planOf(lessons, [{ lesson_no: 5, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }]), lessons }).success).toBe(false)
    // 게시 판 읽기(PublishedLessonDesign)는 옛 판(교수 차시의 서술형 2 + 마지막 논술형 차시, compat 이 라벨을 배열로 올린 것)도 받는다
    const legacy = [1, 2].map((no) => ({ ...lessonV2, no })).concat({ ...lessonV2, no: 3, assessment: ['서술형'] }, { ...lessonV2, no: 4, assessment: ['서술형'] }, { ...assessmentSession(5), assessment: ['논술형'], flow: { ...assessmentSession(5).flow, main: [{ step_label: '논술형 안내', minutes: 15, activities: ['안내'] }, { step_label: '논술형 작성', minutes: 35, activities: ['작성'] }] } })
    const legacyPlan = planOf(legacy, [{ lesson_no: 3, kind: '서술형' }, { lesson_no: 4, kind: '서술형' }, { lesson_no: 5, kind: '논술형' }])
    expect(PublishedLessonDesign.safeParse({ unit_plan: legacyPlan, lessons: legacy }).error?.issues ?? []).toEqual([])
    expect(LessonDesign.safeParse({ unit_plan: legacyPlan, lessons: legacy }).success).toBe(false)
    expect(PublishedLessonDesign.safeParse({ unit_plan, lessons }).success).toBe(true)
  })
  it('quiz (대표 2026-09-26, L-09): 새 세트는 단답형만(type short·choices null), 게시 판 읽기는 옛 선택형도 받는다', () => {
    const lessons = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no })).concat(assessmentSession(6))
    const unit_plan = { set_title: '자료의 정리와 해석', set_key_question: '자료는 무엇을 말하는가?', lesson_map: lessons.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic })),
      assessment_plan: { formative: '교수 차시마다 퀴즈 3문항', summative_placement: [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }
    const withQuiz = (q: ReturnType<typeof quiz>) => lessons.map((l) => (l.no === 2 ? { ...l, formative_check: { quiz: [quiz('문항 1'), q, quiz('문항 3')] } } : l))
    const messages = (ls: unknown[]) => LessonDesign.safeParse({ unit_plan, lessons: ls }).error?.issues.map((i) => i.message) ?? []
    expect(messages(lessons)).toEqual([])
    expect(messages(withQuiz(choiceQuiz('문항 2')))).toEqual(['2차시 퀴즈 2: 퀴즈는 단답형만(선택지 금지)'])
    // 단답형이라도 선택지를 달면 안 된다
    expect(messages(withQuiz({ ...quiz('문항 2'), choices: ['6', '7'] }))).toEqual(['2차시 퀴즈 2: 퀴즈는 단답형만(선택지 금지)'])
    expect(STAGE_SCHEMAS[3].safeParse({ unit_plan, lessons: withQuiz(choiceQuiz('문항 2')) }).success).toBe(false)
    // 차시 하나(Lesson)와 게시 판(PublishedLessonDesign)은 옛 선택형을 읽는다 — 이미 게시된 판은 바꾸지 않는다
    expect(Lesson.safeParse({ ...lessonV2, formative_check: { quiz: [choiceQuiz('문항 1'), choiceQuiz('문항 2'), choiceQuiz('문항 3')] } }).success).toBe(true)
    expect(PublishedLessonDesign.safeParse({ unit_plan, lessons: withQuiz(choiceQuiz('문항 2')) }).error?.issues ?? []).toEqual([])
  })
  it('material source is an object and role defaults to raw', () => {
    const m = Material.parse({ id: 'A', title: 't', kind: 'table', body: null, table: { columns: ['부스', '개수'], rows: [[1, 18]] }, source: { kind: '자작', attribution: null, ai_assisted: false } })
    expect(m.role).toBe('raw'); expect(m.images).toEqual([])
    expect(Material.safeParse({ id: 'A', title: 't', kind: 'text', body: 'b', table: null, source: { kind: '공개', attribution: null, ai_assisted: false } }).success).toBe(false)
    expect(Material.safeParse({ id: 'A', title: 't', kind: 'text', body: 'b', table: null, source: '자작' }).success).toBe(false)
  })
  it('assessment: 서술형 6 + 논술형 16 = 22 (대표 2026-09-26), unified rubric, scale continuity, condition refs, paper<=1, exemplar bands', () => {
    expect(Assessment.safeParse(assessmentV2).error?.issues ?? []).toEqual([])
    const bad = (patch: (a: typeof assessmentV2) => unknown) => Assessment.safeParse(patch(structuredClone(assessmentV2))).success
    expect(bad((a) => { a.items[0].points = 5; return a })).toBe(false)
    expect(bad((a) => { a.items[0].rubric.criteria[0].scale.splice(1, 1); return a })).toBe(false)
    expect(bad((a) => { a.items[0].rubric.criteria[1].condition_nos = [1]; return a })).toBe(false)
    expect(bad((a) => { a.items[1].rubric.criteria[1].condition_nos = [3]; return a })).toBe(false)
    expect(bad((a) => { a.items[0].conditions.answer_mode = 'paper'; a.items[1].conditions.answer_mode = 'paper'; return a })).toBe(false)
    expect(bad((a) => { a.items[1].rubric.holistic = null; return a })).toBe(false)
    expect(bad((a) => { a.items[1].exemplar_answers[0].points = 20; return a })).toBe(false)
    expect(bad((a) => { a.items[1].exemplar_answers[2].points = 15; a.items[1].exemplar_answers[2].scores = [4, 4, 4, 3]; return a })).toBe(false)
    expect(bad((a) => { a.items[0].stem = '자료 A의 상대도수를 구하시오. (6점)'; return a })).toBe(false)
    expect(bad((a) => { a.grade_boundaries[6].min = 1; return a })).toBe(false)
  })
  it('assessment structure: exactly 2 items, 서술형 → 논술형, both with analytic + holistic rubrics (C-15, C-31)', () => {
    const messages = (patch: (a: typeof assessmentV2) => unknown) => Assessment.safeParse(patch(structuredClone(assessmentV2))).error?.issues.map((i) => i.message).join(' | ') ?? ''
    expect(messages((a) => a)).toBe('')
    // 서술형도 총체적 상/중/하 필수
    expect(messages((a) => { a.items[0].rubric.holistic = null; return a })).toMatch(/총체적/)
    // 서술형 요소 2~3개, max 합 6
    expect(messages((a) => { a.items[0].rubric.criteria = [a.items[0].rubric.criteria[0]]; return a })).toMatch(/요소 최댓값 합/)
    // 서술형 요소는 3개까지(SHORT_CRITERIA.max) — max 합이 6이어도 4요소는 막는다
    expect(messages((a) => {
      const c = a.items[0].rubric.criteria
      a.items[0].rubric.criteria = [c[0], c[1], { ...c[2], name: '이유 1', max: 1, scale: c[2].scale.slice(0, 2) }, { ...c[2], name: '이유 2', max: 1, scale: c[2].scale.slice(0, 2) }]
      a.items[0].exemplar_answers = a.items[0].exemplar_answers.map((e) => ({ ...e, scores: [...e.scores.slice(0, 2), 0, 0], points: e.scores[0] + e.scores[1] }))
      return a
    })).toMatch(/서술형 채점 요소는 3개 이하/)
    // 순서·개수·배점
    expect(messages((a) => { a.items = [a.items[1], a.items[0]]; return a })).toMatch(/서술형 → 논술형/)
    expect(messages((a) => { a.items = [a.items[0], structuredClone(a.items[0]), a.items[1]]; return a })).not.toBe('')
    expect(messages((a) => { a.items[1].points = 12; return a })).not.toBe('')
    // 논술형 예시가 전제하는 서술형 점수(assumed_short_points)는 한 문항의 0~6
    expect(messages((a) => { a.items[1].exemplar_answers[0].assumed_short_points = 7; return a })).not.toBe('')
  })
  it('published 판 reader accepts the legacy 서술형 3점 × 2 structure (holistic optional there) but nothing else', () => {
    expect(PublishedAssessment.safeParse(legacyAssessment).error?.issues ?? []).toEqual([])
    expect(PublishedAssessment.safeParse(assessmentV2).error?.issues ?? []).toEqual([])
    expect(Assessment.safeParse(legacyAssessment).success).toBe(false)
    const mixed = { ...legacyAssessment, items: [legacyAssessment.items[0], assessmentV2.items[0], assessmentV2.items[1]] }
    expect(PublishedAssessment.safeParse(mixed).success).toBe(false)
    // 지금 구조의 서술형은 판에서도 총체적 기준이 있어야 한다
    const noHolistic = structuredClone(assessmentV2); noHolistic.items[0].rubric.holistic = null
    expect(PublishedAssessment.safeParse(noHolistic).success).toBe(false)
  })
  it('conditions: 0~4 items (C-32) and a criterion may point at no condition', () => {
    const issues = (patch: (a: typeof assessmentV2) => unknown) => Assessment.safeParse(patch(structuredClone(assessmentV2))).error?.issues.map((i) => i.message) ?? []
    expect(assessmentV2.items[0].conditions.items).toEqual([]); expect(assessmentV2.items[0].rubric.criteria[0].condition_nos).toEqual([])
    expect(issues((a) => a)).toEqual([])
    const cond = (no: number) => ({ no, text: `요건 ${no}을 지킬 것`, verb: '지키다', points: null, category: no % 2 ? '내용' : '형식' })
    expect(issues((a) => { a.items[1].conditions.items = [1, 2, 3, 4].map(cond); a.items[1].rubric.criteria[3].condition_nos = [1, 2, 3, 4]; return a })).toEqual([])
    expect(issues((a) => { a.items[1].conditions.items = [1, 2, 3, 4, 5].map(cond); a.items[1].rubric.criteria[3].condition_nos = [1, 2, 3, 4, 5]; return a })).not.toEqual([])
  })
  it('notice plan and review kinds and stage list', () => {
    const plan = { per_lesson: [1, 2, 3, 4].map((n) => ({ lesson_no: n, topic_summary: '표 만들기를 배웠습니다.', preview: '다음 시간에는 그래프를 배워요.', home_study_suggestion: '틀린 문항 하나를 다시 풀어 봅시다.', quiz_notes: [{ quiz_no: 1, wrong_note: '계급 폭을 다시 보면 됩니다' }], criteria_phrases: null })),
      footer_disclaimer: '본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.' }
    expect(NoticePlan.safeParse(plan).success).toBe(true)
    expect(Review.parse({ pass: false, issues: [{ kind: 'level', detail: 'x' }, { kind: 'notice', detail: 'y' }] }).issues).toHaveLength(2)
    expect(Object.keys(STAGE_SCHEMAS)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
  })
})
