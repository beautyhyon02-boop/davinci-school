'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmOutline } from './actions'
import { OutlineFields } from './OutlineFields'
import { Button } from '@/components/ui/Button'
import type { Outline } from '@/lib/inquiry/schema'
import { app } from '@/content/site'

const copy = app.inquiry.teacher.page

export type OutlineTarget = { assignmentId: string; studentName: string; outline: Outline }

/** 목차 확인: 기본값(첫 배정의 목차) 그대로 [확인]만 눌러도 된다. 적용할 학생은 처음에 모두 체크. */
export function OutlinePanel({ taskId, targets }: { taskId: string; targets: OutlineTarget[] }) {
  const router = useRouter()
  const [outline, setOutline] = useState<Outline>(targets[0]?.outline ?? { method: 'none', career: true })
  const [picked, setPicked] = useState<Set<string>>(new Set(targets.map((t) => t.assignmentId)))
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()

  function toggle(id: string, on: boolean) { setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n }) }
  function onConfirm() {
    setMessage(null)
    start(async () => {
      const r = await confirmOutline(taskId, [...picked], outline)
      if (!r.ok) { setMessage({ tone: 'error', text: r.error }); return }
      setMessage({ tone: 'ok', text: copy.confirmed(r.count) }); router.refresh()
    })
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)]">
      <h2 className="text-lg font-bold">{copy.outlineChangeHeading}</h2>
      <p className="mt-1 text-sm text-ink-500">{copy.outlineHelp}</p>
      {targets.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">{copy.outlineNoAssignments}</p>
      ) : (
        <>
          <div className="mt-3"><OutlineFields outline={outline} onChange={setOutline} /></div>
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">{copy.applyTo}</legend>
            <ul className="mt-1 space-y-1">
              {targets.map((t) => (
                <li key={t.assignmentId} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={picked.has(t.assignmentId)} onChange={(e) => toggle(t.assignmentId, e.target.checked)} />
                  <span>{t.studentName}</span>
                  <span className="text-xs text-ink-500">{app.inquiry.method[t.outline.method]}{t.outline.career ? ` · ${copy.careerLabel}` : ''}</span>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="mt-4"><Button type="button" onClick={onConfirm} disabled={pending || picked.size === 0}>{pending ? copy.confirming : copy.confirm}</Button></div>
        </>
      )}
      {message && <p className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-mint-700' : 'text-red-600'}`}>{message.text}</p>}
    </section>
  )
}
