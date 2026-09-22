'use client'
import { useState, useTransition } from 'react'
import { overrideQuiz } from './actions'
import { app } from '@/content/site'
import type { QuizResponseRow } from '@/lib/classroom/types'

const copy = app.classroom.review
type Student = { assignmentId: string; name: string }

export function QuizMatrix({ lessons, students, responses }: { lessons: { no: number; quizCount: number; types: ('choice' | 'short')[] }[]; students: Student[]; responses: QuizResponseRow[] }) {
  const [lesson, setLesson] = useState(lessons[0]?.no ?? 1)
  const [pending, start] = useTransition()
  const cur = lessons.find((l) => l.no === lesson)
  const cell = (aid: string, q: number) => responses.find((r) => r.assignment_id === aid && r.lesson_no === lesson && r.quiz_no === q)
  const rate = (q: number) => { const xs = students.map((s) => cell(s.assignmentId, q)).filter(Boolean) as QuizResponseRow[]; return xs.length ? Math.round((xs.filter((x) => x.correct).length / xs.length) * 100) : 0 }

  return (
    <section className="rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{copy.quizHeading}</h2>
        {lessons.map((l) => <button key={l.no} type="button" onClick={() => setLesson(l.no)} className={`rounded-full px-3 py-1 text-sm ${lesson === l.no ? 'bg-ink-900 text-white' : 'bg-ink-100'}`}>{app.classroom.student.lessonTab(l.no)}</button>)}
      </div>
      {cur && cur.quizCount > 0 ? (
        <table className="mt-3 w-full text-sm">
          <thead><tr><th className="p-2 text-left" />{Array.from({ length: cur.quizCount }, (_, i) => <th key={i} className="p-2">{i + 1}<div className="text-xs font-normal text-ink-500">{copy.quizRate(rate(i + 1))}</div></th>)}</tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.assignmentId} className="border-t border-ink-100">
                <td className="p-2 font-semibold">{s.name}</td>
                {Array.from({ length: cur.quizCount }, (_, i) => {
                  const r = cell(s.assignmentId, i + 1)
                  const canFlip = r && cur.types[i] === 'short'
                  return (
                    <td key={i} className="p-2 text-center">
                      {r ? (
                        <button type="button" disabled={!canFlip || pending} title={r.response}
                          onClick={() => canFlip && start(async () => { await overrideQuiz(s.assignmentId, lesson, i + 1, !r.correct) })}
                          className={`h-8 w-8 rounded-full ${r.correct ? 'bg-mint-500' : 'bg-red-400'} ${canFlip ? 'cursor-pointer' : 'cursor-default'}`} aria-label={r.correct ? copy.overrideWrong : copy.overrideCorrect} />
                      ) : <span className="text-ink-500">{copy.noResponse}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  )
}
