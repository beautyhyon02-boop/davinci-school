// tests/quiz-condition.test.ts
// 대표 2026-11-06(L-23): 정답이 낱말·숫자가 아니라 구·문장인 퀴즈에는 답 조건(condition) 한 줄 — 답의 꼴·담을 것·가짓수.
// "어떤 답을 써야 할지 생각은 많은데 정리해서 쓰기 애매한" 문항은 컴플레인 감. 조건은 학생 화면·문제지·교재에 문항 아래 "조건"으로 보인다.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuizItem } from '@/lib/studio/schemas'
import { staticIssues, quizNeedsCondition, QUIZ_CONDITION_MISSING } from '@/lib/studio/checks'
import { expandFields, applyFieldEdits, validateEdited } from '@/lib/studio/editable-fields'
import { buildQuizJudgePrompt, QUIZ_JUDGE_RULES } from '@/lib/classroom/quiz-judge'
import { LessonCards } from '@/components/studio/parts/LessonCards'
import { StudentBook } from '@/components/book/StudentBook'
import { TeacherBook } from '@/components/book/TeacherBook'
import { buildBookPlan } from '@/lib/book/plan'
import { app } from '@/content/site'
import { snapshotFor } from './fixtures/book'
import { lessonV2, assessmentSession } from './studio-schemas.test'

vi.mock('@/app/student/assignments/[id]/actions', () => ({ submitQuiz: vi.fn() }))
const { QuizForm } = await import('@/app/student/assignments/[id]/QuizForm')

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const COND = "독자가 글을 읽을 때 달라지는 점 한 가지를 '~할 수 있다'로 끝나는 한 구로 쓰시오."

describe('QuizItem 스키마 — condition(답 조건)은 선택(옛 판에는 없다), 있으면 2~120자', () => {
  const base = { q: '기호와 색을 함께 쓸 때 처음 온 독자가 얻는 이점을 쓰시오.', type: 'short', choices: null, answer: '한눈에 빨리 구분된다 / 다 읽지 않아도 된다', explanation: '해설입니다' }
  it('없어도 되고, 있으면 짧지 않은 한 줄', () => {
    expect(QuizItem.safeParse(base).success).toBe(true)
    expect(QuizItem.safeParse({ ...base, condition: COND }).success).toBe(true)
    // 하한은 2자(문장 고치기의 "한 글자 바꿔 보기" 시험·빈 칸 저장과 어긋나지 않게) — 조건의 알맹이는 [TS] 메모·AI 검토가 본다
    expect(QuizItem.safeParse({ ...base, condition: '' }).success).toBe(false)
    expect(QuizItem.safeParse({ ...base, condition: 'x' }).success).toBe(false)
    expect(QuizItem.safeParse({ ...base, condition: 'x'.repeat(121) }).success).toBe(false)
  })
})

describe('quizNeedsCondition — 답이 구·문장인 문항만(낱말·숫자 정답은 아님)', () => {
  const q = (question: string, answer: string) => ({ q: question, answer })
  it('서술어로 끝나는 정답, 넉 낱말 이상 정답, "짧은 구로·까닭·이유를" 발문은 조건이 필요하다', () => {
    expect(quizNeedsCondition(q('양변에 같은 음수를 곱할 때 부등호에 일어나는 변화를 쓰시오.', '방향이 바뀐다 / 부등호가 반대가 된다'))).toBe(true)
    expect(quizNeedsCondition(q('자료 F를 쓴 사람이 독자에게 바라는 행동을 영어로 쓰시오.', 'bring your own cup / use a reusable cup'))).toBe(true)
    expect(quizNeedsCondition(q('두 해의 합계만 비교하면 안 되는 까닭을 쓰시오.', '부스 수가 달라서'))).toBe(true)
    expect(quizNeedsCondition(q('발표 끝에 이 문장을 넣은 까닭을 짧은 구로 쓰시오.', '실천 요청 / 행동 촉구'))).toBe(true)
  })
  it('용어·숫자·식·짧은 명사구 정답은 조건이 필요 없다', () => {
    expect(quizNeedsCondition(q('도수의 총합에 대한 각 계급의 도수의 비율을 부르는 말을 쓰시오.', '상대도수'))).toBe(false)
    expect(quizNeedsCondition(q('글을 쓴 뒤 다시 다듬는 일을 가리키는 말을 쓰시오.', '고쳐쓰기 / 고쳐 쓰기'))).toBe(false)
    expect(quizNeedsCondition(q('30 이상 40 미만인 부스는 몇 곳인지 수로 쓰시오.', '6'))).toBe(false)
    expect(quizNeedsCondition(q('일차부등식 5x-4≤16의 해를 구하시오.', 'x ≤ 4 / x는 4 이하'))).toBe(false)
    expect(quizNeedsCondition(q('조사 대상은 누구인가?', '우리 학교 1학년 학생 / 1학년 학생'))).toBe(false)
    // "요"로 끝나는 명사, 용어를 묻는 발문 속 "까닭" — 조건이 필요 없는 낱말 정답
    expect(quizNeedsCondition(q('발표할 내용을 미리 간추려 순서대로 적어 둔 것을 무엇이라고 하는지 쓰시오.', '개요'))).toBe(false)
    expect(quizNeedsCondition(q('뒤에 주어와 동사를 두어 까닭을 나타내는 접속사를 영어로 쓰시오.', 'because'))).toBe(false)
    expect(quizNeedsCondition(q('내용 평가의 두 기준 가운데 무엇이 문제인지 쓰시오.', '타당성'))).toBe(false)
    // 독립 검토 2026-11-06: "다·인지"로 끝나는 짧은 명사, 식(영문자·숫자 섞임)은 구가 아니다
    expect(quizNeedsCondition(q('가장 넓은 바다의 이름을 쓰시오.', '태평양 / 바다'))).toBe(false)
    expect(quizNeedsCondition(q('자기 생각을 점검하는 사고를 가리키는 말을 쓰시오.', '메타인지'))).toBe(false)
    expect(quizNeedsCondition(q('기울기가 2이고 y절편이 1인 직선의 식을 쓰시오.', 'y = 2x + 1 / y=2x+1'))).toBe(false)
    expect(quizNeedsCondition(q('두 표현을 함께 쓸 때 독자에게 생기는 변화를 쓰시오.', '구분된다'))).toBe(true)
  })
})

// zod(LessonDesign)를 통과하는 설계 — 문장 고치기 시험이 validateEdited 로 형식을 본다
const design = (quiz: Record<string, unknown>[]) => {
  const lessons = [{ ...lessonV2, no: 1, formative_check: { quiz } }, ...[2, 3, 4, 5].map((no) => ({ ...lessonV2, no })), assessmentSession(6)]
  const unit_plan = {
    set_title: '자료의 정리와 해석', set_key_question: '자료는 무엇을 말하는가?', lesson_map: lessons.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic })),
    assessment_plan: { formative: '교수 차시마다 퀴즈 3문항', summative_placement: [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } },
  }
  return { unit_plan, lessons }
}

describe('[TS] 참고 메모 — 답 조건 없는 구 정답 퀴즈(L-23, 막지 않음)', () => {
  const ctx = { standards: [{ code: '[9수04-02]', text: 'x' }], prior: {} }
  const phrase = { q: '기호와 색을 함께 쓸 때 처음 온 독자가 얻는 이점을 짧은 구로 쓰시오.', type: 'short', choices: null, answer: '한눈에 빨리 구분된다 / 다 읽지 않아도 된다', explanation: '해설입니다', keywords: ['한눈'] }
  const notes = (quiz: Record<string, unknown>[]) => staticIssues(3, design(quiz), ctx).filter((i) => i.detail.includes('답 조건'))
  it('구 정답인데 condition 이 없으면 자리와 함께 적는다(kind other)', () => {
    const n = notes([phrase, ...lessonV2.formative_check.quiz.slice(1)])
    expect(n.map((i) => i.detail)).toEqual([`1차시 퀴즈 1: ${QUIZ_CONDITION_MISSING}`])
    expect(n[0].kind).toBe('other')
    expect(QUIZ_CONDITION_MISSING).toContain('L-23')
  })
  it('조건을 붙이면 메모가 사라지고, 낱말·숫자 정답(lessonV2)은 애초에 메모가 없다', () => {
    expect(notes([{ ...phrase, condition: COND }, ...lessonV2.formative_check.quiz.slice(1)])).toEqual([])
    expect(notes(lessonV2.formative_check.quiz)).toEqual([])
  })
  it('시연 fixture(수학·과학)의 구 정답 퀴즈는 모두 조건을 갖고 있다', () => {
    for (const suffix of ['', '-과학']) {
      const fx = JSON.parse(readFileSync(`data/studio-fixtures/stage3-generate${suffix}.json`, 'utf8'))
      expect(staticIssues(3, fx, ctx).filter((i) => i.detail.includes('답 조건')), suffix).toEqual([])
      const withCondition = fx.lessons.flatMap((l: { formative_check: { quiz: { condition?: string }[] } }) => l.formative_check.quiz.filter((q) => q.condition))
      expect(withCondition.length, suffix).toBeGreaterThan(0)
    }
  })
})

describe('문장 고치기 — 답 조건 칸과 라벨', () => {
  const PATTERN = 'lessons[].formative_check.quiz[].condition'
  it('condition 이 있는 퀴즈는 "퀴즈 N 답 조건" 칸으로 펼쳐진다', () => {
    const output = { lessons: [{ ...lessonV2, formative_check: { quiz: [{ ...lessonV2.formative_check.quiz[0], condition: COND }, ...lessonV2.formative_check.quiz.slice(1)] } }] }
    const f = expandFields(3, output).find((x) => x.pattern === PATTERN)
    expect(f?.value).toBe(COND)
    expect(f?.multiline).toBe(false)
    expect(app.studio.wizard.fieldEditor.labels[PATTERN]([0, 0], {})).toBe('퀴즈 1 답 조건')
  })
  // 독립 검토 2026-11-06: L-23 메모가 "조건을 적으라"고 하는데 칸이 없으면 다시 생성하는 수밖에 없다 — 없는 퀴즈에도 빈 칸을 내고, 적으면 새로 붙인다
  it('condition 이 없는 퀴즈에도 빈 칸이 나오고, 적어 저장하면 새로 붙고, 비우면 키를 없앤다(형식 검사 통과)', () => {
    const output = design(lessonV2.formative_check.quiz)
    const fields = expandFields(3, output)
    const empty = fields.filter((x) => x.pattern === PATTERN && x.path[1] === 0)
    expect(empty.map((x) => x.value)).toEqual(['', '', ''])
    expect(empty[0].optional).toBe(true)
    const added = applyFieldEdits(output, fields, { [empty[0].id]: COND })
    expect((added.lessons[0].formative_check.quiz[0] as { condition?: string }).condition).toBe(COND)
    expect(validateEdited(3, added, fields)).toBeNull()
    const untouched = applyFieldEdits(output, fields, { [empty[0].id]: '' })
    expect('condition' in (untouched.lessons[0].formative_check.quiz[0] as object)).toBe(false)
    const fields2 = expandFields(3, added)
    const f2 = fields2.find((x) => x.pattern === PATTERN && x.value === COND)!
    const removed = applyFieldEdits(added, fields2, { [f2.id]: '' })
    expect('condition' in (removed.lessons[0].formative_check.quiz[0] as object)).toBe(false)
    expect(validateEdited(3, removed, fields2)).toBeNull()
  })
})

describe('AI 뜻 판정 — 답 조건을 함께 보낸다', () => {
  const input = { subject: '국어', level: '중', grade: 2, q: '기호와 색을 함께 쓸 때 처음 온 독자가 얻는 이점을 쓰시오.', answer: '한눈에 빨리 구분된다', explanation: '해설', keywords: ['한눈'], response: '빨리 알아볼 수 있다' }
  it('condition 이 있으면 "답 조건:" 줄이 들어가고, 없으면 빠진다', () => {
    expect(buildQuizJudgePrompt({ ...input, condition: COND }).user).toContain(`답 조건: ${COND}`)
    expect(buildQuizJudgePrompt(input).user).not.toContain('답 조건')
    expect(buildQuizJudgePrompt({ ...input, condition: null }).user).not.toContain('답 조건')
  })
  it('규칙은 답 조건을 어떻게 볼지 말한다(꼴만 다르면 맞음, 조건이 요구한 내용이 빠지면 부분)', () => {
    expect(QUIZ_JUDGE_RULES).toContain('답 조건')
  })
})

describe('학생 화면·교재·제작소 카드 — 문항 아래 "조건"이 보인다', () => {
  const label = app.classroom.student.quiz.conditionLabel
  it('QuizForm: 제출 전·후 모두 조건 줄이 있고, 조건 없는 문항은 줄이 없다', () => {
    const quiz = [{ q: '첫째 문항', type: 'short' as const, choices: null, condition: COND }, { q: '둘째 문항', type: 'short' as const, choices: null }]
    const before = renderToStaticMarkup(createElement(QuizForm, { assignmentId: 'a1', lessonNo: 1, quiz, done: null }))
    expect(text(before)).toContain(`${label}: ${COND}`)
    expect(before.split(label).length - 1).toBe(1)
    const after = renderToStaticMarkup(createElement(QuizForm, { assignmentId: 'a1', lessonNo: 1, quiz: quiz.map((q) => ({ ...q, answer: '답', explanation: '해설' })), done: [{ response: '답', correct: true }, { response: 'x', correct: false }] }))
    expect(text(after)).toContain(`${label}: ${COND}`)
  })
  it('학생용·교사용 교재: 퀴즈 문제 아래 조건', () => {
    const snap = snapshotFor('수학')
    const lesson = snap.lessons.find((l) => l.formative_check.quiz.length > 0)!
    lesson.formative_check.quiz[0].condition = COND
    const student = renderToStaticMarkup(createElement(StudentBook, { plan: buildBookPlan(snap, 'student'), draft: false }))
    const teacher = renderToStaticMarkup(createElement(TeacherBook, { plan: buildBookPlan(snap, 'teacher'), draft: false }))
    for (const html of [student, teacher]) expect(text(html)).toContain(`${app.book.lesson.quizCondition}: ${COND}`)
  })
  it('제작소 차시 카드(원장 패키지 화면): 문제 → 조건 → 정답 → 해설 순으로 쌓인다', () => {
    const lessons = [{ ...lessonV2, formative_check: { quiz: [{ ...lessonV2.formative_check.quiz[0], condition: COND }, ...lessonV2.formative_check.quiz.slice(1)] } }]
    const html = renderToStaticMarkup(createElement(LessonCards, { lessons, showAnswers: true, open: true }))
    const c = app.packageView.lessons.quiz
    const t = text(html)
    expect(t).toContain(`${c.conditionLabel}: ${COND}`)
    const seg = text(html.slice(html.indexOf('data-quiz-answer="1"')))
    expect(seg.indexOf(COND)).toBeGreaterThan(seg.indexOf('문항 1'))
    expect(seg.indexOf(COND)).toBeLessThan(seg.indexOf(`${c.answerLabel}`))
  })
})
