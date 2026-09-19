'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createItemSet } from './actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Subject } from '@/lib/studio/schemas'
import { app } from '@/content/site'

const copy = app.studio.picker

export type PickerStandard = { id: string; code: string; text: string; domain: string; verified: boolean }
export type StandardsBySubject = Record<string, Record<string, PickerStandard[]>>

export function StandardsPicker({
  themeId,
  availableSubjects,
  standardsBySubject,
}: {
  themeId: string
  availableSubjects: Subject[]
  standardsBySubject: StandardsBySubject
}) {
  const [subject, setSubject] = useState<string>(availableSubjects[0] ?? '')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const domains = useMemo(() => standardsBySubject[subject] ?? {}, [standardsBySubject, subject])
  const allRows = useMemo(() => Object.values(domains).flat(), [domains])
  const q = search.trim().toLowerCase()
  const filteredByDomain = useMemo(() => {
    const result: Record<string, PickerStandard[]> = {}
    for (const [domain, rows] of Object.entries(domains)) {
      const filtered = q
        ? rows.filter((r) => r.code.toLowerCase().includes(q) || r.text.toLowerCase().includes(q))
        : rows
      if (filtered.length) result[domain] = filtered
    }
    return result
  }, [domains, q])

  const selectedRows = allRows.filter((r) => selected.has(r.id))
  const unverifiedCodes = selectedRows.filter((r) => !r.verified).map((r) => r.code)
  const count = selected.size
  const countOk = count >= 2 && count <= 6

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onSubjectChange(next: string) {
    setSubject(next)
    setSelected(new Set())
    setSearch('')
    setError(null)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await createItemSet(themeId, subject as Subject, Array.from(selected))
      if (res.ok) router.push(`/admin/items/${themeId}/sets/${res.id}`)
      else setError(res.error)
    })
  }

  if (availableSubjects.length === 0) {
    return (
      <Card className="mt-6">
        <h2 className="text-lg font-bold">{app.studio.sets.newSetHeading}</h2>
        <p className="mt-2 text-sm text-ink-500">{copy.noSubjectsAvailable}</p>
      </Card>
    )
  }

  return (
    <Card className="mt-6">
      <h2 className="text-lg font-bold">{app.studio.sets.newSetHeading}</h2>

      <label className="mt-3 grid max-w-xs gap-1 text-sm font-semibold">
        {copy.subjectLabel}
        <select
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          className="rounded-xl border border-ink-300 px-3 py-2 font-normal"
        >
          <option value="" disabled>{copy.subjectPlaceholder}</option>
          {availableSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={copy.searchPlaceholder}
        className="mt-3 w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
      />

      <div className="mt-3 max-h-96 space-y-3 overflow-y-auto">
        {Object.entries(filteredByDomain).map(([domain, rows]) => (
          <details key={domain} open className="rounded-xl border border-ink-100 p-3">
            <summary className="cursor-pointer text-sm font-semibold">{domain}</summary>
            <ul className="mt-2 space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="mt-1"
                  />
                  <span className="font-mono text-xs text-ink-500">{r.code}</span>
                  <span className="flex-1">{r.text}</span>
                  <Badge tone={r.verified ? 'mint' : 'gray'}>{r.verified ? copy.verified : copy.unverified}</Badge>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {!Object.keys(filteredByDomain).length && <p className="text-sm text-ink-500">{copy.empty}</p>}
      </div>

      <p className={`mt-3 text-sm font-semibold ${countOk ? 'text-mint-700' : 'text-ink-500'}`}>
        {copy.selectedCount(count)}
      </p>

      {unverifiedCodes.length > 0 && (
        <p className="mt-1 text-sm text-lemon-600">{copy.unverifiedWarning(unverifiedCodes)}</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3">
        <Button disabled={!countOk || pending} onClick={submit}>
          {pending ? copy.submitting : copy.submit}
        </Button>
      </div>
    </Card>
  )
}
