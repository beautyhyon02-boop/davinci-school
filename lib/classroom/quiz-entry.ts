import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnswerSource } from './types'
import { canSetCell, emptyCells, teacherQuizRow, affectedFinalizations, fillCandidates, type CellState, type QuizType, type FinalizationRow, type ResponseKey } from './quiz-finalize'

/**
 * 퀴즈 O/X 입력·최종 확인의 DB 쓰기(설계 §4.1). db 는 원장 클라이언트(RLS 가 자기 원의 배정만 허용한다 —
 * quiz_responses 는 0009 teacher_rw_quiz, quiz_finalizations 는 0014 teacher_rw_quiz_finalizations).
 * 서버 액션이 역할·차시·문항 번호를 확인한 뒤 부른다. 테스트는 가짜 클라이언트로 한다.
 *
 * 마이그레이션 0014 가 아직 적용되지 않았을 때(quiz_finalizations 표 없음): 읽기는 "확인 없음"으로, 확인 풀기는 "풀 것 없음"으로
 * 지나가고(O/X 입력은 그대로 된다), 최종 확인 저장만 실패를 돌려준다. 어느 것도 예외를 던지지 않는다.
 * 표 없음이 아닌 오류로 확인을 풀지 못하면 실패를 돌려준다(O/X 는 이미 저장됨 — 화면이 [확인 풀기]를 안내한다).
 */

/**
 * 'unfinalize-failed' = O/X 는 이미 저장됐는데 최종 확인을 풀지 못했다(표가 없는 것이 아니라 다른 오류). 화면은 [확인 풀기]를 안내한다.
 * 'not-open' = 아직 열지 않은 차시의 빈칸에 원장 O/X 를 넣으려 했다.
 */
export type EntryResult = { ok: true; unfinalized: boolean } | { ok: false; reason: 'not-allowed' | 'not-open' | 'save-failed' | 'unfinalize-failed' }
export type UnfinalizeResult = { ok: true; removed: boolean } | { ok: false }

/**
 * 표가 없어서 난 오류인가(마이그레이션 0014 전). PostgREST PGRST205(스키마 캐시에 표 없음)·Postgres 42P01(relation 없음),
 * 또는 코드 없이 문장만 온 경우 그 문장으로 알아본다. 그 밖의 오류(권한·네트워크 등)는 표 없음으로 치지 않는다.
 */
export function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  if (e.code === 'PGRST205' || e.code === '42P01') return true
  const m = typeof e.message === 'string' ? e.message : ''
  return /schema cache|could not find the table|relation .* does not exist/i.test(m)
}

/** 최종 확인 읽기. available=false 면 표가 없거나 읽지 못한 것 — 화면은 최종 확인 칸을 그리지 않는다. 표 없음이 아닌 오류는 기록을 남긴다. */
export async function loadFinalizations(db: SupabaseClient, assignmentIds: string[]): Promise<{ available: boolean; rows: FinalizationRow[] }> {
  if (assignmentIds.length === 0) return { available: true, rows: [] }
  try {
    const { data, error } = await db.from('quiz_finalizations').select('assignment_id, lesson_no, finalized_at').in('assignment_id', assignmentIds)
    if (error || !data) {
      if (!isMissingTable(error)) console.error('[quiz_finalizations] read failed', error)
      return { available: false, rows: [] }
    }
    return { available: true, rows: data as FinalizationRow[] }
  } catch (e) {
    console.error('[quiz_finalizations] read failed', e)
    return { available: false, rows: [] }
  }
}

/**
 * 확인 풀기: 그 배정들·그 차시의 최종 확인 줄을 지운다. removed = 지운 줄이 있었는가.
 * 표가 없으면(0014 전) 풀 것이 없는 것이다 — ok, removed false(조용히). 그 밖의 오류는 ok false — 확인이 그대로 남아 있을 수 있다.
 */
export async function unfinalize(db: SupabaseClient, assignmentIds: string[], lessonNo: number): Promise<UnfinalizeResult> {
  if (assignmentIds.length === 0) return { ok: true, removed: false }
  try {
    const { data, error } = await db.from('quiz_finalizations').delete().in('assignment_id', assignmentIds).eq('lesson_no', lessonNo).select('id')
    if (error) {
      if (isMissingTable(error)) return { ok: true, removed: false }
      console.error('[quiz_finalizations] release failed', error)
      return { ok: false }
    }
    return { ok: true, removed: (data ?? []).length > 0 }
  } catch (e) {
    console.error('[quiz_finalizations] release failed', e)
    return { ok: false }
  }
}

/**
 * 학생이 최종 확인 뒤에 화면으로 퀴즈를 낸 경우(늦은 제출): 그 배정·그 차시의 확인을 푼다. 학생 제출은 이미 끝났으므로
 * 어떤 오류도 밖으로 내지 않는다(표 없음 포함). db 는 service role — 학생에게는 quiz_finalizations 정책이 없다.
 */
export async function releaseAfterStudentQuiz(db: SupabaseClient, assignmentId: string, lessonNo: number): Promise<void> {
  try {
    await unfinalize(db, [assignmentId], lessonNo)
  } catch (e) {
    console.error('[quiz_finalizations] release failed', e)
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
 * lessonOpen=false(그 배정에 아직 열지 않은 차시)면 빈칸에 새 O/X 를 넣지 않는다. 이미 있는 줄은 고치거나 지울 수 있다
 * (전에 잘못 채운 칸을 되돌릴 길을 남긴다).
 */
export async function applyQuizCell(db: SupabaseClient, a: ResponseKey & { target: CellState; quizType: QuizType; userId: string; now: string; lessonOpen?: boolean }): Promise<EntryResult> {
  const key = { assignment_id: a.assignment_id, lesson_no: a.lesson_no, quiz_no: a.quiz_no }
  const { data: row, error: readErr } = await db.from('quiz_responses').select('correct, source')
    .eq('assignment_id', a.assignment_id).eq('lesson_no', a.lesson_no).eq('quiz_no', a.quiz_no).maybeSingle()
  if (readErr) return { ok: false, reason: 'save-failed' }
  const cur = (row ?? null) as { correct: boolean; source: AnswerSource } | null
  if (!canSetCell(cur, a.target, a.quizType)) return { ok: false, reason: 'not-allowed' }
  if (!cur && a.lessonOpen === false) return { ok: false, reason: 'not-open' }

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
  const u = await unfinalize(db, [a.assignment_id], a.lesson_no)
  if (!u.ok) return { ok: false, reason: 'unfinalize-failed' }
  return { ok: true, unfinalized: u.removed }
}

/** 주어진 배정들의 이 차시 빈칸을 O(원장 줄)로. 이미 응답이 있는 칸은 건드리지 않는다. 채운 칸이 있는 배정만 최종 확인이 풀린다. */
export async function fillEmptyCorrect(db: SupabaseClient, a: { assignmentIds: string[]; lesson: { no: number; quizCount: number }; userId: string; now: string }): Promise<EntryResult & { filled?: number }> {
  if (a.assignmentIds.length === 0) return { ok: true, unfinalized: false, filled: 0 }
  const { data, error: readErr } = await db.from('quiz_responses').select('assignment_id, lesson_no, quiz_no').in('assignment_id', a.assignmentIds).eq('lesson_no', a.lesson.no)
  if (readErr) return { ok: false, reason: 'save-failed' }
  const cells = emptyCells(a.lesson, a.assignmentIds, (data ?? []) as ResponseKey[])
  if (cells.length === 0) return { ok: true, unfinalized: false, filled: 0 }
  const { error } = await db.from('quiz_responses').insert(cells.map((c) => teacherQuizRow(c, true, a.userId, a.now)))
  if (error) return { ok: false, reason: 'save-failed' }
  const u = await unfinalize(db, affectedFinalizations(cells).map((x) => x.assignment_id), a.lesson.no)
  if (!u.ok) return { ok: false, reason: 'unfinalize-failed' }
  return { ok: true, unfinalized: u.removed, filled: cells.length }
}

/**
 * [선택한 학생의 빈칸을 O로]: 화면이 보낸 배정 id 를 그대로 믿지 않는다 — 이 원장 원(academy_id)·이 세트(item_set_id)의 배정인지
 * 다시 읽어 확인하고, 그 차시를 아직 열지 않은 배정(open_lessons < 차시)은 건너뛴다. 남은 배정의 빈칸만 채운다.
 */
export async function fillSelectedCorrect(db: SupabaseClient, a: { academyId: string; setId: string; assignmentIds: unknown; lesson: { no: number; quizCount: number }; userId: string; now: string }): Promise<EntryResult & { filled?: number }> {
  const asked = Array.isArray(a.assignmentIds) ? [...new Set(a.assignmentIds.filter((x): x is string => typeof x === 'string' && x.length > 0))] : []
  if (asked.length === 0) return { ok: false, reason: 'not-allowed' }
  const { data, error } = await db.from('assignments').select('id, open_lessons').eq('item_set_id', a.setId).eq('academy_id', a.academyId).in('id', asked)
  if (error) return { ok: false, reason: 'save-failed' }
  const rows = (data ?? []) as { id: string; open_lessons: number }[]
  const ids = fillCandidates(a.lesson.no, rows.map((r) => ({ assignmentId: r.id, openLessons: r.open_lessons })))
  return fillEmptyCorrect(db, { assignmentIds: asked.filter((id) => ids.includes(id)), lesson: a.lesson, userId: a.userId, now: a.now })
}
