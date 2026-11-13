// tests/quiz-roles.test.ts
// 대표 2026-11-13(설계 docs/superpowers/specs/2026-11-13-quiz-roles-design.md): 차시 마무리 퀴즈의 성격 —
// "알아야 할 것을 아는가(1번 핵심 지식) · 과목답게 해 볼 수 있는가(2번) · 단원 평가에서 쓸 힘이 한 칸 쌓였는가(3번 디딤돌)".
// 영어 퀴즈가 한국어로 까닭을 묻고(3번 모두), 쓰이지 않는 용어(planning)를 외우게 하던 것을 고친다. 수준 기준은 『성취기준에서 문항까지』 앞 장.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuizItem } from '@/lib/studio/schemas'
import { rulesFor, LESSON_RULES, SUBJECT_RULES } from '@/lib/studio/prompts/rules/index'
import {
  staticIssues, quizLevelOrderOk, answerHasHangul, answerLacksNumber, newSituationCue,
  QUIZ_ROLE_ORDER_NOTE, QUIZ_CRITERIA_REF_MISSING, QUIZ_PARTIAL_NOTE_MISSING, QUIZ_NEW_SITUATION, QUIZ_ENGLISH_ANSWER, QUIZ_MATH_NUMBER, quizCriteriaRefUnknown,
} from '@/lib/studio/checks'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { expandFields } from '@/lib/studio/editable-fields'
import { buildQuizJudgePrompt, QUIZ_JUDGE_RULES } from '@/lib/classroom/quiz-judge'
import { matchKind, followsQuizRoles } from '@/lib/classroom/quiz'
import { COMMON_RULES } from '@/lib/studio/prompts/rules/index'
import { TeacherBook } from '@/components/book/TeacherBook'
import { buildBookPlan } from '@/lib/book/plan'
import { snapshotFor } from './fixtures/book'
import { LessonCards } from '@/components/studio/parts/LessonCards'
import { app } from '@/content/site'
import { lessonV2, assessmentSession } from './studio-schemas.test'

const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
const row = (id: string) => spec.split('\n').find((line) => line.startsWith(`| ${id} |`))!
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')

describe('규칙 문장 — 퀴즈 세 자리의 역할', () => {
  const rule = (id: string) => LESSON_RULES.find((r) => r.id === id)!
  it('L-10: 성취기준의 기능어를 해 보는 작은 수행, 1번 핵심 지식·2번 과목답게 해 보기·3번 단원 평가 디딤돌, 옛 "회상·관계·추론" 틀은 없다', () => {
    const t = rule('L-10').text
    for (const s of ['성취기준의 기능어', '문항이 묻는 것과 채점이 보는 것이 같아야', '1번 핵심 지식(D~E)', '2번 과목답게 해 보기(C)', '3번 단원 평가 디딤돌(B)',
      'criteria_focus', 'criteria_ref', '쓰이지 않는 이름을 외워 대는 문항 금지', 'level_ref']) expect(t, s).toContain(s)
    expect(t).not.toMatch(/관계·추론|새 사례 적용|회상\(D~E/)
    expect(row('L-10')).toBe(`| L-10 | ${t} | P+S | [WP11-3][WP11-9][대표] |`)
  })
  it('L-09: 답은 낱말·수치·짧은 구·한 문장(3번은 한 문장)', () => {
    expect(rule('L-09').text).toContain('낱말·수치·짧은 구·한 문장을 직접 쓰는 문항, 선택지 없음')
  })
  it('L-13: 2·3번은 활동지가 쓰게 한 문장·풀이를 다시 묻지 않는다(옛 "관계·추론·까닭 있는 선택" 문구는 없다)', () => {
    const t = rule('L-13').text
    expect(t).toContain('같은 기능을 다른 문장·다른 수치로'); expect(t).toContain('1번 핵심 지식이 가르친 낱말·표현을 묻는 것은 예외')
    expect(t).not.toContain('까닭 있는 선택')
    expect(row('L-13')).toBe(`| L-13 | ${t} | P+S | [v2-1001] |`)
  })
  it('L-24(자료가 단서를 주고 판단은 학생이)·L-25(해설은 학생이 읽는 글, 2·3번은 부분 답의 모습 — 틀린 값은 부분이 아니다): PS/대표, 스펙 행과 같은 문장, 모든 과목 프롬프트에', () => {
    const l24 = rule('L-24'), l25 = rule('L-25')
    for (const s of ['배운 것만', '자료에 그대로 적혀 있어도 안 되고', '단서가 없어도 안 된다', '새 상황은 묻지 않는다']) expect(l24.text, s).toContain(s)
    for (const s of ['학생이 제출 뒤에 읽는 글', '평가자의 말은 쓰지 않는다', 'partial_note', '부분 답이 되는 경우', '값·결론이 틀린 답은 부분이 아니라 틀림이다']) expect(l25.text, s).toContain(s)
    expect(l25.text).not.toContain('무엇을 보는지')
    for (const r of [l24, l25]) { expect(r.nature).toBe('PS'); expect(r.tags).toEqual(['대표']); expect(row(r.id)).toBe(`| ${r.id} | ${r.text} | P+S | [대표] |`) }
    for (const subject of ['국어', '수학', '과학', '영어', '사회']) { expect(rulesFor(subject)).toMatch(/^L-24 퀴즈는 그 차시의/m); expect(rulesFor(subject)).toMatch(/^L-25 퀴즈 해설/m) }
    expect(LESSON_RULES).toHaveLength(25)
  })
  it('과목 규칙: 영어는 모두 영어로 답, 수학은 수·식, 국어는 찾은 말·고쳐 쓴 문장, 사회는 자료의 수치·근거 문장, 과학은 개념어·값·개념을 넣은 설명', () => {
    const find = (subject: string, id: string) => SUBJECT_RULES[subject].find((r) => r.id === id)!
    expect(find('영어', 'S-영-10').text).toMatch(/세 문항 모두 영어로 답한다/); expect(find('영어', 'S-영-10').text).toContain('한국어로 까닭을 설명하게 하는 문항은 내지 않는다')
    expect(find('수학', 'S-수-08').text).toContain('식이나 값을 넣어'); expect(find('수학', 'S-수-08').text).toContain('수·식 없이 말로만 하는 설명')
    expect(find('국어', 'S-국-07').text).toContain('고쳐 쓴 문장')
    expect(find('사회', 'S-사-08').text).toContain('자료 이름과 수치를 넣은 근거 한 문장')
    expect(find('과학', 'S-과-09').text).toContain('배운 개념어를 넣어 현상을 한 문장으로 설명')
    for (const [subject, id] of [['영어', 'S-영-10'], ['수학', 'S-수-08'], ['국어', 'S-국-07'], ['사회', 'S-사-08'], ['과학', 'S-과-09']] as const) {
      const r = find(subject, id)
      expect(r.nature, id).toBe('PS'); expect(r.tags, id).toEqual(['대표'])
      expect(row(id), id).toBe(`| ${id} | ${r.text} | [대표] |`)
      expect(rulesFor(subject)).toContain(`${id} `)
    }
    expect(rulesFor('수학')).not.toMatch(/^S-영-10 /m)   // L-10 문장이 과목 규칙 번호를 가리키므로 줄 첫머리로 본다
  })
})

describe('QuizItem 스키마 — criteria_ref·partial_note 는 선택(옛 판에는 없다)', () => {
  const base = { q: '자료 G의 긴 문구를 초등학생 방문객용 안내판에 맞게 짧은 영어 문구로 고쳐 쓰시오.', type: 'short', choices: null, answer: 'Bring your cup! / Please bring your cup.', explanation: '독자에 맞춰 표현을 고르는지 본다.' }
  it('없어도 되고, 있으면 한 줄', () => {
    expect(QuizItem.safeParse(base).success).toBe(true)
    expect(QuizItem.safeParse({ ...base, criteria_ref: '독자에 맞는 표현', partial_note: '뜻은 맞지만 문장이 길어 안내판에 맞지 않는 답' }).success).toBe(true)
    expect(QuizItem.safeParse({ ...base, criteria_ref: '' }).success).toBe(false)
    expect(QuizItem.safeParse({ ...base, partial_note: 'x' }).success).toBe(false)
    expect(QuizItem.safeParse({ ...base, partial_note: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('[TS] 순수 판정', () => {
  it('quizLevelOrderOk: 자리 순서대로 D~E·C·B 일 때만 참', () => {
    expect(quizLevelOrderOk([{ level_ref: 'D~E' }, { level_ref: 'C' }, { level_ref: 'B' }])).toBe(true)
    expect(quizLevelOrderOk([{ level_ref: 'C' }, { level_ref: 'D~E' }, { level_ref: 'B' }])).toBe(false)
    expect(quizLevelOrderOk([{ level_ref: 'D~E' }, { level_ref: 'C' }, {}])).toBe(false)
  })
  it('answerHasHangul: 영어 퀴즈 정답에 한글이 있으면 참', () => {
    expect(answerHasHangul('부스 수가 달라서 / 비교 조건이 같지 않아서')).toBe(true)
    expect(answerHasHangul('Bring your own cup. / Please bring a cup.')).toBe(false)
    expect(answerHasHangul('64 / 64 students')).toBe(false)
  })
  it('answerLacksNumber: 수학 2·3번 정답에 수·식이 하나도 없으면 참', () => {
    expect(answerLacksNumber('부등식, 좌석 수가 범위로 주어져서')).toBe(true)
    expect(answerLacksNumber('x ≥ 6이므로 좌석이 6개 이상 필요하다')).toBe(false)
    expect(answerLacksNumber('3x + 2 = 20')).toBe(false)
    expect(answerLacksNumber('해가 서로 같다 / 같은 범위이다')).toBe(true)
    // 독립 검토 2026-11-13: 받아들일 표기 가운데 하나라도 수·식이 없으면 참(수 있는 표기 하나가 말뿐인 표기를 가리지 않게)
    expect(answerLacksNumber('0.3 / 비율이 더 크다')).toBe(true)
    expect(answerLacksNumber('n − 2 / n-2')).toBe(false)
  })
  it('newSituationCue: 해설이 "새 상황·다루지 않은"을 말하면 그 말을 돌려준다', () => {
    expect(newSituationCue('수업에서 다루지 않은 새 상황에 정보 윤리를 적용해 본다.')).toBeTruthy()
    expect(newSituationCue('매체와 상황에 따라 전략이 달라진다는 관계를 새 사례에 적용한다.')).toBeTruthy()
    expect(newSituationCue('자료 E의 수치를 영어 문장으로 설명하는지 본다.')).toBeNull()
    // 독립 검토 2026-11-13: 자료를 두고 하는 말("안내문이 다루지 않은 정보")은 걸리지 않고, "배우지 않은"은 걸린다
    expect(newSituationCue('안내문이 다루지 않은 정보를 찾아 보탠다.')).toBeNull()
    expect(newSituationCue('배우지 않은 표현으로 바꾸어 쓴다.')).toBeTruthy()
  })
})

// 새 규칙을 지키는 퀴즈 세 문항(수학 세트를 본뜸) — lessonV2 의 나머지 칸은 그대로
const good = [
  { q: '자료 A에서 좌석이 가장 많은 구역의 좌석 수를 쓰시오.', type: 'short', choices: null, answer: '24 / 24석', explanation: '표에서 필요한 값을 읽는지 본다.', level_ref: 'D~E', competency: '자료 읽기' },
  { q: '한 모둠에 4명씩 x모둠이 앉아 좌석 24개를 넘지 않게 하려 한다. 이 상황을 부등식으로 쓰시오.', type: 'short', choices: null, answer: '4x ≤ 24 / 4x<=24', explanation: '상황을 부등식으로 나타내는지 본다.', level_ref: 'C', competency: '과정·기능', partial_note: '식은 세웠으나 부등호 방향이 반대인 답' },
  { q: '위 부등식의 해가 이 상황에서 무엇을 뜻하는지 해를 넣어 한 문장으로 쓰시오.', type: 'short', choices: null, answer: 'x ≤ 6이므로 모둠은 6개까지 앉을 수 있다 / 6모둠 이하만 앉을 수 있다', explanation: '해를 상황에 맞게 해석하는지 본다.', level_ref: 'B', competency: '근거 들어 설명하기', condition: "해를 넣어 '~이므로 ~할 수 있다' 꼴의 한 문장으로 쓰시오.", criteria_ref: '해의 해석', partial_note: '해는 맞지만 상황에서의 뜻을 말하지 않은 답', keywords: ['6'] },
]
const design = (quiz: Record<string, unknown>[], focus: string[] | null = ['식 세우기', '해의 해석']) => {
  const lessons = [{ ...lessonV2, no: 1, formative_check: { quiz } }, ...[2, 3, 4, 5].map((no) => ({ ...lessonV2, no })), assessmentSession(6)]
  const unit_plan = {
    set_title: '도서관 좌석', set_key_question: '기준은 무엇인가?',
    lesson_map: lessons.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic, ...(l.no === 1 && focus ? { criteria_focus: focus } : {}) })),
    assessment_plan: { formative: '교수 차시마다 퀴즈 3문항', summative_placement: [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } },
  }
  return { unit_plan, lessons }
}
const omit = <T extends Record<string, unknown>>(o: T, ...keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))
const ctx = (subject: string) => ({ standards: [{ code: '[9수04-02]', text: 'x' }], prior: {}, subject })
const lesson1 = (quiz: Record<string, unknown>[], subject = '수학', focus?: string[] | null) =>
  staticIssues(3, design(quiz, focus), ctx(subject)).filter((i) => i.detail.startsWith('1차시 퀴즈') || i.detail.startsWith('1차시 ' + QUIZ_ROLE_ORDER_NOTE.slice(0, 4))).map((i) => i.detail)

describe('[TS] 참고 메모(kind other, 막지 않음) — 1차시 퀴즈', () => {
  it('새 규칙을 지킨 세 문항에는 역할 관련 메모가 없다', () => {
    const notes = lesson1(good).filter((d) => [QUIZ_ROLE_ORDER_NOTE, QUIZ_CRITERIA_REF_MISSING, QUIZ_PARTIAL_NOTE_MISSING, QUIZ_NEW_SITUATION, QUIZ_MATH_NUMBER].some((n) => d.includes(n.slice(0, 12))))
    expect(notes).toEqual([])
  })
  it('수준이 자리 순서와 다르면 메모', () => {
    const swapped = [{ ...good[1] }, { ...good[0] }, { ...good[2] }]
    expect(staticIssues(3, design(swapped), ctx('수학')).map((i) => i.detail)).toContain(`1차시 ${QUIZ_ROLE_ORDER_NOTE}`)
  })
  it('3번에 criteria_ref 가 없으면 메모, 그 차시 criteria_focus 에 없는 이름이면 그 이름과 함께 메모(criteria_focus 가 없으면 이름 대조는 건너뛴다)', () => {
    const noRef = omit(good[2], 'criteria_ref')
    expect(lesson1([good[0], good[1], noRef])).toContain(`1차시 퀴즈 3: ${QUIZ_CRITERIA_REF_MISSING}`)
    expect(lesson1([good[0], good[1], { ...good[2], criteria_ref: '검산' }])).toContain(`1차시 퀴즈 3: ${quizCriteriaRefUnknown('검산')}`)
    expect(lesson1([good[0], good[1], { ...good[2], criteria_ref: '검산' }], '수학', null).filter((d) => d.includes('검산'))).toEqual([])
  })
  it('2·3번에 partial_note 가 없으면 메모(1번은 보지 않는다)', () => {
    const noPartial = omit(good[1], 'partial_note')
    const notes = lesson1([good[0], noPartial, good[2]])
    expect(notes).toContain(`1차시 퀴즈 2: ${QUIZ_PARTIAL_NOTE_MISSING}`)
    expect(notes.filter((d) => d.startsWith('1차시 퀴즈 1') && d.includes(QUIZ_PARTIAL_NOTE_MISSING))).toEqual([])
  })
  it('해설이 "새 상황·다루지 않은"을 말하면 L-24 메모', () => {
    const notes = lesson1([good[0], good[1], { ...good[2], explanation: '수업에서 다루지 않은 새 상황에 적용해 본다.' }])
    expect(notes.some((d) => d.startsWith('1차시 퀴즈 3') && d.includes(QUIZ_NEW_SITUATION))).toBe(true)
  })
  it('수학 세트: 2·3번 정답에 수·식이 없으면 S-수-08 메모; 다른 과목에서는 이 메모가 없다', () => {
    const wordy = { ...good[2], answer: '해가 서로 같다 / 같은 범위이다', keywords: ['같다'] }
    expect(lesson1([good[0], good[1], wordy])).toContain(`1차시 퀴즈 3: ${QUIZ_MATH_NUMBER}`)
    expect(lesson1([good[0], good[1], wordy], '국어').filter((d) => d.includes(QUIZ_MATH_NUMBER))).toEqual([])
  })
  it('영어 세트: 정답에 한글이 있으면 S-영-10 메모(세 문항 모두 본다); 다른 과목에서는 없다', () => {
    const korean = { ...good[2], answer: '부스 수가 달라서 / 비교 조건이 같지 않아서' }
    expect(lesson1([good[0], good[1], korean], '영어')).toContain(`1차시 퀴즈 3: ${QUIZ_ENGLISH_ANSWER}`)
    expect(lesson1([good[0], good[1], korean], '사회').filter((d) => d.includes(QUIZ_ENGLISH_ANSWER))).toEqual([])
  })
  it('메모는 모두 kind other — 막지 않는다', () => {
    const bare = omit(good[2], 'criteria_ref', 'partial_note')
    const issues = staticIssues(3, design([good[0], good[1], bare]), ctx('수학')).filter((i) => i.detail.startsWith('1차시 퀴즈 3'))
    expect(issues.length).toBeGreaterThan(0)
    for (const i of issues) expect(i.kind).toBe('other')
  })
})

describe('3단계 프롬프트 — 자리별 역할·과목 규칙·L-24·L-25', () => {
  const pctx = { theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['영어'] }, subject: '영어', standards: [{ code: '[9영02-03]', text: '친숙한 주제에 관해 사실적 정보를 설명한다.' }], prior: {} } as never
  it('과제: 1번 핵심 지식·2번 과목답게 해 보기·3번 단원 평가 디딤돌, criteria_ref·partial_note, 새 상황 금지', () => {
    const task = buildPrompt(3, pctx).user
    for (const s of ['1번 "D~E" 핵심 지식', '2번 "C" 과목답게 해 보기', '3번 "B" 단원 평가 디딤돌', 'criteria_ref', 'partial_note', '성취기준의 기능어', '수업에서 다루지 않은 새 상황은 쓰지 않는다(L-24)']) expect(task, s).toContain(s)
    expect(task).not.toContain('수업에서 다루지 않은 새 사례에 적용')
    expect(task).not.toContain('관계·추론(두 개념의 관계')
  })
  it('검토: 역할과 실제 문항이 맞는지(L-10), 단서 없는 짐작·새 상황(L-24), partial_note·해설(L-25)', () => {
    const review = buildReviewPrompt(3, pctx, {}).user
    for (const s of ['1번 핵심 지식(D~E)·2번 과목답게 해 보기(C)·3번 단원 평가 디딤돌(B)', 'level(L-10)', 'quiz(L-24)', 'quiz(L-25)', '같은 기능을 다른 문장·다른 수치로']) expect(review, s).toContain(s)
    expect(review).not.toContain('까닭 있는 선택')
  })
  it('영어 세트의 규칙 블록에 S-영-10 이 들어간다', () => {
    expect(buildPrompt(3, pctx).system).toMatch(/^S-영-10 영어 퀴즈는 세 문항 모두 영어로 답한다/m)
  })
})

describe('문장 고치기 — 3번의 이어지는 채점 요소(criteria_ref)와 부분 답(partial_note) 칸', () => {
  it('빈 칸으로도 나온다(선택 칸) — 메모가 적으라고 한 것을 그 자리에서 적을 수 있게', () => {
    const fields = expandFields(3, design(lessonV2.formative_check.quiz))
    const ref = fields.filter((f) => f.pattern === 'lessons[].formative_check.quiz[].criteria_ref' && f.path[1] === 0)
    const partial = fields.filter((f) => f.pattern === 'lessons[].formative_check.quiz[].partial_note' && f.path[1] === 0)
    expect(ref).toHaveLength(3); expect(partial).toHaveLength(3)
    expect(ref[0].optional).toBe(true)
    const labels = app.studio.wizard.fieldEditor.labels
    expect(labels['lessons[].formative_check.quiz[].criteria_ref']([0, 2], {})).toBe('퀴즈 3 이어지는 채점 요소')
    expect(labels['lessons[].formative_check.quiz[].partial_note']([0, 1], {})).toBe('퀴즈 2 부분 답이 되는 경우')
  })
})

describe('AI 뜻 판정 — 문항의 역할과 부분 답의 모습을 함께 보낸다', () => {
  const input = { subject: '영어', level: '중', grade: 1, q: '긴 문구를 짧은 영어 문구로 고쳐 쓰시오.', answer: 'Bring your cup!', explanation: '독자에 맞춰 표현을 고르는지 본다.', response: 'Please bring cup' }
  it('partial_note 가 있으면 "부분 답이 되는 경우:" 줄, criteria_ref 가 있으면 "이어지는 채점 요소:" 줄, quizNo 가 있으면 역할 줄', () => {
    const p = buildQuizJudgePrompt({ ...input, quizNo: 3, criteriaRef: '독자에 맞는 표현', partialNote: '뜻은 맞지만 문장이 긴 답' }).user
    expect(p).toContain('부분 답이 되는 경우: 뜻은 맞지만 문장이 긴 답')
    expect(p).toContain('이어지는 채점 요소: 독자에 맞는 표현')
    expect(p).toContain('문항의 역할: 단원 평가 디딤돌')
  })
  it('없으면 그 줄들이 빠진다(옛 판 그대로)', () => {
    const p = buildQuizJudgePrompt(input).user
    expect(p).not.toContain('부분 답이 되는 경우'); expect(p).not.toContain('이어지는 채점 요소'); expect(p).not.toContain('문항의 역할')
  })
  it('규칙: 주어진 세 가지도 기준에 든다, 부분 답의 모습이면 "부분"이되 값·결론이 다르면 "틀림"(부분 = O 이므로 틀린 값이 O 가 되면 안 된다)', () => {
    expect(QUIZ_JUDGE_RULES).toContain('주어졌다면 문항의 역할·이어지는 채점 요소·부분 답이 되는 경우뿐이다')
    expect(QUIZ_JUDGE_RULES).toContain('내용이 정답과 같은 뜻이면 "맞음"')
    expect(QUIZ_JUDGE_RULES).toContain('값·결론이 정답과 다르면 그 모습이어도 "틀림"')
  })
})

describe('화면 — 수준 표시가 역할 이름으로', () => {
  it('quizLevel: 새 규칙 판(roles=true)은 D~E 핵심 지식 · C 해 보기 · B 디딤돌, 옛 판은 옛 이름 그대로(옛 문항에 새 이름을 붙이지 않는다)', () => {
    const c = app.packageView.lessons
    expect(c.quizLevel(1, 'D~E', true)).toBe('1번 D~E(핵심 지식)'); expect(c.quizLevel(2, 'C', true)).toBe('2번 C(해 보기)'); expect(c.quizLevel(3, 'B', true)).toBe('3번 B(디딤돌)')
    expect(c.quizLevel(3, 'B')).toBe('3번 B(관계·추론)'); expect(c.quizLevel(1, 'D~E', false)).toBe('1번 D~E(회상)')
    expect(c.quizLevel(1, undefined, true)).toBe('1번 수준 없음')
    expect(app.book.lesson.quizLevel('B', true)).toBe('수준 B(디딤돌)'); expect(app.book.lesson.quizLevel('B')).toBe('수준 B')
  })
  it('제작소 차시 카드(정답 보기): 3번 아래 이어지는 채점 요소와 부분 답이 보인다', () => {
    const lessons = [{ ...lessonV2, formative_check: { quiz: good } }]
    const t = text(renderToStaticMarkup(createElement(LessonCards, { lessons, showAnswers: true, open: true })))
    const c = app.packageView.lessons.quiz
    expect(t).toContain(`${c.criteriaRefLabel}: 해의 해석`)
    expect(t).toContain(`${c.partialLabel}: 해는 맞지만 상황에서의 뜻을 말하지 않은 답`)
  })
})

describe('독립 검토 2026-11-13 반영', () => {
  it('followsQuizRoles: 3문항이고 3번에 이어지는 채점 요소가 (공백 아닌 글로) 적힌 판만', () => {
    expect(followsQuizRoles(good)).toBe(true)
    expect(followsQuizRoles([good[0], good[1], { ...good[2], criteria_ref: '  ' }])).toBe(false)
    expect(followsQuizRoles([good[0], good[1], omit(good[2], 'criteria_ref')])).toBe(false)
    expect(followsQuizRoles([good[2]])).toBe(false)
  })
  it('부분 답 칸이 있는 문항(문장 답)은 핵심어만 들어 있다고 O 가 되지 않는다 — 글자 비교로 같으면 그대로 O', () => {
    const item = { type: 'short' as const, choices: null, answer: 'Please bring your reusable cup. / Bring your reusable cup, please.', keywords: ['reusable'] }
    expect(matchKind(item, 'reusable cup')).toBe('keyword')                                   // 옛 판(부분 답 칸 없음): 지금까지처럼
    expect(matchKind({ ...item, partial_note: '부탁하는 말 없이 낱말만 쓴 답' }, 'reusable cup')).toBeNull()   // 새 판: AI 뜻 판정으로
    expect(matchKind({ ...item, partial_note: '부탁하는 말 없이 낱말만 쓴 답' }, 'please bring your reusable cup')).toBe('literal')
  })
  it('부분 답 칸이 있는 문장 답은 핵심어가 없어도 [TS] 핵심어 메모가 없다', () => {
    const sentence = { ...good[2], keywords: undefined }
    const notes = staticIssues(3, design([good[0], good[1], sentence]), ctx('수학')).filter((i) => i.detail.startsWith('1차시 퀴즈 3') && i.detail.includes('핵심어'))
    expect(notes).toEqual([])
  })
  it('남아 있던 옛 문구가 없다: L-15·L-18(회상 → 1번 핵심 지식), C-42(까닭·보완·적용), S-과-09(배운 규칙으로 예측), 3단계 과제', () => {
    const lesson = (id: string) => LESSON_RULES.find((r) => r.id === id)!.text
    expect(lesson('L-15')).toContain('1번 핵심 지식 = 지식, 2·3번 = 기능'); expect(lesson('L-15')).not.toContain('회상')
    expect(lesson('L-18')).toContain('퀴즈 1번(핵심 지식)으로 보낸다'); expect(lesson('L-18')).not.toContain('퀴즈 D~E 문항')
    const c42 = COMMON_RULES.find((r) => r.id === 'C-42')!.text
    expect(c42).toContain('배운 것을 직접 해 본 결과'); expect(c42).not.toContain('까닭·보완·적용')
    expect(SUBJECT_RULES['과학'].find((r) => r.id === 'S-과-09')!.text).toContain('배운 규칙으로 결과를 예측한다')
    for (const id of ['L-15', 'L-18']) expect(spec.split('\n').find((l) => l.startsWith(`| ${id} |`))).toContain(lesson(id))
    expect(spec.split('\n').find((l) => l.startsWith('| C-42 |'))).toContain(c42)
    const pctx = { theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['영어'] }, subject: '영어', standards: [{ code: '[9영02-03]', text: '친숙한 주제에 관해 사실적 정보를 설명한다.' }], prior: {} } as never
    const task = buildPrompt(3, pctx).user
    for (const old of ['꼴 회상은 퀴즈 D~E로', '회상 문항도 낱말을 묻되', '무엇을 보는지(성취기준의 어느 수행인지)']) expect(task, old).not.toContain(old)
    expect(task).toContain('학생이 제출 뒤에 읽는 글이라'); expect(task).toContain('값·결론이 틀린 답은 부분이 아니라 틀림이다')
    const review = buildReviewPrompt(3, pctx, {}).user
    expect(review).toContain('정답이 낱말·수치·짧은 구·한 문장이라'); expect(review).toContain('문장으로 답하는 2·3번은 keywords 없음이 정상')
  })
  it('학생용 교재·학생 판에는 이어지는 채점 요소·부분 답이 없고, 교사용 교재에는 있다(역할 이름도 새 규칙 판에서만)', () => {
    const snap = snapshotFor('수학')
    const lesson = snap.lessons.find((l) => l.formative_check.quiz.length === 3)!
    const quiz = lesson.formative_check.quiz as (typeof lesson.formative_check.quiz[number] & { criteria_ref?: string; partial_note?: string })[]
    quiz[2].criteria_ref = '해의 해석'; quiz[2].partial_note = '해는 맞지만 뜻을 말하지 않은 답'
    const student = buildBookPlan(snap, 'student'); const teacher = buildBookPlan(snap, 'teacher')
    expect(JSON.stringify(student)).not.toContain('해는 맞지만 뜻을 말하지 않은 답'); expect(JSON.stringify(student)).not.toContain('criteria_ref')
    const html = text(renderToStaticMarkup(createElement(TeacherBook, { plan: teacher, draft: false })))
    expect(html).toContain(`${app.book.lesson.quizCriteriaRef}: 해의 해석`); expect(html).toContain(`${app.book.lesson.quizPartial}: 해는 맞지만 뜻을 말하지 않은 답`)
    expect(html).toContain('수준 B(디딤돌)')
  })
  it('시연 fixture 의 부분 답 줄은 틀린 값을 말하지 않는다', () => {
    for (const suffix of ['', '-과학']) {
      const fx = JSON.parse(readFileSync(`data/studio-fixtures/stage3-generate${suffix}.json`, 'utf8'))
      const notes = fx.lessons.flatMap((l: { formative_check: { quiz: { partial_note?: string }[] } }) => l.formative_check.quiz.map((q) => q.partial_note).filter(Boolean)) as string[]
      expect(notes.length, suffix).toBe(10)
      for (const n of notes) expect(n, n).not.toMatch(/틀린|거꾸로|하나 더 센/)
    }
  })
})
