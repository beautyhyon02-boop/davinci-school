'use client'
import { useActionState } from 'react'
import { createAssignments, type AssignState } from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'

const copy = app.classroom.assign
export type StudentOption = { id: string; name: string; grade: number; assigned: boolean }

/** setGrade null = 학년을 정하지 않은 세트(학교급 학년군 전체) — 학년이 달라도 표시하지 않는다. */
export function AssignForm({ setId, setGrade, students, maxLessons }: { setId: string; setGrade: number | null; students: StudentOption[]; maxLessons: number }) {
  const bound = createAssignments.bind(null, setId)
  const [state, action, pending] = useActionState<AssignState, FormData>(bound, undefined)
  return (
    <form action={action} className="grid gap-4">
      <fieldset className="rounded-2xl bg-white p-4">
        <legend className="px-1 text-sm font-semibold">{copy.students}</legend>
        <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" onChange={(e) => {
          document.querySelectorAll<HTMLInputElement>('input[name=student]:not(:disabled)').forEach((el) => { el.checked = e.target.checked })
        }} />{copy.selectAll}</label>
        <ul className="grid gap-1 sm:grid-cols-2">
          {students.map((st) => (
            <li key={st.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="student" value={st.id} disabled={st.assigned} />
              <span className={st.assigned ? 'text-ink-500' : ''}>{st.name}</span>
              {st.assigned && <Badge tone="gray">{copy.alreadyAssigned}</Badge>}
              {!st.assigned && setGrade != null && st.grade !== setGrade && <Badge tone="lemon">{copy.gradeMismatch(setGrade)}</Badge>}
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">{copy.dueLabel}<input type="date" name="due_at" className="rounded-xl border border-ink-300 px-3 py-2 font-normal" /></label>
        <label className="grid gap-1 text-sm font-semibold">{copy.openLabel}
          <input type="number" name="open_lessons" min={1} max={maxLessons} defaultValue={1} className="rounded-xl border border-ink-300 px-3 py-2 font-normal" /></label>
        <label className="flex items-end gap-2 pb-2 text-sm font-semibold"><input type="checkbox" name="allow_retry" defaultChecked />{copy.retryLabel}</label>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div><Button type="submit" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button></div>
    </form>
  )
}
