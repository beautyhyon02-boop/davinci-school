// tests/checks.test.ts
import { describe, it, expect } from 'vitest'
import { staticIssues, inventedActors, statesAnswer, quizCopySource, lessonSourceUnits, questionStems } from '@/lib/studio/checks'
import { statesAnswer as compatStatesAnswer } from '@/lib/studio/compat'
import { LessonDesign } from '@/lib/studio/schemas'
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
  it('stage 2: 대주제 제목의 낱말이 섞이면 사유 앞에 "대주제 상황(…)을 재구성 문장에 넣었음 — 학습 목표·차시에만 쓴다"를 붙인다', () => {
    const en = [{ code: '[9영02-03]', text: '친숙한 주제에 관해 사실적 정보를 설명한다.' }, { code: '[9영02-09]', text: '적절한 매체를 활용하여 정보 윤리를 준수하며 말하거나 쓴다.' }]
    const row = (i: number, reconstructed_text: string) => ({ code: en[i].code, original_text: en[i].text, reconstruction_type: '재조정', reconstructed_text, reason: ['학원 60분 최적화'], merged_with: [], learning_elements: ['x'] })
    const out = { standards: [
      row(0, '학생은 학교 축제의 안내문을 가지고 사실적 정보를 설명하는 글을 쓸 수 있다.'),
      row(1, '학생은 적절한 매체를 가지고 정보 윤리를 준수하며 매체 활용을 해서 말하거나 쓰는 것을 할 수 있다.') ],
      reconstruction: '학생은 학교 축제의 일회용품 줄이기를 다룬 영어 안내문과 도표 자료를 가지고 사실적 정보를 설명할 수 있다.', learning_goals: [], level_anchor: [], key_question_candidates: [] }
    const theme = { title: '학교 축제 일회용품 줄이기' }
    const details = staticIssues(2, out, { standards: en, prior: {}, theme }).map((i) => i.detail)
    expect(details).toEqual([
      '대주제 상황(학교, 축제의)을 재구성 문장에 넣었음 — 학습 목표·차시에만 쓴다: [9영02-03]: 원문에 없는 표현 학교, 축제의',
      '대주제 상황(학교, 축제의, 일회용품, 줄이기를)을 재구성 문장에 넣었음 — 학습 목표·차시에만 쓴다: 통합 문장: 원문에 없는 표현 학교, 축제의, 일회용품, 줄이기를, 다룬, 영어',
    ])
    // 판정은 그대로다 — 대주제가 없으면 사유 앞머리만 빠진다
    expect(staticIssues(2, out, { standards: en, prior: {} }).map((i) => i.detail)).toEqual([
      '[9영02-03]: 원문에 없는 표현 학교, 축제의',
      '통합 문장: 원문에 없는 표현 학교, 축제의, 일회용품, 줄이기를, 다룬, 영어',
    ])
  })
  it('stage 2: 대주제 낱말이 아닌 새 내용어에는 앞머리를 붙이지 않는다', () => {
    const out = { standards: [], reconstruction: '학생은 통계청 자료를 가지고 상대도수를 구할 수 있다.', learning_goals: [], level_anchor: [], key_question_candidates: [] }
    expect(staticIssues(2, out, { standards, prior: {}, theme: { title: '학교 축제 일회용품 줄이기' } }).map((i) => i.detail)).toEqual(['통합 문장: 원문에 없는 표현 통계청'])
  })
  it('stage 3: coverage, placement, mergeable adjacency, short-only quiz, main ≥ 2 steps', () => {
    const lessons = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no, standards: ['[9수04-02]'], mergeable_with: no === 1 ? 4 : null })).concat({ ...assessmentSession(6), standards: ['[9수04-02]'], mergeable_with: null })
    const out = { unit_plan: { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }, lessons }
    const issues = staticIssues(3, out, { standards, prior: {} })
    expect(issues.some((i) => i.kind === 'coverage' && i.detail.includes('[9수04-03]'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('병합'))).toBe(true)
    // 대표 2026-09-26(L-09): 퀴즈는 단답형만 — 선택형이거나 선택지를 단 문항은 걸린다, 단답형(lessonV2)은 걸리지 않는다
    expect(issues.filter((i) => i.kind === 'quiz')).toEqual([])
    const withQuiz = (quiz: (typeof lessonV2.formative_check.quiz)[number]) => ({ ...out, lessons: out.lessons.map((l) => l.no === 1 ? { ...l, mergeable_with: 2, formative_check: { quiz: [quiz, ...l.formative_check.quiz.slice(1)] } } : l) })
    const quizIssues = (o: unknown) => staticIssues(3, o, { standards, prior: {} }).filter((i) => i.kind === 'quiz').map((i) => i.detail)
    const first = lessonV2.formative_check.quiz[0]
    expect(quizIssues(withQuiz({ ...first, type: 'choice', choices: ['6', '7'] }))).toEqual(['1차시 퀴즈 1: 퀴즈는 단답형만(선택지 금지)'])
    expect(quizIssues(withQuiz({ ...first, choices: ['6', '7'] }))).toEqual(['1차시 퀴즈 1: 퀴즈는 단답형만(선택지 금지)'])
    expect(quizIssues(withQuiz({ ...first, type: 'choice', choices: null }))).toEqual(['1차시 퀴즈 1: 퀴즈는 단답형만(선택지 금지)'])
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
  it('stage 3 (대표 2026-09-26, L-10): 퀴즈 수준이 D~E·C·B 하나씩이 아니면 참고 메모(kind other) — 옛 초안(level_ref 없음)도 zod 는 통과하고 메모만 받는다', () => {
    const one = [standards[0]]
    const design = (lessons: unknown[]) => ({ unit_plan: { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }, lessons })
    const base = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no })).concat(assessmentSession(6))
    const levelNotes = (lessons: unknown[]) => staticIssues(3, design(lessons), { standards: one, prior: {} }).filter((i) => i.detail.includes('수준'))
    expect(levelNotes(base)).toEqual([])
    const setLevels = (no: number, levels: (string | undefined)[]) => base.map((l) => (l.no === no ? { ...l, formative_check: { quiz: l.formative_check.quiz.map((q, i) => ({ ...q, level_ref: levels[i] })) } } : l))
    const note = '퀴즈 수준 표시(level_ref)가 없거나 D~E/C/B가 고르지 않음 — 3단계를 다시 생성하면 채워집니다'
    expect(levelNotes(setLevels(1, ['D~E', 'D~E', 'D~E']))).toEqual([{ kind: 'other', detail: `1차시 ${note}` }])
    expect(levelNotes(setLevels(3, ['D~E', 'C', undefined]))).toEqual([{ kind: 'other', detail: `3차시 ${note}` }])
    expect(levelNotes(setLevels(2, ['C', 'B', 'D~E']))).toEqual([])   // 순서는 따지지 않는다
    // 옛 모양 차시(퀴즈에 level_ref 가 아예 없음): 새 세트 zod(LessonDesign)를 통과하고 — 이미지 첨부·문장 고치기가 되고 — [TS] 메모만 받는다
    const old = base.map((l) => ({ ...l, formative_check: { quiz: l.formative_check.quiz.map(({ level_ref: _x, ...q }) => { void _x; return q }) } }))
    const unit_plan = { set_title: '자료의 정리와 해석', set_key_question: '자료는 무엇을 말하는가?', lesson_map: old.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic })),
      assessment_plan: { ...design(old).unit_plan.assessment_plan, formative: '교수 차시마다 퀴즈 3문항' } }
    expect(LessonDesign.safeParse({ unit_plan, lessons: old }).error?.issues ?? []).toEqual([])
    expect(levelNotes(old).map((i) => i.detail)).toEqual([1, 2, 3, 4, 5].map((no) => `${no}차시 ${note}`))
  })
  it('stage 3 (대표 2026-09-26, L-10): 정답이 본문(발문 대본·수업 흐름·활동지·사용 자료)에 그대로 있고 발문이 그 문장을 옮겼으면 "정답이 본문에 그대로 있음" 참고 메모', () => {
    const one = [standards[0]]
    const design = (lessons: unknown[]) => ({ unit_plan: { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }, lessons })
    const first = lessonV2.formative_check.quiz[0]
    const lesson1 = (patch: Record<string, unknown>, q: { q: string; answer: string }) => ({ ...lessonV2, no: 1, ...patch, formative_check: { quiz: [{ ...first, ...q }, ...lessonV2.formative_check.quiz.slice(1)] } })
    const copyNotes = (l: unknown, prior: Record<string, unknown> = {}) => staticIssues(3, design([l, ...[2, 3, 4, 5].map((no) => ({ ...lessonV2, no })), assessmentSession(6)]), { standards: one, prior })
      .filter((i) => i.detail.includes('본문에 그대로'))
    // 수업에서 물은 발문을 퀴즈가 되풀이 — 발문 대본
    const script = { teacher_script: { questions: [{ prompt: '자료 A의 도수분포표에서 계급 30개 이상 40개 미만의 도수는?', expected_answer: '6', if_stuck: '표에서 그 칸을 짚어 보게 한다.' }, lessonV2.teacher_script.questions[1]] } }
    expect(copyNotes(lesson1(script, { q: '자료 A의 도수분포표에서 계급 30개 이상 40개 미만의 도수는?', answer: '6' }))).toEqual([{ kind: 'other', detail: '1차시 퀴즈 1: 정답이 본문에 그대로 있음(발문 대본)' }])
    // 같은 개념의 새 사례(다른 계급)는 되풀이가 아니다
    expect(copyNotes(lesson1(script, { q: '자료 A의 도수분포표에서 계급 50개 이상 60개 미만의 도수는?', answer: '4' }))).toEqual([])
    // 수업 흐름 문장에 빈칸을 뚫은 발문 — 수업 흐름
    const flow = { flow: { ...lessonV2.flow, intro: ['과학적 탐구 방법의 과정(문제 인식 → 가설 설정 → 자료 수집 → 결론 도출)을 칠판에 정리'] } }
    expect(copyNotes(lesson1(flow, { q: '과학적 탐구 방법은 "문제 인식 → 가설 설정 → (   ) → 결론 도출" 순서로 진행된다. 빈칸에 들어갈 단계는?', answer: '자료 수집 / 자료 모으기' }))).toEqual([{ kind: 'other', detail: '1차시 퀴즈 1: 정답이 본문에 그대로 있음(수업 흐름)' }])
    // 회상 문항이 묻는 용어가 수업 흐름에 나오는 것은 자연스럽다 — 발문이 그 문장을 옮기지 않았으면 걸지 않는다
    const terms = { flow: { ...lessonV2.flow, intro: ['계급·계급의 크기·도수 용어를 익힌다'] } }
    expect(copyNotes(lesson1(terms, { q: '도수분포표에서 "20개 이상 30개 미만"처럼 변량을 나눈 구간을 무엇이라 하는가?', answer: '계급' }))).toEqual([])
    // 사용 자료 본문의 문장을 옮기면 답이 되는 발문 — 4단계 확정본(다시 검토)이나 대주제 공유 자료, 이 차시가 쓰는 자료만
    const body = '플라스틱은 석유에서 얻은 원료로 만든 고분자 물질이다. 가볍고 잘 깨지지 않는다.'
    const lookUp = { q: '자료 A에 따르면 플라스틱은 무엇에서 얻은 원료로 만드는가?', answer: '석유' }
    expect(copyNotes(lesson1({ materials_used: ['A'] }, lookUp), { stage4: { materials: [{ id: 'A', body }] } })).toEqual([{ kind: 'other', detail: '1차시 퀴즈 1: 정답이 본문에 그대로 있음(자료 A)' }])
    expect(copyNotes(lesson1({ materials_used: ['A'] }, lookUp), { shared_materials: [{ id: 'A', body }] })).toHaveLength(1)
    expect(copyNotes(lesson1({ materials_used: ['B'] }, lookUp), { stage4: { materials: [{ id: 'A', body }] } })).toEqual([])
    expect(copyNotes(lesson1({ materials_used: ['A'] }, lookUp))).toEqual([])   // 자료 본문을 모르면(보통의 3단계) 판단하지 않는다
    // 긴 기대 답(교사용 인정 기준)은 절 단위로 본다 — 앞 절의 낱말과 뒤 절의 정답이 우연히 겹친 것은 베끼기가 아니다
    const criteria = { worksheet: { ...lessonV2.worksheet, tasks: lessonV2.worksheet.tasks.map((t) => (t.tier === '도전' ? { ...t, expected: '부스 수와 전체 개수가 달라 개수가 늘어도 차지하는 비율은 그대로일 수 있음을, 개수와 상대도수가 다르게 말하는 품목을 예로 들어 설명하면 인정' } : t)) } }
    expect(copyNotes(lesson1(criteria, { q: '어떤 계급의 도수가 전체 도수에서 차지하는 비율을 무엇이라 하는가?', answer: '상대도수' }))).toEqual([])
    // 단원 평가 차시는 보지 않는다(퀴즈 0), 단답 판정은 L-06 힌트 검사와 같은 함수다
    expect(compatStatesAnswer).toBe(statesAnswer)
  })
  it('quizCopySource: 발문 내용어는 조사·묻는 말·흔한 말(자료·따르면)을 뗀 낱말, 수 정답은 다른 수의 일부가 아닌 낱개일 때만', () => {
    expect(questionStems('자료 D에 따르면 땅에 묻힌 플라스틱이 사라지기까지 약 몇 년이 걸리는가?')).toEqual(['묻힌', '플라스틱', '사라지기', '걸리'])
    const units = lessonSourceUnits({ flow: { intro: ['자료 A의 40번대 값 41·42·44·45·47을 줄기와 잎 그림으로 나타낸다'] } })
    expect(units).toEqual([['수업 흐름', '자료 A의 40번대 값 41·42·44·45·47을 줄기와 잎 그림으로 나타낸다']])
    expect(quizCopySource({ q: '자료 A의 40번대 값을 줄기와 잎 그림으로 나타낼 때 잎의 개수는?', answer: '1' }, units)).toBeNull()
    expect(quizCopySource({ q: '자료 A의 40번대 값을 줄기와 잎 그림으로 나타낼 때 가장 작은 값은?', answer: '41' }, units)).toBe('수업 흐름')
  })
  it('stage 4: size conventions and raw-data leakage hints', () => {
    const big = { materials: [{ ...materials[0], table: { columns: ['a'], rows: Array.from({ length: 30 }, (_, i) => [i]) } }] }
    expect(staticIssues(4, big, { standards, prior: {} }).some((i) => i.detail.includes('25행'))).toBe(true)
    const pub = { materials: [{ ...materials[0], source: { kind: '공개', attribution: '통계청', ai_assisted: true } }] }
    expect(staticIssues(4, pub, { standards, prior: {} }).some((i) => i.kind === 'source')).toBe(true)
  })
  it('stage 4: 제목에 자작·가상 같은 출처 표기가 남아 있으면 자문(kind other)만 남긴다 — 반려하지 않는다(대표 2026-09-26)', () => {
    const marked = { materials: [{ ...materials[0], title: '학생 설문 결과 (학생회 조사, 가상)' }] }
    const issues = staticIssues(4, marked, { standards, prior: {} })
    expect(issues).toEqual([{ kind: 'other', detail: '자료 A: 제목에 출처 표기("학생 설문 결과 (학생회 조사, 가상)")가 남아 있음 — 출처는 source 필드에만' }])
    expect(staticIssues(4, { materials }, { standards, prior: {} })).toEqual([])
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
  it('stage 5: 척도는 점수로 읽는다 — 만점부터 적은(내림차순) 채점표도 0점 서술을 찾고, 풀어 쓴 무응답·시도("쓰지 않았거나 …썼지만")는 인정한다(2026-09-25 영어 세트)', () => {
    const prior = { stage4: { materials }, stage3: { lessons: [] } }
    const zeroNotes = (a: unknown) => staticIssues(5, a, { standards, prior }).filter((i) => i.detail.includes('0점 서술'))
    const desc = structuredClone(assessmentV2)
    for (const it of desc.items) for (const c of it.rubric.criteria) {
      c.scale = [...c.scale].reverse().map((s) => (s.points === 0 ? { ...s, descriptor: '답을 쓰지 않았거나, 영어 문장을 썼지만 자료 F의 사실을 하나도 담지 않음' } : s))
      expect(c.scale[0].points).toBe(c.max)   // index 0 = 만점 서술(저장된 영어 세트와 같은 순서)
    }
    expect(zeroNotes(desc)).toEqual([])
    // 무응답만 있고 시도 구분이 없는 0점 서술은 여전히 잡는다(순서와 무관)
    const noAttempt = structuredClone(desc); noAttempt.items[1].rubric.criteria[2].scale.at(-1)!.descriptor = '답을 쓰지 않음(빈 답안)'
    expect(zeroNotes(noAttempt).map((i) => i.detail)).toEqual([`문항 2 ${noAttempt.items[1].rubric.criteria[2].name}: 0점 서술에 무응답·시도 구분이 없음`])
    const neither = structuredClone(desc); neither.items[0].rubric.criteria[0].scale.at(-1)!.descriptor = '자료의 사실을 하나도 담지 않음'
    expect(zeroNotes(neither)).toHaveLength(1)
  })
  it('stage 5: 과제 상황의 인물이 대주제·자료에 없으면 자문(other) — 학교 안 사람은 늘 허용(2026-09-25 영어 세트 "교환학생")', () => {
    const prior = { stage4: { materials: [{ ...materials[0], title: '축제 부스 일회용컵 개수 (학생회 조사)', body: '부스를 찾은 관람객 수와 컵 개수' }] }, stage3: { lessons: [] } }
    const theme = { title: '학교 축제, 일회용품을 줄이자' }
    const actorNotes = (situation: { role: string; audience: string }) => {
      const a = structuredClone(assessmentV2); Object.assign(a.items[1].situation!, situation)
      return staticIssues(5, a, { standards, prior, theme }).filter((i) => i.detail.includes('상황의 인물'))
    }
    expect(actorNotes({ role: '학생회 환경부원', audience: '우리 학교 학생과 교환학생' })).toEqual([
      { kind: 'other', detail: '문항 2(논술형): 상황의 인물이 자료·대주제에 없음(교환학생) — role·audience는 대주제·자료에 나오는 사람만 쓴다' },
    ])
    expect(actorNotes({ role: '학생회 임원', audience: '부스를 찾는 학생, 교사와 학부모' })).toEqual([])
    expect(actorNotes({ role: '동아리 부원', audience: '축제 관람객들에게' })).toEqual([])   // 자료에 관람객이 있다
    expect(actorNotes({ role: '학생', audience: '지역 주민과 외국인 관광객' }).map((i) => i.detail)).toEqual(['문항 2(논술형): 상황의 인물이 자료·대주제에 없음(주민, 외국인, 관광객) — role·audience는 대주제·자료에 나오는 사람만 쓴다'])
    // 대주제 소개(0단계)에 나오는 사람도 허용
    const withIntro = { ...prior, stage0: { intro: '축제에는 교환학생도 부스를 운영한다.', subject_ideas: [] } }
    const a = structuredClone(assessmentV2); a.items[1].situation!.audience = '교환학생'
    expect(staticIssues(5, a, { standards, prior: withIntro, theme }).filter((i) => i.detail.includes('상황의 인물'))).toEqual([])
    // 문맥(대주제·자료)이 하나도 없으면 검사하지 않는다
    expect(inventedActors(['교환학생'], '')).toEqual([])
    expect(inventedActors(['중학생 어린이'], '축제')).toEqual(['어린이'])
  })
  it('stage 5: criterion names must differ across the two items (the 단원 평가 차시 notice splits them by name)', () => {
    const prior = { stage4: { materials }, stage3: { lessons: [] } }
    const dup = structuredClone(assessmentV2); dup.items[0].rubric.criteria[0].name = dup.items[1].rubric.criteria[0].name
    expect(staticIssues(5, dup, { standards, prior }).filter((i) => i.detail.includes('겹침')).map((i) => i.kind)).toEqual(['rubric'])
    expect(staticIssues(5, assessmentV2, { standards, prior }).filter((i) => i.detail.includes('겹침'))).toEqual([])
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
  // 오너 관찰(2026-09-26): 영어 세트가 이 과목과 무관한 대주제 공유 수학 표(A~D)를 차시 materials_used에 그대로 옮겨 적었다.
  describe('stage 3/5: a shared material a lesson cites but no item/worksheet actually uses (advisory, other)', () => {
    const one = [standards[0]]
    const design = (lessons: unknown[]) => ({ unit_plan: { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }, lessons })
    const teaching = (no: number, materials_used: string[]) => ({ ...lessonV2, no, materials_used })
    const shareIssues = (o: unknown, ctx: Record<string, unknown> = {}) => staticIssues(3, o, { standards: one, prior: ctx, sharedMaterialIds: ['A', 'B', 'D'] }).filter((i) => i.detail.includes('공유 자료'))

    it('stage 3: skipped when stage 5 items are not known yet (the common case while designing lessons)', () => {
      const lessons = [1, 2, 3].map((no) => teaching(no, ['A'])).concat(assessmentSession(4))
      expect(shareIssues(design(lessons))).toEqual([])
    })
    it('stage 3: skipped without sharedMaterialIds even if a later stage5 is known', () => {
      const lessons = [1, 2, 3].map((no) => teaching(no, ['A'])).concat(assessmentSession(4))
      const issues = staticIssues(3, design(lessons), { standards: one, prior: { stage5: { items: [{ materials_used: ['F'] }] } } }).filter((i) => i.detail.includes('공유 자료'))
      expect(issues).toEqual([])
    })
    it('stage 3: flags a teaching lesson citing a shared id that stage5 items never use and the worksheet/quiz/script never mention', () => {
      const lessons = [teaching(1, ['D']), teaching(2, ['B']), teaching(3, ['B']), assessmentSession(4)]
      const prior = { stage5: { items: [{ materials_used: ['B'] }, { materials_used: ['B'] }] } }
      expect(shareIssues(design(lessons), prior)).toEqual([{ kind: 'other', detail: '1차시가 문항·활동지가 쓰지 않는 공유 자료 D를 가리킴' }])
    })
    it('stage 3: does not flag the 단원 평가 차시 itself, ids the items do use, or ids only the lesson worksheet/quiz/script mentions by name', () => {
      const mentioning = { ...teaching(1, ['D']), worksheet: { ...lessonV2.worksheet, tasks: [{ ...lessonV2.worksheet.tasks[0], prompt: '자료 D의 항목을 하나 고르시오' }] } }
      const lessons = [mentioning, teaching(2, ['B']), teaching(3, ['B']), { ...assessmentSession(4), materials_used: ['A', 'B', 'D'] }]
      const prior = { stage5: { items: [{ materials_used: ['B'] }, { materials_used: ['B'] }] } }
      expect(shareIssues(design(lessons), prior)).toEqual([])
    })
    it('stage 5: flags using ctx.prior.stage3 lessons and this output\'s own items (실제 검토 시점 — 5단계에서 항상 알 수 있다)', () => {
      const lessons = [teaching(1, ['D']), teaching(2, ['B']), teaching(3, ['B']), assessmentSession(4)]
      const prior = { stage4: { materials }, stage3: { lessons } }
      const a = structuredClone(assessmentV2); a.items[0].materials_used = ['B']; a.items[1].materials_used = ['B']
      const issues = staticIssues(5, a, { standards, prior, sharedMaterialIds: ['A', 'B', 'D'] }).filter((i) => i.detail.includes('공유 자료'))
      expect(issues).toEqual([{ kind: 'other', detail: '1차시가 문항·활동지가 쓰지 않는 공유 자료 D를 가리킴' }])
    })
    it('과학 fixture 수치(B/D/E, items도 B·D·E를 쓴다)에서는 자문이 뜨지 않는다 — mock fixture 는 note-free 여야 한다', () => {
      const lessons = [teaching(1, ['B']), teaching(2, ['D']), teaching(3, ['D', 'E']), assessmentSession(4)]
      const a = structuredClone(assessmentV2); a.items[0].materials_used = ['D', 'E']; a.items[1].materials_used = ['B', 'D']
      const issues = staticIssues(5, a, { standards, prior: { stage4: { materials }, stage3: { lessons } }, sharedMaterialIds: ['B', 'D', 'E'] }).filter((i) => i.detail.includes('공유 자료'))
      expect(issues).toEqual([])
    })
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
