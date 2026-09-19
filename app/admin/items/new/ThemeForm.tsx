'use client'
import { useActionState } from 'react'
import { createTheme } from '../actions'
import { THEME_FIELDS } from '@/lib/studio/themes'
import { SUBJECTS, LEVELS } from '@/lib/studio/schemas'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.studio.newTheme
const input = 'rounded-xl border border-ink-300 px-4 py-3 font-normal'

export function ThemeForm() {
  const [state, action, pending] = useActionState(createTheme, undefined)

  return (
    <form action={action} className="grid max-w-md gap-4">
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.title}
        <input name={THEME_FIELDS.title} required className={input} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.level}
        <select name={THEME_FIELDS.level} defaultValue={LEVELS[0]} className={input}>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.grade}
        <input name={THEME_FIELDS.grade} type="number" min={1} max={6} required className={input} />
      </label>
      <fieldset className="grid gap-1 text-sm font-semibold">
        <legend>{copy.labels.subjects}</legend>
        <div className="flex flex-wrap gap-3 font-normal">
          {SUBJECTS.map((s) => (
            <label key={s} className="flex items-center gap-1.5">
              <input type="checkbox" name={THEME_FIELDS.subjects} value={s} />
              {s}
            </label>
          ))}
        </div>
      </fieldset>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button>
    </form>
  )
}
