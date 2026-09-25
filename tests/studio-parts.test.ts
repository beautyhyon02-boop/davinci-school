// 패키지 화면 조각(components/studio/parts/) — 원장 패키지 화면과 제작소 단계 탭이 함께 쓰는 완성본 렌더러.
// 오너 규칙(2026-09-26): 단계 탭은 요약이 아니라 학생·원장이 보는 완성본 그대로 — 표는 모든 행, 차시 카드 아래 그 차시의 교사용 지침.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MaterialsFull, MaterialsSection } from '@/components/studio/parts/MaterialsFull'
import { LessonCards } from '@/components/studio/parts/LessonCards'
import { TeacherGuideView } from '@/components/studio/parts/TeacherGuideView'
import { NoticePlanView } from '@/components/studio/parts/NoticePlanView'
import { UnitPlanView } from '@/components/studio/parts/UnitPlanView'
import { app } from '@/content/site'

const fx = (k: string) => JSON.parse(readFileSync(`data/studio-fixtures/${k}.json`, 'utf8'))
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const c = app.packageView
const count = (s: string, needle: string) => s.split(needle).length - 1
// 렌더러(React)가 글자를 이스케이프하는 방식 그대로 — 마크업 안에서 원문 위치를 찾을 때
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
/** a 뒤에 b 가 오고, 둘 사이에 블록 경계(</p> 또는 </li>)가 있다 = 같은 줄에 이어 붙지 않고 아랫줄에 있다. */
function separated(html: string, a: string, b: string) {
  const ia = html.indexOf(esc(a))
  expect(ia, a).toBeGreaterThanOrEqual(0)
  const ib = html.indexOf(esc(b), ia + esc(a).length)
  expect(ib, b).toBeGreaterThan(ia)
  expect(html.slice(ia, ib), `${a} ↔ ${b}`).toMatch(/<\/p>|<\/li>/)
}
const reEsc = (s: string) => s.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')
/** 목록 xs 가 한 줄에 하나씩(<li>…x…</li>) 있고, 이웃끼리 ' · '·' / '·', ' 로 이어 붙은 곳이 없다. */
function onePerLine(html: string, xs: string[]) {
  const t = text(html)
  for (const x of xs) expect(html, x).toMatch(new RegExp(`<li[^>]*>(?:(?!</li>).)*${reEsc(esc(x))}(?:(?!<li).)*</li>`, 's'))
  for (let i = 1; i < xs.length; i++) for (const sep of [' · ', ' / ', ', ']) expect(t).not.toContain(norm(xs[i - 1]) + sep + norm(xs[i]))
}

type Mat = { id: string; title: string; body: string | null; table: { columns: string[]; rows: (string | number)[][] } | null }
type Lesson = {
  no: number; topic: string; key_question: string; goal: string; caution_notes: string[]; materials_needed: string[]
  teacher_script: { questions: { prompt: string; expected_answer: string; if_stuck: string }[] }
  formative_check: { quiz: { q: string; answer: string; explanation: string }[] }
  worksheet: { tasks: { no: number; prompt: string; tier: string; level_ref: string }[] }
}

/** 표식 attr="id" 가 붙은 칸 한 장의 마크업(그 칸부터 같은 표식의 다음 칸 앞까지). */
function segment(html: string, attr: string, id: string | number): string {
  const start = html.indexOf(`${attr}="${id}"`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = html.indexOf(`${attr}="`, start + 1)
  return html.slice(start, next < 0 ? undefined : next)
}
const lessonSegment = (html: string, no: number) => segment(html, 'data-lesson-no', no)

describe.each(['수학', '과학'] as const)('parts (%s fixtures)', (subject) => {
  const sfx = subject === '과학' ? '-과학' : ''
  const materials: Mat[] = fx(`stage4-generate${sfx}`).materials
  const s3 = fx(`stage3-generate${sfx}`)
  const lessons: Lesson[] = s3.lessons
  const guide = fx(`stage6-generate${sfx}`)
  const notice = fx(`stage7-generate${sfx}`)

  describe('MaterialsFull', () => {
    const html = renderToStaticMarkup(createElement(MaterialsFull, { materials }))
    const t = text(html)
    it('renders every table row (no 5-row preview) and every body', () => {
      for (const m of materials) {
        const seg = segment(html, 'data-material-id', m.id)
        if (m.table) {
          expect(count(seg, '<tr class="border-b border-ink-50">')).toBe(m.table.rows.length)
          for (const row of m.table.rows) for (const cell of row) expect(text(seg)).toContain(norm(String(cell)))
        }
        if (m.body) expect(t).toContain(norm(m.body))
      }
      expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
    })
    it('draws the auto chart for chartable tables and marks shared materials only when asked', () => {
      if (subject === '수학') expect(html).toMatch(/max-w-\[480px\]/)
      expect(html).not.toContain(`>${c.materials.sharedBadge}<`)
      const shared = renderToStaticMarkup(createElement(MaterialsFull, { materials, sharedIds: [materials[0].id] }))
      expect(count(shared, `>${c.materials.sharedBadge}<`)).toBe(1)
    })
    it('MaterialsSection wraps the same list in the print-kept card', () => {
      const card = renderToStaticMarkup(createElement(MaterialsSection, { materials }))
      expect(card).toContain('data-print="keep"')
      expect(count(card, 'data-print="material"')).toBe(materials.length)
    })
  })

  describe('LessonCards', () => {
    const html = renderToStaticMarkup(createElement(LessonCards, { lessons, showAnswers: true, open: true, guide: guide.per_lesson }))
    it('renders every lesson in full: topic, goal, key question, script with expected answers, cautions, quiz answers', () => {
      const t = text(html)
      expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
      for (const l of lessons) {
        const seg = text(lessonSegment(html, l.no))
        expect(seg).toContain(norm(`${c.lessons.columns.no} ${l.no} · ${l.topic}`))
        expect(seg).toContain(norm(l.goal)); expect(seg).toContain(norm(l.key_question))
        for (const q of l.teacher_script.questions) {
          expect(seg).toContain(norm(q.prompt)); expect(seg).toContain(norm(q.expected_answer)); expect(seg).toContain(norm(q.if_stuck))
        }
        for (const n of l.caution_notes) expect(seg).toContain(norm(n))
        for (const q of l.formative_check.quiz) { expect(seg).toContain(norm(q.q)); expect(seg).toContain(norm(q.answer)); expect(seg).toContain(norm(q.explanation)) }
        for (const w of l.worksheet.tasks) expect(seg).toContain(norm(w.prompt))
      }
    })
    it('puts each lesson\'s 교사용 지침서 notes inside that lesson\'s 교사용 지침 block — and nowhere else', () => {
      for (const l of lessons) {
        const seg = lessonSegment(html, l.no)
        expect(seg).toContain('data-teacher-guide')
        expect(text(seg)).toContain(c.lessons.teacherBlockHeading)
        const mine: string[] = guide.per_lesson.find((p: { no: number }) => p.no === l.no)?.notes ?? []
        for (const n of mine) expect(text(seg)).toContain(norm(n))
        const others: string[] = guide.per_lesson.filter((p: { no: number }) => p.no !== l.no).flatMap((p: { notes: string[] }) => p.notes).filter((n: string) => !mine.includes(n))
        for (const n of others) expect(text(seg)).not.toContain(norm(n))
      }
    })
    it('without a guide there is no 지침서 메모 heading; without answers the expected answers are hidden', () => {
      const bare = renderToStaticMarkup(createElement(LessonCards, { lessons, showAnswers: false, open: false }))
      expect(bare).not.toContain(`>${c.lessons.guideNotesHeading}<`)
      // 채점 자료를 숨기면 예상 답·막힐 때·정답·해설·기대 답 줄(data-aside)이 하나도 없다 — 발문은 그대로
      expect(bare).not.toContain('data-aside=')
      expect(text(bare)).toContain(norm(lessons[0].teacher_script.questions[0].prompt))
    })
    it('발문 대본: 발문(굵게) → 아랫줄 예상 답 → 아랫줄 막힐 때 — 옆으로 잇지 않는다(오너 요청 2026-09-26)', () => {
      expect(text(html)).not.toContain(` — ${c.lessons.scriptExpected}:`)
      for (const l of lessons) {
        const seg = lessonSegment(html, l.no)
        l.teacher_script.questions.forEach((q, i) => {
          const li = seg.slice(seg.indexOf(`data-script-question="${i + 1}"`))
          const one = li.slice(0, li.indexOf('</li>'))
          expect(one).toContain(`<p data-script-prompt="true" class="font-semibold">${esc(q.prompt)}</p>`)
          expect(one).toMatch(new RegExp(`<p data-aside="expected"[^>]*><span class="font-semibold">${c.lessons.scriptExpected}</span> `))
          expect(one).toMatch(new RegExp(`<p data-aside="stuck"[^>]*><span class="font-semibold">${c.lessons.scriptStuck}</span> `))
          expect(one.indexOf(esc(q.prompt))).toBeLessThan(one.indexOf(esc(q.expected_answer)))
          expect(one.indexOf(esc(q.expected_answer))).toBeLessThan(one.indexOf(esc(q.if_stuck)))
          separated(one, q.prompt, q.expected_answer)
          separated(one, q.expected_answer, q.if_stuck)
          expect(text(one)).not.toContain(norm(`${q.expected_answer} · `))
        })
        onePerLine(seg, l.teacher_script.questions.map((q) => q.prompt))
        onePerLine(seg, l.caution_notes)
      }
    })
    it('퀴즈: 문제(굵게) / 정답 / 해설을 세 줄로, 퀴즈 수준은 한 줄에 하나씩', () => {
      expect(text(html)).not.toContain(`${c.lessons.quiz.answerLabel}: `)
      for (const l of lessons) {
        const seg = lessonSegment(html, l.no)
        const quiz = l.formative_check.quiz as { q: string; answer: string; explanation: string; level_ref?: string }[]
        quiz.forEach((q, i) => {
          const li = seg.slice(seg.indexOf(`data-quiz-answer="${i + 1}"`))
          const one = li.slice(0, li.indexOf('</li>'))
          expect(one).toContain(`<p class="font-semibold">${esc(q.q)}</p>`)
          separated(one, q.q, q.answer)
          separated(one, q.answer, q.explanation)
          expect(one).toContain('data-aside="answer"'); expect(one).toContain('data-aside="explanation"')
        })
        onePerLine(seg, quiz.map((q) => q.q))
        if (quiz.some((q) => q.level_ref)) {
          const levels = seg.slice(seg.indexOf('data-quiz-levels'))
          onePerLine(levels.slice(0, levels.indexOf('</ul>') + 5), quiz.map((q, i) => c.lessons.quizLevel(i + 1, q.level_ref)))
        }
      }
    })
    it('활동지: 층(기본/표준/도전)마다 이름표 + 한 줄에 한 과제, 기대 답은 과제 아랫줄; 자료·준비물·흐름도 한 줄에 하나씩', () => {
      for (const l of lessons) {
        const seg = lessonSegment(html, l.no)
        const tasks = l.worksheet.tasks as { no: number; prompt: string; tier: string; level_ref: string; expected?: string }[]
        for (const w of tasks) {
          expect(seg).toContain(`data-worksheet-tier="${esc(c.lessons.worksheetTier(w.tier, w.level_ref))}"`)
          expect(seg).toContain(`<li value="${w.no}">${esc(w.prompt)}</li>`)
          if (w.expected) {
            const li = seg.slice(seg.indexOf(`data-worksheet-answer="${w.no}"`))
            separated(li.slice(0, li.indexOf('</li>')), w.prompt, w.expected)
          }
        }
        onePerLine(seg, tasks.map((w) => w.prompt))
        onePerLine(seg, l.materials_needed)
        const full = s3.lessons.find((x: { no: number }) => x.no === l.no)
        onePerLine(seg, (full.materials_used as string[]).map((id) => `${c.materials.idLabel} ${id}`))
        onePerLine(seg, full.flow.intro); onePerLine(seg, full.flow.wrapup)
        for (const m of full.flow.main) onePerLine(seg, m.activities)
        // 주제가 굵은 제목 줄, 핵심질문·목표는 각자 한 줄
        expect(seg).toContain(`<h3 class="text-base font-bold">${esc(`${c.lessons.columns.no} ${l.no} · ${l.topic}`)}</h3>`)
        separated(seg, l.key_question, l.goal)
      }
    })
    it('reads loosely: a hand-edited lesson with missing fields renders without crashing or leaking undefined', () => {
      const html2 = renderToStaticMarkup(createElement(LessonCards, { lessons: [{ no: 1, topic: '주제만 있는 차시' }], showAnswers: true, open: true }))
      expect(text(html2)).toContain('주제만 있는 차시')
      expect(text(html2)).not.toMatch(/undefined|NaN|\[object Object\]/)
    })
  })

  describe('TeacherGuideView', () => {
    const html = renderToStaticMarkup(createElement(TeacherGuideView, { guide, lessons }))
    const t = text(html)
    it('shows the whole guide: general, glossary, grading tips, retry guidance and per-lesson notes labelled with the lesson topic', () => {
      expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
      expect(t).toContain(norm(guide.general.purpose))
      for (const g of guide.glossary) expect(t).toContain(norm(g.term))
      for (const tip of guide.grading_guide.review_tips) expect(t).toContain(norm(tip))
      expect(t).toContain(norm(guide.grading_guide.retry_guidance))
      for (const p of guide.per_lesson.filter((x: { notes: string[] }) => x.notes.length > 0)) {
        const topic = lessons.find((l) => l.no === p.no)!.topic
        const seg = segment(html, 'data-guide-lesson', p.no)
        expect(text(seg)).toContain(norm(c.teacherGuide.lessonWithTopic(p.no, topic)))
        for (const n of p.notes) expect(text(seg)).toContain(norm(n))
      }
    })
  })

  describe('TeacherGuideView — 한 줄에 하나씩', () => {
    const html = renderToStaticMarkup(createElement(TeacherGuideView, { guide, lessons }))
    it('준비물·생략 활동·검수 팁·용어는 한 줄에 하나, 흔한 오답의 읽는 법은 아랫줄', () => {
      onePerLine(html, guide.general.materials)
      for (const m of guide.merge_guide) onePerLine(html, m.skip_activities)
      onePerLine(html, guide.grading_guide.review_tips)
      for (const e of guide.grading_guide.common_errors) separated(html, e.error, e.how_to_read)
      for (const g of guide.glossary) separated(html, g.term, g.explanation)
    })
  })

  describe('NoticePlanView', () => {
    const t = text(renderToStaticMarkup(createElement(NoticePlanView, { plan: notice })))
    it('shows every lesson block and the disclaimer', () => {
      expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
      for (const p of notice.per_lesson) {
        expect(t).toContain(norm(p.topic_summary)); expect(t).toContain(norm(p.preview)); expect(t).toContain(norm(p.home_study_suggestion))
      }
      expect(t).toContain(norm(notice.footer_disclaimer))
    })
    it('오답 코멘트·요소별 문구는 한 줄에 하나씩(\' / \' 로 잇지 않음)', () => {
      const html = renderToStaticMarkup(createElement(NoticePlanView, { plan: notice }))
      for (const p of notice.per_lesson) {
        const seg = segment(html, 'data-notice-lesson', p.lesson_no)
        onePerLine(seg, p.quiz_notes.map((q: { wrong_note: string }) => q.wrong_note))
        for (const cp of p.criteria_phrases ?? []) { onePerLine(seg, cp.good); onePerLine(seg, cp.improve) }
      }
      expect(notice.per_lesson.some((p: { criteria_phrases: unknown[] | null }) => (p.criteria_phrases?.length ?? 0) > 0)).toBe(true)
    })
  })

  describe('UnitPlanView', () => {
    it('shows the lesson map and the 서·논술형 placement', () => {
      const t = text(renderToStaticMarkup(createElement(UnitPlanView, { plan: s3.unit_plan })))
      for (const p of s3.unit_plan.assessment_plan.summative_placement) expect(t).toContain(norm(c.unitPlan.placement(p.kind, p.lesson_no)))
      for (const l of s3.unit_plan.lesson_map) expect(t).toContain(norm(c.unitPlan.lessonMapItem(l.lesson_no, l.topic)))
    })
    it('차시 구성·서·논술형 배치·종합 도달 모습은 한 줄에 하나씩', () => {
      const html = renderToStaticMarkup(createElement(UnitPlanView, { plan: s3.unit_plan }))
      onePerLine(html, s3.unit_plan.lesson_map.map((l: { lesson_no: number; topic: string }) => c.unitPlan.lessonMapItem(l.lesson_no, l.topic)))
      onePerLine(html, s3.unit_plan.assessment_plan.summative_placement.map((p: { kind: string; lesson_no: number }) => c.unitPlan.placement(p.kind, p.lesson_no)))
      onePerLine(html, (['상', '중', '하'] as const).map((lv) => s3.unit_plan.assessment_plan.rubric_note[lv]))
    })
  })
})

describe('parts are client-safe', () => {
  it('no part imports the fs-backed levels module or node built-ins, and none takes function props', () => {
    const dir = 'components/studio/parts'
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'))
    expect(files.sort()).toEqual(['LessonCards.tsx', 'MaterialsFull.tsx', 'NoticePlanView.tsx', 'TeacherGuideView.tsx', 'UnitPlanView.tsx', 'common.tsx'])
    for (const f of files) {
      const src = readFileSync(`${dir}/${f}`, 'utf8')
      expect(src, f).not.toMatch(/from '@\/lib\/reference\/levels'/)
      expect(src, f).not.toMatch(/from 'node:|from 'fs'|from '@\/lib\/supabase/)
      expect(src, f).not.toMatch(/from '[^']*PackageView'/)
    }
  })
})
