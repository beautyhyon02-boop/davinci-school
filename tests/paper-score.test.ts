// 종이 답안 점수 입력(설계 2026-09-29 §4.2, R-5): 순수 계산(manual.ts), 저장(paper-score.ts, 가짜 클라이언트), 화면(서버 렌더).
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { buildManualCriteria, manualTotal, canEnterPaperScore, isManualGrading, MANUAL_MODEL } from '@/lib/classroom/manual'
import { savePaperScore } from '@/lib/classroom/paper-score'
import { overallFor } from '@/lib/classroom/scoring'
import { buildNoticeSkeleton } from '@/lib/classroom/notice'
import { upgradeSnapshot } from '@/lib/studio/publish'
import { sortScale } from '@/lib/studio/scale'
import { memoryDb } from './fixtures/fake-db'

vi.mock('@/app/teacher/assignments/[setId]/actions', () => ({ enterPaperScore: vi.fn(), confirmGrading: vi.fn(), reopenGrading: vi.fn(), requestRegrade: vi.fn(), regradeAi: vi.fn() }))
const { PaperScoreForm } = await import('@/app/teacher/assignments/[setId]/PaperScoreForm')
const { ReviewCard } = await import('@/app/teacher/assignments/[setId]/ReviewCard')
const { ResultView } = await import('@/app/student/assignments/[id]/ResultView')
const { app } = await import('@/content/site')
const copy = app.classroom.review

const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const rawSnapshot = { schema_version: 2, cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, lessons: [], materials: [], standards: [], intro: '', reconstruction: '', learning_goals: [], key_question: '', assessment, teacher_guide: null, generated_with: { models: [] } }
const snapshot = upgradeSnapshot(rawSnapshot)
const item1 = snapshot.assessment!.items[0]
const rubric1 = item1.rubric.criteria as { name: string; max: number; scale: { points: number; descriptor: string }[] }[]
const fullPoints = rubric1.map((c) => c.max)
const NOW = '2026-09-29T05:00:00.000Z'
const MARKER = copy.paper.marker
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ')

describe('buildManualCriteria · manualTotal · canEnterPaperScore', () => {
  const rubric = { criteria: [{ name: '자료 해석', max: 2 }, { name: '근거 제시', max: 4 }] }
  it('builds the confirmed shape in rubric order with empty evidence', () => {
    expect(buildManualCriteria(rubric, [1, 4])).toEqual({
      criteria: [{ name: '자료 해석', points: 1, max: 2, evidence: '', note: '' }, { name: '근거 제시', points: 4, max: 4, evidence: '', note: '' }],
      score: 5,
    })
    expect(buildManualCriteria(rubric, [0, 0])?.score).toBe(0)
  })
  it('rejects a wrong count, out-of-range, non-integer or non-number points', () => {
    for (const bad of [[1], [1, 2, 3], [3, 0], [-1, 0], [1.5, 0], ['1', 0], [null, 0], 'x', null, undefined]) expect(buildManualCriteria(rubric, bad)).toBeNull()
    expect(buildManualCriteria({ criteria: [] }, [])).toBeNull()
  })
  it('manualTotal updates as scores are chosen and knows when every criterion has one', () => {
    expect(manualTotal([null, null])).toEqual({ total: 0, complete: false })
    expect(manualTotal([2, null])).toEqual({ total: 2, complete: false })
    expect(manualTotal([2, 0])).toEqual({ total: 2, complete: true })
    expect(manualTotal([])).toEqual({ total: 0, complete: false })
  })
  it('paper entry is offered only where no submitted answer exists (or a teacher answer lost its grading)', () => {
    expect(canEnterPaperScore(null, false)).toBe(true)
    expect(canEnterPaperScore({ submitted_at: null, source: 'student' }, false)).toBe(true)      // 임시저장만
    expect(canEnterPaperScore({ submitted_at: NOW, source: 'student' }, false)).toBe(false)
    expect(canEnterPaperScore({ submitted_at: NOW, source: 'student' }, true)).toBe(false)
    expect(canEnterPaperScore({ submitted_at: NOW, source: 'teacher' }, true)).toBe(false)
    expect(canEnterPaperScore({ submitted_at: NOW, source: 'teacher' }, false)).toBe(true)       // 지난 저장이 중간에 실패
  })
  it('isManualGrading reads the model column', () => {
    expect(isManualGrading({ model: MANUAL_MODEL })).toBe(true)
    expect(isManualGrading({ model: 'mock' })).toBe(false)
    expect(isManualGrading({ model: null })).toBe(false)
    expect(isManualGrading(null)).toBe(false)
  })
})

describe('savePaperScore (가짜 DB)', () => {
  const teacher = { userId: 't1', academyId: 'ac1' }
  const tables = (extra: Record<string, Record<string, unknown>[]> = {}) => ({
    assignments: [{ id: 'as1', item_set_id: 'set', item_set_version: 1, academy_id: 'ac1' }, { id: 'other', item_set_id: 'set', item_set_version: 1, academy_id: 'ac2' }],
    item_set_versions: [{ item_set_id: 'set', version: 1, snapshot: rawSnapshot }],
    answers: [], gradings: [], ...extra,
  })
  const call = (db: ReturnType<typeof memoryDb>, over: Record<string, unknown> = {}, admin: ReturnType<typeof memoryDb> = db) =>
    savePaperScore({ db: db as never, admin: admin as never, teacher, assignmentId: 'as1', itemNo: 1, points: fullPoints, comment: '  잘 썼어요  ', marker: MARKER, now: NOW, ...over })

  it('stores a submitted teacher answer and a confirmed manual grading, with no AI columns', async () => {
    const db = memoryDb(tables())
    const r = await call(db)
    expect(r).toMatchObject({ ok: true, score: item1.points })
    expect(db.tables.answers).toEqual([expect.objectContaining({ assignment_id: 'as1', item_no: 1, attempt: 1, body: MARKER, source: 'teacher', entered_by: 't1', submitted_at: NOW })])
    const g = db.tables.gradings[0]
    expect(g).toMatchObject({ answer_id: db.tables.answers[0].id, academy_id: 'ac1', status: 'confirmed', model: 'manual', final_score: item1.points, confirmed_by: 't1', confirmed_at: NOW, updated_at: NOW, teacher_comment: '잘 썼어요', final_strengths: [], final_improvements: [] })
    expect(g.final_criteria).toEqual(rubric1.map((c) => ({ name: c.name, points: c.max, max: c.max, evidence: '', note: '' })))
    for (const k of ['ai_criteria', 'ai_score', 'ai_strengths', 'ai_improvements', 'input_tokens', 'output_tokens']) expect(g).not.toHaveProperty(k)
  })
  it('the grading row is written with the admin client; the answer with the teacher client', async () => {
    const db = memoryDb(tables()); const admin = memoryDb({ gradings: [] })
    expect((await call(db, {}, admin)).ok).toBe(true)
    expect(db.writes.map((w) => `${w.op}:${w.table}`)).toEqual(['insert:answers'])
    expect(admin.writes.map((w) => `${w.op}:${w.table}`)).toEqual(['insert:gradings'])
  })
  it("another academy's assignment is refused before anything is written", async () => {
    const db = memoryDb(tables())
    expect(await call(db, { assignmentId: 'other' })).toEqual({ ok: false, reason: 'forbidden' })
    expect(await call(db, { assignmentId: 'nope' })).toEqual({ ok: false, reason: 'forbidden' })
    expect(db.writes).toEqual([])
  })
  it('bad item number or bad scores write nothing', async () => {
    const db = memoryDb(tables())
    expect(await call(db, { itemNo: 9 })).toEqual({ ok: false, reason: 'bad-item' })
    expect(await call(db, { itemNo: 0 })).toEqual({ ok: false, reason: 'bad-item' })
    expect(await call(db, { points: fullPoints.map((p) => p + 1) })).toEqual({ ok: false, reason: 'bad-score' })
    expect(await call(db, { points: fullPoints.slice(1) })).toEqual({ ok: false, reason: 'bad-score' })
    expect(db.writes).toEqual([])
  })
  it('a student-submitted answer is never overwritten', async () => {
    const db = memoryDb(tables({ answers: [{ id: 'an1', assignment_id: 'as1', item_no: 1, attempt: 1, body: '학생 글', source: 'student', submitted_at: NOW }] }))
    expect(await call(db)).toEqual({ ok: false, reason: 'already-submitted' })
    expect(db.tables.answers[0].body).toBe('학생 글')
    expect(db.writes).toEqual([])
  })
  it('an unsubmitted student draft row becomes the paper answer row (one row per item·attempt)', async () => {
    const db = memoryDb(tables({ answers: [{ id: 'an1', assignment_id: 'as1', item_no: 1, attempt: 1, body: '쓰다 만 글', source: 'student', submitted_at: null }] }))
    expect((await call(db)).ok).toBe(true)
    expect(db.tables.answers).toHaveLength(1)
    expect(db.tables.answers[0]).toMatchObject({ id: 'an1', body: MARKER, source: 'teacher', submitted_at: NOW })
    expect(db.tables.gradings[0]).toMatchObject({ answer_id: 'an1', status: 'confirmed', model: 'manual' })
  })
  it('if the grading insert failed last time, saving again only adds the grading row', async () => {
    const failing = memoryDb(tables(), { failOn: ['insert:gradings'] })
    expect(await call(failing)).toEqual({ ok: false, reason: 'save-failed' })
    expect(failing.tables.answers).toHaveLength(1)
    const db = memoryDb({ ...failing.tables })
    expect((await call(db, { points: fullPoints.map(() => 0), comment: '' })).ok).toBe(true)
    expect(db.tables.answers).toHaveLength(1)
    expect(db.tables.gradings).toHaveLength(1)
    expect(db.tables.gradings[0]).toMatchObject({ final_score: 0, teacher_comment: null })
  })
  it('a paper answer that already has its grading is changed through re-open, not through a second entry', async () => {
    const db = memoryDb(tables())
    expect((await call(db)).ok).toBe(true)
    expect(await call(db)).toEqual({ ok: false, reason: 'already-submitted' })
    expect(db.tables.gradings).toHaveLength(1)
  })
})

describe('확정 채점으로 똑같이 읽힌다', () => {
  const manualCriteria = buildManualCriteria(item1.rubric, fullPoints)!
  it('set total counts the manual score like any confirmed score', () => {
    const items = snapshot.assessment!.items
    const finals = items.map((it, i) => (i === 0 ? manualCriteria.score : it.points))
    expect(overallFor(items, finals)).toEqual({ total: items.reduce((s, it) => s + it.points, 0), max: items.reduce((s, it) => s + it.points, 0), complete: true })
  })
  it('the notice skeleton takes a manual grading (empty evidence) as an essay result', () => {
    const lessonNo = item1.lesson_no ?? 1
    const withLesson = { ...snapshot, lessons: [{ no: lessonNo, key_question: 'q', goal: 'g', topic: 't', formative_check: { quiz: [] } }] } as never
    const built = buildNoticeSkeleton({
      snapshot: withLesson, lessonNo, studentName: '김하늘', date: '2026-09-29', quiz: [],
      gradings: [{ item_no: 1, attempt: 1, final_score: manualCriteria.score, final_criteria: manualCriteria.criteria, status: 'confirmed', confirmed_at: NOW }],
    })
    expect(built.skeleton.essay_results).toHaveLength(1)
    expect(built.skeleton.essay_results[0]).toMatchObject({ confirmed_score: manualCriteria.score, total_points: item1.points })
    expect(built.skeleton.essay_results[0].criteria_feedback.map((c) => c.criterion_name)).toEqual(rubric1.map((c) => c.name))
  })
})

describe('화면', () => {
  const paperRubric = rubric1.map((c) => ({ name: c.name, max: c.max, scale: sortScale(c.scale).map((s) => ({ points: s.points, descriptor: s.descriptor })) }))
  const answer = { id: 'an1', assignment_id: 'as1', item_no: 1, attempt: 1, body: MARKER, source: 'teacher' as const, photo_path: null, saved_at: NOW, submitted_at: NOW }
  const manual = buildManualCriteria(item1.rubric, fullPoints)!
  const grading = (status: 'confirmed' | 'drafted') => ({
    id: 'g1', answer_id: 'an1', status, ai_criteria: null, ai_score: null, ai_strengths: null, ai_improvements: null, model: 'manual', error: null,
    final_criteria: manual.criteria, final_score: manual.score, final_strengths: [], final_improvements: [], teacher_comment: null, adjust_note: null,
    confirmed_at: status === 'confirmed' ? NOW : null, updated_at: NOW, regrade_requested: false,
  })

  it('PaperScoreForm starts collapsed: only the label and the open link', () => {
    const html = renderToStaticMarkup(createElement(PaperScoreForm, { assignmentId: 'as1', itemNo: 1, label: '서술형', points: item1.points, rubric: paperRubric }))
    expect(text(html)).toContain(copy.paper.open)
    expect(html).not.toContain('type="radio"')
  })
  it('PaperScoreForm (editing): each criterion in bold with one radio per scale row, the total and the save button', () => {
    const html = renderToStaticMarkup(createElement(PaperScoreForm, { assignmentId: 'as1', itemNo: 1, label: '서술형', points: item1.points, rubric: paperRubric, edit: { gradingId: 'g1', points: fullPoints, comment: '' } }))
    const t = text(html)
    expect(html.split('type="radio"').length - 1).toBe(paperRubric.reduce((s, c) => s + c.scale.length, 0))
    for (const c of paperRubric) {
      expect(t).toContain(c.name)
      expect(t).toContain(copy.paper.scaleLine(0, c.scale[0].descriptor))
    }
    expect(t).toContain(copy.paper.total(item1.points, item1.points))
    expect(t).toContain(copy.paper.save)
    expect(t).not.toContain(copy.regrade)
    expect(html.split('checked=""').length - 1).toBe(paperRubric.length)
  })
  it('ReviewCard for a manual grading never offers AI regrade; confirmed shows the score and the paper badge', () => {
    const confirmed = text(renderToStaticMarkup(createElement(ReviewCard, { item: { itemNo: 1, label: '서술형', points: item1.points, answer, grading: grading('confirmed') } })))
    expect(confirmed).toContain(copy.paper.badge)
    expect(confirmed).toContain(`${manual.score}/${item1.points}`)
    const drafted = text(renderToStaticMarkup(createElement(ReviewCard, { item: { itemNo: 1, label: '서술형', points: item1.points, answer, grading: grading('drafted') } })))
    expect(drafted).toContain(MARKER)
    expect(drafted).not.toContain(copy.regrade)
    expect(drafted).not.toContain(copy.requestRegrade)
    expect(drafted).not.toContain(`${copy.evidence}:`)
    expect(drafted).not.toContain(copy.aiDraft)
  })
  it('student ResultView shows the confirmed manual score without empty evidence, strengths or improvements headings', () => {
    const rc = app.classroom.student.result
    const t = text(renderToStaticMarkup(createElement(ResultView, { label: '논술형', points: 16, attempt: 1, grading: { answer_id: 'an1', final_criteria: [{ name: '주장', points: 3, max: 4, evidence: '', note: '' }, { name: '근거', points: 2, max: 4, evidence: '', note: '' }], final_score: 5, final_strengths: [], final_improvements: [], teacher_comment: null } })))
    expect(t).toContain(rc.score(5, 16))
    expect(t).toContain('주장 3/4')
    expect(t).not.toContain(rc.evidence)
    expect(t).not.toContain(rc.strengths)
    expect(t).not.toContain(rc.improvements)
  })
})

describe('순수 모듈', () => {
  it('manual.ts imports no supabase/server/AI code (the browser form imports it)', () => {
    const code = readFileSync('lib/classroom/manual.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/supabase|server-only|next\/|@\/lib\/ai|\.\/grade/)
    expect(code).not.toMatch(/[가-힣]/)
  })
})
