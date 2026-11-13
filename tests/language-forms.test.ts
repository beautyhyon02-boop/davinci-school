// tests/language-forms.test.ts
// 대표 2026-11-14(설계 docs/superpowers/specs/2026-11-14-english-language-forms-design.md): 새 규칙으로 만든 영어 퀴즈가
// "자료 F에서 '종이컵'을 고른 학생에 관한 사실을 영어 한 문장으로 → Thirty students chose paper cups."처럼 표의 한 칸을 옮기는 일이 되었다.
// "학생의 사고 과정이 드러나는지 모르겠다 · 차시가 길러 주는 평가 요소에 맞는 퀴즈 · 영어는 대주제마다 문법 2개 이상, 배운 문법으로 문장을 다양하게."
// → 목표 언어 형식은 AI가 후보를 내고 본사가 고른다. 단원 평가에도 반영한다.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuizItem, Reconstruction, TeacherGuide } from '@/lib/studio/schemas'
import { rulesFor, LESSON_RULES, SUBJECT_RULES } from '@/lib/studio/prompts/rules/index'
import {
  staticIssues, QUIZ2_CRITERIA_REF_MISSING, LANGUAGE_CANDIDATES_MISSING, QUIZ_LANGUAGE_FORM_MISSING, RUBRIC_LANGUAGE_FORM_MISSING,
  languageFormNotTaught, languageFocusUnknown, quizLanguageFormUnknown, guideLanguageFormMissing,
} from '@/lib/studio/checks'
import { selectedLanguageForms, validateLanguageFormPick, languageFormsBlock, LANGUAGE_FORM_PICK } from '@/lib/studio/language-forms'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { expandFields } from '@/lib/studio/editable-fields'
import { buildQuizJudgePrompt, QUIZ_JUDGE_RULES, quizMaterialsText, JUDGE_MATERIALS_MAX } from '@/lib/classroom/quiz-judge'
import { LessonCards } from '@/components/studio/parts/LessonCards'
import { TeacherGuideView } from '@/components/studio/parts/TeacherGuideView'
import { StageOutput } from '@/app/admin/items/[themeId]/sets/[setId]/StageOutput'
import { app } from '@/content/site'
import { lessonV2, assessmentSession } from './studio-schemas.test'
import stage2Fixture from '@/data/studio-fixtures/stage2-generate.json'
import stage5Fixture from '@/data/studio-fixtures/stage5-generate.json'
import stage6Fixture from '@/data/studio-fixtures/stage6-generate.json'

vi.mock('@/app/admin/items/[themeId]/sets/[setId]/actions', () => ({ chooseLanguageForms: vi.fn() }))
const { LanguageFormPicker } = await import('@/app/admin/items/[themeId]/sets/[setId]/LanguageFormPicker')

const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
const row = (id: string) => spec.split('\n').find((line) => line.startsWith(`| ${id} |`))!
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')

const CANDS = [
  { name: '비교급', form: 'more/fewer + 명사 + than', example: 'More students chose tumblers than paper cups.', use: '두 품목의 수치를 견주어 사실을 설명한다', basis: '성취수준 C "어휘와 언어 형식을 활용하여"' },
  { name: '요청하는 명령문', form: '(Please) + 동사원형 ~', example: 'Please bring your own cup.', use: '읽는 사람에게 행동을 요청한다' },
  { name: '접속사 so·because', form: '문장 + so/because + 문장', example: 'We used 420 paper cups, so our booth lends cups.', use: '수치를 근거로 요청을 잇는다' },
  { name: '수동태', form: 'be동사 + 과거분사', example: '420 paper cups were used.', use: '쓰인 물건을 주어로 삼아 사실을 설명한다' },
]
const stage2 = (extra: Record<string, unknown> = {}) => ({ ...stage2Fixture, language_form_candidates: CANDS, ...extra })

describe('규칙 문장', () => {
  const lesson = (id: string) => LESSON_RULES.find((r) => r.id === id)!
  const en = (id: string) => SUBJECT_RULES['영어'].find((r) => r.id === id)!
  it('L-24: 한 칸·한 문장을 옮기면 답이 되는 문항 금지 — 고르기·견주기·바꾸기·잇기', () => {
    const t = lesson('L-24').text
    for (const s of ['자료의 한 칸·한 문장을 옮기면 답이 되는 문항도 내지 않는다', '고르기', '견주기', '바꾸기', '잇기']) expect(t, s).toContain(s)
    expect(row('L-24')).toBe(`| L-24 | ${t} | P+S | [대표] |`)
  })
  it('L-10: 2번과 3번이 모두 그 차시 채점 요소의 이름을 단다', () => {
    const t = lesson('L-10').text
    expect(t).toContain('2번과 3번은 그 차시의 채점 요소(lesson_map.criteria_focus) 가운데 하나의 이름을 criteria_ref에 적는다(요소가 둘이면 나누어 맡고, 하나면 둘 다 그 요소)')
    expect(row('L-10')).toBe(`| L-10 | ${t} | P+S | [WP11-3][WP11-9][대표] |`)
  })
  it('S-영-10: 1번 형식의 꼴·표현, 2번 배운 형식으로 스스로 고른 내용, 3번 바꿔 쓰기·잇기 — 옮겨 적기와 한국어 까닭 문항은 없다', () => {
    const t = en('S-영-10').text
    for (const s of ['세 문항 모두 영어로 답한다', '문법 용어의 이름은 묻지 않는다', '배운 언어 형식을 써서 자료에서 스스로 고른 내용을 영어 한 문장으로', '같은 뜻을 다른 꼴로 바꿔 쓰거나 두 문장을 이어 쓴다',
      'language_form', '정답 문장에 들어갈 내용(품목 이름·수치)은 적지 않는다', '목표 형식을 썼으나 꼴에 잘못이 있는 답은 부분, 목표 형식을 쓰지 않은 답은 틀림', '표의 한 칸을 문장으로 옮기기만 하는 문항', '한국어로 까닭을 설명하게 하는 문항은 내지 않는다']) expect(t, s).toContain(s)
    expect(t).not.toContain('자료의 수치를 영어 한 문장으로')
    expect(row('S-영-10')).toBe(`| S-영-10 | ${t} | [대표] |`)
  })
  it('S-영-11~14(목표 언어 형식·차시·지침서·단원 평가): PS/대표, 스펙 행과 같은 문장, 영어 프롬프트에만', () => {
    const need: Record<string, string[]> = {
      'S-영-11': ['목표 언어 형식(문법)을 2~3개', 'language_form_candidates', '후보를 3~4개', '본사가 2~3개를 고른다(고르지 않으면 앞의 두 개)', '성취수준', 'C-44'],
      'S-영-12': ['language_focus', '한 차시에 새 형식은 하나', '꼴·뜻·쓰임', '활동지', '뒤 차시', '문법 용어의 이름·정의를 묻거나 외우게 하지 않는다'],
      'S-영-13': ['교사용 지침서', '꼴(form)·뜻(meaning)·학생이 자주 틀리는 모습(common_errors', 'language_forms', '비전공 원장용'],
      'S-영-14': ['단원 평가(서술형·논술형)의 언어 사용 채점 요소', '목표 언어 형식을 바르게 썼는지', '척도 서술에 목표 형식의 이름', '조건으로 그 형식을 쓰라고 강제하지는 않는다'],
    }
    for (const [id, parts] of Object.entries(need)) {
      const r = en(id)
      for (const s of parts) expect(r.text, `${id} ${s}`).toContain(s)
      expect(r.nature).toBe('PS'); expect(r.tags).toEqual(['대표'])
      expect(row(id)).toBe(`| ${id} | ${r.text} | [대표] |`)
      expect(rulesFor('영어')).toContain(`${id} `)
      for (const s of ['수학', '과학', '국어', '사회']) expect(rulesFor(s)).not.toContain(id)
    }
  })
  it('S-영-05: 세트의 목표 언어 형식은 조건에 이름으로 밝힐 수 있다', () => {
    const t = en('S-영-05').text
    expect(t).toContain('세트의 목표 언어 형식을 이름으로 밝힐 수 있다(S-영-11)')
    expect(row('S-영-05')).toBe(`| S-영-05 | ${t} | [WP4-운2][WP4 §8][C-07] |`)
  })
})

describe('스키마 — 모두 선택(옛 판·다른 과목에는 없다)', () => {
  it('2단계: language_form_candidates(2~4)·language_forms(이름, 3개까지)', () => {
    expect(Reconstruction.safeParse(stage2Fixture).success).toBe(true)
    expect(Reconstruction.safeParse(stage2({ language_forms: ['비교급', '수동태'] })).success).toBe(true)
    expect(Reconstruction.safeParse(stage2({ language_form_candidates: [...CANDS, CANDS[0]] })).success).toBe(false)   // 다섯 개는 넘친다(하한은 두지 않는다 — language-forms-review.test.ts)
    expect(Reconstruction.safeParse(stage2({ language_form_candidates: [{ ...CANDS[0], example: '' }, CANDS[1]] })).success).toBe(false)
  })
  it('퀴즈 language_form, 차시 language_focus, 지침서 language_forms', () => {
    const q = { q: '자료 F의 두 품목을 골라 견주는 문장을 쓰세요.', type: 'short', choices: null, answer: 'More students chose tumblers than paper cups.', explanation: '두 수치를 견줄 때 비교급을 쓴다.' }
    expect(QuizItem.safeParse(q).success).toBe(true)
    expect(QuizItem.safeParse({ ...q, language_form: '비교급' }).success).toBe(true)
    expect(QuizItem.safeParse({ ...q, language_form: '' }).success).toBe(false)
    expect(TeacherGuide.safeParse(stage6Fixture).success).toBe(true)
    expect(TeacherGuide.safeParse({ ...stage6Fixture, language_forms: [{ name: '비교급', form: 'more + 명사 + than', meaning: '두 대상의 수량을 견준다', common_errors: ['than을 빠뜨림'] }] }).success).toBe(true)
    expect(TeacherGuide.safeParse({ ...stage6Fixture, language_forms: [{ name: '비교급', form: 'x', meaning: 'y', common_errors: [] }] }).success).toBe(false)
  })
})

describe('고른 목표 언어 형식', () => {
  it('고르지 않으면 앞의 두 개, 고르면 후보 순서대로 그것만', () => {
    expect(selectedLanguageForms(stage2()).map((f) => f.name)).toEqual(['비교급', '요청하는 명령문'])
    expect(selectedLanguageForms(stage2({ language_forms: ['수동태', '비교급'] })).map((f) => f.name)).toEqual(['비교급', '수동태'])
  })
  it('후보에 없는 이름만 남았으면 기본(앞의 두 개)으로, 후보가 없으면 빈 배열', () => {
    expect(selectedLanguageForms(stage2({ language_forms: ['가정법'] })).map((f) => f.name)).toEqual(['비교급', '요청하는 명령문'])
    expect(selectedLanguageForms(stage2Fixture)).toEqual([])
    expect(selectedLanguageForms(undefined)).toEqual([])
  })
  it('validateLanguageFormPick: 2~3개, 후보에 있는 이름만, 겹침은 하나로', () => {
    expect(LANGUAGE_FORM_PICK).toEqual({ min: 2, max: 3 })
    expect(validateLanguageFormPick(['수동태', '비교급', '비교급'], CANDS)).toEqual({ ok: true, names: ['비교급', '수동태'] })
    expect(validateLanguageFormPick(['비교급'], CANDS)).toEqual({ ok: false, code: 'count' })
    expect(validateLanguageFormPick(CANDS.map((c) => c.name), CANDS)).toEqual({ ok: false, code: 'count' })
    expect(validateLanguageFormPick(['비교급', '가정법'], CANDS)).toEqual({ ok: false, code: 'unknown' })
  })
  it('languageFormsBlock: 이름·꼴·예문·하는 일을 한 줄씩', () => {
    const b = languageFormsBlock(CANDS.slice(0, 2))
    expect(b).toContain('목표 언어 형식(본사가 고른 것, S-영-11)')
    expect(b).toContain('1. 비교급 — 꼴: more/fewer + 명사 + than — 예문: More students chose tumblers than paper cups. — 하는 일: 두 품목의 수치를 견주어 사실을 설명한다')
    expect(languageFormsBlock([])).toBe('')
  })
})

const pctx = (subject: string, prior: Record<string, unknown> = {}) => ({ theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: [subject] }, subject, standards: [{ code: '[9영02-03]', text: '친숙한 주제에 관해 사실적 정보를 설명한다.' }], prior }) as never

describe('프롬프트', () => {
  it('2단계 과제·검토: 영어 세트만 후보를 내라고 한다', () => {
    const t = buildPrompt(2, pctx('영어')).user
    for (const s of ['language_form_candidates', '3~4개', 'name', 'form', 'example', 'use', 'basis', '권하는 순서', 'S-영-11']) expect(t, s).toContain(s)
    expect(buildReviewPrompt(2, pctx('영어'), {}).user).toContain('목표 언어 형식 후보(S-영-11)')
    for (const s of ['수학', '국어']) { expect(buildPrompt(2, pctx(s)).user).not.toContain('language_form_candidates'); expect(buildReviewPrompt(2, pctx(s), {}).user).not.toContain('목표 언어 형식') }
  })
  it('3단계 과제(모든 과목): 2번에도 criteria_ref, 옮겨 적기 금지 — 고르기·견주기·바꾸기·잇기', () => {
    const t = buildPrompt(3, pctx('수학')).user
    expect(t).toContain('2번과 3번은 그 차시 lesson_map.criteria_focus의 채점 요소 이름 하나를 criteria_ref에 글자 그대로 적는다')
    expect(t).toContain('자료의 한 칸·한 문장을 옮기면 답이 되는 문항도 쓰지 않으며 고르기·견주기·바꾸기·잇기처럼')
    expect(t).not.toContain('language_focus')
    const r = buildReviewPrompt(3, pctx('수학'), {}).user
    expect(r).toContain('2·3번이 자료의 한 칸·한 문장을 옮기면 답이 되는 문항이면 quiz(L-24)')
    expect(r).toContain('2번이나 3번에 criteria_ref가 없거나')
  })
  it('3단계(영어, 2단계에 후보가 있을 때): 고른 형식만 블록으로 보여 주고 language_focus·language_form 을 요구한다 — 고르지 않은 후보는 입력에 없다', () => {
    const p = buildPrompt(3, pctx('영어', { stage2: stage2({ language_forms: ['비교급', '수동태'] }) })).user
    expect(p).toContain('목표 언어 형식(본사가 고른 것, S-영-11)')
    expect(p).toContain('1. 비교급'); expect(p).toContain('2. 수동태')
    expect(p).not.toContain('요청하는 명령문'); expect(p).not.toContain('language_form_candidates')
    for (const s of ['language_focus', 'language_form', 'S-영-12', 'S-영-10', '문법 용어의 이름']) expect(p, s).toContain(s)
    const r = buildReviewPrompt(3, pctx('영어', { stage2: stage2() }), {}).user
    for (const s of ['목표 언어 형식(본사가 고른 것, S-영-11)', 'level(S-영-12)', 'quiz(S-영-10)', '성취기준 원문 밖의 개념으로 보지 않는다']) expect(r, s).toContain(s)
  })
  it('3단계(영어, 후보가 없는 옛 세트)와 다른 과목에는 목표 언어 형식 문장이 없다', () => {
    expect(buildPrompt(3, pctx('영어', { stage2: stage2Fixture })).user).toContain('language_focus·language_form·language_forms를 두지 않는다')   // 옛 영어 세트에는 두지 말라고 말한다
    expect(buildPrompt(3, pctx('영어', { stage2: stage2Fixture })).user).not.toContain('목표 언어 형식(본사가 고른 것')
    expect(buildPrompt(3, pctx('수학', { stage2: stage2() })).user).not.toContain('목표 언어 형식')
  })
  it('5단계(영어): 언어 사용 채점 요소가 목표 형식을 본다 — 조건으로 강제하지 않는다; 6단계: 지침서 language_forms', () => {
    const prior = { stage2: stage2() }
    const p5 = buildPrompt(5, pctx('영어', prior)).user
    for (const s of ['목표 언어 형식(본사가 고른 것, S-영-11)', 'S-영-14', '척도 서술에 목표 형식의 이름', '조건으로 그 형식을 쓰라고 강제하지 않는다']) expect(p5, s).toContain(s)
    expect(buildReviewPrompt(5, pctx('영어', prior), { items: [] }).user).toContain('rubric(S-영-14)')
    const p6 = buildPrompt(6, pctx('영어', prior)).user
    for (const s of ['language_forms', 'meaning', 'common_errors', 'S-영-13', '1. 비교급']) expect(p6, s).toContain(s)
    expect(buildReviewPrompt(6, pctx('영어', prior), {}).user).toContain('other(S-영-13)')
    for (const st of [5, 6] as const) expect(buildPrompt(st, pctx('수학', prior)).user).not.toContain('목표 언어 형식')
  })
})

// ── [TS] 참고 메모 ─────────────────────────────────────────────────────────
const quiz = (over: Record<number, Record<string, unknown>> = {}) => [
  { q: "셀 수 있는 명사 앞에서 '더 적은'을 뜻하는 낱말을 쓰세요.", type: 'short', choices: null, answer: 'fewer', keywords: ['fewer'], explanation: '셀 수 있는 명사 앞에서는 fewer 를 쓴다.', level_ref: 'D~E', competency: '지식·이해' },
  { q: '자료 F에서 두 품목을 골라, 어느 쪽을 고른 학생이 더 많은지 영어 한 문장으로 쓰세요.', type: 'short', choices: null, answer: 'More students chose tumblers than paper cups. / Fewer students chose paper cups than tumblers.', condition: '비교급을 쓰고 두 품목의 이름을 모두 넣을 것', explanation: '두 수치를 견줄 때 비교급과 than 을 쓴다.', level_ref: 'C', competency: '과정·기능', criteria_ref: '사실적 정보 파악의 정확성', partial_note: '두 품목은 맞게 견주었으나 than 을 빠뜨린 답', language_form: '비교급' },
  { q: '자료 E의 수치 하나를 근거로 삼아, 우리 부스가 하는 일을 영어 한 문장으로 이어 쓰세요.', type: 'short', choices: null, answer: 'We used 420 paper cups, so our booth lends cups.', condition: '접속사 so 나 because 를 쓰고 수치를 넣을 것', explanation: '근거와 할 일을 so 로 잇는다.', level_ref: 'B', competency: '근거 들어 설명하기', criteria_ref: '문장 구성과 언어 사용의 정확성', partial_note: '근거와 할 일은 썼으나 두 문장을 잇지 않은 답', language_form: '접속사 so·because' },
].map((q, i) => ({ ...q, ...(over[i] ?? {}) })) as Record<string, unknown>[]
const omit = (o: Record<string, unknown>, ...keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))
const design = (q: Record<string, unknown>[], focus: Record<number, string[]> = { 1: ['비교급'], 2: ['접속사 so·because'] }) => {
  const lessons = [{ ...lessonV2, no: 1, formative_check: { quiz: q } }, ...[2, 3, 4, 5].map((no) => ({ ...lessonV2, no })), assessmentSession(6)]
    .map((l) => (focus[l.no] ? { ...l, language_focus: focus[l.no] } : l))
  const unit_plan = {
    set_title: '부스 안내 문구', set_key_question: '무엇을 어떻게 알릴까?',
    lesson_map: lessons.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic, ...(l.no === 1 ? { criteria_focus: ['사실적 정보 파악의 정확성', '문장 구성과 언어 사용의 정확성'] } : {}) })),
    assessment_plan: { formative: '교수 차시마다 퀴즈 3문항', summative_placement: [{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } },
  }
  return { unit_plan, lessons }
}
const picked = stage2({ language_forms: ['비교급', '접속사 so·because'] })
const cctx = (subject: string, prior: Record<string, unknown> = { stage2: picked }) => ({ standards: [{ code: '[9수04-02]', text: 'x' }], prior, subject })
const notes3 = (q: Record<string, unknown>[], subject = '영어', focus?: Record<number, string[]>, prior?: Record<string, unknown>) => staticIssues(3, design(q, focus), cctx(subject, prior)).map((i) => i.detail).filter((d) => !/^[2-5]차시 퀴즈/.test(d))   // 2~5차시는 lessonV2 그대로라 1차시만 본다
const about = (list: string[], ...needles: string[]) => list.filter((d) => needles.some((n) => d.includes(n)))

describe('[TS] 참고 메모(kind other — 막지 않는다)', () => {
  it('2번에 criteria_ref 가 없으면 메모(모든 과목), 그 차시 criteria_focus 에 없는 이름이면 이름과 함께', () => {
    expect(about(notes3(quiz()), 'criteria_ref')).toEqual([])
    expect(notes3(quiz().map((q, i) => (i === 1 ? omit(q, 'criteria_ref') : q)), '수학')).toContain(`1차시 퀴즈 2: ${QUIZ2_CRITERIA_REF_MISSING}`)
    expect(notes3(quiz({ 1: { criteria_ref: '검산' } }))).toContain('1차시 퀴즈 2: criteria_ref "검산"이(가) 이 차시의 criteria_focus에 없음(L-10)')
  })
  it('2단계(영어): 후보가 없으면 메모 — 다른 과목에는 없다', () => {
    const base = { standards: stage2Fixture.standards.map((s) => ({ code: s.code, text: s.original_text })), prior: {} }
    expect(staticIssues(2, stage2Fixture, { ...base, subject: '영어' }).map((i) => i.detail)).toContain(LANGUAGE_CANDIDATES_MISSING)
    expect(staticIssues(2, stage2(), { ...base, subject: '영어' }).map((i) => i.detail)).not.toContain(LANGUAGE_CANDIDATES_MISSING)
    expect(staticIssues(2, stage2Fixture, { ...base, subject: '수학' }).map((i) => i.detail)).not.toContain(LANGUAGE_CANDIDATES_MISSING)
  })
  it('3단계(영어): 고른 형식을 가르치는 차시가 없으면 메모, language_focus 가 고른 형식이 아니면 메모', () => {
    expect(about(notes3(quiz()), '목표 언어 형식', 'language_focus')).toEqual([])
    expect(notes3(quiz(), '영어', { 1: ['비교급'] })).toContain(languageFormNotTaught('접속사 so·because'))
    expect(notes3(quiz(), '영어', { 1: ['비교급'], 2: ['접속사 so·because'], 3: ['가정법'] })).toContain(languageFocusUnknown(3, '가정법'))
  })
  it('3단계(영어): 2·3번에 language_form 이 없거나 고른 형식이 아니면 메모(1번은 보지 않는다)', () => {
    expect(about(notes3(quiz()), 'language_form')).toEqual([])
    const none = quiz().map((q) => omit(q, 'language_form'))
    expect(about(notes3(none), 'language_form')).toEqual([`1차시 퀴즈 2: ${QUIZ_LANGUAGE_FORM_MISSING}`, `1차시 퀴즈 3: ${QUIZ_LANGUAGE_FORM_MISSING}`])
    expect(notes3(quiz({ 2: { language_form: '수동태' } }))).toContain(`1차시 퀴즈 3: ${quizLanguageFormUnknown('수동태')}`)
  })
  it('후보가 없는 옛 영어 세트와 다른 과목에는 목표 언어 형식 메모가 없다', () => {
    const none = quiz().map((q) => omit(q, 'language_form'))
    expect(about(notes3(none, '영어', {}, { stage2: stage2Fixture }), 'language_form', '목표 언어 형식')).toEqual([])
    expect(about(notes3(none, '수학', {}), 'language_form', '목표 언어 형식')).toEqual([])
  })
  it('5단계(영어): 채점 기준표가 고른 형식의 이름을 한 번도 말하지 않으면 메모', () => {
    const has = (o: unknown, subject = '영어') => staticIssues(5, o, cctx(subject)).map((i) => i.detail).includes(RUBRIC_LANGUAGE_FORM_MISSING)
    expect(has(stage5Fixture)).toBe(true)
    const withForm = JSON.parse(JSON.stringify(stage5Fixture)); withForm.items[1].rubric.criteria[0].scale[1].descriptor += ' 비교급을 바르게 씀'
    expect(has(withForm)).toBe(false)
    expect(has(stage5Fixture, '수학')).toBe(false)
  })
  it('6단계(영어): 고른 형식의 설명이 지침서에 없으면 형식마다 메모', () => {
    const list = (o: unknown, subject = '영어') => about(staticIssues(6, o, cctx(subject)).map((i) => i.detail), 'language_forms')
    expect(list(stage6Fixture)).toEqual([guideLanguageFormMissing('비교급'), guideLanguageFormMissing('접속사 so·because')])
    expect(list({ ...stage6Fixture, language_forms: [{ name: '비교급', form: 'a', meaning: 'b', common_errors: ['c'] }] })).toEqual([guideLanguageFormMissing('접속사 so·because')])
    expect(list(stage6Fixture, '수학')).toEqual([])
  })
  it('메모는 모두 kind other', () => {
    const none = quiz().map((q) => omit(q, 'language_form', 'criteria_ref'))
    const all = staticIssues(3, design(none, {}), cctx('영어')).filter((i) => /language_form|목표 언어 형식|criteria_ref/.test(i.detail))
    expect(all.length).toBeGreaterThan(3)
    expect(all.every((i) => i.kind === 'other')).toBe(true)
  })
})

describe('AI 뜻 판정 — 써야 하는 언어 형식', () => {
  const input = { subject: '영어', level: '중', grade: 1, q: '두 품목을 골라 견주는 문장을 쓰세요.', answer: 'More students chose tumblers than paper cups.', explanation: '비교급과 than 을 쓴다.', response: 'Many students chose tumblers.' }
  it('languageForm 이 있으면 "써야 하는 언어 형식:" 줄, 없으면 없다', () => {
    expect(buildQuizJudgePrompt({ ...input, languageForm: '비교급' }).user).toContain('써야 하는 언어 형식: 비교급')
    expect(buildQuizJudgePrompt(input).user).not.toContain('써야 하는 언어 형식')
  })
  it('규칙: 그 형식을 쓰지 않은 답은 "틀림", 썼으나 꼴에 잘못이 있으면 "부분"', () => {
    expect(QUIZ_JUDGE_RULES).toContain('"써야 하는 언어 형식"이 주어졌는데 학생 답이 그 형식을 쓰지 않았으면 "틀림"')
    expect(QUIZ_JUDGE_RULES).toContain('그 형식을 썼으나 꼴에 잘못이 있으면 "부분"')
  })
})

describe('문장 고치기 칸', () => {
  it('퀴즈의 language_form(선택 칸), 지침서 language_forms 의 꼴·뜻·자주 틀리는 모습', () => {
    const paths = (stage: 3 | 6, o: unknown) => expandFields(stage, o).map((f) => f.path.join('.'))
    expect(paths(3, design(quiz()))).toContain('lessons.0.formative_check.quiz.1.language_form')
    const g = paths(6, { ...stage6Fixture, language_forms: [{ name: '비교급', form: 'a', meaning: 'b', common_errors: ['c'] }] })
    for (const p of ['language_forms.0.form', 'language_forms.0.meaning', 'language_forms.0.common_errors.0']) expect(g, p).toContain(p)
  })
})

describe('화면', () => {
  it('2단계 출력: 후보마다 이름·꼴·예문·하는 일', () => {
    const html = text(renderToStaticMarkup(createElement(StageOutput, { stage: 2, outputs: { 2: stage2() } } as never)))
    expect(html).toContain(app.studio.wizard.stage2.languageFormsLabel)
    for (const s of ['비교급', 'more/fewer + 명사 + than', 'More students chose tumblers than paper cups.', '두 품목의 수치를 견주어 사실을 설명한다']) expect(html, s).toContain(s)
    expect(text(renderToStaticMarkup(createElement(StageOutput, { stage: 2, outputs: { 2: stage2Fixture } } as never)))).not.toContain(app.studio.wizard.stage2.languageFormsLabel)
  })
  it('목표 문법 고르기: 후보가 체크 칸으로 나오고 고른 것(없으면 앞의 두 개)이 체크돼 있다', () => {
    const html = renderToStaticMarkup(createElement(LanguageFormPicker, { setId: 's', candidates: CANDS, selected: [], hasLater: false }))
    expect(text(html)).toContain(app.studio.wizard.languageForms.heading)
    expect(html.match(/type="checkbox"/g)).toHaveLength(4)
    expect(html.match(/checked=""/g)).toHaveLength(2)
    const picked2 = renderToStaticMarkup(createElement(LanguageFormPicker, { setId: 's', candidates: CANDS, selected: ['수동태', '비교급', '접속사 so·because'], hasLater: true }))
    expect(picked2.match(/checked=""/g)).toHaveLength(3)
    expect(text(picked2)).toContain(app.studio.wizard.languageForms.laterNotice)
    expect(renderToStaticMarkup(createElement(LanguageFormPicker, { setId: 's', candidates: [], selected: [], hasLater: false }))).toBe('')
  })
  it('차시 카드: 가르치는 문법, 퀴즈 정답 보기에 써야 하는 문법', () => {
    const lessons = design(quiz()).lessons
    const html = text(renderToStaticMarkup(createElement(LessonCards, { lessons, showAnswers: true, open: true } as never)))
    expect(html).toContain(`${app.packageView.lessons.languageFocusLabel}: 비교급`)
    expect(html).toContain(`${app.packageView.lessons.quiz.languageFormLabel}: 접속사 so·because`)
  })
  it('교사용 지침서: 목표 문법마다 꼴·뜻·자주 틀리는 모습', () => {
    const guide = { ...stage6Fixture, language_forms: [{ name: '비교급', form: 'more + 명사 + than', meaning: '두 대상의 수량을 견준다', common_errors: ['than을 빠뜨림', 'more fewer 를 겹쳐 씀'] }] }
    const html = text(renderToStaticMarkup(createElement(TeacherGuideView, { guide } as never)))
    for (const s of [app.packageView.teacherGuide.languageFormsHeading, '비교급', 'more + 명사 + than', '두 대상의 수량을 견준다', 'than을 빠뜨림']) expect(html, s).toContain(s)
    expect(text(renderToStaticMarkup(createElement(TeacherGuideView, { guide: stage6Fixture } as never)))).not.toContain(app.packageView.teacherGuide.languageFormsHeading)
  })
})

// 학생이 자료에서 스스로 골라 쓰는 문항은 정답이 여러 가지다 — 정답 표기는 예시이고, 사실 여부는 자료로 가린다
describe('AI 뜻 판정 — 문항이 쓰는 자료를 함께 보낸다', () => {
  const mats = [
    { id: 'E', title: 'Festival Count', body: 'Counted on May 10.', table: { columns: ['Item', '2025'], rows: [['Paper cups', 420], ['Plastic cups', 405]] } },
    { id: 'F', title: 'Survey', body: null, table: null },
    { id: 'G', title: 'Notice', body: 'Bring your own cup.', table: null },
  ]
  it('quizMaterialsText: 그 차시가 쓰는 자료만, 제목·본문·표를 글로', () => {
    const t = quizMaterialsText(mats, ['E', 'G'])
    expect(t).toContain('<자료 E> Festival Count'); expect(t).toContain('Item | 2025'); expect(t).toContain('Paper cups | 420'); expect(t).toContain('<자료 G> Notice')
    expect(t).not.toContain('Survey')
    expect(quizMaterialsText(mats, [])).toBe(''); expect(quizMaterialsText(null, ['E'])).toBe(''); expect(quizMaterialsText(mats, undefined)).toBe('')
  })
  it('너무 길면 자른다', () => {
    const long = [{ id: 'E', title: 't', body: 'x'.repeat(JUDGE_MATERIALS_MAX + 500), table: null }]
    expect(quizMaterialsText(long, ['E']).length).toBe(JUDGE_MATERIALS_MAX + '…(이하 잘림)'.length)
  })
  it('프롬프트: materials 가 있으면 "자료:" 줄, 없으면 없다 — 규칙: 자료와 맞고 조건을 지켰으면 맞음, 자료의 사실과 다르면 틀림', () => {
    const input = { subject: '영어', level: '중', grade: 1, q: '두 품목을 골라 견주세요.', answer: 'More students chose tumblers than paper cups.', explanation: '비교급을 쓴다.', response: 'Paper cups were used more than plastic cups.' }
    expect(buildQuizJudgePrompt({ ...input, materials: quizMaterialsText(mats, ['E']) }).user).toContain('자료:\n<자료 E> Festival Count')
    expect(buildQuizJudgePrompt(input).user).not.toContain('자료:')
    expect(QUIZ_JUDGE_RULES).toContain('"정답 표기(예시)"로 주어진 문항만 정답 표기가 예시다')
    expect(QUIZ_JUDGE_RULES).toContain('자료의 사실과 다르면(없는 항목, 틀린 수치, 뒤바뀐 크기) "틀림"')
  })
})
