'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmNotice } from '../../../actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import type { NoticeT } from '@/lib/classroom/notice-schema'

const copy = app.classroom.notice
const ed = copy.edit

function Field({ label, value, max, rows = 2, onChange }: { label: string; value: string; max: number; rows?: number; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-ink-500">
      <span className="flex justify-between gap-2">{label}<span className="font-normal">{ed.maxChars(value.length, max)}</span></span>
      <textarea value={value} rows={rows} maxLength={max} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-ink-300 p-2 text-sm font-normal text-ink-900" />
    </label>
  )
}

/**
 * 원장 확정(HITL). 문장 칸만 고칠 수 있다 — 점수·정오·이름은 서버가 저장된 초안에서 그대로 가져온다(confirmNotice 의 mergeEditable).
 * 부모가 updated_at 을 key 로 주므로 저장 뒤 새 본문으로 다시 마운트된다.
 */
export function NoticeEditForm({ assignmentId, lessonNo, notice, confirmed }: { assignmentId: string; lessonNo: number; notice: NoticeT; confirmed: boolean }) {
  const router = useRouter()
  const [n, setN] = useState<NoticeT>(notice)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [issues, setIssues] = useState<string[]>([])
  const setQuizNote = (i: number, v: string) => setN({ ...n, participation: { ...n.participation, quiz: { ...n.participation.quiz, items: n.participation.quiz.items.map((it, j) => (j === i ? { ...it, note: v } : it)) } } })
  // 단원 평가 차시는 서술형·논술형 결과가 둘 — k 번째 결과의 i 번째 요소만 바꾼다
  const setResult = (k: number, patch: (r: NoticeT['essay_results'][number]) => NoticeT['essay_results'][number]) => setN({ ...n, essay_results: n.essay_results.map((r, j) => (j === k ? patch(r) : r)) })
  const setCriterion = (k: number, i: number, key: 'good_point' | 'improve_point', v: string) => setResult(k, (r) => ({ ...r, criteria_feedback: r.criteria_feedback.map((c, j) => (j === i ? { ...c, [key]: v } : c)) }))
  const submit = () => start(async () => {
    const r = await confirmNotice(assignmentId, lessonNo, n)
    setIssues(r.issues ?? [])
    setMsg(r.ok ? { ok: true, text: copy.confirmed } : { ok: false, text: r.error })
    if (r.ok) router.refresh()
  })

  return (
    <section className="no-print mx-auto mt-6 max-w-[720px] space-y-3 rounded-2xl border border-ink-100 bg-white p-6">
      <h2 className="text-lg font-bold">{ed.heading}</h2>
      <p className="text-sm text-ink-500">{ed.hint}</p>
      <Field label={ed.topicSummary} value={n.lesson_context.topic_summary} max={60} onChange={(v) => setN({ ...n, lesson_context: { ...n.lesson_context, topic_summary: v } })} />
      {n.participation.quiz.items.map((it, i) => (it.is_correct ? null : (
        <Field key={`q${i}`} label={ed.quizNote(i + 1)} value={it.note ?? ''} max={40} onChange={(v) => setQuizNote(i, v)} />
      )))}
      <Field label={ed.directorComment} value={n.participation.director_comment ?? ''} max={80} onChange={(v) => setN({ ...n, participation: { ...n.participation, director_comment: v } })} />
      {n.essay_results.map((e, k) => (
        <div key={e.kind} className="grid gap-2">
          {e.criteria_feedback.map((c, i) => (
            <div key={`c${i}`} className="grid gap-2 rounded-xl bg-ink-100/40 p-3">
              <Field label={ed.good(c.criterion_name)} value={c.good_point} max={60} onChange={(v) => setCriterion(k, i, 'good_point', v)} />
              <Field label={ed.improve(c.criterion_name)} value={c.improve_point ?? ''} max={60} onChange={(v) => setCriterion(k, i, 'improve_point', v)} />
            </div>
          ))}
          {e.retry && (
            <Field label={ed.improvementFor(e.kind)} value={e.retry.improvement_comment ?? ''} max={70} onChange={(v) => setResult(k, (r) => ({ ...r, retry: r.retry ? { ...r.retry, improvement_comment: v } : null }))} />
          )}
        </div>
      ))}
      <Field label={ed.preview} value={n.next_lesson.preview} max={50} onChange={(v) => setN({ ...n, next_lesson: { ...n.next_lesson, preview: v } })} />
      <Field label={ed.homeStudy} value={n.next_lesson.home_study_suggestion} max={60} onChange={(v) => setN({ ...n, next_lesson: { ...n.next_lesson, home_study_suggestion: v } })} />
      <Field label={ed.directorMessage} value={n.director_message ?? ''} max={100} rows={3} onChange={(v) => setN({ ...n, director_message: v })} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={pending} onClick={submit}>{pending ? copy.confirming : confirmed ? copy.reconfirm : copy.confirm}</Button>
        {msg && <p className={`text-sm ${msg.ok ? 'text-mint-700' : 'text-red-600'}`}>{msg.text}</p>}
      </div>
      {issues.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-red-600">{copy.lintHeading}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-600">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      )}
    </section>
  )
}
