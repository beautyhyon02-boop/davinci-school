'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { assignInquiry } from './actions'
import { OutlineFields } from './OutlineFields'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DEFAULT_OUTLINE, type Outline } from '@/lib/inquiry/schema'
import { app } from '@/content/site'

const copy = app.inquiry.teacher.page
const inquiry = app.inquiry

export type StudentOption = { id: string; name: string; assignedStatus: 'assigned' | 'submitted' | 'reopened' | null }

/** 학생 배정: 학생 한 줄에 하나(체크), 이미 배정된 학생은 상태 배지만. 아래에 목차 기본값 → [배정]. */
export function AssignPanel({ taskId, students }: { taskId: string; students: StudentOption[] }) {
  const router = useRouter()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [outline, setOutline] = useState<Outline>({ ...DEFAULT_OUTLINE })
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const open = students.filter((s) => s.assignedStatus === null)

  function toggleAll(on: boolean) { setPicked(on ? new Set(open.map((s) => s.id)) : new Set()) }
  function toggle(id: string, on: boolean) { setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n }) }
  function onAssign() {
    setMessage(null)
    start(async () => {
      const r = await assignInquiry(taskId, [...picked], outline)
      if (!r.ok) { setMessage({ tone: 'error', text: r.error }); return }
      setMessage({ tone: 'ok', text: copy.assigned(r.count) }); setPicked(new Set()); router.refresh()
    })
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)]">
      <h2 className="text-lg font-bold">{copy.assignHeading}</h2>
      <p className="mt-1 text-sm text-ink-500">{copy.assignHelp}</p>
      {students.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">{copy.noStudents}</p>
      ) : (
        <>
          {open.length > 0 && (
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.size === open.length && open.length > 0} onChange={(e) => toggleAll(e.target.checked)} />{copy.selectAll}</label>
          )}
          <ul className="mt-2 divide-y divide-ink-100">
            {students.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2 text-base">
                <input type="checkbox" disabled={s.assignedStatus !== null} checked={picked.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                <span className={s.assignedStatus ? 'text-ink-500' : ''}>{s.name}</span>
                {s.assignedStatus && <Badge tone={s.assignedStatus === 'submitted' ? 'mint' : 'gray'}>{inquiry.assignmentStatus[s.assignedStatus]}</Badge>}
              </li>
            ))}
          </ul>
        </>
      )}
      {open.length > 0 && (
        <div className="mt-4 border-t border-ink-100 pt-4">
          <p className="text-sm font-bold">{copy.outlineHeading}</p>
          <p className="mb-2 text-sm text-ink-500">{copy.outlineHelp}</p>
          <OutlineFields outline={outline} onChange={setOutline} />
          <div className="mt-4"><Button type="button" onClick={onAssign} disabled={pending || picked.size === 0}>{pending ? copy.assigning : copy.assign}</Button></div>
        </div>
      )}
      {message && <p className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-mint-700' : 'text-red-600'}`}>{message.text}</p>}
    </section>
  )
}
