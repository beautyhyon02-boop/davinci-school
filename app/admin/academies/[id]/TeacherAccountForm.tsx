'use client'
import { useActionState } from 'react'
import { createTeacherAccount } from '../actions'
import { Button } from '@/components/ui/Button'
import { PLANS, type Plan } from '@/lib/academies/plan'
import { app } from '@/content/site'

const copy = app.adminAcademies.teacherAccount
const planCopy = app.adminAcademies.plan

/** 원장 계정 발급. 가맹 상품도 여기서 고른다(대표 2026-11-09: 메일 주소 받아 발급할 때 올·베이직을 구분해 체크) — 고른 상품은 그 학원에 저장된다. */
export function TeacherAccountForm({ academyId, currentPlan }: { academyId: string; currentPlan: Plan }) {
  const [state, action, pending] = useActionState(createTeacherAccount.bind(null, academyId), undefined)

  return (
    <div className="mt-4 rounded-2xl bg-white p-6">
      <h3 className="font-bold">{copy.formHeading}</h3>
      {state?.issued ? (
        <div className="mt-3 rounded-xl bg-lemon-50 p-4">
          <p className="font-semibold">{copy.issuedNotice}</p>
          <p className="mt-2 font-mono">{copy.labels.id} {state.issued.email}</p>
          <p className="font-mono">{copy.labels.password} {state.issued.password}</p>
          <p className="mt-2 text-sm text-ink-700">{copy.issuedPlan(planCopy.names[state.issued.plan])}</p>
        </div>
      ) : (
        <form action={action} className="mt-3 grid max-w-md gap-3">
          <input name="name" placeholder={copy.placeholders.name} required className="rounded-xl border border-ink-300 px-4 py-2" />
          <input name="email" type="email" placeholder={copy.placeholders.email} required className="rounded-xl border border-ink-300 px-4 py-2" />
          <fieldset className="grid gap-2 text-sm">
            <legend className="font-semibold">{copy.planLabel}</legend>
            {PLANS.map((p) => (
              <label key={p} className="flex items-start gap-2">
                <input type="radio" name="plan" value={p} defaultChecked={p === currentPlan} className="mt-1" />
                <span>
                  <span className="font-semibold">{planCopy.names[p]}</span>
                  <span className="block text-ink-500">{planCopy.help[p]}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-ink-500">{copy.planNote}</p>
          </fieldset>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <Button type="submit" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button>
        </form>
      )}
    </div>
  )
}
