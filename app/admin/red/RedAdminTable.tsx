'use client'
import { useState, useTransition } from 'react'
import { app } from '@/content/site'
import { setRedHidden, deleteRedReport } from './actions'
import type { RedReportRow } from '@/lib/red/reports'

const copy = app.adminRed

export function RedAdminTable({ rows }: { rows: RedReportRow[] }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? null : r.error ?? null) })
  if (rows.length === 0) return <p className="mt-6 text-sm text-ink-500">{copy.empty}</p>
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-ink-100/60 text-left">
          <tr>{(['date', 'category', 'kind', 'series', 'subject', 'title', 'state'] as const).map((k) => <th key={k} className="p-3">{copy.columns[k]}</th>)}<th className="p-3" /></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-red-row={r.id} className={`border-t border-ink-100 ${r.hidden ? 'text-ink-400' : ''}`}>
              <td className="p-3">{r.report_date}</td>
              <td className="p-3">{r.category}</td>
              <td className="p-3">{copy.kind[r.kind]}</td>
              <td className="p-3">{r.series}</td>
              <td className="p-3">{r.subject}</td>
              <td className="p-3 font-semibold" title={r.filename}>{r.title}</td>
              <td className="p-3">{r.hidden ? copy.state.hidden : copy.state.shown}</td>
              <td className="p-3 whitespace-nowrap">
                <button type="button" disabled={pending} onClick={() => run(() => setRedHidden(r.id, !r.hidden))} className="text-xs text-ink-500 underline">{r.hidden ? copy.show : copy.hide}</button>
                <button type="button" disabled={pending} onClick={() => { if (window.confirm(copy.removeConfirm(r.filename))) run(() => deleteRedReport(r.id)) }} className="ml-3 text-xs text-red-700 underline">{copy.remove}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p className="p-3 text-sm text-red-700">{msg}</p>}
    </div>
  )
}
