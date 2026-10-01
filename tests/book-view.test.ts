// 제본용 교재 두 권(components/book/StudentBook·TeacherBook)을 수학·과학 mock 스냅숏과 옛 v1 판으로 실제 렌더해 본다(서버 렌더 = 정적 마크업).
// 절 순서·차례, 차시마다 자료 상자·활동지 쓰는 칸·퀴즈 답 줄, 단원 평가의 <자료 n>·조건·평가 요소·답란(10줄/20줄), 교사용의 답은 질문 아랫줄.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudentBook } from '@/components/book/StudentBook'
import { TeacherBook } from '@/components/book/TeacherBook'
import { buildBookPlan } from '@/lib/book/plan'
import { ANSWER_LINES } from '@/components/studio/PackageView'
import type { Snapshot } from '@/lib/studio/publish'
import { app } from '@/content/site'
import { snapshotFor, v1Snapshot } from './fixtures/book'
import { englishMaterials, englishGuide, englishTranslations } from './fixtures/english-guide'

const copy = app.book
const pv = app.packageView
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const count = (s: string, needle: string) => s.split(needle).length - 1
const student = (s: Snapshot, draft = false) => renderToStaticMarkup(createElement(StudentBook, { plan: buildBookPlan(s, 'student'), draft }))
const teacher = (s: Snapshot, draft = false) => renderToStaticMarkup(createElement(TeacherBook, { plan: buildBookPlan(s, 'teacher'), draft }))
const sectionIds = (html: string) => [...html.matchAll(/data-book-section="([^"]+)"/g)].map((m) => m[1])
/** 절 id 의 마크업(다음 절 전까지). */
const section = (html: string, id: string) => {
  const at = html.indexOf(`data-book-section="${id}"`)
  expect(at, id).toBeGreaterThanOrEqual(0)
  const next = html.indexOf('data-book-section="', at + 1)
  return html.slice(at, next < 0 ? html.length : next)
}
/** a 뒤에 b 가 오고 그 사이에 블록 경계가 있다 = 아랫줄(옆으로 잇지 않음). */
function below(html: string, a: string, b: string) {
  const ia = html.indexOf(esc(a)); expect(ia, a).toBeGreaterThanOrEqual(0)
  const ib = html.indexOf(esc(b), ia + esc(a).length); expect(ib, b).toBeGreaterThan(ia)
  expect(html.slice(ia, ib), `${a} ↔ ${b}`).toMatch(/<\/p>|<\/li>|<\/h[2-4]>/)
}

describe.each(['수학', '과학'] as const)('StudentBook (%s)', (subject) => {
  const snap = snapshotFor(subject)
  const html = student(snap)
  const t = text(html)
  const teaching = snap.lessons.filter((l) => l.kind !== 'assessment')

  it('root is data-book="student"; sections run cover → toc → unit → lessons → assessment → back, each marked for a page break', () => {
    expect(html.startsWith('<article data-book="student"')).toBe(true)
    expect(sectionIds(html)).toEqual(['cover', 'toc', 'unit', ...teaching.map((l) => `lesson-${l.no}`), 'assessment', 'back'])
    expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
  it('cover: 대주제·과목·학교급·세트 제목 + 학년 반 번호 이름 빈줄; no draft mark unless asked', () => {
    const cover = text(section(html, 'cover'))
    expect(cover).toContain(snap.cover.title)
    expect(cover).toContain(norm(copy.cover.subjectLine('중', 1, subject)))
    expect(cover).toContain(copy.kindTitle.student)
    for (const f of Object.values(copy.cover.fields)) expect(cover).toContain(f)
    expect(section(html, 'cover')).toContain('data-book-student-line')
    expect(html).not.toContain('data-book-draft')
    expect(student(snap, true)).toContain(`<span data-book-draft="true">${copy.draftMark}</span>`)
  })
  it('toc lists 이 단원에서 → every lesson title → 단원 평가, in order', () => {
    const toc = section(html, 'toc')
    const entries = [...toc.matchAll(/data-toc-entry="([^"]+)">([^<]+)</g)].map((m) => [m[1], m[2]])
    expect(entries).toEqual([['unit', copy.unit.heading], ...teaching.map((l) => [`lesson-${l.no}`, esc(copy.lesson.heading(l.no, l.topic))]), ['assessment', copy.assessment.heading]])
  })
  it('이 단원에서: key question, goals in student words (no axis), 평가 요소 per item (name + max only)', () => {
    const u = section(html, 'unit')
    expect(text(u)).toContain(norm(snap.key_question))
    for (const g of snap.learning_goals) expect(text(u)).toContain(norm(g.text))
    expect(text(u)).not.toContain('지식·이해'); expect(text(u)).not.toContain('과정·기능')
    for (const it of snap.assessment!.items) for (const cr of it.rubric.criteria) expect(text(u)).toContain(norm(pv.items.criterionLine(cr.name, cr.max)))
  })
  it('each lesson section: title + goal, its materials (table with 괘선), worksheet tasks with a writing space each, 3 quizzes each with one answer line and no answers', () => {
    for (const l of teaching) {
      const sec = section(html, `lesson-${l.no}`)
      const st = text(sec)
      expect(st).toContain(norm(copy.lesson.heading(l.no, l.topic)))
      expect(st).toContain(norm(l.goal))
      expect([...sec.matchAll(/data-book-material="([A-Z])"/g)].map((m) => m[1])).toEqual(l.materials_used)
      for (const id of l.materials_used) {
        const m = snap.materials.find((x) => x.id === id)!
        if (m.table) { expect(sec).toContain('<table class="book-table">'); expect(st).toContain(norm(String(m.table.columns[0]))) }
      }
      expect([...sec.matchAll(/data-book-task="(\d+)"/g)].map((m) => Number(m[1]))).toEqual(l.worksheet.tasks.map((w) => w.no))
      for (const w of l.worksheet.tasks) {
        expect(st).toContain(norm(w.prompt))
        if (w.answer_space === 'short' || w.answer_space === 'lines') expect(count(sec, 'data-answer-line')).toBeGreaterThan(0)
        else expect(sec).toContain(`data-writing-box="${w.answer_space}"`)
      }
      const quiz = sec.slice(sec.indexOf('data-quiz'))
      expect(count(quiz, 'data-book-quiz=')).toBe(3)
      for (const [i, q] of l.formative_check.quiz.entries()) {
        expect(text(quiz)).toContain(norm(q.q))
        const item = quiz.slice(quiz.indexOf(`data-book-quiz="${i + 1}"`), quiz.indexOf(`data-book-quiz="${i + 2}"`) < 0 ? undefined : quiz.indexOf(`data-book-quiz="${i + 2}"`))
        expect(count(item, 'data-answer-line')).toBe(1)
        expect(item).not.toContain('data-book-aside')   // 정답·해설 줄 없음(문장 단위 검사는 tests/book-student-safety.test.ts)
      }
    }
  })
  it('단원 평가: every item with stem → <자료 n> boxes (materials_used order) → conditions/분량/형식 → 평가 요소 → 10/20 answer lines; no rubric/exemplars', () => {
    const sec = section(html, 'assessment')
    const items = snap.assessment!.items
    expect(count(sec, 'data-book-item=')).toBe(items.length)
    items.forEach((it, i) => {
      const seg = sec.slice(sec.indexOf(`data-book-item="${i + 1}"`), sec.indexOf(`data-book-item="${i + 2}"`) < 0 ? undefined : sec.indexOf(`data-book-item="${i + 2}"`))
      const st = text(seg)
      expect(st).toContain(norm(it.stem))
      const boxes = [...seg.matchAll(/data-book-item-material="([A-Z])" data-material-no="(\d+)"/g)].map((m) => [m[1], Number(m[2])])
      expect(boxes).toEqual(it.materials_used.map((id, k) => [id, k + 1]))
      it.materials_used.forEach((id, k) => expect(st).toContain(`${pv.items.materialLabel(k + 1)} ${pv.items.materialHint(id)}`))
      for (const cd of it.conditions.items) expect(st).toContain(norm(`${copy.assessment.conditionNo(cd.no)} ${cd.text}`))
      expect(st).toContain(norm(`${copy.assessment.length}: ${it.conditions.length}`))
      for (const cr of it.rubric.criteria) expect(st).toContain(norm(pv.items.criterionLine(cr.name, cr.max)))
      expect(seg).toContain(`data-answer-kind="${it.kind}"`)
      expect(count(seg, 'data-answer-line')).toBe(ANSWER_LINES[it.kind])
      // 문두 → 자료 상자 → 조건 칸 → 답란 순서
      expect(seg.indexOf('data-item-stem')).toBeLessThan(seg.indexOf('data-book-item-material'))
      expect(seg.indexOf('data-book-item-material')).toBeLessThan(seg.indexOf('data-item-conditions'))
      expect(seg.indexOf('data-item-conditions')).toBeLessThan(seg.indexOf('data-answer-kind'))
    })
    expect(sec).not.toContain('data-book-rubric'); expect(sec).not.toContain('data-book-exemplars')
    const paper = structuredClone(snap); paper.assessment!.items[0].conditions.answer_mode = 'paper'
    const pseg = section(student(paper), 'assessment')
    expect(pseg).toContain('data-answer-kind="paper"'); expect(pseg).toContain(`<div class="answer-box">${copy.assessment.paperBox}</div>`)
  })
  it('uses no colour-only distinction markup from the screen cards (no Badge pills, no lavender/mint boxes)', () => {
    expect(html).not.toMatch(/rounded-full px-2\.5/)
    expect(html).not.toMatch(/bg-(lavender|mint|lemon)-\d+/)
  })
})

describe.each(['수학', '과학'] as const)('TeacherBook (%s)', (subject) => {
  const snap = snapshotFor(subject)
  const html = teacher(snap)
  const t = text(html)
  const teaching = snap.lessons.filter((l) => l.kind !== 'assessment')

  it('root is data-book="teacher"; sections run cover(교사용) → toc → plan → lessons → assessment → guide → notice', () => {
    expect(html.startsWith('<article data-book="teacher"')).toBe(true)
    expect(sectionIds(html)).toEqual(['cover', 'toc', 'plan', ...teaching.map((l) => `lesson-${l.no}`), 'assessment', 'guide', 'notice'])
    expect(section(html, 'cover')).toContain(`data-book-teacher-mark="true" class="font-bold">${copy.cover.teacherMark}`)
    expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
    expect(teacher(snap, true)).toContain('data-book-draft')
  })
  it('단원 계획: standards (원문·재구성 below), 3-axis goals, key question, 차시 구성표 rows 차시·주제·자료·평가/퀴즈', () => {
    const p = section(html, 'plan')
    const pt = text(p)
    for (const s of snap.standards) { expect(pt).toContain(s.code); expect(pt).toContain(norm(s.text)) }
    for (const g of snap.learning_goals) { expect(pt).toContain(norm(g.text)); expect(pt).toContain(`(${g.axis})`) }
    expect(pt).toContain(norm(snap.key_question))
    const table = p.slice(p.indexOf('data-plan-table'))
    expect(count(table, '<tr>')).toBe(snap.lessons.length + 1)
    for (const l of snap.lessons) {
      expect(text(table)).toContain(norm(l.topic))
      if (l.formative_check.quiz.length) expect(text(table)).toContain(copy.plan.quizCell(l.formative_check.quiz.length))
    }
    expect(text(table)).toContain('서술형 + 논술형')
  })
  it('each lesson: 수업 흐름 with minutes, 발문 → 예상 답 → 막힐 때 (each on the line below), materials, worksheet → 기대 답 below, quiz → 정답 → 해설 below + 역량, 준비물·유의점·지침서 메모', () => {
    for (const l of teaching) {
      const sec = section(html, `lesson-${l.no}`)
      const st = text(sec)
      expect(st).toContain(`${copy.lesson.flowStep.intro} (${copy.lesson.minutes(l.time_budget.intro_min)})`)
      for (const m of l.flow.main) expect(st).toContain(norm(pv.lessons.stepLabel(m.step_label, m.minutes)))
      for (const q of l.teacher_script.questions) { below(sec, q.prompt, q.expected_answer); below(sec, q.expected_answer, q.if_stuck) }
      expect(sec).toContain('data-script-prompt')
      expect([...sec.matchAll(/data-book-material="([A-Z])"/g)].map((m) => m[1])).toEqual(l.materials_used)
      for (const w of l.worksheet.tasks) below(sec, w.prompt, w.expected)
      for (const q of l.formative_check.quiz) {
        below(sec, q.q, q.answer); below(sec, q.answer, q.explanation)
        if (q.competency) expect(sec).toContain(`data-competency="${q.competency}"`)
      }
      for (const n of l.caution_notes) expect(st).toContain(norm(n))
      for (const n of l.materials_needed) expect(st).toContain(norm(n))
      for (const n of snap.teacher_guide!.per_lesson.find((p) => p.no === l.no)?.notes ?? []) expect(st).toContain(norm(n))
      expect(count(sec, 'data-book-aside="answer"')).toBe(l.formative_check.quiz.length)
    }
  })
  it('단원 평가: items with answer spaces + 출제 의도, rubric tables (0점 upward, 배운 차시·역량), 예시 답안 with 채점자 의견 below, A~E, 등급표, 피드백 틀; 평가 차시 운영', () => {
    const sec = section(html, 'assessment')
    const st = text(sec)
    expect(st).toContain(copy.assessment.sessionFlow)
    expect(st).toContain(norm(pv.lessons.stepLabel('논술형 작성', 35)))
    snap.assessment!.items.forEach((it, i) => {
      const seg = sec.slice(sec.indexOf(`data-book-item="${i + 1}"`), sec.indexOf(`data-book-item="${i + 2}"`) < 0 ? sec.indexOf('data-grade-boundaries') : sec.indexOf(`data-book-item="${i + 2}"`))
      const s = text(seg)
      expect(count(seg, 'data-answer-line')).toBe(ANSWER_LINES[it.kind])
      for (const el of it.evaluation_elements) expect(s).toContain(norm(el))
      expect(seg).toContain(`data-book-rubric="${i + 1}"`)
      for (const cr of it.rubric.criteria) {
        expect(s).toContain(norm(copy.assessment.criterion(cr.name, cr.max)))
        const at = (p: number) => s.indexOf(norm(cr.scale.find((x) => x.points === p)!.descriptor))
        for (let p = 1; p <= cr.max; p++) expect(at(p - 1), cr.name).toBeLessThan(at(p))
        if (cr.competency) expect(seg).toContain(`data-competency="${cr.competency}"`)
      }
      for (const e of it.exemplar_answers) below(seg, e.text, e.rationale)
      expect(seg).toContain('data-level-map')
      for (const lv of it.level_map) expect(s).toContain(`${lv.level} ${lv.min}~${lv.max}`)
      if (it.rubric.holistic) expect(s).toContain(norm(it.rubric.holistic.상))
    })
    const gb = sec.slice(sec.indexOf('data-grade-boundaries'))
    for (const b of snap.assessment!.grade_boundaries) expect(text(gb)).toContain(`${b.grade} ${b.min}~${b.max} ${b.band} ${b.level_ref}`)
    for (const lv of ['상', '중', '하'] as const) expect(text(gb)).toContain(norm(snap.assessment!.feedback_templates[lv]))
    // 배운 차시(C-39)
    const taught = structuredClone(snap)
    for (const it of taught.assessment!.items) for (const cr of it.rubric.criteria) cr.taught_in = [2, 4]
    expect(count(teacher(taught), 'data-taught-in')).toBe(taught.assessment!.items.reduce((n, it) => n + it.rubric.criteria.length, 0))
  })
  it('교사용 지침 전체 and 안내장 틀 are the same views as the package screen', () => {
    const g = text(section(html, 'guide'))
    for (const tip of snap.teacher_guide!.grading_guide.review_tips) expect(g).toContain(norm(tip))
    for (const x of snap.teacher_guide!.glossary) expect(g).toContain(norm(x.term))
    const n = text(section(html, 'notice'))
    for (const p of snap.notice_plan!.per_lesson) expect(n).toContain(norm(p.topic_summary))
    expect(n).toContain(snap.notice_plan!.footer_disclaimer)
  })
})

describe('TeacherBook — 영어 세트', () => {
  const base = snapshotFor('수학')
  const materials = [...base.materials, ...(englishMaterials as unknown as Snapshot['materials'])]
  materials.find((m) => m.id === 'E')!.english_version_of = 'B'
  const snap: Snapshot = { ...base, materials, teacher_guide: englishGuide(), shared_material_ids: ['A', 'B'] }
  snap.lessons = snap.lessons.map((l, i) => (i === 0 ? { ...l, materials_used: ['B', 'E'] } : l))
  const html = teacher(snap)
  it('shows the translations section inside 교사용 지침 (title/body/table headers/exemplars) and the 「공동 자료 B의 영어판」 label on E', () => {
    const g = section(html, 'guide')
    expect(g).toContain('data-guide-translations')
    for (const m of englishTranslations.materials) expect(text(g)).toContain(m.title_ko)
    expect(g).toContain('>품목</th>')
    for (const e of englishTranslations.exemplar_answers) expect(text(g)).toContain(norm(e.text_ko))
    const l1 = section(html, 'lesson-1')
    expect([...l1.matchAll(/data-book-material="([A-Z])"/g)].map((m) => m[1])).toEqual(['E'])
    expect(l1).toContain('data-english-version-of="B"')
    expect(text(l1)).toContain(pv.materials.englishVersionBadge('B'))
    // 학생용 교재에는 영어판 표시도, 원본 B 도 없다(1차시)
    const s1 = section(student(snap), 'lesson-1')
    expect([...s1.matchAll(/data-book-material="([A-Z])"/g)].map((m) => m[1])).toEqual(['E'])
    expect(s1).not.toContain('data-english-version-of'); expect(text(s1)).not.toContain('영어판')
  })
})

describe('both books on the legacy v1 snapshot', () => {
  const snap = v1Snapshot()
  it('render 4 teaching lessons + 3 items without leaks; the v1 선택형 quiz lists its choices; the paper item gets the box', () => {
    for (const html of [student(snap), teacher(snap)]) {
      const t = text(html)
      expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
      expect(sectionIds(html).filter((id) => id.startsWith('lesson-'))).toEqual(['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4'])
      const sec = section(html, 'assessment')
      expect(count(sec, 'data-book-item=')).toBe(3)
      expect(sec).toContain('data-answer-kind="paper"')
      const choice = snap.lessons[0].formative_check.quiz.find((q) => q.choices)!
      for (const ch of choice.choices!) expect(t).toContain(norm(ch))
    }
    // 옛 판의 논술형 차시(발문·활동지 있음)는 교사용 단원 평가 절의 평가 차시 운영에 발문·활동지 답이 실린다
    const sess = snap.lessons.find((l) => l.kind === 'assessment')!
    const tsec = section(teacher(snap), 'assessment')
    for (const q of sess.teacher_script.questions) below(tsec, q.prompt, q.expected_answer)
    for (const w of sess.worksheet.tasks) below(tsec, w.prompt, w.expected)
  })
})
