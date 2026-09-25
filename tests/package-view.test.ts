// PackageView(관리자 미리보기·원장 열람)를 mock fixture 로 조립한 v2 스냅샷으로 실제 렌더해 본다(서버 렌더 = 정적 마크업).
// 스펙 §2.9 카드 순서와 차시·자료·문항 카드의 핵심 표시(분 단위 소단계·활동지 3단계·자료 라벨·조건 번호·[N점]·종이 답안)를 확인한다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PackageView, MaterialsSection, ANSWER_LINES } from '@/components/studio/PackageView'
import { buildSnapshot, upgradeSnapshot, type Snapshot } from '@/lib/studio/publish'
import { app } from '@/content/site'
import { SHORT_MINUTES, ESSAY_MINUTES } from '@/lib/studio/structure-text'

const fx = (k: string) => JSON.parse(readFileSync(`data/studio-fixtures/${k}.json`, 'utf8'))
const v1 = (k: string) => JSON.parse(readFileSync(`tests/fixtures/v1/${k}.json`, 'utf8'))
const c = app.packageView

function snapshotFor(subject: '수학' | '과학', grade: number | null = 1): Snapshot {
  const sfx = subject === '과학' ? '-과학' : ''
  const s2 = fx(`stage2-generate${sfx}`); const s3 = fx(`stage3-generate${sfx}`)
  return buildSnapshot({
    theme: { title: '학교 축제, 일회용품을 줄이자', level: '중', grade, intro: '대주제 소개 문장', materials: null },
    itemSet: {
      subject, level: '중', grade, reconstruction: s2.reconstruction, reconstruction_detail: s2.standards, learning_goals: s2.learning_goals,
      key_question: s2.key_question_candidates[0], unit_plan: s3.unit_plan, lessons: s3.lessons, materials: fx(`stage4-generate${sfx}`).materials,
      assessment: fx(`stage5-generate${sfx}`), teacher_guide: fx(`stage6-generate${sfx}`), notice_plan: fx(`stage7-generate${sfx}`),
      stage_status: { stage5: { state: 'accepted', attempt: 1, model: 'mock', updated_at: '' } },
    },
    standards: s2.standards.map((s: { code: string; original_text: string }) => ({ code: s.code, text: s.original_text })),
    version: 1,
  })
}
const render = (snapshot: Snapshot, mode: 'admin' | 'teacher') => renderToStaticMarkup(createElement(PackageView, { snapshot, mode, showAnswers: true }))
// 마크업에서 태그를 걷어낸 글자만(렌더된 텍스트 비교용).
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')
const norm = (s: string) => s.replace(/\s+/g, ' ')
// 렌더러(React)가 글자를 이스케이프하는 방식 그대로 — 마크업 안에서 원문 위치를 찾을 때
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
/** a 뒤에 b 가 오고, 둘 사이에 블록 경계(</p> 또는 </li>)가 있다 = 같은 줄에 이어 붙지 않고 아랫줄에 있다(오너 요청 2026-09-26). */
function separated(html: string, a: string, b: string) {
  const ia = html.indexOf(esc(a))
  expect(ia, a).toBeGreaterThanOrEqual(0)
  const ib = html.indexOf(esc(b), ia + esc(a).length)
  expect(ib, b).toBeGreaterThan(ia)
  expect(html.slice(ia, ib), `${a} ↔ ${b}`).toMatch(/<\/p>|<\/li>/)
}

describe.each(['수학', '과학'] as const)('PackageView v2 (%s mock snapshot)', (subject) => {
  const snap = snapshotFor(subject)
  const html = render(snap, 'admin')
  const t = text(html)

  it('renders without undefined/NaN/[object Object] leaks', () => {
    expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
  it('shows every lesson with its time split and every main step with minutes', () => {
    for (const l of snap.lessons) {
      expect(t).toContain(norm(`${c.lessons.columns.no} ${l.no} · ${l.topic}`))
      expect(t).toContain(norm(c.lessons.timeLabel(l.time_budget.intro_min, l.time_budget.main_min, l.time_budget.wrapup_min)))
      for (const m of l.flow.main) expect(t).toContain(norm(c.lessons.stepLabel(m.step_label, m.minutes)))
      for (const q of l.teacher_script.questions) expect(t).toContain(norm(q.prompt))
      for (const n of l.caution_notes) expect(t).toContain(norm(n))
    }
  })
  it('each lesson card carries a 교사용 지침 block with that lesson\'s script, cautions and 지침서 notes — admin and teacher modes (2026-09-26)', () => {
    for (const mode of ['admin', 'teacher'] as const) {
      const h = mode === 'admin' ? html : render(snap, 'teacher')
      for (const l of snap.lessons) {
        const start = h.indexOf(`data-lesson-no="${l.no}"`)
        const next = h.indexOf('data-lesson-no="', start + 1)
        const raw = h.slice(start, next < 0 ? h.indexOf(`<h2 class="text-lg font-bold">${c.materialsHeading}</h2>`) : next)
        const seg = text(raw)
        expect(seg).toContain(c.lessons.teacherBlockHeading)
        // 발문(굵게) → 아랫줄 예상 답 → 아랫줄 막힐 때(오너 요청 2026-09-26: 옆으로 쭉 나열하지 말 것)
        for (const q of l.teacher_script.questions) {
          expect(raw).toContain(`<p data-script-prompt="true" class="font-semibold">${esc(q.prompt)}</p>`)
          separated(raw, q.prompt, q.expected_answer); separated(raw, q.expected_answer, q.if_stuck)
        }
        expect(seg).not.toContain(` — ${c.lessons.scriptExpected}:`)
        for (const n of l.caution_notes) expect(seg).toContain(norm(n))
        for (const n of snap.teacher_guide!.per_lesson.find((p) => p.no === l.no)?.notes ?? []) expect(seg).toContain(norm(n))
        // 퀴즈 수준(L-10, 대표 2026-09-26): 교수 차시 카드의 교사용 지침 칸에 문항마다 D~E·C·B — 시연 세트는 수준이 모두 붙어 있다
        const quiz = l.formative_check.quiz as { level_ref?: string }[]
        if (quiz.length) {
          // 퀴즈 수준은 한 줄에 하나(예전의 " · " 한 줄 나열 아님)
          const levels = raw.slice(raw.indexOf('data-quiz-levels'))
          const block = levels.slice(0, levels.indexOf('</ul>'))
          expect(block).toContain(c.lessons.quizLevelsHeading)
          for (const [i, q] of quiz.entries()) expect(block).toContain(`<li>${esc(c.lessons.quizLevel(i + 1, q.level_ref))}</li>`)
          expect(seg).not.toContain(quiz.map((q, i) => c.lessons.quizLevel(i + 1, q.level_ref)).join(' · '))
        } else expect(seg).not.toContain(c.lessons.quizLevelsHeading)
      }
    }
    expect(c.lessons.quizLevel(3, 'B')).toBe('3번 B(관계·추론)'); expect(c.lessons.quizLevel(1, undefined)).toBe('1번 수준 없음')
    // 수준이 없는 옛 퀴즈(2026-09-26 이전 판)는 수준 줄을 두지 않는다
    const old = { ...snap, lessons: snap.lessons.map((l) => ({ ...l, formative_check: { quiz: l.formative_check.quiz.map(({ level_ref: _x, ...q }) => { void _x; return q }) } })) }
    expect(render(old, 'teacher')).not.toContain('data-quiz-levels')
    // 학생 화면(자기 차시 패널·퀴즈 폼)은 수준을 보이지 않는다
    for (const f of ['page.tsx', 'QuizForm.tsx', 'LessonTabs.tsx', 'ResultView.tsx']) expect(readFileSync(`app/student/assignments/[id]/${f}`, 'utf8'), f).not.toMatch(/level_ref|quizLevel/)
    // 학생 화면은 패키지 조립·차시 카드를 쓰지 않는다(자기 차시 패널 + 자료 조각만) — 교사용 지침 칸이 학생에게 갈 길이 없다
    const student = readFileSync('app/student/assignments/[id]/page.tsx', 'utf8')
    expect(student).not.toMatch(/PackageView|LessonCards|LessonCard\b/)
    expect(student).toContain("from '@/components/studio/parts/MaterialsFull'")
  })
  it('shows worksheet tasks for all three tiers 기본/표준/도전 with the level reference', () => {
    for (const l of snap.lessons) for (const w of l.worksheet.tasks) {
      expect(t).toContain(norm(c.lessons.worksheetTier(w.tier, w.level_ref)))
      expect(t).toContain(norm(w.prompt))
    }
    for (const tier of ['기본', '표준', '도전']) expect(t).toContain(tier)
  })
  it('shows materials with the mint 자료 label and no internal source/role badges', () => {
    for (const m of snap.materials) {
      expect(html).toContain(`>${c.materials.idLabel} ${m.id}</span>`)
      expect(t).toContain(norm(m.title))
    }
    expect(html).toMatch(/bg-mint-500[^>]*>자료 [A-Z]</)
    // 배지 마크업만 검사한다(본문·규칙 문장에 같은 낱말이 있을 수 있다)
    expect(html).not.toMatch(new RegExp(`>${c.materials.sourceLabel.자작}<`))
    expect(html).not.toMatch(new RegExp(`>${c.materials.roleLabel.raw}<`))
    expect(html).not.toMatch(new RegExp(`>${c.materials.aiBadge}<`))
  })
  it('shows each item card: stem ending [N점], numbered conditions, rubric criteria with max, notes, exemplars, A~E', () => {
    for (const it of snap.assessment!.items) {
      expect(t).toContain(norm(it.stem))
      expect(it.stem.trim().endsWith(`[${it.points}점]`)).toBe(true)
      for (const cd of it.conditions.items) expect(t).toContain(norm(`${c.assessment.conditions.itemNo(cd.no)} ${cd.text}`))
      for (const cr of it.rubric.criteria) expect(t).toContain(norm(c.rubric.criterionLabel(cr.name, cr.max)))
      for (const n of it.rubric.notes) expect(t).toContain(norm(n))
      for (const e of it.exemplar_answers) expect(t).toContain(norm(e.text))
      for (const lv of it.level_map) expect(t).toContain(`${lv.level} ${lv.min}~${lv.max}`)
      for (const el of it.evaluation_elements) expect(t).toContain(norm(el))
      if (it.situation) expect(t).toContain(norm(it.situation.product))
      if (it.rubric.holistic) expect(t).toContain(norm(it.rubric.holistic.상))
    }
  })
  it('item cards read top-down: stem in text-base, elements/conditions/length/format/notes/exemplars/A~E one per line (2026-09-26)', () => {
    const segs = html.split('data-print="item"').slice(1)
    snap.assessment!.items.forEach((it, i) => {
      const seg = segs[i]
      expect(seg).toContain(`<p data-item-stem="true" class="mt-3 whitespace-pre-wrap text-base font-semibold leading-relaxed">${esc(it.stem)}</p>`)
      for (const el of it.evaluation_elements) expect(seg).toContain(`<li>${esc(el)}</li>`)
      if (it.evaluation_elements.length > 1) expect(text(seg)).not.toContain(it.evaluation_elements.join(' · '))
      for (let k = 1; k < it.conditions.items.length; k++) separated(seg, it.conditions.items[k - 1].text, it.conditions.items[k].text)
      separated(seg, it.conditions.length, it.conditions.format)
      for (let k = 1; k < it.rubric.notes.length; k++) separated(seg, it.rubric.notes[k - 1], it.rubric.notes[k])
      for (const e of it.exemplar_answers) separated(seg, e.text, e.rationale)
      // A~E: 수준마다 한 줄(수준 굵게 · 예상 점수 · 특징), 예전의 " / " 한 줄 나열 아님
      const lm = seg.slice(seg.indexOf('data-level-map'))
      const block = lm.slice(0, lm.indexOf('</ul>'))
      expect(block.split('<li>').length - 1).toBe(it.level_map.length)
      for (const lv of it.level_map) expect(block).toContain(`<span class="inline-block w-6 font-bold">${lv.level}</span> <span class="tabular-nums">${lv.min}~${lv.max}</span>`)
      expect(text(seg)).not.toMatch(/[A-E] \d+~\d+ \/ [A-E]/)
    })
  })
  it('marks exactly the paper-answer items (none in the demo sets since 2026-09-26; a synthetic paper 서술형 shows one)', () => {
    const papers = snap.assessment!.items.filter((i) => i.conditions.answer_mode === 'paper').length
    expect(papers).toBe(0)
    expect(t.split(c.assessment.conditions.answerMode.paper).length - 1).toBe(0)
    const paper = structuredClone(snap); paper.assessment!.items[0].conditions.answer_mode = 'paper'
    expect(text(render(paper, 'admin')).split(c.assessment.conditions.answerMode.paper).length - 1).toBe(1)
  })
  it('the 단원 평가 차시 (after the last teaching lesson) renders as its own card: lemon badge + note, 서술형 + 논술형, no quiz/worksheet', () => {
    const cards = html.split('data-lesson-kind=').slice(1)
    expect(cards.map((x) => x.slice(1, x.indexOf('"', 1)))).toEqual(['teaching', 'teaching', 'teaching', 'teaching', 'teaching', 'assessment'])
    const session = cards[5].slice(0, cards[5].indexOf(`<h2 class="text-lg font-bold">`))
    expect(text(session)).toContain(c.lessons.assessmentSessionBadge); expect(text(session)).toContain(norm(c.lessons.assessmentSessionNote(SHORT_MINUTES, ESSAY_MINUTES)))
    expect(text(session)).toContain('서술형 + 논술형')
    expect(text(session)).toContain(norm(c.lessons.stepLabel('서술형 작성', 15))); expect(text(session)).toContain(norm(c.lessons.stepLabel('논술형 작성', 35)))
    expect(session).not.toContain(`>${c.lessons.worksheetHeading}</p>`); expect(session).not.toContain(`>${c.lessons.quizHeading}</p>`)
    // 교수 차시에는 빈 평가 배지가 없다(assessment = [])
    expect(html.split(`text-lemon-600">${c.lessons.assessmentSessionBadge}</span>`).length - 1).toBe(1)
    for (const card of cards.slice(0, 5)) expect(card.slice(0, 600)).not.toMatch(/bg-mint-100[^>]*>\s*<\/span>/)
  })
  it('the 서술형 card has no "조건" heading (no conditions, C-32) but shows 분량·형식; the 논술형 card keeps its numbered conditions', () => {
    const segs = html.split('data-print="item"').slice(1)
    const [short, essay] = segs
    expect(text(short)).not.toContain(c.assessment.conditions.heading)
    expect(text(short)).toContain(norm(`${c.assessment.conditions.lengthLabel}: ${snap.assessment!.items[0].conditions.length}`))
    expect(text(essay)).toContain(c.assessment.conditions.heading)
    expect(text(essay)).toContain(norm(`${c.assessment.conditions.itemNo(1)} ${snap.assessment!.items[1].conditions.items[0].text}`))
  })
  it('shows the v2 cards in spec order (§2.9)', () => {
    const order = [c.standardsHeading, c.reconstructionHeading, c.learningGoalsHeading, c.keyQuestionHeading, c.unitPlanHeading, c.lessonsHeading,
      c.materialsHeading, c.assessmentHeading, c.gradingCriteriaHeading, c.noticePlanHeading, c.generatedWithHeading]
    const at = order.map((h) => html.indexOf(`<h2 class="text-lg font-bold">${h}</h2>`))
    expect(at.every((x) => x >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
  it('등급표·피드백 틀은 문항 카드 밖의 "채점 기준" 카드 한 장에(두 문항 공통), 채점 자료 접이식 안에 둔다(2026-09-25)', () => {
    const start = html.indexOf(`<h2 class="text-lg font-bold">${c.gradingCriteriaHeading}</h2>`)
    const lastItem = html.lastIndexOf('data-print="item"')
    expect(start).toBeGreaterThan(lastItem)
    // 예전의 따로 선 등급표·피드백 틀 카드(h2)는 없다 — 채점 기준 카드 안 소제목(h3)
    expect(html).not.toContain(`<h2 class="text-lg font-bold">${c.gradeBoundariesHeading}</h2>`)
    expect(html).not.toContain(`<h2 class="text-lg font-bold">${c.feedbackTemplatesHeading}</h2>`)
    const card = html.slice(start, html.indexOf('<h2 class="text-lg font-bold">', start + 1))
    expect(card).toContain(`<h3 class="text-base font-bold">${c.gradeBoundariesHeading}</h3>`)
    expect(card).toContain(c.feedbackTemplatesHeading)
    expect(card).toMatch(/<details open="" data-print="omit"/)
    for (const b of snap.assessment!.grade_boundaries) expect(text(card)).toContain(`${b.grade} ${b.min}~${b.max} ${b.band} ${b.level_ref}`)
    for (const lv of ['상', '중', '하'] as const) expect(text(card)).toContain(norm(snap.assessment!.feedback_templates[lv]))
    // 문항 카드 안에는 등급표가 없다
    expect(html.slice(0, start)).not.toContain(c.gradeBoundariesHeading)
    // 원장 열람은 접힌 채, 채점 자료를 숨기면(showAnswers=false) 채점 기준 카드도 없다
    const teacher = render(snap, 'teacher')
    const tStart = teacher.indexOf(`<h2 class="text-lg font-bold">${c.gradingCriteriaHeading}</h2>`)
    expect(teacher.slice(tStart, teacher.indexOf('<h2 class="text-lg font-bold">', tStart + 1))).toMatch(/<details data-print="omit"/)
    const hidden = renderToStaticMarkup(createElement(PackageView, { snapshot: snap, mode: 'teacher', showAnswers: false }))
    expect(hidden).not.toContain(c.gradingCriteriaHeading)
  })
  it('each item rubric lists its scale from 0점 upward', () => {
    const cr = snap.assessment!.items[1].rubric.criteria[0]
    const at = (p: number) => t.indexOf(norm(cr.scale.find((s) => s.points === p)!.descriptor))
    for (let p = 1; p <= cr.max; p++) expect(at(p - 1)).toBeLessThan(at(p))
  })
  it('shows the reconstruction table, unit plan placement, level_ref, teacher guide grading tips and notice plan', () => {
    for (const r of snap.reconstruction_detail) expect(t).toContain(norm(r.reconstructed_text))
    for (const p of snap.unit_plan!.assessment_plan.summative_placement) expect(t).toContain(norm(c.unitPlan.placement(p.kind, p.lesson_no)))
    for (const b of snap.assessment!.grade_boundaries) expect(t).toContain(b.level_ref)
    for (const tip of snap.teacher_guide!.grading_guide.review_tips) expect(t).toContain(norm(tip))
    for (const p of snap.notice_plan!.per_lesson) expect(t).toContain(norm(p.topic_summary))
    for (const g of snap.learning_goals) expect(t).toContain(g.axis)
  })
  it('teacher mode keeps answers folded (details without open); admin shows them open', () => {
    const teacher = render(snap, 'teacher')
    expect(teacher).toContain('<summary')
    expect(teacher).not.toMatch(/<details open/)
    expect(html).toMatch(/<details open/)
    expect(teacher).not.toContain(`<h2 class="text-lg font-bold">${c.generatedWithHeading}</h2>`)
    // 접혀 있어도 내용은 있다(펼치면 보임)
    expect(text(teacher)).toContain(norm(snap.assessment!.items[0].exemplar_answers[0].text))
  })
})

// 문제지 인쇄(간단판): html.print-questions 일 때 app/globals.css 가 data-package-view 바로 아래 칸 중 data-print="keep" 만 남긴다.
describe.each(['수학', '과학'] as const)('PackageView 문제지 인쇄 표식 (%s)', (subject) => {
  const snap = snapshotFor(subject)
  const html = render(snap, 'teacher')
  const items = snap.assessment!.items
  const count = (s: string, needle: string) => s.split(needle).length - 1
  // 문항 카드 i 의 마크업(다음 문항 카드 또는 채점 기준 제목 전까지)
  const itemSegments = () => {
    const starts: number[] = []
    for (let at = html.indexOf('data-print="item"'); at >= 0; at = html.indexOf('data-print="item"', at + 1)) starts.push(at)
    const stop = html.indexOf(`<h2 class="text-lg font-bold">${c.gradingCriteriaHeading}</h2>`)
    return starts.map((s, i) => html.slice(s, starts[i + 1] ?? stop))
  }

  it('keeps exactly cover → key question → items; the separate 자료 card is dropped because every material is inside an item (no duplicates)', () => {
    expect(html.startsWith('<div data-package-view="true"')).toBe(true)
    // 데모 세트는 문항이 세트 자료를 전부 품는다(수학 A·B, 과학 B·D·E) — 따로 선 자료 칸은 인쇄에서 빠진다
    expect(new Set(items.flatMap((i) => i.materials_used))).toEqual(new Set(snap.materials.map((m) => m.id)))
    expect(count(html, 'data-print="keep"')).toBe(3)
    const keeps: number[] = []
    for (let at = html.indexOf('data-print="keep"'); at >= 0; at = html.indexOf('data-print="keep"', at + 1)) keeps.push(at)
    const cover = html.indexOf(`>${snap.cover.title}</h1>`)
    const kq = html.indexOf(`<h2 class="text-lg font-bold">${c.keyQuestionHeading}</h2>`)
    const qs = html.indexOf(`<h2 class="text-lg font-bold">${c.assessmentHeading}</h2>`)
    // 각 keep 칸 바로 안에 표지 제목·핵심질문·문항 제목이 온다
    expect([cover, kq, qs].every((x, i) => x > keeps[i] && (keeps[i + 1] === undefined || x < keeps[i + 1]))).toBe(true)
    expect(text(html)).toContain(norm(snap.key_question))
    // 자료 칸은 화면에는 그대로 있다(차시도 쓴다) — keep 이 아닐 뿐
    const mats = html.indexOf(`<h2 class="text-lg font-bold">${c.materialsHeading}</h2>`)
    expect(mats).toBeGreaterThan(-1)
    expect(html.slice(0, mats).lastIndexOf('<div data-print="keep"')).toBeLessThan(kq)
  })
  it('a material used only by lessons keeps the 자료 card on the sheet, but the item-embedded materials inside it are omitted (printed once)', () => {
    const extra = structuredClone(snap)
    extra.materials.push({ ...extra.materials[0], id: 'Z', title: '차시에서만 쓰는 자료' })
    const h = render(extra, 'teacher')
    expect(count(h, 'data-print="keep"')).toBe(4)
    const mats = h.indexOf(`<h2 class="text-lg font-bold">${c.materialsHeading}</h2>`)
    const card = h.slice(mats, h.indexOf(`<h2 class="text-lg font-bold">${c.assessmentHeading}</h2>`))
    expect(count(card, 'data-print="material"')).toBe(1)
    expect(card).toContain('data-print="material" data-material-id="Z"')
    for (const m of snap.materials) expect(card).toContain(`data-print="omit" data-material-id="${m.id}"`)
    // 인쇄되는 자료 블록 = 문항 안 상자 + 문항 밖 자료 Z — 같은 ID 가 두 번 인쇄되지 않는다
    const printed = [...h.matchAll(/data-print="(?:item-)?material" data-material-id="([A-Z])"/g)].map((m) => m[1])
    expect(printed.filter((id) => id === 'Z')).toHaveLength(1)
    const perItem = items.map((i) => i.materials_used.length).reduce((a, b) => a + b, 0)
    expect(printed).toHaveLength(perItem + 1)
  })
  it('puts the 이름·날짜 line in the cover as sheet-only', () => {
    const cover = html.slice(0, html.indexOf(`<h2 class="text-lg font-bold">${c.standardsHeading}</h2>`))
    expect(cover).toMatch(/data-print="sheet-only"><p class="student-line">/)
    expect(cover).toContain(c.print.studentLine.name)
    expect(cover).toContain(c.print.studentLine.date)
    expect(cover).toContain(`data-print="omit"`)   // 버전 배지·게시일
  })
  it('marks every item card with its embedded 자료 boxes, and hides the grading material inside item cards', () => {
    // 따로 선 자료 칸의 자료는 모두 문항 안에 있으므로 인쇄용 표식이 omit 이다
    expect(count(html, 'data-print="material"')).toBe(0)
    expect(count(html, 'data-print="item-material"')).toBe(items.reduce((a, i) => a + i.materials_used.length, 0))
    const segs = itemSegments()
    expect(segs.length).toBe(items.length)
    segs.forEach((seg, i) => {
      expect(text(seg)).toContain(norm(items[i].stem))
      for (const cd of items[i].conditions.items) expect(text(seg)).toContain(norm(`${c.assessment.conditions.itemNo(cd.no)} ${cd.text}`))
      const details = seg.match(/<details[^>]*>/g) ?? []
      expect(details.length).toBe(1)
      expect(details.every((d) => d.includes('data-print="omit"'))).toBe(true)
    })
  })
  it('gives each item a sheet-only answer space: 서술형 10 lines (6점), 논술형 20 lines, paper items a boxed note', () => {
    expect(ANSWER_LINES).toEqual({ 서술형: 10, 논술형: 20 })
    itemSegments().forEach((seg, i) => {
      const it = items[i]
      expect(seg).toMatch(/data-print="sheet-only" data-answer-kind="[^"]+" class="answer-space/)
      if (it.conditions.answer_mode === 'paper') {
        expect(seg).toContain('data-answer-kind="paper"')
        expect(seg).toContain(`<div class="answer-box">${c.print.paperBox}</div>`)
        expect(count(seg, 'data-answer-line')).toBe(0)
      } else {
        expect(seg).toContain(`data-answer-kind="${it.kind}"`)
        expect(count(seg, 'data-answer-line')).toBe(ANSWER_LINES[it.kind])
      }
    })
    expect(items.map((i) => i.kind)).toEqual(['서술형', '논술형'])
  })
  it('a synthetic paper item gets the boxed note instead of lines (no paper item in the demo sets)', () => {
    const paper = structuredClone(snap); paper.assessment!.items[0].conditions.answer_mode = 'paper'
    const seg = render(paper, 'teacher').split('data-print="item"')[1]
    expect(seg).toContain('data-answer-kind="paper"'); expect(seg).toContain(`<div class="answer-box">${c.print.paperBox}</div>`)
    expect(count(seg, 'data-answer-line')).toBe(0)
  })
})

// 문항 = 자료 + 문항 한 덩어리(대표 연수 2기 실습-2 p.18~20): 문항 카드 안, 문두 아래·조건 위에 그 문항의 자료를
// materials_used 순서대로 <자료 1>·<자료 2> 상자로 넣는다. 옛 문두("자료 B는 …")가 읽히게 상자 라벨 옆에 세트 ID를 작게.
describe.each(['수학', '과학'] as const)('PackageView 문항 안 자료 (%s)', (subject) => {
  const snap = snapshotFor(subject)
  const items = snap.assessment!.items
  const segsOf = (h: string) => {
    const starts: number[] = []
    for (let at = h.indexOf('data-print="item"'); at >= 0; at = h.indexOf('data-print="item"', at + 1)) starts.push(at)
    const stop = h.indexOf(`<h2 class="text-lg font-bold">${c.gradingCriteriaHeading}</h2>`)
    return starts.map((s, i) => h.slice(s, starts[i + 1] ?? (stop < 0 ? h.length : stop)))
  }
  it.each(['admin', 'teacher'] as const)('each item card (%s) embeds its own materials in materials_used order, labeled <자료 n> with the set ID hint, between stem and conditions', (mode) => {
    const segs = segsOf(render(snap, mode))
    expect(segs).toHaveLength(items.length)
    segs.forEach((seg, i) => {
      const it = items[i]
      const boxes = [...seg.matchAll(/data-print="item-material" data-material-id="([A-Z])" data-material-no="(\d+)"/g)].map((m) => [m[1], Number(m[2])])
      expect(boxes).toEqual(it.materials_used.map((id, k) => [id, k + 1]))
      it.materials_used.forEach((id, k) => {
        expect(text(seg)).toContain(`${c.items.materialLabel(k + 1)} ${c.items.materialHint(id)}`)
        const m = snap.materials.find((x) => x.id === id)!
        if (m.body) expect(text(seg)).toContain(norm(m.body).slice(0, 40))
        if (m.table) expect(text(seg)).toContain(norm(String(m.table.columns[0])))
      })
      // 문두 → 자료 상자 → (조건·분량) 순서
      const stemAt = text(seg).indexOf(norm(it.stem))
      const firstBox = text(seg).indexOf(c.items.materialLabel(1))
      const lengthAt = text(seg).indexOf(`${c.assessment.conditions.lengthLabel}:`)
      expect(stemAt).toBeGreaterThan(-1)
      expect(firstBox).toBeGreaterThan(stemAt)
      expect(lengthAt).toBeGreaterThan(firstBox)
    })
  })
  it('the <자료 n> numbering restarts per item and follows materials_used order, not the set letter order', () => {
    const swapped = structuredClone(snap)
    const last = swapped.assessment!.items[swapped.assessment!.items.length - 1]
    last.materials_used = [...last.materials_used].reverse()
    const seg = segsOf(render(swapped, 'admin')).at(-1)!
    const boxes = [...seg.matchAll(/data-material-id="([A-Z])" data-material-no="(\d+)"/g)].map((m) => `${m[2]}:${m[1]}`)
    expect(boxes).toEqual(last.materials_used.map((id, k) => `${k + 1}:${id}`))
  })
  it('a materials_used ID missing from the set shows a gentle note instead of crashing', () => {
    const broken = structuredClone(snap)
    broken.assessment!.items[0].materials_used = ['Q']
    const seg = segsOf(render(broken, 'admin'))[0]
    expect(text(seg)).toContain(norm(c.items.materialMissing('Q')))
    expect(text(seg)).not.toMatch(/undefined|NaN/)
  })
})

describe('PackageView on upgraded v1 data', () => {
  it('renders an upgraded v1 published snapshot (≥2 main steps, 논술형 5+35)', () => {
    const s = upgradeSnapshot({
      cover: { title: 'v1 판', subject: '수학', level: '중', grade: 1, version: 1, published_at: '2026-09-20T00:00:00.000Z' },
      standards: fx('standards-math'), intro: '', reconstruction: v1('stage2-generate').reconstruction, learning_goals: v1('stage2-generate').learning_goals,
      key_question: '자료는 무엇을 말하는가?', lessons: v1('stage3-generate').lessons, materials: v1('stage4-generate').materials,
      assessment: v1('stage5-generate'), teacher_guide: v1('stage6-generate'), generated_with: { models: ['mock'] },
    })
    const html = render(s, 'teacher')
    const t = text(html)
    expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
    for (const l of s.lessons) for (const m of l.flow.main) expect(t).toContain(norm(c.lessons.stepLabel(m.step_label, m.minutes)))
    expect(t).toContain(c.lessons.stepLabel('논술형 작성', 35))
    // 옛 판 정리(C-32, fix wave): 서술형 카드엔 "조건" 헤딩이 없고(빈 조건), 논술형 카드는 정리된 조건만 보인다
    const segs = html.split('data-print="item"').slice(1)
    expect(segs).toHaveLength(s.assessment!.items.length)
    for (const [i, item] of s.assessment!.items.entries()) {
      if (item.kind === '서술형') {
        expect(item.conditions.items).toEqual([])
        expect(text(segs[i])).not.toContain(c.assessment.conditions.heading)
      } else {
        expect(item.conditions.items.length).toBeGreaterThan(0)
        expect(text(segs[i])).toContain(c.assessment.conditions.heading)
        for (const cd of item.conditions.items) expect(text(segs[i])).toContain(norm(`${c.assessment.conditions.itemNo(cd.no)} ${cd.text}`))
        // 정리된 개수만큼만 "조건 N." 이 보인다 — 풀이 힌트 때문에 지워진 조건(v1 원문 "감축 목표를 …정하고")은 조건 목록에 없다
        expect(text(segs[i])).not.toContain(c.assessment.conditions.itemNo(item.conditions.items.length + 1))
        expect(text(segs[i])).not.toContain('감축 목표를 개수 또는 비율로 정하고')
      }
    }
  })
  it('renders a v1-shaped draft through buildSnapshot (admin preview guard)', () => {
    const s = buildSnapshot({
      theme: { title: '초안', level: '중', grade: 1, intro: null, materials: [{ id: 'A', title: '공유', kind: 'text', body: 'b', table: null, source: '자작' }] as never },
      itemSet: { subject: '수학', level: '중', grade: 1, reconstruction: 'r', reconstruction_detail: null, learning_goals: v1('stage2-generate').learning_goals, key_question: null, unit_plan: null,
        lessons: v1('stage3-generate').lessons, materials: v1('stage4-generate').materials, assessment: v1('stage5-generate'), teacher_guide: v1('stage6-generate'), notice_plan: null, stage_status: {} } as never,
      standards: [], version: 1,
    })
    expect(text(render(s, 'admin'))).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
})

describe('MaterialsSection (student lesson panel)', () => {
  it('keeps the owner layout rules: centered tables ≤560px, two-column split over 12 rows, chart ≤480px', () => {
    const snap = snapshotFor('수학')
    const html = renderToStaticMarkup(createElement(MaterialsSection, { materials: snap.materials }))
    expect(html).toContain('max-w-[560px]')
    expect(html).toContain('grid-cols-2')          // 자료 A: 20행 2열 → 반으로 나눔
    expect(html).toContain('text-center tabular-nums')
    expect(html).toMatch(/max-w-\[480px\]/)        // 자동 그래프
  })
  it('renders nothing for an empty list', () => {
    expect(renderToStaticMarkup(createElement(MaterialsSection, { materials: [] }))).toBe('')
  })
})

describe('mergedLevelRows — 묶인 성취수준은 한 줄로', () => {
  it('A·B / C·D 묶음은 한 번만, 나머지는 수준별로', async () => {
    const { mergedLevelRows } = await import('@/components/studio/PackageView')
    const rows = mergedLevelRows({ A: '가', B: '가', C: '나', D: '나', E: '다' }, [['A', 'B'], ['C', 'D']])
    expect(rows).toEqual([{ label: 'A·B', text: '가' }, { label: 'C·D', text: '나' }, { label: 'E', text: '다' }])
    expect(mergedLevelRows({ A: '가', B: '나' }, [])).toEqual([{ label: 'A', text: '가' }, { label: 'B', text: '나' }])
  })
})

describe('학년 선택(대표 2026-09-26): 표지·문제지의 학교급 표기', () => {
  it('cover with a grade keeps "중 1학년 · 수학"', () => {
    expect(text(render(snapshotFor('수학'), 'teacher'))).toContain('중 1학년 · 수학')
  })
  it('cover with null grade says "중학교(1~3학년군) · 수학" — on screen and on the print sheet (cover is kept)', () => {
    const snap = snapshotFor('수학', null)
    expect(snap.cover.grade).toBeNull()
    for (const mode of ['admin', 'teacher'] as const) {
      const html = render(snap, mode)
      const cover = html.slice(0, html.indexOf(`<h2 class="text-lg font-bold">${c.standardsHeading}</h2>`))
      expect(text(cover)).toContain('중학교(1~3학년군) · 수학')
      expect(cover).not.toContain('data-print="omit"><p class="mt-1 text-sm text-ink-500">중학교')   // 학년 줄은 인쇄에서 빠지지 않는다
      expect(text(html)).not.toMatch(/null학년|중 1학년|undefined학년/)
    }
  })
})
