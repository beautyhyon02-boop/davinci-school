import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnswerSource } from './types'
import { canSetCell, emptyCells, teacherQuizRow, affectedFinalizations, type CellState, type QuizType, type FinalizationRow, type ResponseKey } from './quiz-finalize'

/**
 * 퀴즈 O/X 입력·최종 확인의 DB 쓰기(설계 §4.1). db 는 원장 클라이언트(RLS 가 자기 원의 배정만 허용한다 —
 * quiz_responses 는 0009 teacher_rw_quiz, quiz_finalizations 는 0014 teacher_rw_quiz_finalizations).
 * 서버 액션이 역할·차시·문항 번호를 확인한 뒤 부른다. 테스트는 가짜 클라이언트로 한다.
 *
 * 마이그레이션 0014 가 아직 적용되지 않았을 때(quiz_finalizations 표 없음): 읽기는 "확인 없음"으로, 확인 풀기는 "풀 것 없음"으로
 * 지나가고(O/X 입력은 그대로 된다), 최종 확인 저장만 실패를 돌려준다. 어느 것도 예외를 던지지 않는다.
 */

export type EntryResult = { ok: true; unfinalized: boolean } | { ok: false; reason: 'not-allowed' | 'save-failed' }

/** 최종 확인 읽기. available=false 면 표가 없거나 읽지 못한 것 — 화면은 최종 확인 칸을 그리지 않는다. */
export async function loadFinalizations(db: SupabaseClient, assignmentIds: string[]): Promise<{ available: boolean; rows: FinalizationRow[] }> {
  if (assignmentIds.length === 0) return { available: true, rows: [] }
  try {
    const { data, error } = await db.from('quiz_finalizations').select('assignment_id, lesson_no, finalized_at').in('assignment_id', assignmentIds)
    if (error || !data) return { available: false, rows: [] }
    return { available: true, rows: data as FinalizationRow[] }
  } catch {
    return { available: false, rows: [] }
  }
}

/** 확인 풀기: 그 배정들·그 차시의 최종 확인 줄을 지운다. 지운 줄이 있었으면 true. 표가 없으면 false(조용히). */
export async function unfinalize(db: SupabaseClient, assignmentIds: string[], lessonNo: number): Promise<boolean> {
  if (assignmentIds.length === 0) return false
  try {
    const { data, error } = await db.from('quiz_finalizations').delete().in('assignment_id', assignmentIds).eq('lesson_no', lessonNo).select('id')
    if (error || !data) return false
    return data.length > 0
  } catch {
    return false
  }
}

export async function finalizeLesson(db: SupabaseClient, a: { assignments: { id: string; academy_id: string }[]; lessonNo: number; userId: string; now: string }): Promise<{ ok: boolean }> {
  if (a.assignments.length === 0) return { ok: false }
  const rows = a.assignments.map((x) => ({ assignment_id: x.id, academy_id: x.academy_id, lesson_no: a.lessonNo, finalized_by: a.userId, finalized_at: a.now }))
  try {
    const { error } = await db.from('quiz_finalizations').upsert(rows, { onConflict: 'assignment_id,lesson_no' })
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

/**
 * 칸 하나를 목표 상태로: 빈칸 → O/X 는 원장 줄 넣기, 원장 줄 → 빈칸은 지우기, 그 밖은 정오 바꾸기.
 * 바뀌었으면 그 배정·그 차시의 최종 확인을 푼다.
 */
export async function applyQuizCell(db: SupabaseClient, a: ResponseKey & { target: CellState; quizType: QuizType; userId: string; now: string }): Promise<EntryResult> {
  const key = { assignment_id: a.assignment_id, lesson_no: a.lesson_no, quiz_no: a.quiz_no }
  const { data: row, error: readErr } = await db.from('quiz_responses').select('correct, source')
    .eq('assignment_id', a.assignment_id).eq('lesson_no', a.lesson_no).eq('quiz_no', a.quiz_no).maybeSingle()
  if (readErr) return { ok: false, reason: 'save-failed' }
  const cur = (row ?? null) as { correct: boolean; source: AnswerSource } | null
  if (!canSetCell(cur, a.target, a.quizType)) return { ok: false, reason: 'not-allowed' }

  if (!cur) {
    const { error } = await db.from('quiz_responses').insert(teacherQuizRow(key, a.target === 'O', a.userId, a.now))
    if (error) return { ok: false, reason: 'save-failed' }
  } else if (a.target === 'empty') {
    // 원장이 넣은 줄만(canSetCell 이 확인했고, 지울 때도 source 로 한 번 더 거른다 — 학생 응답은 지워지지 않는다)
    const { error } = await db.from('quiz_responses').delete()
      .eq('assignment_id', a.assignment_id).eq('lesson_no', a.lesson_no).eq('quiz_no', a.quiz_no).eq('source', 'teacher')
    if (error) return { ok: false, reason: 'save-failed' }
  } else {
    const { error } = await db.from('quiz_responses').update({ correct: a.target === 'O', overridden_by: a.userId, overridden_at: a.now })
      .eq('assignment_id', a.assignment_id).eq('lesson_no', a.lesson_no).eq('quiz_no', a.quiz_no)
    if (error) return { ok: false, reason: 'save-failed' }
  }
  const unfinalized = await unfinalize(db, [a.assignment_id], a.lesson_no)
  return { ok: true, unfinalized }
}

/** 이 차시의 빈칸을 모두 O(원장 줄)로. 이미 응답이 있는 칸은 건드리지 않는다. 채운 칸이 있는 배정만 최종 확인이 풀린다. */
export async function fillEmptyCorrect(db: SupabaseClient, a: { assignmentIds: string[]; lesson: { no: number; quizCount: number }; userId: string; now: string }): Promise<EntryResult & { filled?: number }> {
  if (a.assignmentIds.length === 0) return { ok: true, unfinalized: false, filled: 0 }
  const { data, error: readErr } = await db.from('quiz_responses').select('assignment_id, lesson_no, quiz_no').in('assignment_id', a.assignmentIds).eq('lesson_no', a.lesson.no)
  if (readErr) return { ok: false, reason: 'save-failed' }
  const cells = emptyCells(a.lesson, a.assignmentIds, (data ?? []) as ResponseKey[])
  if (cells.length === 0) return { ok: true, unfinalized: false, filled: 0 }
  const { error } = await db.from('quiz_responses').insert(cells.map((c) => teacherQuizRow(c, true, a.userId, a.now)))
  if (error) return { ok: false, reason: 'save-failed' }
  const unfinalized = await unfinalize(db, affectedFinalizations(cells).map((x) => x.assignment_id), a.lesson.no)
  return { ok: true, unfinalized, filled: cells.length }
}
