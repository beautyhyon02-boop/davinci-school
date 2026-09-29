// 고침 라운드(2026-09-29): 빈칸 채우기는 고른 학생만, 열지 않은 차시에는 O/X 를 넣지 않음, 확인 풀기 실패 구분, 학생의 늦은 퀴즈 제출.
// lib 는 가짜 DB 로, 서버 액션은 세션·클라이언트 모듈을 가짜로 바꿔 부른다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fillCandidates } from '@/lib/classroom/quiz-finalize'
import { applyQuizCell, fillSelectedCorrect, unfinalize, loadFinalizations, releaseAfterStudentQuiz, isMissingTable } from '@/lib/classroom/quiz-entry'
import { hasUnsentDraft } from '@/lib/classroom/manual'
import { memoryDb } from './fixtures/fake-db'

const NOW = '2026-09-29T03:00:00.000Z'
const state: { session: Record<string, unknown>; db: ReturnType<typeof memoryDb>; admin: ReturnType<typeof memoryDb> } = { session: {}, db: memoryDb({}), admin: memoryDb({}) }
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSessionProfile: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => state.db) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.admin }))
vi.mock('@/lib/ai/claude', () => ({ callStructured: vi.fn() }))

const { app } = await import('@/content/site')
const rev = app.classroom.review.errors

const quiz = (answer: string) => ({ type: 'short', question: '문제', answer, choices: null, explanation: '풀이' })
const lesson = (no: number) => ({ no, key_question: 'q', goal: 'g', topic: 't', formative_check: { quiz: [quiz('6'), quiz('7')] } })
const snapshot = { schema_version: 2, cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, lessons: [lesson(1), lesson(2), lesson(3)], materials: [], standards: [], intro: '', reconstruction: '', learning_goals: [], key_question: '', assessment: null, teacher_guide: null, generated_with: { models: [] } }
const asg = (id: string, open_lessons: number, over: Record<string, unknown> = {}) => ({ id, item_set_id: 'set', item_set_version: 1, academy_id: 'ac1', student_id: `st-${id}`, open_lessons, closed: false, ...over })
const tables = (extra: Record<string, Record<string, unknown>[]> = {}) => ({
  assignments: [asg('a1', 3), asg('a2', 3), asg('a3', 1), asg('x1', 3, { academy_id: 'ac2' }), asg('y1', 3, { item_set_id: 'other-set' })],
  item_set_versions: [{ item_set_id: 'set', version: 1, snapshot }],
  quiz_responses: [] as Record<string, unknown>[],
  quiz_finalizations: ['a1', 'a2', 'a3', 'x1', 'y1'].map((id) => ({ id: `f-${id}`, assignment_id: id, lesson_no: 2, finalized_at: NOW })),
  ...extra,
})
const teacherRows = (db: ReturnType<typeof memoryDb>) => db.tables.quiz_responses.filter((r) => r.source === 'teacher').map((r) => `${r.assignment_id}:${r.lesson_no}:${r.quiz_no}:${r.correct ? 'O' : 'X'}`)

let quiet: ReturnType<typeof vi.spyOn>
beforeEach(() => { quiet = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { quiet.mockRestore() })

describe('fillCandidates — 고를 수 있는 학생', () => {
  const students = [{ assignmentId: 'a1', openLessons: 3 }, { assignmentId: 'a2', openLessons: 2 }, { assignmentId: 'a3', openLessons: 1 }]
  it('keeps only students whose lesson is open, in the given order', () => {
    expect(fillCandidates(2, students)).toEqual(['a1', 'a2'])
    expect(fillCandidates(3, students)).toEqual(['a1'])
    expect(fillCandidates(4, students)).toEqual([])
  })
  it('and, when given, only those who still have an empty cell', () => {
    expect(fillCandidates(1, students, ['a3', 'a2'])).toEqual(['a2', 'a3'])
    expect(fillCandidates(2, students, ['a3', 'a2'])).toEqual(['a2'])
    expect(fillCandidates(1, students, [])).toEqual([])
  })
})

describe('fillSelectedCorrect (가짜 DB)', () => {
  const args = (assignmentIds: unknown) => ({ academyId: 'ac1', setId: 'set', assignmentIds, lesson: { no: 2, quizCount: 2 }, userId: 't1', now: NOW })
  it('fills only the chosen students; the unchosen (absent) student stays empty and stays finalised', async () => {
    const db = memoryDb(tables())
    expect(await fillSelectedCorrect(db as never, args(['a1']))).toEqual({ ok: true, unfinalized: true, filled: 2 })
    expect(teacherRows(db)).toEqual(['a1:2:1:O', 'a1:2:2:O'])
    expect(db.tables.quiz_finalizations.map((f) => f.assignment_id)).toEqual(['a2', 'a3', 'x1', 'y1'])
  })
  it('skips a chosen student whose lesson is not open yet', async () => {
    const db = memoryDb(tables())
    expect(await fillSelectedCorrect(db as never, args(['a3', 'a2']))).toMatchObject({ ok: true, filled: 2 })
    expect(teacherRows(db)).toEqual(['a2:2:1:O', 'a2:2:2:O'])
    expect(db.tables.quiz_finalizations.map((f) => f.assignment_id)).toContain('a3')
  })
  it("ignores ids of another academy, another set, or no assignment at all", async () => {
    const db = memoryDb(tables())
    expect(await fillSelectedCorrect(db as never, args(['x1', 'y1', 'nope']))).toEqual({ ok: true, unfinalized: false, filled: 0 })
    expect(db.writes).toEqual([])
    expect(await fillSelectedCorrect(db as never, args(['x1', 'a1', 'a1']))).toMatchObject({ ok: true, filled: 2 })
    expect(teacherRows(db)).toEqual(['a1:2:1:O', 'a1:2:2:O'])
  })
  it('an empty or malformed selection writes nothing', async () => {
    const db = memoryDb(tables())
    for (const bad of [[], null, undefined, 'a1', [1, null, '']]) expect(await fillSelectedCorrect(db as never, args(bad))).toEqual({ ok: false, reason: 'not-allowed' })
    expect(db.writes).toEqual([])
  })
  it('leaves existing answers alone', async () => {
    const db = memoryDb(tables({ quiz_responses: [{ assignment_id: 'a1', lesson_no: 2, quiz_no: 1, response: '5', correct: false, source: 'student' }] }))
    expect(await fillSelectedCorrect(db as never, args(['a1']))).toMatchObject({ ok: true, filled: 1 })
    expect(db.tables.quiz_responses.find((r) => r.quiz_no === 1)).toMatchObject({ response: '5', correct: false, source: 'student' })
  })
  it('the O rows are written but the release failed → unfinalize-failed', async () => {
    const db = memoryDb(tables(), { failOn: ['delete:quiz_finalizations'] })
    expect(await fillSelectedCorrect(db as never, args(['a1']))).toEqual({ ok: false, reason: 'unfinalize-failed' })
    expect(teacherRows(db)).toEqual(['a1:2:1:O', 'a1:2:2:O'])
    expect(db.tables.quiz_finalizations).toHaveLength(5)
  })
})

describe('applyQuizCell — 열지 않은 차시', () => {
  const base = { assignment_id: 'a3', lesson_no: 2, quiz_no: 1, quizType: 'short' as const, userId: 't1', now: NOW }
  it('refuses a new O/X in an empty cell of a lesson that is not open, and writes nothing', async () => {
    const db = memoryDb(tables())
    expect(await applyQuizCell(db as never, { ...base, target: 'O', lessonOpen: false })).toEqual({ ok: false, reason: 'not-open' })
    expect(db.writes).toEqual([])
    expect(db.tables.quiz_finalizations).toHaveLength(5)
  })
  it('a row that is already there can still be changed and removed (undoing an earlier wrong fill)', async () => {
    const db = memoryDb(tables({ quiz_responses: [{ assignment_id: 'a3', lesson_no: 2, quiz_no: 1, response: '', correct: true, source: 'teacher' }] }))
    expect((await applyQuizCell(db as never, { ...base, target: 'X', lessonOpen: false })).ok).toBe(true)
    expect((await applyQuizCell(db as never, { ...base, target: 'empty', lessonOpen: false })).ok).toBe(true)
    expect(db.tables.quiz_responses).toEqual([])
  })
  it('an open lesson (or no flag) works as before', async () => {
    const db = memoryDb(tables())
    expect(await applyQuizCell(db as never, { ...base, target: 'O', lessonOpen: true })).toEqual({ ok: true, unfinalized: true })
    expect(await applyQuizCell(db as never, { ...base, quiz_no: 2, target: 'X' })).toEqual({ ok: true, unfinalized: false })
  })
  it('the O/X is saved but the release failed → unfinalize-failed, the row stays', async () => {
    const db = memoryDb(tables(), { failOn: ['delete:quiz_finalizations'] })
    expect(await applyQuizCell(db as never, { ...base, assignment_id: 'a1', target: 'O' })).toEqual({ ok: false, reason: 'unfinalize-failed' })
    expect(teacherRows(db)).toEqual(['a1:2:1:O'])
  })
})

describe('unfinalize · loadFinalizations — 표 없음과 다른 오류', () => {
  it('isMissingTable: PGRST205, 42P01 or a message about the relation / schema cache', () => {
    expect(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.quiz_finalizations' in the schema cache" })).toBe(true)
    expect(isMissingTable({ code: '42P01', message: 'relation "quiz_finalizations" does not exist' })).toBe(true)
    expect(isMissingTable({ message: 'relation "public.quiz_finalizations" does not exist' })).toBe(true)
    expect(isMissingTable({ message: "Could not find the table 'public.quiz_finalizations' in the schema cache" })).toBe(true)
    expect(isMissingTable({ code: '42501', message: 'permission denied for table quiz_finalizations' })).toBe(false)
    expect(isMissingTable({ message: 'fetch failed' })).toBe(false)
    expect(isMissingTable(null)).toBe(false)
    expect(isMissingTable('x')).toBe(false)
  })
  it('unfinalize: missing table is quiet success, any other error is a failure, a thrown error too', async () => {
    expect(await unfinalize(memoryDb({}, { missing: ['quiz_finalizations'] }) as never, ['a1'], 1)).toEqual({ ok: true, removed: false })
    expect(quiet).not.toHaveBeenCalled()
    expect(await unfinalize(memoryDb(tables(), { failOn: ['delete:quiz_finalizations'] }) as never, ['a1'], 2)).toEqual({ ok: false })
    expect(await unfinalize({ from: () => { throw new Error('network') } } as never, ['a1'], 2)).toEqual({ ok: false })
    expect(quiet).toHaveBeenCalledTimes(2)
    expect(await unfinalize(memoryDb(tables()) as never, [], 2)).toEqual({ ok: true, removed: false })
  })
  it('loadFinalizations: both give available false, only the other error is logged', async () => {
    expect(await loadFinalizations(memoryDb({}, { missing: ['quiz_finalizations'] }) as never, ['a1'])).toEqual({ available: false, rows: [] })
    expect(quiet).not.toHaveBeenCalled()
    expect(await loadFinalizations(memoryDb(tables(), { failOn: ['select:quiz_finalizations'] }) as never, ['a1'])).toEqual({ available: false, rows: [] })
    expect(quiet).toHaveBeenCalledTimes(1)
  })
})

describe('releaseAfterStudentQuiz — 학생의 늦은 제출', () => {
  it('removes only that assignment·lesson row', async () => {
    const db = memoryDb(tables({ quiz_finalizations: [{ id: 'f1', assignment_id: 'a1', lesson_no: 2 }, { id: 'f2', assignment_id: 'a1', lesson_no: 1 }, { id: 'f3', assignment_id: 'a2', lesson_no: 2 }] }))
    await releaseAfterStudentQuiz(db as never, 'a1', 2)
    expect(db.tables.quiz_finalizations.map((f) => f.id)).toEqual(['f2', 'f3'])
  })
  it('never throws: missing table, failed delete, thrown error', async () => {
    await expect(releaseAfterStudentQuiz(memoryDb({}, { missing: ['quiz_finalizations'] }) as never, 'a1', 2)).resolves.toBeUndefined()
    await expect(releaseAfterStudentQuiz(memoryDb(tables(), { failOn: ['delete:quiz_finalizations'] }) as never, 'a1', 2)).resolves.toBeUndefined()
    await expect(releaseAfterStudentQuiz({ from: () => { throw new Error('network') } } as never, 'a1', 2)).resolves.toBeUndefined()
  })
})

describe('hasUnsentDraft — 쓰다 만 글', () => {
  it('true only for an unsubmitted student row with text', () => {
    expect(hasUnsentDraft({ submitted_at: null, source: 'student', body: '쓰다 만 글' })).toBe(true)
    expect(hasUnsentDraft({ submitted_at: null, source: 'student', body: '  \n ' })).toBe(false)
    expect(hasUnsentDraft({ submitted_at: null, source: 'student', body: '' })).toBe(false)
    expect(hasUnsentDraft({ submitted_at: NOW, source: 'student', body: '낸 글' })).toBe(false)
    expect(hasUnsentDraft({ submitted_at: null, source: 'teacher', body: '표지' })).toBe(false)
    expect(hasUnsentDraft(null)).toBe(false)
  })
})

describe('서버 액션 (세션·클라이언트 가짜)', () => {
  const asTeacher = () => { state.session = { role: 'teacher', academyId: 'ac1', userId: 't1' } }
  const asStudent = (id: string) => { state.session = { role: 'student', academyId: 'ac1', userId: `st-${id}` } }

  it('fillEmptyQuiz fills the ticked students only and needs at least one', async () => {
    const { fillEmptyQuiz } = await import('@/app/teacher/assignments/[setId]/actions')
    asTeacher(); state.db = memoryDb(tables())
    expect(await fillEmptyQuiz('set', 2, [])).toEqual({ ok: false, error: rev.fillNoneSelected })
    expect(await fillEmptyQuiz('set', 2, ['a2', 'a3', 'x1', 'y1'])).toEqual({ ok: true, unfinalized: true })
    expect(teacherRows(state.db)).toEqual(['a2:2:1:O', 'a2:2:2:O'])
    expect(state.db.tables.quiz_finalizations.map((f) => f.assignment_id)).toEqual(['a1', 'a3', 'x1', 'y1'])
  })
  it('fillEmptyQuiz: release failure tells the teacher the O/X was saved', async () => {
    const { fillEmptyQuiz } = await import('@/app/teacher/assignments/[setId]/actions')
    asTeacher(); state.db = memoryDb(tables(), { failOn: ['delete:quiz_finalizations'] })
    expect(await fillEmptyQuiz('set', 2, ['a1'])).toEqual({ ok: false, error: rev.unfinalizeFailed })
    expect(teacherRows(state.db)).toHaveLength(2)
  })
  it('setQuizCell refuses a lesson that is not open for that student, calmly', async () => {
    const { setQuizCell } = await import('@/app/teacher/assignments/[setId]/actions')
    asTeacher(); state.db = memoryDb(tables())
    expect(await setQuizCell('a3', 2, 1, 'O')).toEqual({ ok: false, error: rev.quizLessonNotOpen })
    expect(state.db.writes).toEqual([])
    expect(await setQuizCell('a3', 1, 1, 'O')).toEqual({ ok: true, unfinalized: false })
    expect(await setQuizCell('a1', 2, 1, 'X')).toEqual({ ok: true, unfinalized: true })
    expect(await setQuizCell('x1', 2, 1, 'O')).toEqual({ ok: false, error: rev.saveFailed })
    expect(teacherRows(state.db)).toEqual(['a3:1:1:O', 'a1:2:1:X'])
  })
  it('setQuizCell / unfinalizeQuizLesson: release failure is reported, not swallowed', async () => {
    const { setQuizCell, unfinalizeQuizLesson } = await import('@/app/teacher/assignments/[setId]/actions')
    asTeacher(); state.db = memoryDb(tables(), { failOn: ['delete:quiz_finalizations'] })
    expect(await setQuizCell('a1', 2, 1, 'O')).toEqual({ ok: false, error: rev.unfinalizeFailed })
    expect(teacherRows(state.db)).toEqual(['a1:2:1:O'])
    expect(await unfinalizeQuizLesson('set', 2)).toEqual({ ok: false, error: rev.undoFailed })
  })
  it('migration 0014 not applied: entering O/X and filling still work', async () => {
    const { setQuizCell, fillEmptyQuiz, unfinalizeQuizLesson } = await import('@/app/teacher/assignments/[setId]/actions')
    asTeacher(); state.db = memoryDb(tables(), { missing: ['quiz_finalizations'] })
    expect(await setQuizCell('a1', 2, 1, 'O')).toEqual({ ok: true, unfinalized: false })
    expect(await fillEmptyQuiz('set', 2, ['a2'])).toEqual({ ok: true, unfinalized: false })
    expect(await unfinalizeQuizLesson('set', 2)).toEqual({ ok: true })
  })
  it('submitQuiz after the teacher finalised: the answers are stored and that student·lesson is released', async () => {
    const { submitQuiz } = await import('@/app/student/assignments/[id]/actions')
    asStudent('a1'); state.db = memoryDb(tables()); state.admin = memoryDb({ quiz_responses: [], quiz_finalizations: [{ id: 'f1', assignment_id: 'a1', lesson_no: 2 }, { id: 'f2', assignment_id: 'a1', lesson_no: 1 }, { id: 'f3', assignment_id: 'a2', lesson_no: 2 }] })
    const r = await submitQuiz('a1', 2, ['6', '9'])
    expect(r).toMatchObject({ ok: true, results: [{ correct: true }, { correct: false }] })
    expect(state.admin.tables.quiz_responses).toHaveLength(2)
    expect(state.admin.tables.quiz_finalizations.map((f) => f.id)).toEqual(['f2', 'f3'])
    expect(state.db.writes).toEqual([])                       // 학생 클라이언트로는 아무것도 쓰지 않는다
  })
  it('submitQuiz still succeeds when the table is missing or the release fails', async () => {
    const { submitQuiz } = await import('@/app/student/assignments/[id]/actions')
    asStudent('a1'); state.db = memoryDb(tables())
    state.admin = memoryDb({ quiz_responses: [] }, { missing: ['quiz_finalizations'] })
    expect((await submitQuiz('a1', 2, ['6', '7'])).ok).toBe(true)
    state.admin = memoryDb({ quiz_responses: [], quiz_finalizations: [{ id: 'f1', assignment_id: 'a1', lesson_no: 2 }] }, { failOn: ['delete:quiz_finalizations'] })
    expect((await submitQuiz('a1', 2, ['6', '7'])).ok).toBe(true)
    expect(state.admin.tables.quiz_responses).toHaveLength(2)
  })
  it('submitQuiz that is refused releases nothing', async () => {
    const { submitQuiz } = await import('@/app/student/assignments/[id]/actions')
    asStudent('a3'); state.db = memoryDb(tables()); state.admin = memoryDb({ quiz_responses: [], quiz_finalizations: [{ id: 'f1', assignment_id: 'a3', lesson_no: 2 }] })
    expect(await submitQuiz('a3', 2, ['6', '7'])).toEqual({ ok: false, error: app.classroom.student.errors.notOpen })
    expect(state.admin.writes).toEqual([])
  })
})
