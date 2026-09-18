'use client'
import { useActionState } from 'react'
import { createAcademy } from '../actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.adminAcademies.form
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
        {copy.labels.directorPhone}
        <input name="director_phone" className={input} />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>{copy.submit}</Button>
    </form>
  )
}
