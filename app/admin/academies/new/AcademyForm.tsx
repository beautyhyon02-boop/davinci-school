'use client'
import { useActionState } from 'react'
import { createAcademy } from '../actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import { PLANS, DEFAULT_PLAN } from '@/lib/academies/plan'
import { SIDOS } from '@/lib/academies/sido'

const copy = app.adminAcademies.form
const planCopy = app.adminAcademies.plan
const input = 'rounded-xl border border-ink-300 px-4 py-3 font-normal'

export function AcademyForm() {
  const [state, action, pending] = useActionState(createAcademy, undefined)

  return (
    <form action={action} className="grid max-w-md gap-4">
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.code}
        <input name="code" required className={input} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.name}
        <input name="name" required className={input} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.region}
        <input name="region" className={input} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.sido}
        <select name="sido" defaultValue="" className={input}>
          <option value="">{copy.sidoNone}</option>
          {SIDOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.website}
        <input name="website" placeholder={copy.websitePlaceholder} className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        {/* 체크 해제 상태는 브라우저가 보내지 않으므로, 빈 값을 먼저 보내 「껐음」을 알린다(parseMapFields). */}
        <input type="hidden" name="show_on_map" value="" />
        <input type="checkbox" name="show_on_map" value="on" defaultChecked />
        {copy.labels.showOnMap}
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.directorPhone}
        <input name="director_phone" className={input} />
      </label>
      <fieldset className="grid gap-2 text-sm font-semibold">
        {planCopy.label}
        {PLANS.map(p => (
          <label key={p} className="flex items-start gap-2 font-normal">
            <input type="radio" name="plan" value={p} defaultChecked={p === DEFAULT_PLAN} className="mt-1" />
            <span>
              <span className="font-semibold">{planCopy.names[p]}</span>
              <span className="block text-ink-500">{planCopy.help[p]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>{copy.submit}</Button>
    </form>
  )
}
