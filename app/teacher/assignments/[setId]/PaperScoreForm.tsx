'use client'
import { useState, useTransition } from 'react'
import { enterPaperScore, confirmGrading } from './actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import { manualTotal } from '@/lib/classroom/manual'

const copy = app.classroom.review.paper

export type PaperRubric = { name: string; max: number; scale: { points: number; descriptor: string }[] }[]
type Props = {
  assignmentId: string
  itemNo: number
  label: string
  points: number
  /** 채점표 요소(채점표 순서)와 척도(0점부터 오름차순 — 서버가 맞춰 넘긴다). */
  rubric: PaperRubric
  /** 있으면 고치기(다시 고치기로 확정을 푼 종이 답안 점수) — 저장은 confirmGrading. 없으면 새로 넣기. */
  edit?: { gradingId: string; points: number[]; comment: string }
  /** 학생이 쓰다 만 글(제출 전 임시저장)이 있다 — 저장하면 그 글이 바뀐다고 한 줄로 알린다. 저장은 막지 않는다. */
  draftWarning?: boolean
}

/**
 * [종이 답안 점수 입력](설계 2026-09-29 §4.2): 요소 이름(굵게) 아래 척도를 한 줄에 하나씩 고르고, 합계가 바로 바뀐다.
 * 저장하면 확정본이 된다(AI 호출 없음).
 */
export function PaperScoreForm({ assignmentId, itemNo, label, points, rubric, edit, draftWarning }: Props) {
  const [open, setOpen] = useState(!!edit)
  const [chosen, setChosen] = useState<(number | null)[]>(rubric.map((_, i) => edit?.points[i] ?? null))
  const [comment, setComment] = useState(edit?.comment ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const { total, complete } = manualTotal(chosen)
  const group = `paper-${assignmentId}-${itemNo}`

  function save() {
    if (!complete) return
    const pts = chosen.map((p) => p ?? 0)
    start(async () => {
      const r = edit
        ? await confirmGrading(edit.gradingId, { criteria: rubric.map((c, i) => ({ name: c.name, points: pts[i], max: c.max, evidence: '', note: '' })), strengths: [], improvements: [], comment, adjustNote: '' })
        : await enterPaperScore(assignmentId, itemNo, pts, comment)
      setMsg(r.ok ? { ok: true, text: copy.saved } : { ok: false, text: r.error })
    })
  }

  return (
    <div className="rounded-2xl border border-lavender-100 bg-lavender-100/30 p-4">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2 text-left">
        <span className="font-bold">{label}</span>
        <Badge tone="lavender">{copy.badge}</Badge>
        <span className="text-sm text-mint-700 underline">{open ? copy.close : copy.open}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-ink-700">{edit ? copy.editIntro : copy.intro}</p>
          {draftWarning && !edit && <p className="rounded-xl bg-lemon-100 p-3 text-sm text-ink-900">{copy.draftWarning}</p>}
          {rubric.map((c, i) => (
            <fieldset key={c.name} className="rounded-xl bg-white p-3">
              <legend className="px-1 text-base font-bold">{c.name} <span className="text-sm font-normal text-ink-500">{copy.criterionMax(c.max)}</span></legend>
              <div className="mt-1 space-y-1">
                {c.scale.map((s) => (
                  <label key={s.points} className={`flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm ${chosen[i] === s.points ? 'bg-mint-100' : ''}`}>
                    <input type="radio" name={`${group}-${i}`} value={s.points} checked={chosen[i] === s.points} className="mt-1"
                      onChange={() => { setChosen(chosen.map((x, j) => (j === i ? s.points : x))); setMsg(null) }} />
                    <span>{copy.scaleLine(s.points, s.descriptor)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-lg font-bold">{copy.total(total, points)}</p>
          <label className="grid gap-1 text-sm font-semibold text-ink-500">{copy.comment}
            <textarea value={comment} rows={2} onChange={(e) => setComment(e.target.value)} className="rounded-xl border border-ink-300 bg-white p-2 text-sm font-normal text-ink-900" />
          </label>
          <div>
            <Button type="button" disabled={pending || !complete} onClick={save}>{copy.save}</Button>
            {!complete && <p className="mt-1 text-sm text-ink-500">{copy.chooseAll}</p>}
            {msg && <p className={`mt-1 text-sm ${msg.ok ? 'text-mint-700' : 'text-red-600'}`}>{msg.text}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
