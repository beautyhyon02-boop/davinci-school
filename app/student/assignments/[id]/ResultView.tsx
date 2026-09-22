import { app } from '@/content/site'
import type { Criterion } from '@/lib/classroom/types'

const copy = app.classroom.student.result
export type StudentGrading = { answer_id: string; final_criteria: Criterion[] | null; final_score: number | null; final_strengths: string[] | null; final_improvements: string[] | null; teacher_comment: string | null }

export function ResultView({ label, points, attempt, grading }: { label: string; points: number; attempt: number; grading: StudentGrading }) {
  return (
    <section className="rounded-2xl bg-mint-50 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">{copy.heading(label)}</h3>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold">{copy.attempt(attempt)} · {copy.score(grading.final_score ?? 0, points)}</span>
      </div>
      {(grading.final_criteria?.length ?? 0) > 1 && (
        <ul className="mt-3 space-y-1">
          {grading.final_criteria!.map((c, i) => <li key={i}><span className="font-semibold">{c.name}</span> {c.points}/{c.max} — <span className="text-ink-700">{copy.evidence}: “{c.evidence}”</span></li>)}
        </ul>
      )}
      <p className="mt-3 font-semibold">{copy.strengths}</p>
      <ul className="list-disc pl-6">{(grading.final_strengths ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>
      <p className="mt-3 font-semibold">{copy.improvements}</p>
      <ul className="list-disc pl-6">{(grading.final_improvements ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>
      {grading.teacher_comment && <p className="mt-3 rounded-xl bg-white p-3"><span className="font-semibold">{copy.comment}:</span> {grading.teacher_comment}</p>}
    </section>
  )
}
