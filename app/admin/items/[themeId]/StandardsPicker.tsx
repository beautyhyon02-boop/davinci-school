'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createItemSet } from './actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Subject } from '@/lib/studio/schemas'
import { app } from '@/content/site'
import { SharedMaterialCheckboxes, toggleSharedId, type SharedMaterialOption } from './SharedMaterialCheckboxes'

const copy = app.studio.picker

export type PickerStandard = { id: string; code: string; text: string; domain: string; verified: boolean }
/** 묶음(사회 세트만 제목이 있다 — 지리·일반사회·역사…) 아래에 영역(domain)별 목록. */
export type PickerFamily = { key: string; label: string; domains: { domain: string; rows: PickerStandard[] }[] }
export type StandardsBySubject = Record<string, PickerFamily[]>

export function StandardsPicker({
  themeId,
  availableSubjects,
  standardsBySubject,
  sharedOptions = [],
}: {
  themeId: string
  availableSubjects: Subject[]
  standardsBySubject: StandardsBySubject
  /** 대주제 공동 자료(체크 목록용 평범한 데이터). 기본 선택은 없음(대표 결정 2026-09-28). */
  sharedOptions?: SharedMaterialOption[]
}) {
  const [subject, setSubject] = useState<string>(availableSubjects[0] ?? '')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sharedSelected, setSharedSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const families = useMemo(() => standardsBySubject[subject] ?? [], [standardsBySubject, subject])
  const allRows = useMemo(() => families.flatMap((f) => f.domains.flatMap((d) => d.rows)), [families])
  const q = search.trim().toLowerCase()
  const filteredFamilies = useMemo(() => {
    const result: PickerFamily[] = []
    for (const f of families) {
      const domains = f.domains
        .map((d) => ({ domain: d.domain, rows: q ? d.rows.filter((r) => r.code.toLowerCase().includes(q) || r.text.toLowerCase().includes(q)) : d.rows }))
        .filter((d) => d.rows.length > 0)
      if (domains.length) result.push({ ...f, domains })
    }
    return result
  }, [families, q])

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
      const res = await createItemSet(themeId, subject as Subject, Array.from(selected), sharedSelected)
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

      {families.some((f) => f.label) && <p className="mt-3 text-xs text-ink-500">{copy.familyHelp}</p>}

      <div className="mt-3 max-h-96 space-y-4 overflow-y-auto">
        {filteredFamilies.map((f) => (
          <section key={f.key || 'all'} className="space-y-2">
            {/* 묶음 제목은 한 줄에 하나씩 세로로(대표: 옆으로 잇지 않는다) */}
            {f.label && <h3 className="border-b border-ink-100 pb-1 text-sm font-bold text-ink-700">{f.label}</h3>}
            {f.domains.map((d) => (
              <details key={`${f.key}|${d.domain}`} open className="rounded-xl border border-ink-100 p-3">
                <summary className="cursor-pointer text-sm font-semibold">{d.domain}</summary>
                <ul className="mt-2 space-y-2">
                  {d.rows.map((r) => (
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
          </section>
        ))}
        {!filteredFamilies.length && <p className="text-sm text-ink-500">{copy.empty}</p>}
      </div>

      <p className={`mt-3 text-sm font-semibold ${countOk ? 'text-mint-700' : 'text-ink-500'}`}>
        {copy.selectedCount(count)}
      </p>

      {unverifiedCodes.length > 0 && (
        <p className="mt-1 text-sm text-lemon-600">{copy.unverifiedWarning(unverifiedCodes)}</p>
      )}

      {/* 이 세트에서 쓸 공동 자료(대표 결정 2026-09-28) — 기본은 아무것도 안 씀. 대주제에 공동 자료가 없으면 칸을 두지 않는다. */}
      {sharedOptions.length > 0 && (
        <div className="mt-4 rounded-xl border border-ink-100 p-3">
          <p className="text-sm font-semibold">{app.studio.sharedSelection.heading}</p>
          <p className="mt-1 text-xs text-ink-500">{app.studio.sharedSelection.createDescription}</p>
          <SharedMaterialCheckboxes options={sharedOptions} selected={sharedSelected} onToggle={(id) => setSharedSelected((s) => toggleSharedId(s, id))} disabled={pending} />
        </div>
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
