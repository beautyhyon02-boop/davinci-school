'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveReportDraft, confirmReport, reopenReport, type ReportActionResult } from './actions'
import { UnitReportView } from '@/components/classroom/UnitReportView'
import { PrintButton } from '@/components/classroom/PrintButton'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import { applyEdits, restrictReport, editKey, MAX_SENTENCE, type ReportEdits } from '@/lib/classroom/report-edit'
import type { UnitReportBody } from '@/lib/classroom/report-schema'

const copy = app.classroom.report
const pg = copy.page
const ed = copy.edit

type Field = { key: string; label: string; base: string; rows: number }

/** 고칠 수 있는 문장 칸 목록(기본 문장과 함께). 숫자 칸은 없다. */
function fieldsOf(base: UnitReportBody): Field[] {
  const out: Field[] = [{ key: editKey.overall(), label: ed.overall, base: base.overall_comment, rows: 3 }]
  for (const s of base.subjects) {
    out.push({ key: editKey.summary(s.subject), label: ed.summary(s.subject), base: s.summary, rows: 2 })
    for (const q of s.quizzes) {
      if (!q.correct) out.push({ key: editKey.quiz(s.subject, q.lesson_no, q.quiz_no), label: ed.quizNote(s.subject, q.lesson_no, q.quiz_no), base: q.wrong_note ?? '', rows: 2 })
    }
    for (const a of s.assessment) {
      for (const c of a.criteria) {
        out.push({ key: editKey.phrase(s.subject, a.item_no, c.name), label: `${ed.phrase(s.subject, a.kind, c.name)} · ${ed.phraseKind[c.phrase_kind]}`, base: c.phrase ?? '', rows: 2 })
      }
    }
  }
  return out
}

/**
 * 단원 리포트 화면(원장): 넣을 과목 → 미리보기 → 문장 고치기 → [초안 저장]·[확정]·[인쇄].
 * 화면이 서버에 보내는 것은 과목 이름과 고친 문장뿐이다 — 점수·O/X 는 서버가 DB 에서 다시 만든다.
 * 부모가 저장 시각을 key 로 주므로 저장 뒤에는 새 본문으로 다시 시작한다.
 */
export function ReportEditor({ themeId, studentId, academyName, today, subjects, fresh, stored, initialEdits, stale, reportsAvailable }: {
  themeId: string; studentId: string; academyName: string
  /** 오늘 날짜(YYYY-MM-DD, 서버가 정한다). */
  today: string
  /** 이 단원에서 이 학생에게 배정된 과목(교과 순서). */
  subjects: string[]
  /** 지금 기록으로 새로 만든 본문(모든 과목, 기본 문장). */
  fresh: UnitReportBody
  stored: { status: 'draft' | 'confirmed'; body: UnitReportBody; confirmedAt: string | null } | null
  /** 저장된 본문에서 골라낸 고친 문장. */
  initialEdits: ReportEdits
  /** 저장한 뒤 점수·O/X 가 바뀌었는가. */
  stale: boolean
  reportsAvailable: boolean
}) {
  const router = useRouter()
  const confirmed = stored?.status === 'confirmed'
  const [included, setIncluded] = useState<string[]>(() => {
    const saved = stored?.body.included_subjects.filter((s) => subjects.includes(s)) ?? []
    return saved.length ? saved : subjects
  })
  const [edits, setEdits] = useState<ReportEdits>(initialEdits)
  // 저장된 본문을 그대로 보여 주는 동안은 true. [점수 다시 불러오기]나 과목 체크를 바꾸면 지금 기록으로 넘어간다.
  const [showStored, setShowStored] = useState<boolean>(!!stored && stale)
  const [reloaded, setReloaded] = useState(false)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const effective = included.length ? included : subjects
  const base = stored && (confirmed || showStored) ? stored.body : restrictReport(fresh, effective, copy.build)
  const preview = confirmed ? base : applyEdits(base, edits)
  const fields = confirmed ? [] : fieldsOf(base)

  const toggle = (subject: string) => {
    setIncluded((cur) => (cur.includes(subject) ? cur.filter((s) => s !== subject) : subjects.filter((s) => s === subject || cur.includes(s))))
    if (showStored) { setShowStored(false); setReloaded(true) }
    setMsg(null)
  }
  const setField = (key: string, value: string) => { setEdits((cur) => ({ ...cur, [key]: value })); setMsg(null) }
  const restore = (key: string) => setEdits((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== key)))
  const reload = () => { setShowStored(false); setReloaded(true); setMsg(null) }

  const run = (action: () => Promise<ReportActionResult>, done: string) => start(async () => {
    const r = await action()
    setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error })
    if (r.ok) router.refresh()
  })

  return (
    <>
      <div className="no-print mt-4 space-y-3">
        {!reportsAvailable && <p className="rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{pg.reportsUnavailable}</p>}
        {stale && confirmed && <p className="rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{pg.staleConfirmed}</p>}
        {stale && !confirmed && showStored && (
          <div className="space-y-2 rounded-xl bg-lemon-50 p-3">
            <p className="text-sm text-ink-700">{pg.stale}</p>
            <Button type="button" variant="accent" onClick={reload}>{pg.reload}</Button>
          </div>
        )}
        {reloaded && !showStored && <p className="rounded-xl bg-mint-50 p-3 text-sm text-ink-700">{pg.reloaded}</p>}

        {confirmed ? (
          <p className="text-sm text-ink-500">{pg.confirmedHint}</p>
        ) : (
          <fieldset className="rounded-2xl border border-ink-100 bg-white p-5">
            <legend className="px-1 text-base font-bold">{pg.subjectsHeading}</legend>
            <p className="text-sm text-ink-500">{pg.subjectsHint}</p>
            <ul className="mt-2 space-y-2">
              {subjects.map((s) => (
                <li key={s}>
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <input type="checkbox" className="h-4 w-4 accent-mint-500" checked={included.includes(s)} onChange={() => toggle(s)} />
                    {s}
                  </label>
                </li>
              ))}
            </ul>
            {included.length === 0 && <p className="mt-2 text-sm text-ink-500">{pg.subjectsNone}</p>}
          </fieldset>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {confirmed ? (
              <Button type="button" variant="accent" disabled={pending} onClick={() => run(() => reopenReport(themeId, studentId), pg.reopened)}>{pg.reopen}</Button>
            ) : (
              <>
                <Button type="button" variant="accent" disabled={pending} onClick={() => run(() => saveReportDraft(themeId, studentId, effective, edits), pg.saved)}>{pending ? pg.saving : pg.saveDraft}</Button>
                <Button type="button" disabled={pending} onClick={() => run(() => confirmReport(themeId, studentId, effective, edits), pg.confirmed)}>{pg.confirm}</Button>
              </>
            )}
            <PrintButton label={pg.print} />
          </div>
          {msg && <p className={`text-sm ${msg.ok ? 'text-mint-700' : 'text-red-600'}`}>{msg.text}</p>}
          {!confirmed && <p className="text-sm text-ink-500">{pg.numbersNote}</p>}
          {!confirmed && <p className="text-sm text-ink-500">{pg.printHint}</p>}
        </div>
        <h2 className="pt-2 text-lg font-bold">{pg.previewHeading}</h2>
      </div>

      <div className="mt-3 print:mt-0">
        <UnitReportView body={preview} academyName={academyName} date={confirmed && stored?.confirmedAt ? stored.confirmedAt.slice(0, 10) : today} draft={!confirmed} />
      </div>

      {!confirmed && (
        <section className="no-print mx-auto mt-6 max-w-[720px] space-y-4 rounded-2xl border border-ink-100 bg-white p-6">
          <h2 className="text-lg font-bold">{ed.heading}</h2>
          <p className="text-sm text-ink-500">{ed.hint}</p>
          {fields.map((f) => {
            const edited = Object.prototype.hasOwnProperty.call(edits, f.key)
            const value = edited ? edits[f.key] : f.base
            return (
              <div key={f.key} className="grid gap-1">
                <label htmlFor={`f-${f.key}`} className="text-sm font-semibold text-ink-700">{f.label}</label>
                <textarea
                  id={`f-${f.key}`} value={value} rows={f.rows} maxLength={MAX_SENTENCE}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="rounded-xl border border-ink-300 p-2 text-sm text-ink-900"
                />
                <p className="text-xs text-ink-500">{ed.maxChars(value.length, MAX_SENTENCE)}</p>
                {edited && <button type="button" onClick={() => restore(f.key)} className="w-fit text-xs text-mint-700 underline">{ed.restore}</button>}
              </div>
            )
          })}
        </section>
      )}
    </>
  )
}
