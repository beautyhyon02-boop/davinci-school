import type { AnswerSource } from './types'

/**
 * 퀴즈 최종 확인·종이 O/X 입력의 순수 계산(설계 docs/superpowers/specs/2026-09-29-unit-report-design.md §4.1).
 * DB·화면 문구를 쓰지 않는다 — 읽기·쓰기는 quiz-entry.ts, 문구는 content/site.ts.
 */

export type CellState = 'empty' | 'O' | 'X'
export type QuizType = 'choice' | 'short'
/** 칸 하나의 응답 줄에서 계산에 필요한 것만. 줄이 없으면(빈칸) null/undefined. */
export type CellRow = { correct: boolean; source: AnswerSource } | null | undefined
export type ResponseKey = { assignment_id: string; lesson_no: number; quiz_no: number }
export type FinalizationRow = { assignment_id: string; lesson_no: number; finalized_at: string }

export function cellState(row: CellRow): CellState {
  if (!row) return 'empty'
  return row.correct ? 'O' : 'X'
}

/** 원장이 넣은 줄인가(종이로 푼 학생). 이 줄만 다시 빈칸으로 돌릴(지울) 수 있다. */
export function isTeacherEntered(row: CellRow): boolean {
  return !!row && row.source === 'teacher'
}

/**
 * 칸을 한 번 눌렀을 때의 다음 상태. 바꿀 수 없는 칸이면 null.
 *  · 빈칸 → O
 *  · 원장이 넣은 칸: O → X → 빈칸(줄 삭제)
 *  · 학생이 화면에서 푼 칸: O ↔ X 만(응답은 남는다). 옛 판의 선택형은 기계 채점이 확실해 바꾸지 않는다(종전 규칙).
 */
export function nextCellState(row: CellRow, quizType: QuizType): CellState | null {
  if (!row) return 'O'
  if (isTeacherEntered(row)) return row.correct ? 'X' : 'empty'
  if (quizType !== 'short') return null
  return row.correct ? 'X' : 'O'
}

/** 서버가 받은 목표 상태가 이 칸에 허용되는가(화면을 거치지 않은 호출도 같은 규칙으로 막는다). */
export function canSetCell(row: CellRow, target: CellState, quizType: QuizType): boolean {
  if (target !== 'empty' && target !== 'O' && target !== 'X') return false
  if (!row) return target !== 'empty'
  if (cellState(row) === target) return false
  if (isTeacherEntered(row)) return true
  return target !== 'empty' && quizType === 'short'
}

/** 원장이 넣는 종이 O/X 줄. response 는 not null 열이라 빈 문자열로 둔다(학생 응답 없음). */
export function teacherQuizRow(key: ResponseKey, correct: boolean, userId: string, now: string) {
  return { ...key, response: '', correct, source: 'teacher' as const, overridden_by: userId, overridden_at: now }
}

/** 이 차시에서 응답 줄이 없는 칸(배정 × 문항 번호). */
export function emptyCells(lesson: { no: number; quizCount: number }, assignmentIds: string[], responses: ResponseKey[]): ResponseKey[] {
  const have = new Set(responses.filter((r) => r.lesson_no === lesson.no).map((r) => `${r.assignment_id}|${r.quiz_no}`))
  const out: ResponseKey[] = []
  for (const assignment_id of assignmentIds) {
    for (let quiz_no = 1; quiz_no <= lesson.quizCount; quiz_no++) {
      if (!have.has(`${assignment_id}|${quiz_no}`)) out.push({ assignment_id, lesson_no: lesson.no, quiz_no })
    }
  }
  return out
}

/** 이 차시에 빈칸이 하나라도 있는 배정(학생) — 최종 확인 단추 아래 이름 목록. 주어진 배정 순서를 지킨다. */
export function assignmentsWithEmpty(lesson: { no: number; quizCount: number }, assignmentIds: string[], responses: ResponseKey[]): string[] {
  const missing = new Set(emptyCells(lesson, assignmentIds, responses).map((c) => c.assignment_id))
  return assignmentIds.filter((id) => missing.has(id))
}

/** O/X 가 바뀐 칸들 때문에 최종 확인이 풀려야 하는 (배정, 차시) — 중복 없이. */
export function affectedFinalizations(changed: ResponseKey[]): { assignment_id: string; lesson_no: number }[] {
  const seen = new Set<string>()
  const out: { assignment_id: string; lesson_no: number }[] = []
  for (const c of changed) {
    const k = `${c.assignment_id}|${c.lesson_no}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ assignment_id: c.assignment_id, lesson_no: c.lesson_no })
  }
  return out
}

export type LessonFinalState = {
  /** all = 이 세트의 모든 학생이 확인됨, some = 일부만(확인 뒤 O/X 를 바꿔 풀린 학생이 있음), none = 확인 전 */
  state: 'all' | 'some' | 'none'
  /** 확인된 줄 가운데 가장 늦은 시각(표시용). */
  finalizedAt: string | null
  /** 아직(또는 다시) 확인되지 않은 배정. */
  pending: string[]
}

export function lessonFinalState(lessonNo: number, assignmentIds: string[], finalizations: FinalizationRow[]): LessonFinalState {
  const mine = finalizations.filter((f) => f.lesson_no === lessonNo && assignmentIds.includes(f.assignment_id))
  const done = new Set(mine.map((f) => f.assignment_id))
  const pending = assignmentIds.filter((id) => !done.has(id))
  const finalizedAt = mine.map((f) => f.finalized_at).sort().at(-1) ?? null
  const state = assignmentIds.length > 0 && pending.length === 0 ? 'all' : done.size > 0 ? 'some' : 'none'
  return { state, finalizedAt, pending }
}

/** 한 배정에서 최종 확인된 차시 번호(오름차순) — 리포트 입력 finalizedLessons. */
export function finalizedLessonsOf(assignmentId: string, finalizations: { assignment_id: string; lesson_no: number }[]): number[] {
  return [...new Set(finalizations.filter((f) => f.assignment_id === assignmentId).map((f) => f.lesson_no))].sort((a, b) => a - b)
}

/** 한국 시간 날짜(YYYY-MM-DD). 서버·브라우저 어디서 그려도 같은 글자가 나온다. 읽을 수 없는 값이면 빈 문자열. */
export function kstDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10)
}
