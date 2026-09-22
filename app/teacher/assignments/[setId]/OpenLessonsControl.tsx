'use client'
import { useState, useTransition } from 'react'
import { setOpenLessons } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.assign.detail

export function OpenLessonsControl({ setId, current, maxLessons }: { setId: string; current: number; maxLessons: number }) {
  const [value, setValue] = useState(current)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4">
      <span className="text-sm font-semibold">{copy.openLessons}</span>
      <select value={value} onChange={(e) => setValue(Number(e.target.value))} className="rounded-xl border border-ink-300 px-3 py-2 text-sm">
        {Array.from({ length: maxLessons }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{copy.openTo(n)}</option>)}
      </select>
      <Button type="button" disabled={pending} onClick={() => start(async () => {
        const r = await setOpenLessons(setId, value); setMsg(r.ok ? copy.saved : r.error)
      })}>{copy.applyAll}</Button>
      {msg && <span className="text-sm text-ink-500">{msg}</span>}
    </div>
  )
}
