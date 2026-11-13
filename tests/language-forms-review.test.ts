// tests/language-forms-review.test.ts
// 독립 검토 2026-11-14 반영(커밋 f740c4f 뒤): 판정의 "정답 표기는 예시" 규칙이 닫힌 문항에도 걸리던 것, 형식 규칙의 우선순위,
// 후보가 없는 옛 영어 세트·다른 과목에 새 칸이 생기는 길, 고른 문법이 하나만 남는 경우, 자료 글의 튼튼함, 규칙 문장끼리의 어긋남.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { Reconstruction } from '@/lib/studio/schemas'
import { LESSON_RULES, SUBJECT_RULES } from '@/lib/studio/prompts/rules/index'
import { selectedLanguageForms, languageFormCandidates, validateLanguageFormPick, scrubLanguageForms } from '@/lib/studio/language-forms'
import { repairOutput } from '@/lib/studio/repair'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { buildQuizJudgePrompt, QUIZ_JUDGE_RULES, quizMaterialsText, isOpenChoiceQuiz, JUDGE_MATERIALS_MAX } from '@/lib/classroom/quiz-judge'
import { buildBookPlan } from '@/lib/book/plan'
import { expandFields } from '@/lib/studio/editable-fields'
import { app } from '@/content/site'
import { snapshotFor } from './fixtures/book'
import stage2Fixture from '@/data/studio-fixtures/stage2-generate.json'
import stage6Fixture from '@/data/studio-fixtures/stage6-generate.json'

const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
const row = (id: string) => spec.split('\n').find((line) => line.startsWith(`| ${id} |`))!
const C = (name: string) => ({ name, form: 'f + g', example: 'An example sentence.', use: '하는 일' })
const stage2 = (extra: Record<string, unknown> = {}) => ({ ...stage2Fixture, language_form_candidates: [C('가'), C('나'), C('다'), C('라')], ...extra })
const pctx = (subject: string, prior: Record<string, unknown> = {}, level = '중') => ({ theme: { title: '학교 축제 일회용품 줄이기', level, grade: null, subjects: [subject] }, subject, standards: [{ code: '[9영02-03]', text: '친숙한 주제에 관해 사실적 정보를 설명한다.' }], prior }) as never

describe('AI 뜻 판정 — "정답 표기는 예시"는 학생이 스스로 고르는 문항에만', () => {
  const input = { subject: '사회', level: '중', grade: 1, q: '재활용률이 가장 높은 품목을 쓰시오.', answer: '유리병', explanation: '표에서 가장 큰 값을 찾는다.', response: '종이컵은 5%이다' }
  it('isOpenChoiceQuiz: 문항이 "골라"·"고른"·"스스로 정해"를 말할 때만', () => {
    expect(isOpenChoiceQuiz('자료 F에서 두 품목을 골라, 견주는 문장을 쓰세요.')).toBe(true)
    expect(isOpenChoiceQuiz('수치 하나를 스스로 정해 근거로 삼으세요.')).toBe(true)
    expect(isOpenChoiceQuiz('재활용률이 가장 높은 품목을 쓰시오.')).toBe(false)
    expect(isOpenChoiceQuiz('다음 초안 문장을 바르게 고쳐 쓰세요.')).toBe(false)   // "고쳐"는 고르기가 아니다
  })
  it('닫힌 문항: 자료를 보내도 정답 표기가 기준이라는 이름표 그대로', () => {
    const p = buildQuizJudgePrompt({ ...input, materials: '<자료 B> 표' }).user
    expect(p).toContain('정답 표기(어느 것이든 정답):'); expect(p).not.toContain('정답 표기(예시')
  })
  it('열린 문항(openChoice): 이름표가 "정답 표기(예시 …)"로 바뀐다', () => {
    const p = buildQuizJudgePrompt({ ...input, openChoice: true, materials: '<자료 B> 표' }).user
    expect(p).toContain('정답 표기(예시 — 학생이 자료에서 다른 것을 골라 써도 된다):'); expect(p).not.toContain('정답 표기(어느 것이든 정답)')
  })
  it('규칙: 예시 규칙은 "정답 표기(예시)" 문항에만, 그 밖에는 자료가 있어도 정답 표기가 기준', () => {
    expect(QUIZ_JUDGE_RULES).toContain('"정답 표기(예시)"로 주어진 문항만')
    expect(QUIZ_JUDGE_RULES).toContain('그 밖의 문항은 "자료"가 주어져도 정답 표기가 기준이다')
    expect(QUIZ_JUDGE_RULES).not.toContain('"자료"가 주어지면 정답 표기는 예시다')
  })
  it('규칙: 형식을 쓰지 않은 답은 뜻이 같아도·답 조건에 그 형식이 적혀 있어도 "부분"이 아니라 "틀림"', () => {
    expect(QUIZ_JUDGE_RULES).toContain('뜻이 정답과 같아도, 답 조건에 그 형식이 적혀 있어도 "부분"이 아니라 "틀림"')
  })
})

describe('자료 글(quizMaterialsText) — 모양이 어긋난 자료에도 던지지 않는다', () => {
  it('열 이름이 없는 표·배열이 아닌 줄·글이 아닌 본문', () => {
    const odd = [{ id: 'A', title: 't', body: 12 as never, table: { rows: [['a', 1], 'x' as never] } as never }, { id: 'B', title: null, body: null, table: null }]
    expect(() => quizMaterialsText(odd, ['A', 'B'])).not.toThrow()
    expect(quizMaterialsText(odd, ['A', 'B'])).toContain('a | 1')
    expect(quizMaterialsText('nope' as never, ['A'])).toBe('')
  })
  it('잘리면 잘렸다고 적는다(판정이 "없는 항목"으로 읽지 않게)', () => {
    const t = quizMaterialsText([{ id: 'E', title: 't', body: 'x'.repeat(JUDGE_MATERIALS_MAX + 500), table: null }], ['E'])
    expect(t.endsWith('…(이하 잘림)')).toBe(true)
  })
})

describe('고른 문법 — 하나만 남으면 채운다, 이름이 겹친 후보는 하나로', () => {
  it('고른 이름 가운데 하나만 후보에 남았으면 앞의 후보로 두 개까지 채운다(후보 순서)', () => {
    expect(selectedLanguageForms(stage2({ language_forms: ['다', '없는 이름'] })).map((f) => f.name)).toEqual(['가', '다'])
    expect(selectedLanguageForms(stage2({ language_forms: ['가', '없는 이름'] })).map((f) => f.name)).toEqual(['가', '나'])
  })
  it('이름이 겹친 후보는 앞의 것만', () => {
    const dup = stage2({ language_form_candidates: [C('가'), C('가'), C('나')] })
    expect(languageFormCandidates(dup).map((f) => f.name)).toEqual(['가', '나'])
    expect(validateLanguageFormPick(['가', '나'], languageFormCandidates(dup))).toEqual({ ok: true, names: ['가', '나'] })
  })
})

describe('생성 직후 손질 — 새 칸이 엉뚱한 세트에 생기거나 형식 검사를 깨지 않게', () => {
  it('형식 검사 전(repairOutput): 2단계의 language_forms 는 지우고(본사가 고르는 칸), null 인 새 칸은 지운다', () => {
    const r2 = repairOutput(2, { ...stage2(), language_forms: ['가', '나'] }) as Record<string, unknown>
    expect('language_forms' in r2).toBe(false); expect(r2.language_form_candidates).toHaveLength(4)
    expect('language_form_candidates' in (repairOutput(2, { ...stage2Fixture, language_form_candidates: null }) as object)).toBe(false)
    const r3 = repairOutput(3, { lessons: [{ no: 1, language_focus: null, formative_check: { quiz: [{ q: 'a', language_form: null }, { q: 'b', language_form: '가' }] } }] }) as { lessons: { language_focus?: unknown; formative_check: { quiz: Record<string, unknown>[] } }[] }
    expect('language_focus' in r3.lessons[0]).toBe(false)
    expect('language_form' in r3.lessons[0].formative_check.quiz[0]).toBe(false)
    expect(r3.lessons[0].formative_check.quiz[1].language_form).toBe('가')
  })
  it('스키마: 후보가 하나뿐이거나 빈 배열이어도 형식 검사를 통과한다(마법사를 막지 않는다)', () => {
    expect(Reconstruction.safeParse(stage2({ language_form_candidates: [C('가')] })).success).toBe(true)
    expect(Reconstruction.safeParse(stage2({ language_form_candidates: [] })).success).toBe(true)
  })
  it('형식 검사 뒤(scrubLanguageForms): 영어가 아닌 세트와 목표 문법이 없는 영어 세트에서는 새 칸을 뺀다', () => {
    const out3 = { lessons: [{ no: 1, language_focus: ['가'], formative_check: { quiz: [{ q: 'a' }, { q: 'b', language_form: '가', criteria_ref: 'x' }] } }] }
    const s3 = scrubLanguageForms(3, out3, { subject: '국어', hasForms: false }) as typeof out3
    expect('language_focus' in s3.lessons[0]).toBe(false); expect('language_form' in s3.lessons[0].formative_check.quiz[1]).toBe(false)
    expect((s3.lessons[0].formative_check.quiz[1] as { criteria_ref?: string }).criteria_ref).toBe('x')
    expect(scrubLanguageForms(3, out3, { subject: '영어', hasForms: true })).toEqual(out3)
    expect('language_focus' in (scrubLanguageForms(3, out3, { subject: '영어', hasForms: false }) as typeof out3).lessons[0]).toBe(false)
    expect('language_form_candidates' in (scrubLanguageForms(2, stage2(), { subject: '수학', hasForms: false }) as object)).toBe(false)
    expect((scrubLanguageForms(2, stage2(), { subject: '영어', hasForms: false }) as { language_form_candidates: unknown[] }).language_form_candidates).toHaveLength(4)
    const g = { ...stage6Fixture, language_forms: [{ name: '가', form: 'a', meaning: 'b', common_errors: ['c'] }] }
    expect('language_forms' in (scrubLanguageForms(6, g, { subject: '과학', hasForms: false }) as object)).toBe(false)
    expect('language_forms' in (scrubLanguageForms(6, g, { subject: '영어', hasForms: true }) as object)).toBe(true)
  })
  it('runStage 가 생성 결과에 이 손질을 건다', () => {
    const src = readFileSync('lib/studio/stages.ts', 'utf8')
    expect(src).toMatch(/scrubLanguageForms\(stage, enrichOutput\(stage, r\.data,/)
  })
})

describe('프롬프트', () => {
  it('후보가 없는 옛 영어 세트의 3·5·6단계: 새 칸을 두지 말라고 분명히 말한다(규칙 블록에는 S-영-10~14가 있으므로)', () => {
    for (const st of [3, 5, 6] as const) {
      const p = buildPrompt(st, pctx('영어', { stage2: stage2Fixture })).user
      expect(p, String(st)).toContain('이 영어 세트는 목표 언어 형식을 정하지 않았다')
      expect(p).toContain('language_focus·language_form·language_forms를 두지 않는다')
    }
    expect(buildReviewPrompt(3, pctx('영어', { stage2: stage2Fixture }), {}).user).toContain('목표 언어 형식을 정하지 않았다')
    expect(buildPrompt(3, pctx('수학', { stage2: stage2Fixture })).user).not.toContain('목표 언어 형식')
  })
  it('4단계(영어): 자료의 영어 글에 목표 형식을 쓴 문장을 넣게 한다 — 다른 과목·후보 없는 세트는 그대로', () => {
    const p = buildPrompt(4, pctx('영어', { stage2: stage2() })).user
    for (const s of ['목표 언어 형식(본사가 고른 것, S-영-11)', '자료의 영어 글', '형식마다 하나 이상', 'S-영-12']) expect(p, s).toContain(s)
    expect(buildReviewPrompt(4, pctx('영어', { stage2: stage2() }), {}).user).toContain('coverage(S-영-12)')
    expect(buildPrompt(4, pctx('수학', { stage2: stage2() })).user).not.toContain('목표 언어 형식')
    expect(buildPrompt(4, pctx('영어', { stage2: stage2Fixture })).user).not.toContain('목표 언어 형식')
  })
  it('5단계(영어): 목표 형식은 성취수준이 근거라 원문 밖의 개념으로 보지 않는다고 과제·검토 모두에', () => {
    const prior = { stage2: stage2() }
    expect(buildPrompt(5, pctx('영어', prior)).user).toContain('성취기준 원문 밖의 개념으로 보지 않는다')
    expect(buildReviewPrompt(5, pctx('영어', prior), { items: [] }).user).toContain('fidelity로 짚지 않는다')
  })
  it('2단계: 학교급을 못 박지 않는다("이 학교급 학년군")', () => {
    const p = buildPrompt(2, pctx('영어', {}, '초')).user
    expect(p).toContain('이 학교급 학년군에서 배우는 형식만 낸다'); expect(p).not.toContain('중학교 학년군에서 배우는 형식만')
  })
  it('3단계(모든 과목): 네 가지는 예시 — 식을 세워 값을 구하기·규칙으로 예측하기도 같다', () => {
    const t = buildPrompt(3, pctx('수학')).user
    expect(t).toContain('고르기·견주기·바꾸기·잇기처럼 학생이 스스로 정하거나 만들어 내는 일을 넣는다(식을 세워 값을 구하기·규칙을 찾아 예측하기도 같다)')
    expect(buildReviewPrompt(3, pctx('수학'), {}).user).toContain('학생이 스스로 정하거나 만들어 내는 일(고르기·견주기·바꾸기·잇기, 식 세우기·규칙으로 예측하기)이 있어야 한다')
  })
})

describe('규칙 문장 — 서로 어긋나던 곳', () => {
  const lesson = (id: string) => LESSON_RULES.find((r) => r.id === id)!
  const en = (id: string) => SUBJECT_RULES['영어'].find((r) => r.id === id)!
  it('L-24: 네 가지는 닫힌 목록이 아니다', () => {
    const t = lesson('L-24').text
    expect(t).toContain('고르기(여럿 가운데 골라 쓴다)·견주기(두 곳 이상을 견준다)·바꾸기(꼴이나 읽는 사람을 바꿔 다시 쓴다)·잇기(두 사실, 또는 근거와 주장을 잇는다)처럼 학생이 스스로 정하거나 만들어 내는 일이 들어가야 한다(식을 세워 값을 구하기·규칙을 찾아 예측하기도 같다)')
    expect(row('L-24')).toBe(`| L-24 | ${t} | P+S | [대표] |`)
  })
  it('S-영-05: 형식의 이름은 퀴즈의 답 조건에만 — 단원 평가 문항의 조건에는 적지 않는다(S-영-14)', () => {
    const t = en('S-영-05').text
    expect(t).toContain('퀴즈의 답 조건(condition)에는 세트의 목표 언어 형식을 이름으로 밝힐 수 있다(S-영-11) — 단원 평가 문항의 조건에는 적지 않는다(S-영-14)')
    expect(row('S-영-05')).toBe(`| S-영-05 | ${t} | [WP4-운2][WP4 §8][C-07] |`)
  })
  it('S-영-10: 적지 않는 것은 정답 문장에 들어갈 내용(품목 이름·수치) — 형식의 이름에 든 기능어는 된다', () => {
    const t = en('S-영-10').text
    expect(t).toContain('정답 문장에 들어갈 내용(품목 이름·수치)은 적지 않는다 — 형식의 이름에 든 기능어(so·because·than)는 적어도 된다')
    expect(row('S-영-10')).toBe(`| S-영-10 | ${t} | [대표] |`)
  })
  it('S-영-11: 학교급을 못 박지 않는다', () => {
    const t = en('S-영-11').text
    expect(t).toContain('그 학교급 학년군에서 배우는 형식만 내고'); expect(t).not.toContain('중학교 학년군')
    expect(row('S-영-11')).toBe(`| S-영-11 | ${t} | [대표] |`)
  })
})

describe('화면·교재', () => {
  it('문장 고치기: 지침서 목표 문법 묶음의 이름표가 있다(날 키가 보이지 않게)', () => {
    const groups = app.studio.wizard.fieldEditor.groups as Record<string, (tag: string) => string>
    expect(groups.language_forms('')).toBe('목표 문법 (교사용)')
    const g = expandFields(6, { ...stage6Fixture, language_forms: [{ name: '비교급', form: 'a', meaning: 'b', common_errors: ['c'] }] })
    expect(g.filter((f) => f.pattern.startsWith('language_forms')).length).toBe(3)
  })
  it('교사용 교재에는 퀴즈의 써야 하는 문법과 차시의 문법이 실리고, 학생용 교재에는 없다', () => {
    const snap = JSON.parse(JSON.stringify(snapshotFor('수학')))
    snap.lessons[0].language_focus = ['비교급']
    snap.lessons[0].formative_check.quiz[1].language_form = '비교급'
    const teacher = buildBookPlan(snap, 'teacher'), student = buildBookPlan(snap, 'student')
    expect(teacher.lessons[0].quiz[1].language_form).toBe('비교급')
    expect(teacher.lessons[0].teacher?.languageFocus).toEqual(['비교급'])
    expect(JSON.stringify(student)).not.toContain('비교급')
  })
})
