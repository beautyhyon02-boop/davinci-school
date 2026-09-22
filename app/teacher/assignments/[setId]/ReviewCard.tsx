'use client'
import { useEffect, useState, useTransition } from 'react'
import { confirmGrading, reopenGrading, requestRegrade, regradeAi } from './actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import type { AnswerRow, Criterion, GradingRow } from '@/lib/classroom/types'

const copy = app.classroom.review

export type ReviewItem = { itemNo: number; label: string; points: number; answer: AnswerRow | null; grading: GradingRow | null; prev?: { score: number | null } }

function statusOf(it: ReviewItem): keyof typeof copy.status {
  if (!it.answer?.submitted_at) return 'none'
  if (it.answer.attempt === 2 && !it.grading?.confirmed_at) return 'retry'
  return (it.grading?.status ?? 'pending') as keyof typeof copy.status
}
const TONE: Record<keyof typeof copy.status, 'gray' | 'lemon' | 'mint' | 'lavender'> = { none: 'gray', pending: 'lavender', drafted: 'lemon', confirmed: 'mint', failed: 'gray', rejected: 'gray', retry: 'lavender' }

export function ReviewCard({ item }: { item: ReviewItem }) {
  const g = item.grading
  const st = statusOf(item)
  // 화면 시작값: 확정본이 있으면(확정 또는 다시 고치기 중) 확정본, 없으면 AI 초안
  const [criteria, setCriteria] = useState<Criterion[]>(g?.final_criteria ?? g?.ai_criteria ?? [])
  const [strengths, setStrengths] = useState<string[]>(g?.final_strengths ?? g?.ai_strengths ?? [])
  const [improvements, setImprovements] = useState<string[]>(g?.final_improvements ?? g?.ai_improvements ?? [])
  const [comment, setComment] = useState(g?.teacher_comment ?? '')
  const [adjustNote, setAdjustNote] = useState(g?.adjust_note ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(st === 'drafted')
  const [pending, start] = useTransition()
  // 재채점(drafted→drafted) 뒤 서버 값이 바뀌면 편집 상태를 새 값으로 되돌린다(page.tsx 의 key 와 이중 안전장치).
  // ai_criteria 는 새로 그릴 때마다 객체가 새로 오므로 내용(JSON)으로 비교한다 — 다른 카드의 저장으로 이 카드 편집이 지워지지 않게.
  const aiKey = JSON.stringify(g?.ai_criteria ?? null)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 서버 값이 바뀐 때만 편집 상태를 다시 맞춘다 */
    setCriteria(g?.final_criteria ?? g?.ai_criteria ?? [])
    setStrengths(g?.final_strengths ?? g?.ai_strengths ?? [])
    setImprovements(g?.final_improvements ?? g?.ai_improvements ?? [])
    setComment(g?.teacher_comment ?? '')
    setAdjustNote(g?.adjust_note ?? '')
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id·updated_at·AI 초안 내용이 바뀔 때만 다시 맞춘다
  }, [g?.id, g?.updated_at, aiKey])
  // "고쳤는지"는 모든 칸을 AI 초안 하나와만 비교한다(확정본과 AI 초안을 섞어 비교하면 다시 확정할 때 원장 수정이 되돌아간다)
  const edited = JSON.stringify({ criteria, strengths, improvements, comment }) !== JSON.stringify({ criteria: g?.ai_criteria ?? [], strengths: g?.ai_strengths ?? [], improvements: g?.ai_improvements ?? [], comment: '' })
  const score = criteria.reduce((s, c) => s + c.points, 0)

  const list = (label: string, xs: string[], set: (v: string[]) => void) => (
    <div>
      <p className="text-sm font-semibold text-ink-500">{label}</p>
      {xs.map((x, i) => (
        <div key={i} className="mt-1 flex gap-2">
          <textarea value={x} rows={2} onChange={(e) => set(xs.map((y, j) => (j === i ? e.target.value : y)))} className="w-full rounded-xl border border-ink-300 p-2 text-sm" />
          <button type="button" onClick={() => set(xs.filter((_, j) => j !== i))} className="text-xs text-ink-500 underline">{copy.remove}</button>
        </div>
      ))}
      <button type="button" onClick={() => set([...xs, ''])} className="mt-1 text-xs text-mint-700 underline">{copy.addLine}</button>
    </div>
  )

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-2 text-left">
        <span className="font-bold">{item.label}</span>
        <Badge tone={TONE[st]}>{copy.status[st]}</Badge>
        {item.answer && <Badge tone="gray">{copy.attempt(item.answer.attempt)}</Badge>}
        {g?.model === 'mock' && <Badge tone="lemon">{copy.mock}</Badge>}
        {g?.status === 'confirmed' && <span className="text-sm text-ink-500">{g.final_score}/{item.points}</span>}
        {item.prev && g?.final_score != null && item.prev.score != null && <span className="text-sm text-ink-500">{copy.compare(item.prev.score, g.final_score)}</span>}
      </button>
      {open && item.answer && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-ink-500">{copy.studentAnswer}</p>
            <p className="mt-1 whitespace-pre-wrap rounded-xl bg-ink-100/50 p-3 text-sm">{item.answer.body}</p>
          </div>
          {g && (g.status === 'drafted' || g.status === 'confirmed') ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink-500">{g.status === 'confirmed' ? copy.finalLabel : copy.aiDraft}</p>
              <div>
                <p className="text-sm font-semibold text-ink-500">{copy.criteria}</p>
                {criteria.map((c, i) => (
                  <div key={i} className="mt-1 rounded-xl border border-ink-100 p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      <input type="number" min={0} max={c.max} value={c.points} disabled={g.status === 'confirmed'}
                        onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, points: Math.max(0, Math.min(c.max, Number(e.target.value))) } : x)))} className="w-16 rounded border border-ink-300 px-2 py-1" />
                      <span className="text-ink-500">/ {c.max}</span>
                    </div>
                    <p className="mt-1 text-ink-700"><span className="text-ink-500">{copy.evidence}:</span> “{c.evidence}”</p>
                    {c.note && <p className="text-xs text-ink-500">{c.note}</p>}
                  </div>
                ))}
                <p className="mt-1 text-sm font-semibold">{copy.score}: {score}/{item.points}</p>
              </div>
              {g.status === 'confirmed' ? (
                <>
                  <p className="text-sm">{copy.strengths}: {strengths.join(' / ')}</p>
                  <p className="text-sm">{copy.improvements}: {improvements.join(' / ')}</p>
                  {comment && <p className="text-sm">{copy.comment}: {comment}</p>}
                  <p className="text-xs text-ink-500">{copy.confirmedAt(g.confirmed_at?.slice(0, 16).replace('T', ' ') ?? '')}</p>
                  <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await reopenGrading(g.id); setMsg(r.ok ? null : r.error) })}>{copy.reopen}</Button>
                </>
              ) : (
                <>
                  {list(copy.strengths, strengths, setStrengths)}
                  {list(copy.improvements, improvements, setImprovements)}
                  <label className="grid gap-1 text-sm font-semibold text-ink-500">{copy.comment}<textarea value={comment} rows={2} onChange={(e) => setComment(e.target.value)} className="rounded-xl border border-ink-300 p-2 text-sm font-normal" /></label>
                  {score !== (g.ai_score ?? score) && (
                    <label className="grid gap-1 text-sm font-semibold text-ink-500">{copy.adjustNote}<input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className="rounded-xl border border-ink-300 p-2 text-sm font-normal" /></label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={pending} onClick={() => start(async () => {
                      const r = await confirmGrading(g.id, edited ? { criteria, strengths, improvements, comment, adjustNote } : null); setMsg(r.ok ? null : r.error)
                    })}>{edited ? copy.confirmEdited : copy.confirmAsIs}</Button>
                    <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await regradeAi(g.id); setMsg(r.ok ? null : r.error) })}>{copy.regrade}</Button>
                    <Button type="button" variant="ghost" disabled={pending || g.regrade_requested} onClick={() => start(async () => { const r = await requestRegrade(g.id); setMsg(r.ok ? null : r.error) })}>{copy.requestRegrade}</Button>
                  </div>
                </>
              )}
              {msg && <p className="text-sm text-red-600">{msg}</p>}
            </div>
          ) : g && (g.status === 'failed' || g.status === 'pending') ? (
            // 실패 또는 멈춘 채점(pending) — [AI 다시 채점]으로 살린다. 실행 중이면 서버의 줄 잡기가 두 번째 실행을 막는다.
            <div className="space-y-2">
              {g.status === 'failed' ? <p className="text-sm text-red-600">{g.error}</p> : <p className="text-sm text-ink-500">{copy.status.pending}</p>}
              <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await regradeAi(g.id); setMsg(r.ok ? null : r.error) })}>{copy.regrade}</Button>
              {msg && <p className="text-sm text-red-600">{msg}</p>}
            </div>
          ) : (
            <p className="text-sm text-ink-500">{copy.status.pending}</p>
          )}
        </div>
      )}
    </div>
  )
}
