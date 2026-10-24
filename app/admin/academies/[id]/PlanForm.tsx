'use client'
import { useActionState } from 'react'
import { setAcademyPlan } from '../actions'
import { Button } from '@/components/ui/Button'
import { PLANS, type Plan } from '@/lib/academies/plan'
import { app } from '@/content/site'

const copy = app.adminAcademies.plan

/** 가맹 상품 바꾸기(PRD 2026-10-20). 저장 전에 확인창 — RED 자료실이 그 원에 바로 열리거나 닫히기 때문. */
export function PlanForm({ academyId, academyName, current, note, changedAt }: { academyId: string; academyName: string; current: Plan; note: string; changedAt: string | null }) {
  const [state, action, pending] = useActionState(setAcademyPlan.bind(null, academyId), undefined)
  return (
    <form
      action={action}
      className="mt-2 grid max-w-md gap-3 rounded-2xl bg-white p-4"
      onSubmit={e => {
        const chosen = (new FormData(e.currentTarget).get('plan') as Plan) ?? current
        if (chosen !== current && !window.confirm(copy.confirm(academyName, copy.names[chosen]))) e.preventDefault()
      }}
    >
      <fieldset className="grid gap-2">
        {PLANS.map(p => (
          <label key={p} className="flex items-start gap-2 text-sm">
            <input type="radio" name="plan" value={p} defaultChecked={p === current} className="mt-1" />
            <span>
              <span className="font-semibold">{copy.names[p]}</span>
              <span className="block text-ink-500">{copy.help[p]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1 text-sm">
        {copy.note}
        <input name="plan_note" defaultValue={note} className="rounded-xl border border-ink-300 px-3 py-2" />
      </label>
      {changedAt && <p className="text-xs text-ink-500">{copy.changedAt(changedAt.slice(0, 16).replace('T', ' '))}</p>}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.saved && <p className="text-sm text-mint-700">{copy.saved}</p>}
      <Button type="submit" disabled={pending}>{copy.submit}</Button>
    </form>
  )
}
