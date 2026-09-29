'use client'
import { useState, useTransition } from 'react'
import { setQuizCell, fillEmptyQuiz, finalizeQuizLesson, unfinalizeQuizLesson } from './actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import { cellState, nextCellState, isTeacherEntered, assignmentsWithEmpty, fillCandidates, lessonFinalState, kstDate, type CellState, type FinalizationRow } from '@/lib/classroom/quiz-finalize'
import type { QuizResponseRow } from '@/lib/classroom/types'

const copy = app.classroom.review
/** openLessons = 그 학생에게 열린 차시 수. 아직 열지 않은 차시의 빈칸에는 O/X 를 넣지 않는다. */
type Student = { assignmentId: string; name: string; openLessons: number }
type Props = {
  setId: string
  lessons: { no: number; quizCount: number; types: ('choice' | 'short')[] }[]
  students: Student[]
  responses: QuizResponseRow[]
  /** 차시별 최종 확인 줄. finalizeAvailable=false(마이그레이션 0014 전)면 최종 확인 칸을 그리지 않는다. */
  finalizations: FinalizationRow[]
  finalizeAvailable: boolean
}

const CELL_STYLE: Record<CellState, string> = {
  O: 'bg-mint-100 text-mint-700',
  X: 'bg-red-100 text-red-700',
  empty: 'border border-dashed border-ink-300 bg-white text-ink-500',
}

/**
 * 퀴즈 O/X 표(학생 × 문항) + 종이 O/X 입력 + 차시별 최종 확인(설계 2026-09-29 §4.1).
 * 칸을 누르면 빈칸 → O → X (→ 빈칸)으로 바뀐다. 아무것도 막지 않는다 — 빈칸이 있어도 [최종 확인]을 누를 수 있다.
 * [이 차시 빈칸 모두 O]는 바로 채우지 않고 학생 목록을 편다 — 종이로 푼 학생만 체크해 채운다(결석한 학생을 O 로 채우지 않게).
 */
export function QuizMatrix({ setId, lessons, students, responses, finalizations, finalizeAvailable }: Props) {
  const [lesson, setLesson] = useState(lessons[0]?.no ?? 1)
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()
  // 빈칸을 채울 학생 고르기: null = 목록 닫힘, 배열 = 목록 열림(체크한 배정 id). 열 때는 아무도 체크돼 있지 않다.
  const [picked, setPicked] = useState<string[] | null>(null)
  const cur = lessons.find((l) => l.no === lesson)
  const ids = students.map((s) => s.assignmentId)
  const nameOf = (id: string) => students.find((s) => s.assignmentId === id)?.name ?? ''
  const cell = (aid: string, q: number) => responses.find((r) => r.assignment_id === aid && r.lesson_no === lesson && r.quiz_no === q)
  const rate = (q: number) => { const xs = students.map((s) => cell(s.assignmentId, q)).filter(Boolean) as QuizResponseRow[]; return xs.length ? Math.round((xs.filter((x) => x.correct).length / xs.length) * 100) : 0 }

  const run = (fn: () => Promise<{ ok: true; unfinalized?: boolean } | { ok: false; error: string }>) => start(async () => {
    const r = await fn()
    if (!r.ok) setMsg({ tone: 'error', text: r.error })
    else setMsg(r.unfinalized ? { tone: 'info', text: copy.finalize.unfinalized } : null)
  })

  const fin = lessonFinalState(lesson, ids, finalizations)
  const missing = cur ? assignmentsWithEmpty({ no: cur.no, quizCount: cur.quizCount }, ids, responses) : []
  // 고를 수 있는 학생: 이 차시에 빈칸이 있고, 이 차시가 열려 있는 학생
  const candidates = fillCandidates(lesson, students, missing)
  const isOpenFor = (s: Student) => s.openLessons >= lesson
  const names = (xs: string[]) => (
    <ul className="mt-1 space-y-0.5">{xs.map((id) => <li key={id} className="font-semibold">{nameOf(id)}</li>)}</ul>
  )

  return (
    <section className="rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{copy.quizHeading}</h2>
        {lessons.map((l) => (
          <button key={l.no} type="button" onClick={() => { setLesson(l.no); setMsg(null); setPicked(null) }}
            className={`rounded-full px-3 py-1 text-sm ${lesson === l.no ? 'bg-ink-900 text-white' : 'bg-ink-100'}`}>
            {finalizeAvailable && lessonFinalState(l.no, ids, finalizations).state === 'all' ? copy.finalize.tabDone(app.classroom.student.lessonTab(l.no)) : app.classroom.student.lessonTab(l.no)}
          </button>
        ))}
      </div>
      {cur && cur.quizCount > 0 ? (
        <>
          <div className="mt-3 rounded-xl bg-lavender-100/50 p-3 text-sm">
            <p className="font-semibold">{copy.quizCell.hintHeading}</p>
            <ul className="mt-1 space-y-0.5 text-ink-700">{copy.quizCell.hints.map((h) => <li key={h}>{h}</li>)}</ul>
          </div>
          <div className="mt-3">
            <Button type="button" variant="accent" aria-expanded={picked !== null} disabled={pending || candidates.length === 0} onClick={() => { setPicked(picked === null ? [] : null); setMsg(null) }}>{copy.fillEmpty}</Button>
            <p className="mt-1 text-sm text-ink-500">{copy.fillEmptyHint}</p>
            <p className="text-sm text-ink-500">{copy.fillEmptyAbsentHint}</p>
            {picked !== null && candidates.length > 0 && (
              <div className="mt-2 rounded-xl bg-lemon-100/60 p-4">
                <p className="font-bold">{copy.fillPick.heading}</p>
                <ul className="mt-2 space-y-1">
                  {candidates.map((id) => (
                    <li key={id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white p-2 text-sm font-semibold">
                        <input type="checkbox" checked={picked.includes(id)} disabled={pending}
                          onChange={(e) => setPicked(e.target.checked ? [...picked, id] : picked.filter((x) => x !== id))} />
                        <span>{nameOf(id)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" disabled={pending || picked.filter((id) => candidates.includes(id)).length === 0}
                    onClick={() => { const chosen = picked.filter((id) => candidates.includes(id)); setPicked(null); run(() => fillEmptyQuiz(setId, lesson, chosen)) }}>{copy.fillPick.confirm}</Button>
                  <Button type="button" variant="ghost" disabled={pending} onClick={() => setPicked(null)}>{copy.fillPick.cancel}</Button>
                </div>
              </div>
            )}
          </div>
          <table className="mt-3 w-full text-sm">
            <thead><tr><th className="p-2 text-left" />{Array.from({ length: cur.quizCount }, (_, i) => <th key={i} className="p-2">{i + 1}<div className="text-xs font-normal text-ink-500">{copy.quizRate(rate(i + 1))}</div></th>)}</tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.assignmentId} className="border-t border-ink-100">
                  <td className="p-2 font-semibold">{s.name}</td>
                  {Array.from({ length: cur.quizCount }, (_, i) => {
                    const r = cell(s.assignmentId, i + 1)
                    const state = cellState(r)
                    const next = nextCellState(r, cur.types[i])
                    const paper = isTeacherEntered(r)
                    // 이 학생에게 아직 열지 않은 차시의 빈칸: O/X 를 넣지 않는다(서버도 거절한다). 이미 넣은 칸은 고칠 수 있다.
                    const closedEmpty = !r && !isOpenFor(s)
                    return (
                      <td key={i} className="p-2 text-center">
                        <button type="button" disabled={next === null || pending || closedEmpty}
                          title={r ? (paper ? copy.quizCell.teacherEntered : copy.quizCell.studentAnswer(r.response)) : closedEmpty ? copy.quizCell.notOpen : copy.quizCell.labels.empty}
                          aria-label={copy.quizCell.aria(s.name, i + 1, copy.quizCell.labels[state])}
                          onClick={() => next !== null && run(() => setQuizCell(s.assignmentId, lesson, i + 1, next))}
                          className={`h-10 w-10 rounded-full text-base font-bold ${CELL_STYLE[state]} ${next === null || closedEmpty ? 'cursor-default' : 'cursor-pointer'}`}>
                          {state === 'empty' ? copy.noResponse : copy.quizCell.labels[state]}
                        </button>
                        {paper && <div className="mt-0.5 text-xs text-lavender-700">{copy.quizCell.paperMark}</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {msg && <p className={`mt-3 rounded-xl p-3 text-sm ${msg.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-lemon-100 text-ink-900'}`}>{msg.text}</p>}
          {finalizeAvailable && (
            <div className="mt-4 rounded-xl border border-ink-100 p-4">
              <p className="font-bold">{copy.finalize.heading(lesson)}</p>
              <p className="mt-1 text-sm text-ink-500">{copy.finalize.reportNote}</p>
              <p className="text-sm text-ink-500">{copy.finalize.changeNote}</p>
              {fin.state === 'all' ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Badge tone="mint">{copy.finalize.done(kstDate(fin.finalizedAt))}</Badge>
                  <button type="button" disabled={pending} onClick={() => run(() => unfinalizeQuizLesson(setId, lesson))} className="text-sm text-ink-500 underline">{copy.finalize.undo}</button>
                </div>
              ) : (
                <div className="mt-3">
                  <Button type="button" disabled={pending} onClick={() => run(() => finalizeQuizLesson(setId, lesson))}>{copy.finalize.button}</Button>
                </div>
              )}
              {fin.state === 'some' && (
                <div className="mt-3 text-sm">
                  <p className="text-ink-500">{copy.finalize.pendingHeading}</p>
                  {names(fin.pending)}
                </div>
              )}
              {missing.length > 0 && (
                <div className="mt-3 text-sm">
                  <p className="text-ink-500">{copy.finalize.missingHeading}</p>
                  {names(missing)}
                  <p className="mt-1 text-ink-500">{copy.finalize.missingNote}</p>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}
