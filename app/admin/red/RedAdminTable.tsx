'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { app } from '@/content/site'
import { publishRed, holdRed, unpublishRed, updateRedMeta, deleteRedReport } from './actions'
import { RED_STATUSES, RED_TYPES, type RedReportRow, type RedStatus } from '@/lib/red/reports'

const copy = app.adminRed
type Result = { ok: boolean; error?: string }
type Run = (fn: () => Promise<Result>, okMsg?: string) => void
const link = 'text-xs underline disabled:opacity-50'

/**
 * 본사 RED 자료실 표(PRD 2026-10-16): 검수대기/게시됨/보류 탭(건수) → 줄마다 [게시]/[보류]/[게시 취소]·[수정]·[지우기].
 * [수정]은 줄 아래에 폼이 펼쳐진다(구분·종류·시리즈·과목·제목·날짜·요약·참고 링크·파일 바꾸기).
 */
export function RedAdminTable({ rows, initialTab = 'pending' }: { rows: RedReportRow[]; initialTab?: RedStatus }) {
  const [tab, setTab] = useState<RedStatus>(initialTab)
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  // 세션이 끝나 액션이 던져도(forbidden) 화면이 조용히 멈추지 않게 받아서 보여 준다(검토 2026-10-16)
  const run: Run = (fn, okMsg) => start(async () => {
    try { const r = await fn(); setMsg(r.ok ? (okMsg ? { text: okMsg, ok: true } : null) : { text: r.error ?? copy.errors.db_failed, ok: false }) }
    catch { setMsg({ text: copy.errors.db_failed, ok: false }) }
  })
  const counts = Object.fromEntries(RED_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<RedStatus, number>
  const shown = rows.filter((r) => r.status === tab)

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        {RED_STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setTab(s)} aria-pressed={tab === s}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === s ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700'}`}>
            {copy.tabs[s]} {counts[s]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="mt-6 text-sm text-ink-500">{copy.empty}</p> : (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink-100/60 text-left">
              <tr>{(['date', 'category', 'redType', 'kind', 'series', 'subject', 'title'] as const).map((k) => <th key={k} className="p-3">{copy.columns[k]}</th>)}<th className="p-3" /></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Row key={r.id} r={r} pending={pending} editing={editing === r.id} onEdit={() => setEditing(editing === r.id ? null : r.id)} run={run} onSaved={() => setEditing(null)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-mint-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  )
}

function Row({ r, pending, editing, onEdit, run, onSaved }: { r: RedReportRow; pending: boolean; editing: boolean; onEdit: () => void; run: Run; onSaved: () => void }) {
  const hold = () => { const note = window.prompt(copy.holdPrompt, r.hold_note); if (note !== null) run(() => holdRed(r.id, note)) }
  return (
    <>
      <tr data-red-row={r.id} className="border-t border-ink-100">
        <td className="p-3 whitespace-nowrap">{r.report_date}</td>
        <td className="p-3">{r.category}</td>
        <td className="p-3 whitespace-nowrap"><span className="rounded-full bg-lavender-100 px-2 py-0.5 text-xs text-lavender-700">{copy.redType[r.red_type]}</span></td>
        <td className="p-3">{copy.kind[r.kind]}</td>
        <td className="p-3">{r.series}</td>
        <td className="p-3">{r.subject}</td>
        <td className="p-3 font-semibold" title={r.filename}>
          {r.title}
          {r.status === 'hold' && r.hold_note && <span className="ml-2 rounded bg-lemon-100 px-2 py-0.5 text-xs font-normal text-ink-700">{copy.holdNote(r.hold_note)}</span>}
          {copy.createdBy[r.created_by] && <span className="ml-2 text-xs font-normal text-ink-500">{copy.createdBy[r.created_by]}</span>}
        </td>
        <td className="p-3 whitespace-nowrap space-x-3">
          {r.status !== 'published' && <button type="button" disabled={pending} onClick={() => run(() => publishRed(r.id))} className={`${link} font-semibold text-mint-700`}>{copy.publish}</button>}
          {r.status === 'published' && <button type="button" disabled={pending} onClick={() => run(() => unpublishRed(r.id))} className={`${link} text-ink-500`}>{copy.unpublish}</button>}
          {r.status !== 'hold' && <button type="button" disabled={pending} onClick={hold} className={`${link} text-ink-500`}>{copy.hold}</button>}
          <button type="button" disabled={pending} onClick={onEdit} className={`${link} text-ink-500`} aria-expanded={editing}>{copy.edit}</button>
          <button type="button" disabled={pending} onClick={() => { if (window.confirm(copy.removeConfirm(r.filename))) run(() => deleteRedReport(r.id)) }} className={`${link} text-red-700`}>{copy.remove}</button>
        </td>
      </tr>
      {editing && <tr className="border-t border-ink-100 bg-ink-100/30"><td colSpan={8} className="p-3"><EditForm r={r} pending={pending} run={run} onSaved={onSaved} /></td></tr>}
    </>
  )
}

function EditForm({ r, pending, run, onSaved }: { r: RedReportRow; pending: boolean; run: Run; onSaved: () => void }) {
  const router = useRouter()
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const field = 'rounded-lg border border-ink-300 px-2 py-1 text-sm'
  const label = 'grid gap-1 text-xs font-semibold text-ink-700'
  // 저장되면 폼이 닫히므로 '저장했습니다'는 표 수준(run 의 okMsg)에 보인다
  function save(fd: FormData) { run(async () => { const res = await updateRedMeta(r.id, fd); if (res.ok) onSaved(); return res }, copy.form.saved) }
  async function replace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setNote(copy.form.replacing)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/red/replace/${r.id}`, { method: 'POST', body: fd })
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
      setNote(res.ok ? copy.form.replaced : (copy.errors[body.error ?? ''] ?? copy.errors.upload_failed) + (body.detail !== undefined ? ` ${copy.typeDetail(body.detail)}` : ''))
      if (res.ok) router.refresh()
    } catch { setNote(copy.errors.upload_failed) } finally { setBusy(false); e.target.value = '' }
  }
  return (
    <form action={save} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className={label}>{copy.columns.category}
          <select name="category" defaultValue={r.category} className={field}><option value="BASIC">BASIC</option><option value="ADVANCED">ADVANCED</option></select>
        </label>
        <label className={label}>{copy.columns.redType}
          <select name="red_type" defaultValue={r.red_type} className={field}>{RED_TYPES.map((t) => <option key={t} value={t}>{copy.redType[t]}</option>)}</select>
        </label>
        <label className={label}>{copy.columns.date}<input name="report_date" type="date" defaultValue={r.report_date} className={field} /></label>
        <label className={label}>{copy.columns.series}<input name="series" defaultValue={r.series} className={field} /></label>
        <label className={label}>{copy.columns.subject}<input name="subject" defaultValue={r.subject} className={field} /></label>
        <label className={label}>{copy.columns.title}<input name="title" defaultValue={r.title} required className={field} /></label>
      </div>
      <label className={label}>{copy.form.summary}<textarea name="summary" defaultValue={r.summary} rows={2} className={field} /></label>
      <label className={label}>{copy.form.links}<textarea name="source_links" defaultValue={r.source_links.map((l) => (l.label === l.url ? l.url : `${l.label} | ${l.url}`)).join('\n')} rows={2} className={field} /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || busy} className="rounded-full bg-ink-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{copy.save}</button>
        <button type="button" onClick={onSaved} className={`${link} text-ink-500`}>{copy.cancel}</button>
        <label className="text-xs text-ink-700">{copy.form.replace} <input type="file" accept=".docx" onChange={replace} disabled={busy} className="text-xs" /></label>
        <span className="text-xs text-ink-500">{r.filename}</span>
        {note && <span className="rounded bg-lemon-100 px-2 py-0.5 text-xs">{note}</span>}
      </div>
    </form>
  )
}
