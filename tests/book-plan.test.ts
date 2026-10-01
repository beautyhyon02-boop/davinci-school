// 제본용 교재 판 짜기(lib/book/plan.ts, 설계 2026-10-01): 수학·과학 mock 스냅숏과 옛 v1 판(문항 3개)에서 절이 빠짐없이 순서대로 나오고,
// 학생용 판에는 정답·해설·채점표·예시답안·발문이 구조적으로 없으며, 영어 세트는 공동 자료 대신 영어판만 싣는다.
import { describe, it, expect } from 'vitest'
import type { Snapshot } from '@/lib/studio/publish'
import { snapshotFor, v1Snapshot } from './fixtures/book'
import { buildBookPlan, substituteEnglishVersions, planRowsFor, BOOK_ANSWER_LINES, type BookPlan } from '@/lib/book/plan'
import { ANSWER_LINES } from '@/components/studio/PackageView'
import { itemMaterialLabels } from '@/lib/studio/item-materials'
import { app } from '@/content/site'
import { sharedB, sharedC, englishVersionE, noticeF } from './fixtures/english-shared'

const copy = app.book

const ids = (p: BookPlan) => p.sections.map((s) => s.id)

describe.each(['수학', '과학'] as const)('buildBookPlan (%s mock snapshot)', (subject) => {
  const snap = snapshotFor(subject)
  const student = buildBookPlan(snap, 'student')
  const teacher = buildBookPlan(snap, 'teacher')
  const teaching = snap.lessons.filter((l) => l.kind !== 'assessment')

  it('student sections: 표지 → 차례 → 이 단원에서 → 교수 차시마다 → 단원 평가 → 뒤표지 (stable ids); TOC lists the middle sections in order', () => {
    expect(ids(student)).toEqual(['cover', 'toc', 'unit', ...teaching.map((l) => `lesson-${l.no}`), 'assessment', 'back'])
    expect(student.toc.map((s) => s.id)).toEqual(['unit', ...teaching.map((l) => `lesson-${l.no}`), 'assessment'])
    expect(student.toc.map((s) => s.title)).toEqual([copy.unit.heading, ...teaching.map((l) => copy.lesson.heading(l.no, l.topic)), copy.assessment.heading])
    // 단원 평가 차시(6차시)는 차시 절이 아니라 단원 평가 절에
    expect(student.lessons.map((l) => l.no)).toEqual(teaching.map((l) => l.no))
    expect(teacher.assessment!.teacher!.session?.kind).toBe('assessment')
    expect(student.assessment!.teacher).toBeUndefined()
  })
  it('teacher sections: 표지 → 차례 → 단원 계획 → 차시마다 → 단원 평가 → 교사용 지침 → 안내장 틀', () => {
    expect(ids(teacher)).toEqual(['cover', 'toc', 'plan', ...teaching.map((l) => `lesson-${l.no}`), 'assessment', 'guide', 'notice'])
    expect(teacher.teacher!.guide).toBe(snap.teacher_guide)
    expect(teacher.teacher!.noticePlan).toBe(snap.notice_plan)
    expect(teacher.teacher!.standards).toEqual(snap.standards)
  })
  it('student plan carries no answers at all (structural): quizzes without answer/explanation/competency, tasks without expected, items without teacher part, no teacher block', () => {
    for (const l of student.lessons) {
      expect(l.teacher).toBeUndefined()
      expect(l.quiz.length).toBe(3)
      for (const q of l.quiz) expect(Object.keys(q).sort()).toEqual(['choices', 'q', 'type'])
      for (const w of l.tasks) expect(Object.keys(w).sort()).toEqual(['answer_space', 'level_ref', 'no', 'prompt', 'tier'])
    }
    for (const it of student.assessment!.items) {
      expect(it.teacher).toBeUndefined()
      expect(it.criteria.every((c) => Object.keys(c).sort().join() === 'max,name')).toBe(true)
    }
    expect(student.teacher).toBeUndefined()
    expect(student.assessment!.teacher).toBeUndefined()
    expect(JSON.stringify(student)).not.toMatch(/"(answer|explanation|expected|expected_answer|if_stuck|descriptor|rationale|level_map|evaluation_elements|translations|competency)"/)
  })
  it('teacher plan carries everything: script with expected answers, quiz answers, worksheet expected, rubric, exemplars, level_map, intent, grade table', () => {
    for (const [i, l] of teacher.lessons.entries()) {
      const src = teaching[i]
      expect(l.teacher!.script.map((q) => q.expected_answer)).toEqual(src.teacher_script.questions.map((q) => q.expected_answer))
      expect(l.quiz.map((q) => q.answer)).toEqual(src.formative_check.quiz.map((q) => q.answer))
      expect(l.tasks.map((w) => w.expected)).toEqual(src.worksheet.tasks.map((w) => w.expected))
      expect(l.teacher!.guideNotes).toEqual(snap.teacher_guide!.per_lesson.find((p) => p.no === l.no)?.notes ?? [])
    }
    for (const [i, it] of teacher.assessment!.items.entries()) {
      const src = snap.assessment!.items[i]
      expect(it.teacher!.rubric).toBe(src.rubric)
      expect(it.teacher!.exemplar_answers).toEqual(src.exemplar_answers)
      expect(it.teacher!.level_map).toEqual(src.level_map)
      expect(it.teacher!.evaluation_elements).toEqual(src.evaluation_elements)
    }
    expect(teacher.assessment!.teacher!.grade_boundaries).toEqual(snap.assessment!.grade_boundaries)
    expect(teacher.assessment!.teacher!.feedback_templates).toEqual(snap.assessment!.feedback_templates)
  })
  it('lesson materials follow materials_used; item materials carry the 문제지 <자료 n> labels in materials_used order', () => {
    for (const [i, l] of student.lessons.entries()) expect(l.materials.map((m) => m.id)).toEqual(teaching[i].materials_used)
    for (const [i, it] of student.assessment!.items.entries()) {
      const src = snap.assessment!.items[i]
      expect(it.materials.map((e) => e.label)).toEqual(itemMaterialLabels(src))
      expect(it.materials.every((e) => e.material?.id === e.label.id)).toBe(true)
    }
  })
  it('answer spaces match the 문제지 (서술형 10 lines · 논술형 20 lines; paper → null)', () => {
    expect(BOOK_ANSWER_LINES).toEqual(ANSWER_LINES)
    expect(student.assessment!.items.map((it) => it.answerLines)).toEqual(snap.assessment!.items.map((it) => ANSWER_LINES[it.kind]))
    const paper = structuredClone(snap); paper.assessment!.items[0].conditions.answer_mode = 'paper'
    expect(buildBookPlan(paper, 'student').assessment!.items[0].answerLines).toBeNull()
  })
  it('unit section lists the student-visible criteria (name + max only) per item', () => {
    expect(student.criteriaByItem.map((x) => x.itemNo)).toEqual([1, 2])
    for (const [i, x] of student.criteriaByItem.entries()) expect(x.criteria).toEqual(snap.assessment!.items[i].rubric.criteria.map((c) => ({ name: c.name, max: c.max })))
  })
  it('teacher 단원 계획 rows: 차시·주제·자료·평가/퀴즈 for every lesson including the 단원 평가 차시', () => {
    const rows = teacher.teacher!.planRows
    expect(rows.map((r) => r.no)).toEqual(snap.lessons.map((l) => l.no))
    for (const [i, r] of rows.entries()) {
      const l = snap.lessons[i]
      expect(r.topic).toBe(l.topic); expect(r.materials).toEqual(l.materials_used); expect(r.quizCount).toBe(l.formative_check.quiz.length)
      expect(r.assessment).toEqual(l.assessment)
    }
    expect(rows.at(-1)!.assessment).toEqual(['서술형', '논술형']); expect(rows.at(-1)!.quizCount).toBe(0)
    expect(planRowsFor(snap)).toEqual(rows)
  })
  it('cover carries title·subject·level·grade·version; Korean sets are not English', () => {
    expect(student.cover).toMatchObject({ title: snap.cover.title, subject, level: '중', grade: 1, version: 1 })
    expect(student.isEnglish).toBe(false); expect(student.sharedIds).toEqual([])
  })
})

describe('buildBookPlan on a legacy v1 snapshot (3 items, 논술형 차시 kind assessment)', () => {
  const snap = v1Snapshot()
  it('does not crash and keeps sections: teaching lessons as lesson sections, the 논술형 차시 folded into 단원 평가, 3 items', () => {
    for (const kind of ['student', 'teacher'] as const) {
      const p = buildBookPlan(snap, kind)
      const teaching = snap.lessons.filter((l) => l.kind !== 'assessment')
      expect(p.lessons.map((l) => l.no)).toEqual(teaching.map((l) => l.no))
      expect(p.assessment!.items).toHaveLength(3)
      expect(p.assessment!.items.map((i) => i.kind)).toEqual(['서술형', '서술형', '논술형'])
      expect(p.sections.some((s) => s.kind === 'assessment')).toBe(true)
      expect(p.sections.filter((s) => s.kind === 'lesson')).toHaveLength(teaching.length)
      if (kind === 'teacher') {
        expect(p.sections.map((s) => s.kind)).toContain('guide')
        expect(p.sections.map((s) => s.kind)).not.toContain('notice')   // v1 판에는 안내장 틀이 없다
        expect(p.teacher!.planRows).toHaveLength(snap.lessons.length)
      } else {
        expect(JSON.stringify(p)).not.toMatch(/"(answer|explanation|expected|expected_answer|if_stuck|descriptor|rationale)"/)
      }
    }
  })
  it('an empty-ish snapshot (no lessons, no assessment, no guide) still builds with cover/toc only sections', () => {
    const empty: Snapshot = { ...snap, lessons: [], assessment: null, teacher_guide: null, notice_plan: null, materials: [] }
    expect(buildBookPlan(empty, 'student').sections.map((s) => s.id)).toEqual(['cover', 'toc', 'unit', 'back'])
    expect(buildBookPlan(empty, 'teacher').sections.map((s) => s.id)).toEqual(['cover', 'toc', 'plan'])
  })
})

// S-영-09: 영어 세트는 한국어 공동 자료를 학생에게 주지 않는다 — 차시·문항이 원본(B)과 영어판(E)을 둘 다 적었으면 E 만, 원본만 적었어도 E 로.
describe('English sets: only the English version of a shared material is printed, never the Korean original', () => {
  const base = snapshotFor('수학')
  const materials = [sharedB, sharedC, englishVersionE, noticeF] as unknown as Snapshot['materials']
  it('substituteEnglishVersions: B+E → E, B alone → E, order kept, duplicates removed, non-English sets untouched', () => {
    expect(substituteEnglishVersions(['B', 'E'], materials)).toEqual(['E'])
    expect(substituteEnglishVersions(['E', 'B'], materials)).toEqual(['E'])
    expect(substituteEnglishVersions(['B'], materials)).toEqual(['E'])
    expect(substituteEnglishVersions(['F', 'B', 'C'], materials)).toEqual(['F', 'E', 'C'])
    expect(substituteEnglishVersions(['A', 'B'], base.materials)).toEqual(['A', 'B'])
    expect(substituteEnglishVersions(null, materials)).toEqual([])
  })
  it('lesson materials and item <자료 n> labels use E (not B); the plan is marked English', () => {
    const snap: Snapshot = structuredClone(base)
    snap.materials = materials
    snap.shared_material_ids = ['B', 'C']
    snap.lessons[0].materials_used = ['B', 'E']
    snap.lessons[1].materials_used = ['B']
    snap.lessons[2].materials_used = ['F', 'B']
    snap.assessment!.items[0].materials_used = ['B', 'F']
    snap.assessment!.items[1].materials_used = ['E', 'B', 'C']
    for (const kind of ['student', 'teacher'] as const) {
      const p = buildBookPlan(snap, kind)
      expect(p.isEnglish).toBe(true)
      expect(p.lessons[0].materials.map((m) => m.id)).toEqual(['E'])
      expect(p.lessons[1].materials.map((m) => m.id)).toEqual(['E'])
      expect(p.lessons[2].materials.map((m) => m.id)).toEqual(['F', 'E'])
      expect(p.assessment!.items[0].materials.map((e) => [e.label.id, e.label.no, e.label.label])).toEqual([['E', 1, app.packageView.items.materialLabel(1)], ['F', 2, app.packageView.items.materialLabel(2)]])
      expect(p.assessment!.items[1].materials.map((e) => e.label.id)).toEqual(['E', 'C'])
      // 어디에도 한국어 원본 B 는 없다
      expect(p.lessons.flatMap((l) => l.materials.map((m) => m.id))).not.toContain('B')
      expect(p.assessment!.items.flatMap((it) => it.materials.map((e) => e.label.id))).not.toContain('B')
      if (kind === 'teacher') expect(p.teacher!.planRows.slice(0, 3).map((r) => r.materials)).toEqual([['E'], ['E'], ['F', 'E']])
    }
  })
})
