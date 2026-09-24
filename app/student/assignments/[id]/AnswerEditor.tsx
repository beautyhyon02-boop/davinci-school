'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { saveDraft, submitAnswer } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student.answer
const studentCopy = app.classroom.student

const AUTOSAVE_MS = 30000

/** 학생에게 보이는 조건(v2 conditions 중 학생용 필드만). answer_mode 'paper' = 표·그래프를 종이에 직접 작성하는 문항. */
export type AnswerConditions = { length: string; format: string; answer_mode: 'screen' | 'paper'; items: { no: number; text: string }[] }

type Props = {
  assignmentId: string; itemNo: number; attempt: number; initialBody: string; submitted: boolean
  label: string; points: number; stem: string; conditions: AnswerConditions
}

function Prompt({ label, points, stem, conditions }: Pick<Props, 'label' | 'points' | 'stem' | 'conditions'>) {
  return (
    <>
      <h3 className="text-lg font-bold">{copy.heading(label, points)}</h3>
      <p className="mt-2 text-sm font-semibold text-ink-500">{copy.stem}</p>
      <p className="mt-1 whitespace-pre-wrap text-lg font-semibold">{stem}</p>
      <div className="mt-2 rounded-xl bg-ink-100/60 p-3 text-sm">
        {/* 조건 문장이 없는 문항(서술형, C-32)에는 "작성 조건" 머리글을 달지 않는다 — 분량·형식만 보인다 */}
        <p className="font-semibold">{conditions.items.length > 0 ? copy.conditions : copy.lengthFormat}</p>
        <ul className="list-disc pl-5">
          {conditions.items.map((c) => <li key={c.no}><span className="text-ink-500">{studentCopy.conditionItem(c.no)}</span> {c.text}</li>)}
          <li><span className="text-ink-500">{copy.conditionLength}</span> {conditions.length}</li>
          <li><span className="text-ink-500">{copy.conditionFormat}</span> {conditions.format}</li>
        </ul>
      </div>
    </>
  )
}

/**
 * 서·논술형 답안 칸. 종이 답안 문항(answer_mode 'paper')은 입력칸·제출 버튼 없이 안내만 보인다 — 원장이 사진을 올리면
 * 그 뒤는 화면 입력과 같은 채점 흐름이다(3주차 스펙 §4.6). 훅이 없는 갈림 컴포넌트라 두 갈래 모두 훅 규칙을 지킨다.
 */
export function AnswerEditor(props: Props) {
  if (props.conditions.answer_mode === 'paper') {
    return (
      <section className="rounded-2xl bg-white p-5">
        <Prompt label={props.label} points={props.points} stem={props.stem} conditions={props.conditions} />
        <p className="mt-3 rounded-xl bg-lemon-100 p-3">{studentCopy.paperAnswer}</p>
      </section>
    )
  }
  return <ScreenAnswerEditor {...props} />
}

function ScreenAnswerEditor({ assignmentId, itemNo, attempt, initialBody, submitted, label, points, stem, conditions }: Props) {
  const [body, setBody] = useState(initialBody)
  const [status, setStatus] = useState<string | null>(null)
  const [isSubmitted, setSubmitted] = useState(submitted)
  const [pending, start] = useTransition()
  const dirty = useRef(false)
  // 최신 본문·제출 여부를 ref 로도 들고 있는다(latest-ref) — persist 를 안정된 함수로 두어 autosave 인터벌이 키 입력마다
  // 다시 시작되지 않게 한다. ref 는 렌더 중이 아니라 값을 바꾸는 이벤트 처리기에서만 갱신한다(react-hooks/refs).
  const bodyRef = useRef(initialBody)
  const submittedRef = useRef(submitted)

  const persist = useCallback(async () => {
    if (!dirty.current || submittedRef.current) return
    setStatus(copy.saving)
    const r = await saveDraft(assignmentId, itemNo, attempt, bodyRef.current)
    dirty.current = !r.ok
    setStatus(r.ok ? copy.saved : studentCopy.errors.saveFailed)
  }, [assignmentId, itemNo, attempt])
  useEffect(() => {
    const t = setInterval(() => { persist() }, AUTOSAVE_MS)
    return () => clearInterval(t)
  }, [persist])

  function onChange(value: string) {
    bodyRef.current = value
    dirty.current = true
    setBody(value)
  }

  function onSubmit() {
    if (!window.confirm(copy.confirm)) return
    start(async () => {
      await persist()
      // 저장이 실패했으면(아직 dirty) 서버에 남은 옛 본문이 제출되지 않도록 여기서 멈춘다
      if (dirty.current) { setStatus(studentCopy.errors.saveFailed); return }
      const r = await submitAnswer(assignmentId, itemNo, attempt)
      if (!r.ok) { setStatus(r.error); return }
      submittedRef.current = true
      setSubmitted(true); setStatus(copy.submitted)
      // 채점 실행(Task 6 라우트). 실패해도 화면은 "확인 중" — 원장이 [다시 채점] 할 수 있다.
      fetch(`/api/classroom/gradings/${r.gradingId}/run`, { method: 'POST' }).catch(() => {})
    })
  }

  return (
    <section className="rounded-2xl bg-white p-5">
      <Prompt label={label} points={points} stem={stem} conditions={conditions} />
      <textarea value={body} readOnly={isSubmitted} placeholder={copy.placeholder} rows={10}
        onChange={(e) => onChange(e.target.value)} onBlur={persist}
        className="mt-3 w-full rounded-xl border border-ink-300 p-4 text-lg leading-relaxed read-only:bg-ink-100/40" />
      <div className="mt-2 flex items-center justify-between text-sm text-ink-500">
        <span>{copy.chars(body.length)}</span><span>{status}</span>
      </div>
      {!isSubmitted && <div className="mt-3"><Button type="button" disabled={pending} onClick={onSubmit}>{copy.submit}</Button></div>}
    </section>
  )
}
