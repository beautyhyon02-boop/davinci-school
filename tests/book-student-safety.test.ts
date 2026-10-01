// 학생용 교재(components/book/StudentBook)에 답이 없다는 증명(설계 2026-10-01 §2 「학생용 교재 (답 없음)」, 대표 요구):
// 수학·과학 mock 스냅숏 + 영어 번역 fixture 로 학생용 교재를 정적 마크업으로 그린 뒤, 퀴즈 정답·해설, 활동지 기대 답, 발문 예상 답·막힐 때,
// 채점표 척도 서술·총체적 기준·채점 시 유의점, 예시답안·채점자 의견, A~E 특징, 출제 의도, 역량 꼬리표, 번역, 「공동 자료 X의 영어판」,
// 등급표·피드백 틀, 지침서·안내장 틀 문장이 하나도 들어 있지 않음을 훑는다. 같은 문장이 학생이 보는 칸(문두·조건·자료·퀴즈 문제·과제)에도
// 있으면(예: 과제 문장 = 발문) 그 자리로만 허용한다 — 허용된 것은 목록으로 남겨 눈으로 볼 수 있게 한다.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudentBook } from '@/components/book/StudentBook'
import { TeacherBook } from '@/components/book/TeacherBook'
import { MaterialChart } from '@/components/studio/parts/MaterialsFull'
import { buildBookPlan } from '@/lib/book/plan'
import type { Snapshot } from '@/lib/studio/publish'
import { app } from '@/content/site'
import { snapshotFor, v1Snapshot } from './fixtures/book'
import { englishMaterials, englishGuide, englishTranslations } from './fixtures/english-guide'

const c = app.packageView
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const renderStudent = (s: Snapshot) => renderToStaticMarkup(createElement(StudentBook, { plan: buildBookPlan(s, 'student') }))
const renderTeacher = (s: Snapshot) => renderToStaticMarkup(createElement(TeacherBook, { plan: buildBookPlan(s, 'teacher') }))

/** 교재에서 학생이 봐야 하는 글(문두·조건·자료·퀴즈 문제·과제·핵심질문·목표·평가 요소 이름) — 금지 문장이 여기 있으면 그 자리로만 허용. */
function studentCorpus(s: Snapshot): string {
  const parts: string[] = [s.key_question, ...s.learning_goals.map((g) => g.text)]
  for (const l of s.lessons) {
    parts.push(l.topic, l.goal, l.key_question)
    for (const q of l.formative_check.quiz) parts.push(q.q, ...(q.choices ?? []))
    for (const w of l.worksheet.tasks) parts.push(w.prompt)
    parts.push(...l.worksheet.self_check)
  }
  // 자료의 자동 그래프(MaterialChart — 학생 화면·문제지에도 같은 그래프)가 찍는 수치 라벨(상대도수 0.18 등)도 학생이 보는 글이다
  for (const m of s.materials) parts.push(m.title, m.body ?? '', ...(m.table?.columns ?? []), ...(m.table?.rows.flat().map(String) ?? []), text(renderToStaticMarkup(createElement(MaterialChart, { material: m }))))
  for (const it of s.assessment?.items ?? []) {
    parts.push(it.stem, it.conditions.length, it.conditions.format, it.conditions.overflow_rule ?? '', ...it.conditions.items.map((x) => x.text))
    for (const cr of it.rubric.criteria) parts.push(cr.name)
  }
  return norm(parts.join('\n'))
}

/** 학생에게 가면 안 되는 문장 전부(교사용 지도서에는 모두 있어야 한다). */
function forbidden(s: Snapshot): { why: string; text: string }[] {
  const out: { why: string; text: string }[] = []
  const add = (why: string, t: string | null | undefined) => { if (t && norm(t).length >= 2) out.push({ why, text: norm(t) }) }
  for (const l of s.lessons) {
    for (const [i, q] of l.formative_check.quiz.entries()) {
      add(`${l.no}차시 퀴즈 ${i + 1} 정답`, q.answer); add(`${l.no}차시 퀴즈 ${i + 1} 해설`, q.explanation)
      if (q.competency) add(`${l.no}차시 퀴즈 ${i + 1} 역량`, c.lessons.competencyBadge(q.competency))
    }
    for (const w of l.worksheet.tasks) add(`${l.no}차시 과제 ${w.no} 기대 답`, w.expected)
    for (const [i, q] of l.teacher_script.questions.entries()) { add(`${l.no}차시 발문 ${i + 1} 예상 답`, q.expected_answer); add(`${l.no}차시 발문 ${i + 1} 막힐 때`, q.if_stuck) }
    for (const n of l.caution_notes) add(`${l.no}차시 유의점`, n)
  }
  for (const [i, it] of (s.assessment?.items ?? []).entries()) {
    for (const el of it.evaluation_elements) add(`문항 ${i + 1} 출제 의도`, el)
    for (const cr of it.rubric.criteria) {
      for (const st of cr.scale) { add(`문항 ${i + 1} ${cr.name} ${st.points}점 서술`, st.descriptor); add(`문항 ${i + 1} ${cr.name} ${st.points}점 예`, st.example) }
      if (cr.competency) add(`문항 ${i + 1} ${cr.name} 역량`, c.rubric.competencyBadge(cr.competency))
      if (cr.taught_in?.length) add(`문항 ${i + 1} ${cr.name} 배운 차시`, c.rubric.taughtIn(cr.taught_in))
    }
    if (it.rubric.holistic) for (const lv of ['상', '중', '하'] as const) add(`문항 ${i + 1} 총체적 ${lv}`, it.rubric.holistic[lv])
    for (const n of it.rubric.notes) add(`문항 ${i + 1} 채점 시 유의점`, n)
    for (const e of it.exemplar_answers) { add(`문항 ${i + 1} 예시답안 ${e.points}점`, e.text); add(`문항 ${i + 1} 채점자 의견`, e.rationale) }
    for (const lv of it.level_map) add(`문항 ${i + 1} A~E ${lv.level}`, lv.trait)
    add(`문항 ${i + 1} 최소 능력`, it.min_competency)
    if (it.situation) add(`문항 ${i + 1} 과제 상황`, c.assessment.situation(it.situation.role, it.situation.audience, it.situation.purpose, it.situation.product))
  }
  if (s.assessment) for (const lv of ['상', '중', '하'] as const) add(`피드백 틀 ${lv}`, s.assessment.feedback_templates[lv])
  const g = s.teacher_guide
  if (g) {
    add('지침서 수업 의도', g.general?.purpose); add('지침서 운영 메모', g.general?.schedule_note)
    for (const x of g.glossary ?? []) add('지침서 용어', x.explanation)
    for (const e of g.grading_guide?.common_errors ?? []) { add('지침서 흔한 오답', e.error); add('지침서 이렇게 읽기', e.how_to_read) }
    for (const t of g.grading_guide?.review_tips ?? []) add('지침서 검수 팁', t)
    add('지침서 재도전', g.grading_guide?.retry_guidance)
    for (const p of g.per_lesson ?? []) for (const n of p.notes) add(`지침서 ${p.no}차시 메모`, n)
    for (const m of g.translations?.materials ?? []) { add('번역 제목', m.title_ko); add('번역 본문', m.body_ko); for (const col of m.table_ko?.columns ?? []) add('번역 열', col); for (const cell of m.table_ko?.rows.flat() ?? []) add('번역 칸', String(cell)) }
    for (const e of g.translations?.exemplar_answers ?? []) add('번역 예시답안', e.text_ko)
  }
  for (const p of s.notice_plan?.per_lesson ?? []) {
    add('안내장 요약', p.topic_summary); add('안내장 가정 학습', p.home_study_suggestion)
    for (const q of p.quiz_notes) add('안내장 오답 코멘트', q.wrong_note)
    for (const cp of p.criteria_phrases ?? []) for (const t of [...cp.good, ...cp.improve]) add('안내장 요소 문구', t)
  }
  for (const m of s.materials) if (m.english_version_of) add('영어판 표시', c.materials.englishVersionBadge(m.english_version_of))
  return out
}

function englishSnapshot(): Snapshot {
  const base = snapshotFor('수학')
  const materials = [...base.materials, ...(englishMaterials as unknown as Snapshot['materials'])]
  // E 를 공동 자료 B 의 영어판으로 — 1차시가 B·E 둘 다 쓰고 문항 1이 B 를 쓴다 → 교재에는 E 만
  const E = materials.find((m) => m.id === 'E')!
  E.english_version_of = 'B'
  const snap: Snapshot = { ...base, materials, teacher_guide: englishGuide(), shared_material_ids: ['A', 'B'] }
  snap.lessons = snap.lessons.map((l, i) => (i === 0 ? { ...l, materials_used: ['B', 'E'] } : l))
  snap.assessment = { ...snap.assessment!, items: snap.assessment!.items.map((it, i) => (i === 0 ? { ...it, materials_used: ['B', 'F'] } : it)) }
  return snap
}

const cases: [string, () => Snapshot][] = [['수학', () => snapshotFor('수학')], ['과학', () => snapshotFor('과학')], ['영어(번역·영어판 합성)', englishSnapshot], ['옛 v1 판', v1Snapshot]]

describe.each(cases)('학생용 교재에 답이 없다 (%s)', (_name, make) => {
  const snap = make()
  const html = renderStudent(snap)
  const t = text(html)
  const corpus = studentCorpus(snap)
  const list = forbidden(snap)

  it('has forbidden strings to check and the teacher book contains them all (the scan is meaningful)', () => {
    expect(list.length).toBeGreaterThan(30)
    const teacher = text(renderTeacher(snap))
    const missing = list.filter((f) => !teacher.includes(f.text))
    expect(missing, missing.map((m) => `${m.why}: ${m.text}`).join('\n')).toEqual([])
  })
  it('none of the answers/explanations/rubric descriptors/exemplars/expected answers/translations/competency tags/intent appear in the student markup (unless the same sentence is student-visible content)', () => {
    const leaks = list.filter((f) => t.includes(f.text) && !corpus.includes(f.text))
    expect(leaks, leaks.map((l) => `${l.why}: ${l.text}`).join('\n')).toEqual([])
    // 허용된 겹침(과제 문장 = 발문 등)은 학생이 보는 칸의 글과 글자까지 같은 것뿐이다
    const allowed = list.filter((f) => t.includes(f.text))
    for (const a of allowed) expect(corpus, a.why).toContain(a.text)
  })
  it('carries no teacher-only markup: no answer/expected/explanation asides, no competency, no level map, no translations, no script prompts, no rubric, no English-version badge', () => {
    for (const needle of ['data-book-aside', 'data-competency', 'data-level-map', 'data-guide-translations', 'data-script-prompt', 'data-book-rubric', 'data-english-version-of', 'data-taught-in', 'data-book-guide', 'data-book-notice', 'data-grade-boundaries', 'data-book-exemplars']) {
      expect(html, needle).not.toContain(needle)
    }
    for (const heading of [c.assessment.elementsLabel, c.assessment.exemplarsHeading, c.assessment.levelMapHeading, c.teacherGuide.translationsHeading, app.book.lesson.script, app.book.lesson.expected, app.book.lesson.quizAnswer, app.book.lesson.quizExplanation, app.book.assessment.rubric, app.book.assessment.exemplars, app.book.assessment.levelMap, app.book.assessment.intent, app.book.lesson.stuck]) {
      expect(t, heading).not.toContain(heading)
    }
    expect(t).not.toMatch(/역량:|배운 차시:|영어판/)
    expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
  it('still shows the student content: every quiz question with an answer line, every worksheet task with a writing space, every item stem with 평가 요소 and the answer space', () => {
    for (const l of snap.lessons.filter((x) => x.kind !== 'assessment')) {
      for (const q of l.formative_check.quiz) expect(t).toContain(norm(q.q))
      for (const w of l.worksheet.tasks) expect(t).toContain(norm(w.prompt))
    }
    for (const it of snap.assessment?.items ?? []) {
      expect(t).toContain(norm(it.stem))
      for (const cr of it.rubric.criteria) expect(t).toContain(norm(c.items.criterionLine(cr.name, cr.max)))
    }
  })
})

describe('학생 경로에는 교재가 없다', () => {
  it('no file under app/student imports the book components or plan', () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []))
    for (const f of files('app/student')) expect(readFileSync(f, 'utf8'), f).not.toMatch(/components\/book|lib\/book/)
    expect(readdirSync('app/(book)').sort()).toEqual(['admin', 'teacher'])
  })
  it('the English translations fixture really has translation text (so the scan above checked something)', () => {
    expect(englishTranslations.materials.length).toBeGreaterThan(0)
    expect(englishTranslations.exemplar_answers.length).toBeGreaterThan(0)
  })
})
