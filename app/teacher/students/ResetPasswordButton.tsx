'use client'
import { useState, useTransition } from 'react'
import { resetStudentPassword } from './actions'
import { app } from '@/content/site'

const copy = app.classroom.students.reset

export function ResetPasswordButton({ profileId }: { profileId: string }) {
  const [result, setResult] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function onClick() {
    if (!window.confirm(copy.confirm)) return
    start(async () => { const r = await resetStudentPassword(profileId); setResult(r.password ?? r.error ?? null) })
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={onClick} disabled={pending} className="text-xs text-ink-500 underline">{copy.button}</button>
      {result && <span className="rounded bg-lemon-100 px-2 py-0.5 font-mono text-xs">{copy.done}: {result}</span>}
    </span>
  )
}
