'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { saveDraft, submitAnswer } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student.answer

const AUTOSAVE_MS = 30000

export function AnswerEditor({ assignmentId, itemNo, attempt, initialBody, submitted, label, points, conditions }: {
  assignmentId: string; itemNo: number; attempt: number; initialBody: string; submitted: boolean
  label: string; points: number; conditions: { length: string; required: string[]; format: string }
}) {
  const [body, setBody] = useState(initialBody)
  const [status, setStatus] = useState<string | null>(null)
  const [isSubmitted, setSubmitted] = useState(submitted)
  const [pending, start] = useTransition()
  const dirty = useRef(false)

  async function persist() {
    if (!dirty.current || isSubmitted) return
    setStatus(copy.saving)
    const r = await saveDraft(assignmentId, itemNo, attempt, body)
    dirty.current = !r.ok
    setStatus(r.ok ? copy.saved : app.classroom.student.errors.saveFailed)
  }
  useEffect(() => { const t = setInterval(persist, AUTOSAVE_MS); return () => clearInterval(t) })

  function onSubmit() {
    if (!window.confirm(copy.confirm)) return
    start(async () => {
      await persist()
      const r = await submitAnswer(assignmentId, itemNo, attempt)
      if (!r.ok) { setStatus(r.error); return }
      setSubmitted(true); setStatus(copy.submitted)
      // 채점 실행(Task 6 라우트). 실패해도 화면은 "확인 중" — 원장이 [다시 채점] 할 수 있다.
      fetch(`/api/classroom/gradings/${r.gradingId}/run`, { method: 'POST' }).catch(() => {})
    })
  }

  return (
    <section className="rounded-2xl bg-white p-5">
      <h3 className="text-lg font-bold">{copy.heading(label, points)}</h3>
      <div className="mt-2 rounded-xl bg-ink-100/60 p-3 text-sm">
        <p className="font-semibold">{copy.conditions}</p>
        <ul className="list-disc pl-5"><li>{conditions.length}</li>{conditions.required.map((c, i) => <li key={i}>{c}</li>)}<li>{conditions.format}</li></ul>
      </div>
      <textarea value={body} readOnly={isSubmitted} placeholder={copy.placeholder} rows={10}
        onChange={(e) => { setBody(e.target.value); dirty.current = true }} onBlur={persist}
        className="mt-3 w-full rounded-xl border border-ink-300 p-4 text-lg leading-relaxed read-only:bg-ink-100/40" />
      <div className="mt-2 flex items-center justify-between text-sm text-ink-500">
        <span>{copy.chars(body.length)}</span><span>{status}</span>
      </div>
      {!isSubmitted && <div className="mt-3"><Button type="button" disabled={pending} onClick={onSubmit}>{copy.submit}</Button></div>}
    </section>
  )
}
