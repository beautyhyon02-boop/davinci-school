'use client'
import { useActionState, useState } from 'react'
import { createStudent, type IssuedState } from './actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { LEVELS } from '@/lib/studio/schemas'
import { app } from '@/content/site'

const copy = app.classroom.students

export function NewStudentForm() {
  const [state, action, pending] = useActionState<IssuedState, FormData>(createStudent, undefined)
  const [copied, setCopied] = useState(false)

  async function copyText() {
    if (!state?.issued) return
    await navigator.clipboard.writeText(`${copy.issued.loginId}: ${state.issued.loginId}\n${copy.issued.password}: ${state.issued.password}`)
    setCopied(true)
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">{copy.form.heading}</h2>
      {state?.issued ? (
        <div className="mt-3 rounded-xl bg-lemon-100 p-4">
          <p className="font-semibold">{copy.issued.heading}</p>
          <p className="mt-1 text-sm text-ink-700">{copy.issued.body}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-sm">
            <dt>{copy.issued.loginId}</dt><dd>{state.issued.loginId}</dd>
            <dt>{copy.issued.password}</dt><dd>{state.issued.password}</dd>
          </dl>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="ghost" onClick={copyText}>{copied ? copy.issued.copied : copy.issued.copy}</Button>
            <Button type="button" variant="ghost" onClick={() => window.print()}>{app.classroom.print}</Button>
          </div>
        </div>
      ) : null}
      <form action={action} className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">{copy.form.nameLabel}
          <input name="name" required className="rounded-xl border border-ink-300 px-3 py-2 font-normal" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-semibold">{copy.form.levelLabel}
            <select name="level" defaultValue={LEVELS[1]} className="rounded-xl border border-ink-300 px-3 py-2 font-normal">
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">{copy.form.gradeLabel}
            <input name="grade" type="number" min={1} max={6} defaultValue={1} className="rounded-xl border border-ink-300 px-3 py-2 font-normal" />
          </label>
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div><Button type="submit" disabled={pending}>{pending ? copy.form.submitting : copy.form.submit}</Button></div>
      </form>
    </Card>
  )
}
