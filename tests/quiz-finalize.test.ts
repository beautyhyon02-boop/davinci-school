// 퀴즈 최종 확인·종이 O/X 입력(설계 2026-09-29 §4.1): 순수 계산(quiz-finalize.ts)과 DB 쓰기(quiz-entry.ts, 가짜 클라이언트).
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  cellState, nextCellState, canSetCell, isTeacherEntered, teacherQuizRow, emptyCells, assignmentsWithEmpty,
  affectedFinalizations, lessonFinalState, finalizedLessonsOf, kstDate,
} from '@/lib/classroom/quiz-finalize'
import { applyQuizCell, fillEmptyCorrect, finalizeLesson, unfinalize, loadFinalizations } from '@/lib/classroom/quiz-entry'
import { alignQuizDone } from '@/lib/classroom/quiz'
import { memoryDb } from './fixtures/fake-db'

const student = (correct: boolean) => ({ correct, source: 'student' as const })
const teacher = (correct: boolean) => ({ correct, source: 'teacher' as const })
const NOW = '2026-09-29T03:00:00.000Z'

describe('칸 상태와 순환', () => {
  it('empty → O → X → empty for a teacher-entered cell', () => {
    expect(cellState(null)).toBe('empty')
    expect(nextCellState(null, 'short')).toBe('O')
    expect(nextCellState(teacher(true), 'short')).toBe('X')
    expect(nextCellState(teacher(false), 'short')).toBe('empty')
  })
  it('a student-entered short cell only flips O ↔ X; a legacy choice cell cannot change', () => {
    expect(nextCellState(student(true), 'short')).toBe('X')
    expect(nextCellState(student(false), 'short')).toBe('O')
    expect(nextCellState(student(true), 'choice')).toBeNull()
    expect(nextCellState({ correct: false, source: 'photo' }, 'short')).toBe('O')
  })
  it('an empty legacy-choice cell can still take a paper O/X, and the teacher row cycles', () => {
    expect(nextCellState(undefined, 'choice')).toBe('O')
    expect(nextCellState(teacher(true), 'choice')).toBe('X')
  })
  it('canSetCell applies the same rules to a direct call', () => {
    expect(canSetCell(null, 'O', 'short')).toBe(true)
    expect(canSetCell(null, 'X', 'choice')).toBe(true)
    expect(canSetCell(null, 'empty', 'short')).toBe(false)
    expect(canSetCell(teacher(true), 'empty', 'short')).toBe(true)
    expect(canSetCell(teacher(true), 'O', 'short')).toBe(false)          // 같은 상태
    expect(canSetCell(student(true), 'empty', 'short')).toBe(false)      // 학생 응답은 지우지 못한다
    expect(canSetCell(student(true), 'X', 'short')).toBe(true)
    expect(canSetCell(student(true), 'X', 'choice')).toBe(false)
    expect(canSetCell(null, 'maybe' as never, 'short')).toBe(false)
  })
  it('teacherQuizRow: source teacher, empty response, override stamp', () => {
    expect(teacherQuizRow({ assignment_id: 'a1', lesson_no: 2, quiz_no: 3 }, false, 'u1', NOW)).toEqual({
      assignment_id: 'a1', lesson_no: 2, quiz_no: 3, response: '', correct: false, source: 'teacher', overridden_by: 'u1', overridden_at: NOW,
    })
    expect(isTeacherEntered(teacher(true))).toBe(true)
    expect(isTeacherEntered(student(true))).toBe(false)
    expect(isTeacherEntered(null)).toBe(false)
  })
})

describe('빈칸·최종 확인 계산', () => {
  const responses = [
    { assignment_id: 'a1', lesson_no: 1, quiz_no: 1 }, { assignment_id: 'a1', lesson_no: 1, quiz_no: 2 }, { assignment_id: 'a1', lesson_no: 1, quiz_no: 3 },
    { assignment_id: 'a2', lesson_no: 1, quiz_no: 2 },
    { assignment_id: 'a3', lesson_no: 2, quiz_no: 1 },
  ]
  it('emptyCells lists the cells with no row in that lesson only', () => {
    expect(emptyCells({ no: 1, quizCount: 3 }, ['a1', 'a2', 'a3'], responses)).toEqual([
      { assignment_id: 'a2', lesson_no: 1, quiz_no: 1 }, { assignment_id: 'a2', lesson_no: 1, quiz_no: 3 },
      { assignment_id: 'a3', lesson_no: 1, quiz_no: 1 }, { assignment_id: 'a3', lesson_no: 1, quiz_no: 2 }, { assignment_id: 'a3', lesson_no: 1, quiz_no: 3 },
    ])
    expect(assignmentsWithEmpty({ no: 1, quizCount: 3 }, ['a3', 'a1', 'a2'], responses)).toEqual(['a3', 'a2'])
    expect(assignmentsWithEmpty({ no: 1, quizCount: 0 }, ['a1'], responses)).toEqual([])
  })
  it('affectedFinalizations de-duplicates (assignment, lesson)', () => {
    expect(affectedFinalizations([
      { assignment_id: 'a2', lesson_no: 1, quiz_no: 1 }, { assignment_id: 'a2', lesson_no: 1, quiz_no: 3 }, { assignment_id: 'a3', lesson_no: 1, quiz_no: 1 },
    ])).toEqual([{ assignment_id: 'a2', lesson_no: 1 }, { assignment_id: 'a3', lesson_no: 1 }])
  })
  it('lessonFinalState: all / some / none, latest time, pending students', () => {
    const fin = [
      { assignment_id: 'a1', lesson_no: 1, finalized_at: '2026-09-28T01:00:00Z' },
      { assignment_id: 'a2', lesson_no: 1, finalized_at: '2026-09-29T01:00:00Z' },
      { assignment_id: 'a1', lesson_no: 2, finalized_at: '2026-09-29T02:00:00Z' },
      { assignment_id: 'zz', lesson_no: 3, finalized_at: '2026-09-29T02:00:00Z' },   // 다른 세트의 배정
    ]
    expect(lessonFinalState(1, ['a1', 'a2'], fin)).toEqual({ state: 'all', finalizedAt: '2026-09-29T01:00:00Z', pending: [] })
    expect(lessonFinalState(2, ['a1', 'a2'], fin)).toEqual({ state: 'some', finalizedAt: '2026-09-29T02:00:00Z', pending: ['a2'] })
    expect(lessonFinalState(3, ['a1', 'a2'], fin)).toEqual({ state: 'none', finalizedAt: null, pending: ['a1', 'a2'] })
    expect(lessonFinalState(1, [], fin).state).toBe('none')
    expect(finalizedLessonsOf('a1', fin)).toEqual([1, 2])
    expect(finalizedLessonsOf('a9', fin)).toEqual([])
  })
  it('kstDate shows the Korean calendar day', () => {
    expect(kstDate('2026-09-29T16:30:00.000Z')).toBe('2026-09-30')
    expect(kstDate('2026-09-29T03:00:00+00:00')).toBe('2026-09-29')
    expect(kstDate(null)).toBe('')
    expect(kstDate('not a date')).toBe('')
  })
  it('alignQuizDone keeps question positions when only some rows exist', () => {
    expect(alignQuizDone(3, [{ quiz_no: 3, response: '', correct: true, source: 'teacher' }, { quiz_no: 1, response: '12', correct: false, source: 'student' }])).toEqual([
      { response: '12', correct: false, paper: false }, null, { response: '', correct: true, paper: true },
    ])
  })
})

describe('applyQuizCell (가짜 DB)', () => {
  const base = { assignment_id: 'a1', lesson_no: 1, quiz_no: 2, quizType: 'short' as const, userId: 'u1', now: NOW }
  const fin = () => [{ id: 'f1', assignment_id: 'a1', lesson_no: 1, finalized_at: NOW }, { id: 'f2', assignment_id: 'a2', lesson_no: 1, finalized_at: NOW }, { id: 'f3', assignment_id: 'a1', lesson_no: 2, finalized_at: NOW }]

  it('empty cell → inserts a teacher row and removes only that assignment·lesson finalisation', async () => {
    const db = memoryDb({ quiz_responses: [], quiz_finalizations: fin() })
    const r = await applyQuizCell(db as never, { ...base, target: 'X' })
    expect(r).toEqual({ ok: true, unfinalized: true })
    expect(db.tables.quiz_responses).toEqual([expect.objectContaining({ assignment_id: 'a1', lesson_no: 1, quiz_no: 2, response: '', correct: false, source: 'teacher', overridden_by: 'u1', overridden_at: NOW })])
    expect(db.tables.quiz_finalizations.map((f) => f.id)).toEqual(['f2', 'f3'])
  })
  it('teacher row → empty deletes the row; student row is never deleted', async () => {
    const db = memoryDb({ quiz_responses: [{ assignment_id: 'a1', lesson_no: 1, quiz_no: 2, response: '', correct: false, source: 'teacher' }], quiz_finalizations: [] })
    expect(await applyQuizCell(db as never, { ...base, target: 'empty' })).toEqual({ ok: true, unfinalized: false })
    expect(db.tables.quiz_responses).toEqual([])

    const db2 = memoryDb({ quiz_responses: [{ assignment_id: 'a1', lesson_no: 1, quiz_no: 2, response: '30', correct: false, source: 'student' }], quiz_finalizations: fin() })
    expect(await applyQuizCell(db2 as never, { ...base, target: 'empty' })).toEqual({ ok: false, reason: 'not-allowed' })
    expect(db2.tables.quiz_responses).toHaveLength(1)
    expect(db2.writes).toEqual([])                                       // 거절된 호출은 확인도 풀지 않는다
    expect(db2.tables.quiz_finalizations).toHaveLength(3)
  })
  it('student short row flips and keeps the response; legacy choice row is refused', async () => {
    const db = memoryDb({ quiz_responses: [{ assignment_id: 'a1', lesson_no: 1, quiz_no: 2, response: '30', correct: false, source: 'student' }], quiz_finalizations: fin() })
    expect(await applyQuizCell(db as never, { ...base, target: 'O' })).toEqual({ ok: true, unfinalized: true })
    expect(db.tables.quiz_responses[0]).toMatchObject({ response: '30', correct: true, source: 'student', overridden_by: 'u1' })
    expect(await applyQuizCell(db as never, { ...base, target: 'X', quizType: 'choice' })).toEqual({ ok: false, reason: 'not-allowed' })
  })
  it('migration 0014 not applied: O/X entry still works, nothing to unfinalise', async () => {
    const db = memoryDb({ quiz_responses: [] }, { missing: ['quiz_finalizations'] })
    expect(await applyQuizCell(db as never, { ...base, target: 'O' })).toEqual({ ok: true, unfinalized: false })
    expect(db.tables.quiz_responses).toHaveLength(1)
  })
  it('a failed write reports save-failed', async () => {
    const db = memoryDb({ quiz_responses: [], quiz_finalizations: fin() }, { failOn: ['insert:quiz_responses'] })
    expect(await applyQuizCell(db as never, { ...base, target: 'O' })).toEqual({ ok: false, reason: 'save-failed' })
    expect(db.tables.quiz_finalizations).toHaveLength(3)
  })
})

describe('fillEmptyCorrect · finalizeLesson · unfinalize · loadFinalizations (가짜 DB)', () => {
  it('fills only the empty cells with O and unfinalises only the assignments it touched', async () => {
    const db = memoryDb({
      quiz_responses: [
        { assignment_id: 'a1', lesson_no: 1, quiz_no: 1, response: 'x', correct: false, source: 'student' },
        { assignment_id: 'a1', lesson_no: 1, quiz_no: 2, response: 'y', correct: true, source: 'student' },
        { assignment_id: 'a1', lesson_no: 1, quiz_no: 3, response: 'z', correct: true, source: 'student' },
        { assignment_id: 'a2', lesson_no: 2, quiz_no: 1, response: 'q', correct: true, source: 'student' },
      ],
      quiz_finalizations: [{ id: 'f1', assignment_id: 'a1', lesson_no: 1, finalized_at: NOW }, { id: 'f2', assignment_id: 'a2', lesson_no: 1, finalized_at: NOW }],
    })
    const r = await fillEmptyCorrect(db as never, { assignmentIds: ['a1', 'a2'], lesson: { no: 1, quizCount: 3 }, userId: 'u1', now: NOW })
    expect(r).toEqual({ ok: true, unfinalized: true, filled: 3 })
    const added = db.tables.quiz_responses.filter((x) => x.source === 'teacher')
    expect(added.map((x) => [x.assignment_id, x.lesson_no, x.quiz_no, x.correct])).toEqual([['a2', 1, 1, true], ['a2', 1, 2, true], ['a2', 1, 3, true]])
    expect(db.tables.quiz_responses.find((x) => x.assignment_id === 'a1' && x.quiz_no === 1)).toMatchObject({ correct: false, response: 'x' })
    expect(db.tables.quiz_finalizations.map((f) => f.id)).toEqual(['f1'])
  })
  it('nothing empty → no write', async () => {
    const db = memoryDb({ quiz_responses: [{ assignment_id: 'a1', lesson_no: 1, quiz_no: 1, response: 'x', correct: true, source: 'student' }], quiz_finalizations: [] })
    expect(await fillEmptyCorrect(db as never, { assignmentIds: ['a1'], lesson: { no: 1, quizCount: 1 }, userId: 'u1', now: NOW })).toEqual({ ok: true, unfinalized: false, filled: 0 })
    expect(db.writes).toEqual([])
  })
  it('finalizeLesson upserts one row per assignment (pressing twice keeps one row each)', async () => {
    const db = memoryDb({ quiz_finalizations: [] })
    const args = { assignments: [{ id: 'a1', academy_id: 'ac' }, { id: 'a2', academy_id: 'ac' }], lessonNo: 3, userId: 'u1', now: NOW }
    expect(await finalizeLesson(db as never, args)).toEqual({ ok: true })
    expect(await finalizeLesson(db as never, { ...args, now: '2026-09-30T00:00:00.000Z' })).toEqual({ ok: true })
    expect(db.tables.quiz_finalizations).toHaveLength(2)
    expect(db.tables.quiz_finalizations[0]).toMatchObject({ assignment_id: 'a1', academy_id: 'ac', lesson_no: 3, finalized_by: 'u1', finalized_at: '2026-09-30T00:00:00.000Z' })
    expect(await unfinalize(db as never, ['a1', 'a2'], 3)).toEqual({ ok: true, removed: true })
    expect(db.tables.quiz_finalizations).toEqual([])
    expect(await unfinalize(db as never, ['a1', 'a2'], 3)).toEqual({ ok: true, removed: false })
  })
  it('missing table: load → not available and empty, finalize → not ok, unfinalize → nothing to release; none throws', async () => {
    const db = memoryDb({}, { missing: ['quiz_finalizations'] })
    expect(await loadFinalizations(db as never, ['a1'])).toEqual({ available: false, rows: [] })
    expect(await finalizeLesson(db as never, { assignments: [{ id: 'a1', academy_id: 'ac' }], lessonNo: 1, userId: 'u1', now: NOW })).toEqual({ ok: false })
    expect(await unfinalize(db as never, ['a1'], 1)).toEqual({ ok: true, removed: false })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwing = { from: () => { throw new Error('network') } }
    expect(await loadFinalizations(throwing as never, ['a1'])).toEqual({ available: false, rows: [] })
    quiet.mockRestore()
  })
  it('loadFinalizations returns the rows of the given assignments', async () => {
    const db = memoryDb({ quiz_finalizations: [{ assignment_id: 'a1', lesson_no: 1, finalized_at: NOW }, { assignment_id: 'b1', lesson_no: 1, finalized_at: NOW }] })
    const r = await loadFinalizations(db as never, ['a1'])
    expect(r.available).toBe(true)
    expect(r.rows).toHaveLength(1)
  })
})

describe('순수 모듈', () => {
  it('quiz-finalize.ts imports no supabase/server code and carries no Korean sentences outside comments', () => {
    const src = readFileSync('lib/classroom/quiz-finalize.ts', 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/supabase|server-only|next\//)
    expect(code).not.toMatch(/[가-힣]/)
  })
})
