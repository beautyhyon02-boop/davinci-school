'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { saveDraft, submitAnswer } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student.answer

const AUTOSAVE_MS = 30000

export function AnswerEditor({ assignmentId, itemNo, attempt, initialBody, submitted, label, points, stem, conditions }: {
  assignmentId: string; itemNo: number; attempt: number; initialBody: string; submitted: boolean
  // v2 조건 모양(conditions.items). answer_mode 'paper' 안내 화면은 Task 7.
  label: string; points: number; stem: string; conditions: { length: string; format: string; items: { no: number; text: string }[] }
}) {
  const [body, setBody] = useState(initialBody)
  const [status, setStatus] = useState<string | null>(null)
  const [isSubmitted, setSubmitted] = useState(submitted)
  const [pending, start] = useTransition()
  const dirty = useRef(false)
  // 최신 값을 ref 로 들고 있는다(latest-ref 패턴) — persist 를 안정된 함수로 유지해 autosave 인터벌이
  // 키 입력마다 재시작되지 않게 한다(그러면 계속 타이핑하는 동안 자동 저장이 blur 로만 동작하게 됨).
  const bodyRef = useRef(body)
  bodyRef.current = body
  const submittedRef = useRef(isSubmitted)
  submittedRef.current = isSubmitted

  const persist = useCallback(async () => {
    if (!dirty.current || submittedRef.current) return
    setStatus(copy.saving)
    const r = await saveDraft(assignmentId, itemNo, attempt, bodyRef.current)
    dirty.current = !r.ok
    setStatus(r.ok ? copy.saved : app.classroom.student.errors.saveFailed)
  }, [assignmentId, itemNo, attempt])
  useEffect(() => {
    const t = setInterval(() => { persist() }, AUTOSAVE_MS)
    return () => clearInterval(t)
  }, [persist])

  function onSubmit() {
    if (!window.confirm(copy.confirm)) return
    start(async () => {
      await persist()
      // 저장이 실패했으면(아직 dirty) 서버에 남은 옛 본문이 제출되지 않도록 여기서 멈춘다
      if (dirty.current) { setStatus(app.classroom.student.errors.saveFailed); return }
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
      <p className="mt-2 text-sm font-semibold text-ink-500">{copy.stem}</p>
      <p className="mt-1 whitespace-pre-wrap text-lg font-semibold">{stem}</p>
      <div className="mt-2 rounded-xl bg-ink-100/60 p-3 text-sm">
        <p className="font-semibold">{copy.conditions}</p>
        <ul className="list-disc pl-5">
          <li><span className="text-ink-500">{copy.conditionLength}</span> {conditions.length}</li>
          {conditions.items.map((c) => <li key={c.no}>{c.text}</li>)}
          <li><span className="text-ink-500">{copy.conditionFormat}</span> {conditions.format}</li>
        </ul>
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
